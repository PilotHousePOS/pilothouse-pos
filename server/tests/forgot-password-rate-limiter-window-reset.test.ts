/**
 * Integration tests: authLimiter window reset for /api/forgot-password
 *
 * The authLimiter (windowMs: 15 min, max: 15) is mounted via
 *   app.use('/api/forgot-password', authLimiter)
 * in routes.ts.  After the window expires the counter must reset so that a
 * previously rate-limited IP can submit another request without being blocked.
 *
 * Implementation note on ALLOW_TENANT_FALLBACK:
 *   tenantMiddleware runs before the authLimiter for all /api routes.  For
 *   requests that lack a tenant slug and whose path is not in the
 *   UNAUTHENTICATED_NO_SLUG_ALLOWLIST (e.g. /forgot-password), tenantMiddleware
 *   returns 400 before the authLimiter ever runs.  Setting ALLOW_TENANT_FALLBACK
 *   causes tenantMiddleware to fall through with tenantId=1, so the authLimiter
 *   can count and eventually block requests normally.
 *
 * Done looks like:
 *   1. 15 POST /api/forgot-password requests exhaust the budget.
 *   2. The 16th request returns 429.
 *   3. System time is advanced past the 15-minute window.
 *   4. The first request after rollover is NOT 429 — the authLimiter reset.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Build a fresh Express app with fresh rate-limiter instances (module isolation
// ensures this file's import of routes is independent of other test files).
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
let originalAllowTenantFallback: string | undefined;

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Allow tenantMiddleware to fall through without a real tenant slug.
  // Without this, tenantMiddleware returns 400 for /api/forgot-password
  // (the path is not in its unauthenticated-no-slug allowlist), which
  // means the authLimiter never runs and cannot be exercised.
  originalAllowTenantFallback = process.env.ALLOW_TENANT_FALLBACK;
  process.env.ALLOW_TENANT_FALLBACK = "true";

  // Freeze Date.now() so the rate-limiter window starts at a known time.
  // We only fake the Date (not setTimeout/setInterval) so that real async DB
  // operations and supertest HTTP calls continue to work correctly.
  vi.useFakeTimers({ toFake: ["Date"] });

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  // Restore real timers and env before any cleanup async work.
  vi.useRealTimers();

  if (originalAllowTenantFallback === undefined) {
    delete process.env.ALLOW_TENANT_FALLBACK;
  } else {
    process.env.ALLOW_TENANT_FALLBACK = originalAllowTenantFallback;
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("authLimiter — window reset allows forgot-password attempts after expiry", () => {
  it(
    "blocks on the 16th attempt then allows a new attempt after the window rolls over",
    async () => {
      const MAX_ATTEMPTS = 15; // mirrors authLimiter max

      // ── Phase 1: exhaust the rate-limit budget ────────────────────────────
      // Send MAX_ATTEMPTS forgot-password requests.  The authLimiter counts each
      // one; there is no route handler registered at /api/forgot-password itself
      // (the handler lives at /api/auth/forgot-password), so Express returns 404
      // after the limiter passes — the important thing is that requests are NOT
      // 429 before the budget is exhausted.
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const res = await agent
          .post("/api/forgot-password")
          .send({ email: `nonexistent-${i}@test.local` });

        expect(
          res.status,
          `attempt ${i + 1}/${MAX_ATTEMPTS} returned 429 before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: 16th request must be rate-limited ────────────────────────
      const blockedRes = await agent
        .post("/api/forgot-password")
        .send({ email: "nonexistent-blocked@test.local" });

      expect(
        blockedRes.status,
        `16th request should be rate-limited (429) but got ${blockedRes.status}`,
      ).toBe(429);

      // ── Phase 3: advance the clock past the 15-minute window ──────────────
      // Moving Date.now() forward causes the MemoryStore to treat the existing
      // window as expired and reset the counter on the next request.
      const WINDOW_MS = 15 * 60 * 1000;
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1000));

      // ── Phase 4: first request after rollover must not be blocked ─────────
      const afterRes = await agent
        .post("/api/forgot-password")
        .send({ email: "nonexistent-after-rollover@test.local" });

      // The critical assertion: the window reset must allow new requests through.
      // The authLimiter is mounted at /api/forgot-password but there is no route
      // handler at that exact path, so Express returns 404 after the limiter
      // passes — any status other than 429 confirms the limiter correctly reset.
      expect(
        afterRes.status,
        `request after window rollover returned 429 — authLimiter window did not reset correctly`,
      ).not.toBe(429);
    },
    90_000,
  );
});
