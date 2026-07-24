/**
 * Integration test: searchLimiter window reset
 *
 * searchLimiter (windowMs: 1 min, max: 60) guards /api/supplies/search and
 * /api/pets via a shared MemoryStore.  After the 1-minute window expires, the
 * per-IP counter must reset so a previously rate-limited IP can search again.
 *
 * Done looks like:
 *   1. 60 GET /api/supplies/search requests exhaust the searchLimiter budget.
 *   2. The 61st request returns 429.
 *   3. Date.now() is advanced past the 1-minute windowMs.
 *   4. The first request after rollover is NOT 429 — counter has reset.
 *   5. (Second test) The window reset also lifts the 429 on /api/pets specifically.
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
  testTenantSlug = `sl-reset-${sfx}`;

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
      name: `SearchLimiterWindowResetTest ${sfx}`,
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

describe("searchLimiter — window reset allows requests after the 1-minute window expires", () => {
  it(
    "blocks on the 61st attempt then allows a new request after the window rolls over",
    async () => {
      const SEARCH_LIMITER_MAX = 60; // mirrors searchLimiter max
      const WINDOW_MS = 1 * 60 * 1000; // mirrors searchLimiter windowMs

      // ── Phase 1: exhaust the rate-limit budget ────────────────────────────
      // Send SEARCH_LIMITER_MAX requests to /api/supplies/search.  Each request
      // is counted by the searchLimiter.  We only care that the limiter counts
      // them — not whether the route handler succeeds — so any non-429 status
      // is acceptable here (200/400/401/etc.).
      for (let i = 0; i < SEARCH_LIMITER_MAX; i++) {
        const res = await agent
          .get("/api/supplies/search")
          .set("X-Tenant-Slug", testTenantSlug)
          .query({ q: `test-${i}` });

        expect(
          res.status,
          `attempt ${i + 1}/${SEARCH_LIMITER_MAX} was blocked by searchLimiter before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: 61st request must be rate-limited ────────────────────────
      const blockedRes = await agent
        .get("/api/supplies/search")
        .set("X-Tenant-Slug", testTenantSlug)
        .query({ q: "over-limit" });

      expect(
        blockedRes.status,
        `61st request should be rate-limited (429) but got ${blockedRes.status}`,
      ).toBe(429);

      expect(
        blockedRes.body?.message,
        "429 body should carry the searchLimiter message",
      ).toMatch(/too many search requests/i);

      // ── Phase 3: advance the clock past the 1-minute window ───────────────
      // Moving Date.now() forward causes the MemoryStore to treat the existing
      // window as expired and reset the counter on the next request.
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1000));

      // ── Phase 4: first request after rollover must not be blocked ─────────
      const afterRes = await agent
        .get("/api/supplies/search")
        .set("X-Tenant-Slug", testTenantSlug)
        .query({ q: "after-rollover" });

      // The critical assertion: the window reset must allow new requests through.
      expect(
        afterRes.status,
        `request after window rollover returned 429 — searchLimiter window did not reset correctly`,
      ).not.toBe(429);
    },
    120_000,
  );

  it(
    "window reset also unblocks /api/pets after the 1-minute expiry",
    async () => {
      const SEARCH_LIMITER_MAX = 60; // mirrors searchLimiter max
      const WINDOW_MS = 1 * 60 * 1000; // mirrors searchLimiter windowMs

      // ── Phase 1: exhaust the shared searchLimiter budget via /api/supplies/search ──
      // The previous test left the clock advanced and may have consumed some of
      // the new window's budget (the final "after-rollover" request).  Advance
      // the clock by another full window so this test starts with a completely
      // fresh, unused counter.
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1000));

      // Send SEARCH_LIMITER_MAX requests to consume the full budget.
      for (let i = 0; i < SEARCH_LIMITER_MAX; i++) {
        const res = await agent
          .get("/api/supplies/search")
          .set("X-Tenant-Slug", testTenantSlug)
          .query({ q: `pets-phase1-${i}` });

        expect(
          res.status,
          `attempt ${i + 1}/${SEARCH_LIMITER_MAX} was unexpectedly blocked before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: /api/pets must now be blocked (shared pool is exhausted) ──
      const blockedPetsRes = await agent
        .get("/api/pets")
        .set("X-Tenant-Slug", testTenantSlug);

      expect(
        blockedPetsRes.status,
        `/api/pets should be rate-limited (429) because the shared searchLimiter budget is exhausted, but got ${blockedPetsRes.status}`,
      ).toBe(429);

      expect(
        blockedPetsRes.body?.message,
        "429 body on /api/pets should carry the searchLimiter message",
      ).toMatch(/too many search requests/i);

      // ── Phase 3: advance the clock past the 1-minute window ───────────────
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1000));

      // ── Phase 4: /api/pets must be unblocked after the window rolls over ──
      const afterPetsRes = await agent
        .get("/api/pets")
        .set("X-Tenant-Slug", testTenantSlug);

      // The critical assertion: the window reset must lift the 429 on /api/pets.
      expect(
        afterPetsRes.status,
        `/api/pets returned 429 after window rollover — searchLimiter window did not reset for /api/pets`,
      ).not.toBe(429);
    },
    120_000,
  );

  it(
    "window reset also unblocks /api/supplies/search after the budget was exhausted via /api/pets",
    async () => {
      const SEARCH_LIMITER_MAX = 60; // mirrors searchLimiter max
      const WINDOW_MS = 1 * 60 * 1000; // mirrors searchLimiter windowMs

      // ── Phase 1: advance to a fresh window ───────────────────────────────
      // Previous tests may have consumed some of the current window's budget.
      // Advance the clock by a full window so this test starts with a
      // completely fresh, unused counter.
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1000));

      // ── Phase 2: exhaust the shared searchLimiter budget via /api/pets ────
      // Send SEARCH_LIMITER_MAX requests to /api/pets.  Because /api/pets and
      // /api/supplies/search share the same searchLimiter instance they count
      // against the same per-IP budget.  We only care that the limiter counts
      // them — not whether the route handler succeeds — so any non-429 status
      // is acceptable here.
      for (let i = 0; i < SEARCH_LIMITER_MAX; i++) {
        const res = await agent
          .get("/api/pets")
          .set("X-Tenant-Slug", testTenantSlug);

        expect(
          res.status,
          `attempt ${i + 1}/${SEARCH_LIMITER_MAX} via /api/pets was unexpectedly blocked before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 3: 61st /api/pets request must be rate-limited ──────────────
      const blockedPetsRes = await agent
        .get("/api/pets")
        .set("X-Tenant-Slug", testTenantSlug);

      expect(
        blockedPetsRes.status,
        `61st /api/pets request should be rate-limited (429) but got ${blockedPetsRes.status}`,
      ).toBe(429);

      expect(
        blockedPetsRes.body?.message,
        "429 body on /api/pets should carry the searchLimiter message",
      ).toMatch(/too many search requests/i);

      // ── Phase 4: advance the clock past the 1-minute window ───────────────
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1000));

      // ── Phase 5: /api/supplies/search must be unblocked after rollover ─────
      const afterSearchRes = await agent
        .get("/api/supplies/search")
        .set("X-Tenant-Slug", testTenantSlug)
        .query({ q: "after-pets-rollover" });

      // The critical assertion: exhausting via /api/pets must also unblock
      // /api/supplies/search once the window rolls over.
      expect(
        afterSearchRes.status,
        `/api/supplies/search returned 429 after window rollover — searchLimiter window did not reset after budget was exhausted via /api/pets`,
      ).not.toBe(429);
    },
    120_000,
  );
});
