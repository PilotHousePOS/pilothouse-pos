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
});
