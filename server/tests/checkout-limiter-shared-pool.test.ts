/**
 * Integration test: checkoutLimiter shared-pool behaviour
 *
 * checkoutLimiter (windowMs: 15 min, max: 10) is applied to both
 * /api/orders and /api/create-payment-intent via two separate app.use() calls
 * that reference the **same** rateLimit() instance.  Because both registrations
 * share the same MemoryStore, they also share the same per-IP counter.
 *
 * This test documents and confirms that shared-pool design as a contract:
 *   1. 10 POST /api/orders requests exhaust the checkoutLimiter budget.
 *   2. The 11th POST /api/orders returns 429.
 *   3. POST /api/create-payment-intent also returns 429 — the budget was
 *      already depleted by the /api/orders burst, proving the shared-pool
 *      behaviour.
 *
 * If this test fails with /api/create-payment-intent NOT returning 429, the
 * two routes have been decoupled onto separate MemoryStore instances — update
 * the comment in routes.ts to reflect the new independent-pool design.
 *
 * NOTE: An X-Tenant-Slug header is required on every request so that
 * tenantMiddleware resolves a tenantId and calls next() rather than returning
 * 400 before the checkoutLimiter middleware has a chance to run.
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

// Build a fresh Express app with isolated rate-limiter instances.
// Importing routes inside the function (rather than at module scope) gives each
// test file its own limiter MemoryStore so tests do not interfere with each
// other when run in parallel.
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
  // Create a real tenant so X-Tenant-Slug resolves req.tenantId, which causes
  // tenantMiddleware to call next() and lets checkoutLimiter run.
  const sfx = randomSuffix();
  testTenantSlug = `co-pool-${sfx}`;

  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `CheckoutLimiterSharedPoolTest ${sfx}`,
      slug: testTenantSlug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  testTenantId = tenant.id;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (testTenantId) {
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("checkoutLimiter shared-pool — /api/orders traffic depletes /api/create-payment-intent budget", () => {
  /**
   * Limiter layout (from server/routes.ts):
   *
   *   checkoutLimiter → app.use('/api/orders',                 checkoutLimiter)  max: 10
   *   checkoutLimiter → app.use('/api/create-payment-intent',  checkoutLimiter)  max: 10  (same instance)
   *
   * Both registrations share the same MemoryStore and therefore the same
   * per-IP counter.  After 10 POST /api/orders requests the shared counter
   * reaches 10 / 10 and blocks any further request on either path.
   */

  it(
    "exhausts checkoutLimiter with 10 POST /api/orders requests — 11th returns 429",
    async () => {
      const CHECKOUT_LIMITER_MAX = 10;

      // Send exactly max requests. The X-Tenant-Slug header ensures tenantMiddleware
      // resolves a tenantId and calls next(), so checkoutLimiter can run and count
      // each hit. Each request must not be blocked by the limiter (non-429).
      for (let i = 0; i < CHECKOUT_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/orders")
          .set("X-Tenant-Slug", testTenantSlug)
          .send({ items: [] });

        expect(
          res.status,
          `attempt ${i + 1}/${CHECKOUT_LIMITER_MAX} was blocked by checkoutLimiter before budget was exhausted`,
        ).not.toBe(429);
      }

      // The (max + 1)th request must be blocked by checkoutLimiter.
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
    120_000,
  );

  it(
    "POST /api/create-payment-intent also returns 429 after the checkoutLimiter budget is depleted by /api/orders — shared-pool confirmed",
    async () => {
      // At this point the checkoutLimiter counter (shared between both routes)
      // is already past 10.  Any request on /api/create-payment-intent must also
      // be blocked because it uses the exact same MemoryStore entry.
      const paymentRes = await agent
        .post("/api/create-payment-intent")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({ amount: 1000 });

      expect(
        paymentRes.status,
        `POST /api/create-payment-intent should return 429 (shared-pool depleted by /api/orders) but got ${paymentRes.status}`,
      ).toBe(429);

      expect(
        paymentRes.body?.message,
        "429 body on /api/create-payment-intent should carry the checkoutLimiter message",
      ).toMatch(/too many checkout attempts/i);
    },
    30_000,
  );
});
