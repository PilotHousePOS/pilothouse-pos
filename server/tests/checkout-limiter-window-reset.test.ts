/**
 * Integration test: checkoutLimiter window reset
 *
 * checkoutLimiter (windowMs: 15 min, max: 10) guards /api/orders and
 * /api/create-payment-intent via a shared MemoryStore.  After the 15-minute
 * window expires, the per-IP counter must reset so a previously rate-limited
 * IP can submit orders again.
 *
 * Done looks like:
 *   1. 10 POST /api/orders requests exhaust the checkoutLimiter budget.
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
  testTenantSlug = `cl-reset-${sfx}`;

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
      name: `CheckoutLimiterWindowResetTest ${sfx}`,
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

describe("checkoutLimiter — window reset allows requests after the 15-minute window expires", () => {
  it(
    "blocks on the 11th attempt then allows a new request after the window rolls over",
    async () => {
      const CHECKOUT_LIMITER_MAX = 10; // mirrors checkoutLimiter max
      const WINDOW_MS = 15 * 60 * 1000; // mirrors checkoutLimiter windowMs

      // ── Phase 1: exhaust the rate-limit budget ────────────────────────────
      // Send CHECKOUT_LIMITER_MAX requests to /api/orders.  Each request is
      // counted by the checkoutLimiter.  We only care that the limiter counts
      // them — not whether the route handler succeeds — so any non-429 status
      // is acceptable here (200/400/401/etc.).
      for (let i = 0; i < CHECKOUT_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/orders")
          .set("X-Tenant-Slug", testTenantSlug)
          .send({});

        expect(
          res.status,
          `attempt ${i + 1}/${CHECKOUT_LIMITER_MAX} was blocked by checkoutLimiter before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: 11th request must be rate-limited ────────────────────────
      const blockedRes = await agent
        .post("/api/orders")
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
        .post("/api/orders")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({});

      // The critical assertion: the window reset must allow new requests through.
      expect(
        afterRes.status,
        `request after window rollover returned 429 — checkoutLimiter window did not reset correctly`,
      ).not.toBe(429);
    },
    120_000,
  );

  it(
    "blocks /api/create-payment-intent after budget is exhausted via /api/orders, then allows it after the window rolls over",
    async () => {
      const CHECKOUT_LIMITER_MAX = 10; // mirrors checkoutLimiter max
      const WINDOW_MS = 15 * 60 * 1000; // mirrors checkoutLimiter windowMs

      // Reset the clock to a fresh starting point so this test is independent
      // of the previous one.
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 5_000));

      // ── Phase 1: exhaust the rate-limit budget via /api/orders ───────────
      for (let i = 0; i < CHECKOUT_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/orders")
          .set("X-Tenant-Slug", testTenantSlug)
          .send({});

        expect(
          res.status,
          `attempt ${i + 1}/${CHECKOUT_LIMITER_MAX} was blocked by checkoutLimiter before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: /api/create-payment-intent must now be blocked ──────────
      // The shared MemoryStore means exhausting /api/orders also blocks the
      // payment-intent route.
      const blockedRes = await agent
        .post("/api/create-payment-intent")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({});

      expect(
        blockedRes.status,
        `POST /api/create-payment-intent should be rate-limited (429) after budget exhausted via /api/orders, but got ${blockedRes.status}`,
      ).toBe(429);

      expect(
        blockedRes.body?.message,
        "429 body should carry the checkoutLimiter message",
      ).toMatch(/too many checkout attempts/i);

      // ── Phase 3: advance the clock past the 15-minute window ─────────────
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1000));

      // ── Phase 4: /api/create-payment-intent must be unblocked after rollover
      const afterRes = await agent
        .post("/api/create-payment-intent")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({});

      // The critical assertion: the window reset must allow payment-intent
      // requests through after the 15-minute window expires.
      expect(
        afterRes.status,
        `POST /api/create-payment-intent returned 429 after window rollover — checkoutLimiter window did not reset for this route`,
      ).not.toBe(429);
    },
    120_000,
  );
});
