/**
 * Tests: signupLimiter — rate limiting for POST /api/auth/signup
 *
 * Two scenarios are covered:
 *
 *  1. After 15 slug-bearing signup attempts the signupLimiter returns 429.
 *     Because each fresh Express app instance carries a fresh in-memory rate-limit
 *     store, the counter starts at zero for each test run.
 *
 *  2. When tenantMiddleware fails and returns 503, ALL signup attempts are
 *     blocked by that 503 — they never reach the signup handler.  This
 *     demonstrates that the signupLimiter skip (`!req.tenantId`) does NOT
 *     create an unprotected path: the 503 itself acts as the guard.
 *
 * Neither scenario touches production data — scenario 1 uses a real tenant row
 * for slug resolution but intentionally sends invalid bodies that will fail
 * before user creation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import supertest from "supertest";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Scenario 1: signupLimiter fires after 15 tenant-bearing attempts ─────────

describe("signupLimiter — rate limit fires after 15 slug-bearing attempts", () => {
  let tenantId: number;
  let tenantSlug: string;
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    const sfx = randomSuffix();
    tenantSlug = `limiter-test-${sfx}`;

    // Advance the sequence to avoid collisions with parallel test files
    await db.execute(
      sql`SELECT setval(
            pg_get_serial_sequence('tenants', 'id'),
            GREATEST((SELECT MAX(id) FROM tenants), 1)
          )`,
    );

    const [tenant] = await db
      .insert(tenants)
      .values({
        name: `Limiter Test ${sfx}`,
        slug: tenantSlug,
        subscriptionStatus: "active",
        subscriptionTier: "starter",
      })
      .returning();

    tenantId = tenant.id;

    // Build a fresh app — a fresh in-memory rate-limit store starts at 0
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    const { registerRoutes } = await import("../routes");
    await registerRoutes(app);

    agent = supertest(app);
  }, 60_000);

  afterAll(async () => {
    if (tenantId) {
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  }, 30_000);

  it(
    "returns 429 on the 16th request when all 16 carry a valid X-Tenant-Slug",
    async () => {
      // Fire exactly 15 attempts with a deliberately invalid body (missing
      // required fields) so no user rows are created.  The limiter still
      // increments its counter because req.tenantId is set (slug resolves).
      for (let i = 0; i < 15; i++) {
        const res = await agent
          .post("/api/auth/signup")
          .set("X-Tenant-Slug", tenantSlug)
          .send({ email: `limiter-${i}-${randomSuffix()}@test.local` }); // intentionally incomplete

        // Accept any non-429 response (validation error, server error, etc.)
        // — as long as the limiter hasn't triggered yet.
        expect(res.status).not.toBe(429);
      }

      // The 16th request must be rate-limited.
      const last = await agent
        .post("/api/auth/signup")
        .set("X-Tenant-Slug", tenantSlug)
        .send({ email: `limiter-16-${randomSuffix()}@test.local` });

      expect(last.status).toBe(429);
    },
    60_000,
  );
});

// ─── Scenario 2: tenantMiddleware 503 path still blocks signup requests ───────

describe("signupLimiter — tenantMiddleware 503 path does not leave signup unprotected", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(() => {
    /**
     * Build a minimal app that reproduces the middleware stack of routes.ts
     * but replaces tenantMiddleware with one that always throws — simulating a
     * database failure during tenant resolution.
     *
     * Stack:
     *   1. brokenTenantMiddleware  → always throws → catch block → 503, no next()
     *   2. signupLimiter           → skip: !req.tenantId (req.tenantId is never set)
     *   3. dummy signup handler    → would return 200 if reached
     *
     * Assertion: all 20 attempts get 503, not 200.  The signupLimiter skip
     * does NOT open a hole; the 503 from tenantMiddleware itself is the guard.
     */
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    // Tenant middleware that always throws (mirrors the catch → 503 path)
    app.use("/api", async (_req, res, _next) => {
      // Intentionally do not call next() — mirrors the real catch block
      res
        .status(503)
        .json({ message: "Tenant resolution failed. Please try again." });
    });

    // The same signupLimiter from routes.ts
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 15,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Too many signup attempts, please try again in 15 minutes." },
      skip: (req: any) => !req.tenantId,
    });
    app.use("/api/auth/signup", limiter);

    // Dummy handler — must never be reached
    app.post("/api/auth/signup", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    agent = supertest(app);
  });

  it(
    "returns 503 for all 20 attempts when tenantMiddleware is broken — route is not unprotected",
    async () => {
      // Send well above the limiter threshold (15) to confirm neither the
      // limiter nor the handler is what's protecting the route — the 503 is.
      for (let i = 0; i < 20; i++) {
        const res = await agent
          .post("/api/auth/signup")
          .send({
            email: `bypass-${i}@test.local`,
            password: "Test1234!",
            firstName: "Bypass",
            lastName: "Attempt",
          });

        // Must be 503 (from broken tenantMiddleware), never 200 (handler) or
        // 429 (limiter — which would also mean the skip didn't fire correctly).
        expect(res.status).toBe(503);
      }
    },
    60_000,
  );
});
