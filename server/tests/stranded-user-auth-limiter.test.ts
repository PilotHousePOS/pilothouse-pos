/**
 * Tests: Stranded users cannot exhaust the authLimiter budget
 *
 * A "stranded" user is authenticated (has a valid auth cookie) but has no
 * tenantId assigned to their account.  When such a user POSTs to
 * /api/auth/login, tenantMiddleware runs first, detects the token, resolves
 * the user, finds no tenantId, and — because /auth/login is NOT in the
 * NO_TENANT_ALLOWLIST — returns 403 before the authLimiter middleware has a
 * chance to execute.
 *
 * The risk being guarded against: a regression where tenantMiddleware starts
 * calling next() for stranded login attempts, allowing those attempts to reach
 * authLimiter and silently burn through the 15 req/15 min budget.  A malicious
 * or misconfigured stranded client could exhaust the budget and trigger 429
 * responses for real unauthenticated login attempts from the same IP.
 *
 * Three behaviours are confirmed:
 *
 *  1. 16 login POSTs sent with a stranded user's auth cookie each return 403
 *     (tenantMiddleware short-circuit, not 429).
 *
 *  2. After the stranded flood, an unauthenticated login attempt from the same
 *     IP is NOT rate-limited (not 429).  If the stranded requests had been
 *     counted the budget would be exhausted and this request would return 429.
 *
 *  3. The authLimiter remaining counter drops by EXACTLY 1 after the stranded
 *     flood (only the post-flood probe), not by 17 (16 flood + 1 probe).  This
 *     is a strict delta assertion that catches partial regressions where some
 *     but not all stranded requests are incorrectly counted.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { generateToken } from "../auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

async function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);
  return app;
}

/**
 * Parse the ratelimit-remaining header from the authLimiter's standardHeaders.
 * express-rate-limit uses lowercase header names.
 */
function parseRemaining(headers: Record<string, string>): number {
  const val = headers["ratelimit-remaining"];
  return val !== undefined ? parseInt(val, 10) : NaN;
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────

let strandedUserId: string;
let strandedToken: string;

beforeAll(async () => {
  const sfx = randomSuffix();

  // Create a stranded user: valid account, no tenantId, not a super-admin.
  // tenantMiddleware will detect the token, find this user, see tenantId = null,
  // check NO_TENANT_ALLOWLIST (which does NOT contain /auth/login), and return 403.
  const [stranded] = await db
    .insert(users)
    .values({
      id: `stranded-al-${sfx}`,
      email: `stranded-al-${sfx}@test.local`,
      firstName: "Stranded",
      lastName: "AuthLimiter",
      password: "hashed-for-test-not-used",
      tenantId: null,
      isAdmin: false,
      isSuperAdmin: false,
      tokenVersion: 0,
    })
    .returning();

  strandedUserId = stranded.id;
  strandedToken = generateToken(stranded as any);
}, 30_000);

afterAll(async () => {
  if (strandedUserId) {
    await db.delete(users).where(eq(users.id, strandedUserId));
  }
}, 30_000);

// ─── Suite: Stranded flood does not exhaust the authLimiter ───────────────────

describe("Stranded-user login flood — authLimiter budget is not consumed", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    // Fresh app → fresh in-memory rate-limit store → deterministic deltas.
    const app = await buildTestApp();
    agent = supertest(app);
  }, 60_000);

  it(
    "16 stranded login POSTs all return 403 (tenantMiddleware short-circuit, not 429)",
    async () => {
      const FLOOD_COUNT = 16;
      for (let i = 0; i < FLOOD_COUNT; i++) {
        const res = await agent
          .post("/api/auth/login")
          .set("Cookie", `auth_token=${strandedToken}`)
          .send({ email: `stranded-al@test.local`, password: "anything" });

        // tenantMiddleware must have intercepted this with 403.
        // If authLimiter intercepted it would be 429 (after budget exhaustion).
        expect(res.status, `request ${i + 1} should be 403`).toBe(403);
        // Extra guard: must not be 429 regardless of other logic.
        expect(res.status, `request ${i + 1} must not be 429`).not.toBe(429);
      }
    },
    30_000,
  );

  it(
    "an unauthenticated login attempt after the flood is NOT rate-limited (authLimiter budget intact)",
    async () => {
      // If the 16 stranded requests had been counted by the authLimiter
      // (budget = 15) this request would receive 429.  It must not.
      const res = await agent
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "wrongpassword" });

      expect(res.status).not.toBe(429);
    },
    10_000,
  );

  it(
    "the authLimiter remaining counter drops by exactly 1 after the stranded flood (delta assertion)",
    async () => {
      // A fresh app is needed for a clean counter so the delta is deterministic.
      const freshApp = await buildTestApp();
      const freshAgent = supertest(freshApp);

      // ── Baseline: one unauthenticated login probe before the flood ─────────
      const baselineRes = await freshAgent
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "wrongpassword" });
      expect(baselineRes.status).not.toBe(429);

      const baselineRemaining = parseRemaining(
        baselineRes.headers as Record<string, string>,
      );
      expect(baselineRemaining, "authLimiter must emit ratelimit-remaining").not.toBeNaN();

      // ── Flood: 16 stranded login POSTs ────────────────────────────────────
      // tenantMiddleware short-circuits with 403; authLimiter never runs.
      const FLOOD_COUNT = 16;
      for (let i = 0; i < FLOOD_COUNT; i++) {
        const res = await freshAgent
          .post("/api/auth/login")
          .set("Cookie", `auth_token=${strandedToken}`)
          .send({ email: `stranded-al@test.local`, password: "anything" });
        expect(res.status, `request ${i + 1} should be 403`).toBe(403);
      }

      // ── Post-flood probe: one more unauthenticated login ──────────────────
      const postFloodRes = await freshAgent
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "wrongpassword" });
      expect(postFloodRes.status).not.toBe(429);

      const postFloodRemaining = parseRemaining(
        postFloodRes.headers as Record<string, string>,
      );
      expect(postFloodRemaining, "post-flood ratelimit-remaining must be a number").not.toBeNaN();

      // ── Key assertion ─────────────────────────────────────────────────────
      // If the 16 stranded requests were wrongly counted, the delta would be 17
      // (16 flood + 1 post-flood probe).  It must be exactly 1 (only the probe).
      const delta = baselineRemaining - postFloodRemaining;
      expect(delta, `authLimiter counter delta must be 1 (only the post-flood probe), got ${delta}`).toBe(1);
    },
    60_000,
  );
});
