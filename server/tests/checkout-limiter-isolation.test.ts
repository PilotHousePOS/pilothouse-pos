/**
 * Integration tests: checkoutLimiter budget isolation
 *
 * checkoutLimiter (windowMs: 15 min, max: 10) is the tightest per-IP limiter
 * in the system.  It covers two routes:
 *   - POST /api/orders
 *   - POST /api/create-payment-intent
 *
 * generalLimiter (windowMs: 15 min, max: 200) covers all /api/* routes.
 *
 * Each limiter maintains its own MemoryStore, so exhausting checkoutLimiter
 * must NOT consume budget from generalLimiter.
 *
 * Done looks like:
 *   1. 10 POST /api/orders requests exhaust the checkoutLimiter budget.
 *   2. The 11th POST /api/orders returns 429.
 *   3. GET /api/stripe/config (generalLimiter only, max 200) still responds
 *      non-429 — checkoutLimiter exhaustion did not bleed into generalLimiter.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Build a fresh Express app with isolated rate-limiter instances.
 * Importing routes inside the function (rather than at module scope) gives each
 * test file its own limiter MemoryStore so tests do not interfere with each
 * other when run in parallel.
 */
async function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);
  return app;
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;
let testTenantId: number;
let testTenantSlug: string;

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();

  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `CheckoutLimiterIsolationTest ${sfx}`,
      slug: `co-lim-iso-${sfx}`,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  testTenantId = tenant.id;
  testTenantSlug = `co-lim-iso-${sfx}`;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (testTenantId) {
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("checkoutLimiter isolation — exhaustion does not bleed into generalLimiter", () => {
  /**
   * Limiter layout (from server/routes.ts):
   *
   * generalLimiter  → app.use('/api', ...)       max: 200  window: 15 min
   * checkoutLimiter → app.use('/api/orders', .)  max:  10  window: 15 min
   *
   * After 10 POST /api/orders requests:
   *   checkoutLimiter : 10 / 10  → exhausted
   *   generalLimiter  : 10 / 200 → plenty of budget remaining
   *
   * The two limiters each have their own MemoryStore instance created by
   * separate rateLimit() calls in routes.ts.  A shared-store bug would cause
   * checkoutLimiter exhaustion to consume generalLimiter budget and eventually
   * block GET /api/stripe/config — which must not happen here.
   */

  it(
    "exhausts checkoutLimiter — POST /api/orders returns 429 on the 11th attempt",
    async () => {
      const CHECKOUT_LIMITER_MAX = 10;

      // Exhaust the checkoutLimiter budget. Each request includes X-Tenant-Slug
      // so tenantMiddleware resolves req.tenantId and passes the request on to
      // the checkoutLimiter rather than short-circuiting with a 400 "Missing
      // tenant" response before the limiter even runs.  The requests will fail
      // at the application layer (no auth cookie → 401), but they must reach
      // the limiter so it can count them.
      for (let i = 0; i < CHECKOUT_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/orders")
          .set("X-Tenant-Slug", testTenantSlug)
          .send({ items: [] });

        expect(
          res.status,
          `attempt ${i + 1}/${CHECKOUT_LIMITER_MAX} returned 429 before checkoutLimiter budget was exhausted`,
        ).not.toBe(429);
      }

      // 11th request must be blocked by checkoutLimiter.
      const blockedRes = await agent
        .post("/api/orders")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({ items: [] });

      expect(
        blockedRes.status,
        `11th POST /api/orders should return 429 but got ${blockedRes.status}`,
      ).toBe(429);

      expect(
        blockedRes.body?.message,
        "429 body should carry the checkoutLimiter message",
      ).toMatch(/too many checkout attempts/i);
    },
    60_000,
  );

  it(
    "GET /api/stripe/config (generalLimiter only) is not blocked after checkoutLimiter exhaustion",
    async () => {
      /**
       * generalLimiter max is 200; the 10 POST /api/orders requests above plus
       * the 11th blocked attempt consumed at most 11 of those 200 slots —
       * far below the threshold.
       *
       * If the two limiters shared a MemoryStore (or a key prefix collision
       * caused the counters to merge), checkoutLimiter exhaustion could bleed
       * into generalLimiter and incorrectly block this request with 429.
       *
       * The test confirms that budget isolation holds: GET /api/stripe/config
       * reaches its handler and returns a non-429 response.
       */
      const configRes = await agent.get("/api/stripe/config");

      expect(
        configRes.status,
        `GET /api/stripe/config returned 429 after checkoutLimiter exhaustion — budget leaked into generalLimiter`,
      ).not.toBe(429);

      // Must reach the handler (any 2xx–4xx is acceptable; 429 or 5xx is not).
      expect(configRes.status).toBeGreaterThanOrEqual(200);
      expect(configRes.status).toBeLessThan(500);
    },
    30_000,
  );
});
