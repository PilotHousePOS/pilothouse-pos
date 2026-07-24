/**
 * Integration tests: authLimiter window reset for /api/auth/forgot-password
 * and /api/auth/reset-password
 *
 * The authLimiter (windowMs: 15 min, max: 15) is mounted on five routes via a
 * single rateLimit() instance, so all five paths share the same MemoryStore
 * counter.  Exhausting the budget via /api/auth/forgot-password must:
 *   a) block that endpoint (429), AND
 *   b) also block /api/auth/reset-password (shared counter), AND
 *   c) reset both when the window expires.
 *
 * Done looks like:
 *   1. 15 POST /api/auth/forgot-password requests exhaust the budget.
 *   2. The 16th request returns 429.
 *   3. A POST /api/auth/reset-password also returns 429 (shared counter).
 *   4. System time is advanced past the 15-minute windowMs.
 *   5. A subsequent POST /api/auth/forgot-password returns 200/400 — not 429.
 *   6. A subsequent POST /api/auth/reset-password also returns 200/400 — not 429.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Build a fresh Express app with fresh rate-limiter instances.
// Because this is a separate test file from auth-rate-limiter-window-reset.test.ts,
// vitest isolates module caches between files, so authLimiter here starts at 0.
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
  // We only fake the Date (not setTimeout/setInterval) so real async DB
  // operations and supertest HTTP calls continue to work correctly.
  vi.useFakeTimers({ toFake: ["Date"] });

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  vi.useRealTimers();
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("authLimiter — window reset clears counter for forgot-password and reset-password", () => {
  it(
    "exhausts budget via forgot-password, blocks reset-password too, then both recover after window rollover",
    async () => {
      const MAX_ATTEMPTS = 15; // mirrors authLimiter max

      // ── Phase 1: exhaust the rate-limit budget via forgot-password ────────
      // Send MAX_ATTEMPTS forgot-password requests.  The handler will return
      // 200 (email queued) or 400 (missing field) — not 429 — until budget
      // is exhausted.
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const res = await agent
          .post("/api/auth/forgot-password")
          .send({ email: `nonexistent-${i}@test.local` });

        expect(
          res.status,
          `attempt ${i + 1}/${MAX_ATTEMPTS} returned 429 before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: 16th forgot-password request must be rate-limited ────────
      const blockedForgot = await agent
        .post("/api/auth/forgot-password")
        .send({ email: "nonexistent-blocked@test.local" });

      expect(
        blockedForgot.status,
        `16th forgot-password request should be rate-limited (429) but got ${blockedForgot.status}`,
      ).toBe(429);

      // ── Phase 3: reset-password is also blocked (shared counter) ─────────
      const blockedReset = await agent
        .post("/api/auth/reset-password")
        .send({ token: "fake-token", password: "NewPassword1!" });

      expect(
        blockedReset.status,
        `reset-password should also be rate-limited (429) because it shares the authLimiter counter, but got ${blockedReset.status}`,
      ).toBe(429);

      // ── Phase 4: advance the clock past the 15-minute window ──────────────
      // Moving Date.now() forward causes the MemoryStore to treat the existing
      // window as expired and reset the counter on the next request.
      const WINDOW_MS = 15 * 60 * 1000;
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1000));

      // ── Phase 5: forgot-password is no longer blocked after rollover ──────
      const afterForgot = await agent
        .post("/api/auth/forgot-password")
        .send({ email: "nonexistent-after-rollover@test.local" });

      // The critical assertion: the window reset must allow new requests through.
      // The handler returns 200 (always sends, for enumeration safety) or 400.
      // Any status other than 429 means the authLimiter correctly reset.
      expect(
        afterForgot.status,
        `forgot-password after window rollover returned 429 — authLimiter window did not reset`,
      ).not.toBe(429);

      // ── Phase 6: reset-password is also no longer blocked after rollover ──
      const afterReset = await agent
        .post("/api/auth/reset-password")
        .send({ token: "fake-token", password: "NewPassword1!" });

      expect(
        afterReset.status,
        `reset-password after window rollover returned 429 — authLimiter window did not reset for this route`,
      ).not.toBe(429);
    },
    90_000,
  );
});
