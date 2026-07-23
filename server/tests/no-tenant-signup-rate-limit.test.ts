/**
 * Tests: No-tenant signup floods do not exhaust the general rate-limit budget
 *
 * The generalLimiter skips POST /api/auth/signup requests that arrive without a
 * tenant context (no X-Tenant-Slug header, no ?tenant= query param, no auth
 * cookie).  Without this skip, a flood of misconfigured no-slug signup attempts
 * from one IP could burn through the 200 req/15 min general budget and block
 * unrelated catalog browsing from the same IP.
 *
 * Three behaviours are confirmed with strict delta assertions:
 *
 *  1. 50 no-tenant signup POSTs → every one returns 400, and the general
 *     rate-limit counter changes by EXACTLY 1 (only the post-flood probe)
 *     not by 51.
 *
 *  2. After the flood, a normal GET /api/supplies (with a slug) succeeds.
 *
 *  3. A POST /api/auth/signup WITH a valid tenant slug IS counted against the
 *     general limiter: the remaining counter visible on the signup response
 *     is exactly 1 less than it was after the baseline probe.
 *
 * Each describe block gets its own fresh express app so the in-memory
 * rate-limit store starts clean and deltas are deterministic.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";

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

function parseRemaining(headers: Record<string, string>): number {
  // express-rate-limit standardHeaders sends "ratelimit-remaining" (lowercase)
  const val = headers["ratelimit-remaining"];
  return val !== undefined ? parseInt(val, 10) : NaN;
}

// ─── Shared tenant fixture ─────────────────────────────────────────────────────

let tenantId: number;
let tenantSlug: string;
const createdUserIds: string[] = [];

beforeAll(async () => {
  const sfx = randomSuffix();
  tenantSlug = `rl-flood-${sfx}`;

  // Advance sequence to avoid ID collisions with parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `RateLimit Flood Test ${sfx}`,
      slug: tenantSlug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  tenantId = tenant.id;
}, 30_000);

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(inArray(contacts.linkedUserId, createdUserIds));
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
  }
  if (tenantId) {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  }
}, 30_000);

// ─── Suite 1: Flood isolation — fresh app so limiter starts at 200 ─────────────

describe("No-tenant signup flood — general budget is not consumed", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    // Fresh app → fresh in-memory rate-limit store → deterministic deltas.
    const app = await buildTestApp();
    agent = supertest(app);
  }, 60_000);

  it(
    "50 no-tenant POSTs return 400 and the general counter drops by exactly 1 (only the post-flood probe)",
    async () => {
      const FLOOD_COUNT = 50;

      // ── Baseline: one catalog GET before the flood ────────────────────────
      const baselineRes = await agent
        .get("/api/supplies")
        .set("X-Tenant-Slug", tenantSlug);
      expect(baselineRes.status).not.toBe(429);

      const baselineRemaining = parseRemaining(
        baselineRes.headers as Record<string, string>,
      );
      expect(baselineRemaining).not.toBeNaN();

      // ── Flood: 50 no-tenant signups ──────────────────────────────────────
      for (let i = 0; i < FLOOD_COUNT; i++) {
        const sfx = randomSuffix();
        const res = await agent.post("/api/auth/signup").send({
          email: `flood-${sfx}@test.local`,
          password: "Test1234!",
          firstName: "Flood",
          lastName: "User",
          phoneNumber: `555${String(i).padStart(7, "0")}`,
        });
        // tenantMiddleware blocks before generalLimiter runs.
        expect(res.status).toBe(400);
      }

      // ── Post-flood probe: one more catalog GET ────────────────────────────
      const postFloodRes = await agent
        .get("/api/supplies")
        .set("X-Tenant-Slug", tenantSlug);
      expect(postFloodRes.status).not.toBe(429);

      const postFloodRemaining = parseRemaining(
        postFloodRes.headers as Record<string, string>,
      );
      expect(postFloodRemaining).not.toBeNaN();

      // ── Key assertion: the counter dropped by exactly 1, not 51 ──────────
      // If the 50 no-tenant signups were wrongly counted, the delta would be 51
      // (50 flood + 1 probe).  It must be exactly 1 (only the post-flood probe).
      const delta = baselineRemaining - postFloodRemaining;
      expect(delta).toBe(1);
    },
    30_000,
  );

  it("catalog browsing still returns non-429 after the flood", async () => {
    const res = await agent
      .get("/api/supplies")
      .set("X-Tenant-Slug", tenantSlug);
    expect(res.status).not.toBe(429);
  });
});

// ─── Suite 2: Slug-bearing signup IS counted — fresh app for clean state ───────

describe("Slug-bearing signup — counted against the general limiter", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    // Separate fresh app so this suite's limiter starts at 200.
    const app = await buildTestApp();
    agent = supertest(app);
  }, 60_000);

  it(
    "a signup WITH a valid tenant slug decrements the general-limiter counter by 1",
    async () => {
      // ── Baseline: one catalog GET so we know the starting remaining count ─
      const baselineRes = await agent
        .get("/api/supplies")
        .set("X-Tenant-Slug", tenantSlug);
      expect(baselineRes.status).not.toBe(429);

      const baselineRemaining = parseRemaining(
        baselineRes.headers as Record<string, string>,
      );
      expect(baselineRemaining).not.toBeNaN();
      // After 1 request on a fresh limiter the baseline should be 199.
      expect(baselineRemaining).toBe(199);

      // ── Send a signup WITH the tenant slug (req.tenantId will be set) ─────
      // The generalLimiter's skip function returns false when tenantId is set,
      // so this request IS counted.
      const sfx = randomSuffix();
      const signupRes = await agent
        .post("/api/auth/signup")
        .set("X-Tenant-Slug", tenantSlug)
        .send({
          email: `rl-counted-${sfx}@test.local`,
          password: "Test1234!",
          firstName: "Counted",
          lastName: "User",
          phoneNumber: `5551${sfx.slice(0, 6)}`,
        });

      // The signup must not be rate-limited itself.
      expect(signupRes.status).not.toBe(429);

      // Track for cleanup
      if ([200, 201].includes(signupRes.status)) {
        const [dbUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, `rl-counted-${sfx}@test.local`));
        if (dbUser) createdUserIds.push(dbUser.id);
      }

      // ── Post-signup probe: the general counter should have dropped by 1 more
      const postSignupRes = await agent
        .get("/api/supplies")
        .set("X-Tenant-Slug", tenantSlug);
      expect(postSignupRes.status).not.toBe(429);

      const postSignupRemaining = parseRemaining(
        postSignupRes.headers as Record<string, string>,
      );
      expect(postSignupRemaining).not.toBeNaN();

      // We've consumed:
      //   1 (baseline GET) + 1 (slug-bearing signup) + 1 (this probe GET) = 3
      // So remaining should be 200 - 3 = 197.
      //
      // The critical check is the delta from baseline: must be 2 (signup + probe),
      // not 1 (probe only — which would happen if the signup was skipped).
      const totalDelta = baselineRemaining - postSignupRemaining;
      expect(totalDelta).toBe(2);
    },
    30_000,
  );
});
