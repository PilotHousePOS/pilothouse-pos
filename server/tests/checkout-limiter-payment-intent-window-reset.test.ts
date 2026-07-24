/**
 * Integration test: checkoutLimiter window reset — /api/create-payment-intent
 *
 * checkoutLimiter (windowMs: 15 min, max: 10) guards /api/orders and
 * /api/create-payment-intent via a shared MemoryStore.  This test exhausts
 * the budget via /api/create-payment-intent and confirms that route is also
 * unblocked after the 15-minute window expires.
 *
 * Done looks like:
 *   1. 10 POST /api/create-payment-intent requests exhaust the checkoutLimiter budget.
 *   2. The 11th request returns 429.
 *   3. Date.now() is advanced past the 15-minute windowMs.
 *   4. The first request after rollover is NOT 429 — counter has reset.
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
  const sfx = randomSuffix();
  testTenantSlug = `cl-pi-reset-${sfx}`;

  // Advance the tenants PK sequence to avoid collisions with parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `CheckoutLimiterPaymentIntentWindowResetTest ${sfx}`,
      slug: testTenantSlug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  testTenantId = tenant.id;

  // Freeze Date.now() so the rate-limiter window starts at a known time.
  // We only fake the Date (not setTimeout/setInterval) so that real async DB
  // operations and supertest HTTP calls continue to work correctly.
  vi.useFakeTimers({ toFake: ["Date"] });

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  // Restore real timers before any cleanup async work.
  vi.useRealTimers();

  if (testTenantId) {
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("checkoutLimiter — window reset unblocks /api/create-payment-intent after the 15-minute window expires", () => {
  it(
    "blocks on the 11th attempt then allows a new request after the window rolls over",
    async () => {
      const CHECKOUT_LIMITER_MAX = 10; // mirrors checkoutLimiter max
      const WINDOW_MS = 15 * 60 * 1000; // mirrors checkoutLimiter windowMs

      // ── Phase 1: exhaust the rate-limit budget ────────────────────────────
      // Send CHECKOUT_LIMITER_MAX requests to /api/create-payment-intent.
      // Each request is counted by the checkoutLimiter.  We only care that the
      // limiter counts them — not whether the route handler succeeds — so any
      // non-429 status is acceptable here (200/400/401/etc.).
      for (let i = 0; i < CHECKOUT_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/create-payment-intent")
          .set("X-Tenant-Slug", testTenantSlug)
          .send({});

        expect(
          res.status,
          `attempt ${i + 1}/${CHECKOUT_LIMITER_MAX} was blocked by checkoutLimiter before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: 11th request must be rate-limited ────────────────────────
      const blockedRes = await agent
        .post("/api/create-payment-intent")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({});

      expect(
        blockedRes.status,
        `11th request should be rate-limited (429) but got ${blockedRes.status}`,
      ).toBe(429);

      expect(
        blockedRes.body?.message,
        "429 body should carry the checkoutLimiter message",
      ).toMatch(/too many checkout attempts/i);

      // ── Phase 3: advance the clock past the 15-minute window ─────────────
      // Moving Date.now() forward causes the MemoryStore to treat the existing
      // window as expired and reset the counter on the next request.
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1000));

      // ── Phase 4: first request after rollover must not be blocked ─────────
      const afterRes = await agent
        .post("/api/create-payment-intent")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({});

      // The critical assertion: the window reset must allow new requests through.
      expect(
        afterRes.status,
        `request after window rollover returned 429 — checkoutLimiter window did not reset correctly for /api/create-payment-intent`,
      ).not.toBe(429);
    },
    120_000,
  );
});
