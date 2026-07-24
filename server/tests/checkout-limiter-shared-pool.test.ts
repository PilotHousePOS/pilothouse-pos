/**
 * Integration test: checkoutLimiter shared-pool behaviour
 *
 * checkoutLimiter (windowMs: 15 min, max: 10) is applied to both
 * /api/orders and /api/create-payment-intent via two separate app.use() calls
 * that reference the **same** rateLimit() instance.  Because both
 * registrations share the same MemoryStore, they also share the same per-IP
 * counter.
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

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
  testTenantSlug = `cl-pool-${sfx}`;

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

describe("checkoutLimiter window-reset — counter clears after the 15-minute windowMs expires", () => {
  /**
   * This describe block uses a dedicated source IP (via X-Forwarded-For) so it
   * starts with a fresh rate-limit bucket that is completely separate from the
   * shared-pool tests below, which run against the default loopback address.
   *
   * Verification strategy:
   *   1. Exhaust the checkoutLimiter for the dedicated IP (10 requests).
   *   2. Confirm the 11th request is blocked (429).
   *   3. Spy on Date.now() and fast-forward the virtual clock past windowMs
   *      (15 min + 1 ms).  express-rate-limit's MemoryStore compares timestamps
   *      with Date.now() on every request, so advancing the virtual clock is
   *      sufficient — no real sleep needed.
   *   4. Confirm the next request is no longer blocked (counter has reset).
   *
   * NOTE: Only Date.now() is mocked — setTimeout/setInterval are left real so
   * that supertest's internal async operations are not affected.
   */

  // A unique fake IP to get a fresh bucket in the shared MemoryStore.
  // getRealIp() reads the rightmost X-Forwarded-For entry, so this value will
  // be used as the rate-limit key for every request in this describe block.
  const RESET_TEST_IP = "10.99.1.1";
  const CHECKOUT_LIMITER_MAX = 10;
  const WINDOW_MS = 15 * 60 * 1000; // must match windowMs in sharedLimiters.ts

  it(
    "allows POST /api/orders again after the 15-minute window expires",
    async () => {
      // ── Step 1: exhaust the budget for RESET_TEST_IP ──────────────────────
      for (let i = 0; i < CHECKOUT_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/orders")
          .set("X-Tenant-Slug", testTenantSlug)
          .set("X-Forwarded-For", RESET_TEST_IP);

        expect(
          res.status,
          `request ${i + 1}/${CHECKOUT_LIMITER_MAX} should not be rate-limited before budget is exhausted`,
        ).not.toBe(429);
      }

      // ── Step 2: confirm the budget is now exhausted ───────────────────────
      const blockedRes = await agent
        .post("/api/orders")
        .set("X-Tenant-Slug", testTenantSlug)
        .set("X-Forwarded-For", RESET_TEST_IP);

      expect(
        blockedRes.status,
        `11th POST /api/orders should be blocked (429) but got ${blockedRes.status}`,
      ).toBe(429);

      expect(
        blockedRes.body?.message,
        "429 body should carry the checkoutLimiter message",
      ).toMatch(/too many checkout attempts/i);

      // ── Step 3: advance the virtual clock past windowMs ───────────────────
      // Spy on Date.now() so that express-rate-limit's MemoryStore sees a
      // timestamp that is beyond the 15-minute window.  We only mock Date.now()
      // (not timers) to keep supertest's async internals working normally.
      const realNow = Date.now();
      const dateSpy = vi
        .spyOn(Date, "now")
        .mockReturnValue(realNow + WINDOW_MS + 1);

      try {
        // ── Step 4: confirm the counter has reset ─────────────────────────
        const afterResetRes = await agent
          .post("/api/orders")
          .set("X-Tenant-Slug", testTenantSlug)
          .set("X-Forwarded-For", RESET_TEST_IP);

        expect(
          afterResetRes.status,
          `POST /api/orders should be allowed after the ${WINDOW_MS}ms window expires, but got ${afterResetRes.status}`,
        ).not.toBe(429);
      } finally {
        dateSpy.mockRestore();
      }
    },
    120_000,
  );
});

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

      // Send exactly max requests.  The X-Tenant-Slug header ensures
      // tenantMiddleware resolves a tenantId and calls next(), so
      // checkoutLimiter can run and count each hit.  Each request must not be
      // blocked by the limiter (non-429).  We don't include a valid body
      // because request validation is downstream of the rate-limiter
      // middleware — the limiter fires first and the response status reflects
      // the rate-limiter decision, not the payload validation.
      for (let i = 0; i < CHECKOUT_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/orders")
          .set("X-Tenant-Slug", testTenantSlug);

        expect(
          res.status,
          `attempt ${i + 1}/${CHECKOUT_LIMITER_MAX} was blocked by checkoutLimiter before budget was exhausted`,
        ).not.toBe(429);
      }

      // The (max + 1)th request must be blocked by checkoutLimiter.
      const blockedRes = await agent
        .post("/api/orders")
        .set("X-Tenant-Slug", testTenantSlug);

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
      // is already past 10.  Any request on /api/create-payment-intent must
      // also be blocked because it uses the exact same MemoryStore entry.
      const paymentIntentRes = await agent
        .post("/api/create-payment-intent")
        .set("X-Tenant-Slug", testTenantSlug);

      expect(
        paymentIntentRes.status,
        `POST /api/create-payment-intent should return 429 (shared-pool depleted by /api/orders) but got ${paymentIntentRes.status}`,
      ).toBe(429);

      expect(
        paymentIntentRes.body?.message,
        "429 body on /api/create-payment-intent should carry the checkoutLimiter message",
      ).toMatch(/too many checkout attempts/i);
    },
    30_000,
  );
});
