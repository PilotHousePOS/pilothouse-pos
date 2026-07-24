/**
 * Integration tests: authLimiter window reset for /api/auth/login
 *
 * The authLimiter (windowMs: 15 min, max: 15) guards /api/auth/login.
 * After the window expires the counter must reset so that a previously
 * rate-limited IP can attempt login again.
 *
 * Done looks like:
 *   1. 15 POST /api/auth/login requests exhaust the budget.
 *   2. The 16th request returns 429.
 *   3. System time is advanced past the 15-minute window.
 *   4. The first request after rollover is NOT 429 — it reaches the login handler.
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

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
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
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("authLimiter — window reset allows login attempts after expiry", () => {
  it(
    "blocks on the 16th attempt then allows a new attempt after the window rolls over",
    async () => {
      const MAX_ATTEMPTS = 15; // mirrors authLimiter max

      // ── Phase 1: exhaust the rate-limit budget ────────────────────────────
      // Send MAX_ATTEMPTS login requests with bogus credentials.  The login
      // handler will return 401 (wrong password / unknown user) for each one —
      // the important thing is that the authLimiter counts them without 429.
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const res = await agent
          .post("/api/auth/login")
          .send({
            email: `nonexistent-${i}@test.local`,
            password: "WrongPassword1!",
          });

        expect(
          res.status,
          `attempt ${i + 1}/${MAX_ATTEMPTS} returned 429 before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: 16th request must be rate-limited ────────────────────────
      const blockedRes = await agent
        .post("/api/auth/login")
        .send({
          email: "nonexistent-blocked@test.local",
          password: "WrongPassword1!",
        });

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
        .post("/api/auth/login")
        .send({
          email: "nonexistent-after-rollover@test.local",
          password: "WrongPassword1!",
        });

      // The critical assertion: the window reset must allow new requests through.
      // The login handler will return 401 (bad credentials) — that's fine.
      // Any status other than 429 means the authLimiter correctly reset.
      expect(
        afterRes.status,
        `request after window rollover returned 429 — authLimiter window did not reset correctly`,
      ).not.toBe(429);

      // It must have reached the login handler (401 for bad credentials).
      expect(
        afterRes.status,
        `post-rollover login should reach the handler (expect 401) but got ${afterRes.status}: ${JSON.stringify(afterRes.body)}`,
      ).toBe(401);
    },
    90_000,
  );

  it(
    "RateLimit-Remaining header equals max-1 (14) and RateLimit-Reset reflects a fresh window after rollover",
    async () => {
      const MAX_ATTEMPTS = 15; // mirrors authLimiter max
      const WINDOW_MS = 15 * 60 * 1000;

      // ── Preamble: advance time into a guaranteed-clean window ─────────────
      // The previous test may have left the rate-limiter with a partially
      // consumed window.  Jump forward by another full window so the MemoryStore
      // treats all prior records as expired before we start counting.
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1000));

      // ── Phase 1: exhaust the rate-limit budget ────────────────────────────
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const res = await agent
          .post("/api/auth/login")
          .send({
            email: `budget-check-${i}@test.local`,
            password: "WrongPassword1!",
          });

        expect(
          res.status,
          `attempt ${i + 1}/${MAX_ATTEMPTS} returned 429 before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: 16th request must be rate-limited ────────────────────────
      const blockedRes = await agent
        .post("/api/auth/login")
        .send({
          email: "budget-check-blocked@test.local",
          password: "WrongPassword1!",
        });
      expect(blockedRes.status).toBe(429);

      // ── Phase 3: advance the clock past the 15-minute window ──────────────
      const afterWindowTime = Date.now() + WINDOW_MS + 1000;
      vi.setSystemTime(new Date(afterWindowTime));

      // ── Phase 4: first request after rollover — inspect rate-limit headers ─
      const afterRes = await agent
        .post("/api/auth/login")
        .send({
          email: "budget-check-after-rollover@test.local",
          password: "WrongPassword1!",
        });

      expect(
        afterRes.status,
        `request after window rollover returned 429 — authLimiter window did not reset correctly`,
      ).not.toBe(429);

      // RateLimit-Remaining must equal max - 1 = 14 (one request consumed in
      // the fresh window). A stale partial reset would produce a lower value.
      const remaining = afterRes.headers["ratelimit-remaining"];
      expect(
        remaining,
        `RateLimit-Remaining should be "14" after rollover but got "${remaining}"`,
      ).toBe("14");

      // RateLimit-Reset must be in the future relative to the time we advanced
      // to, i.e. it reflects a new window starting at afterWindowTime rather
      // than the old (already-expired) window end.
      const resetHeader = afterRes.headers["ratelimit-reset"];
      expect(
        resetHeader,
        "RateLimit-Reset header must be present after rollover",
      ).toBeDefined();

      // express-rate-limit with standardHeaders: true sets RateLimit-Reset to
      // the number of seconds remaining until the current window expires.
      // After a fresh window starts with one request consumed, the reset value
      // should be a positive number of seconds (≤ window duration = 900 s).
      const resetSeconds = Number(resetHeader);
      expect(
        isNaN(resetSeconds),
        `RateLimit-Reset should be a number but got "${resetHeader}"`,
      ).toBe(false);
      expect(
        resetSeconds,
        `RateLimit-Reset should be > 0 (fresh window) but got ${resetSeconds}`,
      ).toBeGreaterThan(0);
      expect(
        resetSeconds,
        `RateLimit-Reset should be ≤ 900 s (one window) but got ${resetSeconds}`,
      ).toBeLessThanOrEqual(900);
    },
    90_000,
  );
});
