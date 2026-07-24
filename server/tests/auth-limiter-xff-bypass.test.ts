/**
 * Security test: authLimiter cannot be bypassed via X-Forwarded-For header rotation
 *
 * Background
 * ----------
 * express-rate-limit uses req.ip as its default key. When Express is configured
 * with `app.set("trust proxy", 1)` (as this app is), req.ip is derived from the
 * X-Forwarded-For header, which an attacker controls from a single TCP connection.
 *
 * Fix
 * ---
 * The authLimiter uses a custom keyGenerator that reads req.socket.remoteAddress
 * (the real TCP peer) instead of req.ip, so rotating X-Forwarded-For values does
 * not create separate rate-limit buckets — all requests from the same connection
 * share one counter.
 *
 * Done looks like
 * ---------------
 * 1. 15 POST /api/auth/login requests each carry a DIFFERENT X-Forwarded-For
 *    value (e.g. "1.1.1.1", "2.2.2.2", …, "15.15.15.15").
 * 2. All 15 are passed through (non-429) — the handler rejects them with 401
 *    because the credentials are wrong, but the limiter allows each one.
 * 3. The 16th request (with yet another unique X-Forwarded-For IP) returns 429,
 *    proving the limiter keys by socket address — not the spoofed header.
 *    If the limiter used req.ip instead, each request would be a fresh bucket
 *    and the 16th would NOT be 429, meaning the bypass was possible.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildTestApp() {
  const app = express();
  // Mirror the production trust-proxy setting so req.ip would be spoofable
  // if the keyGenerator relied on it.
  app.set("trust proxy", 1);
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
  // Freeze Date.now() so the rate-limiter window starts at a known point and
  // does not roll over mid-test.  We only fake Date (not async timers) so that
  // real DB operations and supertest HTTP calls continue to work.
  vi.useFakeTimers({ toFake: ["Date"] });

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  vi.useRealTimers();
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("authLimiter — X-Forwarded-For header rotation cannot bypass the per-connection budget", () => {
  it(
    "blocks the 16th login attempt even when every request carries a distinct X-Forwarded-For IP",
    async () => {
      const AUTH_LIMITER_MAX = 15;

      // Phase 1: send 15 requests, each with a unique spoofed XFF header.
      // If the limiter keyed by req.ip (derived from XFF when trust proxy is 1),
      // each request would land in a fresh bucket and none would be blocked.
      // The fix (keyGenerator → socket address) means they all share one bucket.
      for (let i = 1; i <= AUTH_LIMITER_MAX; i++) {
        // Generate a unique fake source IP for every request.
        const spoofedIp = `${i}.${i}.${i}.${i}`;

        const res = await agent
          .post("/api/auth/login")
          .set("X-Forwarded-For", spoofedIp)
          .send({
            email: `xff-bypass-${i}@test.local`,
            password: "WrongPassword1!",
          });

        // The limiter should allow this through (handler returns 401 for bad creds).
        // A 429 here means the bucket rolled over unexpectedly — surface the index.
        expect(
          res.status,
          `attempt ${i}/${AUTH_LIMITER_MAX} (XFF: ${spoofedIp}) returned 429 before the ` +
            `budget was exhausted — limiter may not be counting all XFF-rotated requests in the same bucket`,
        ).not.toBe(429);
      }

      // Phase 2: 16th request with yet another unique XFF value must still be blocked.
      // If the limiter used req.ip, this would be a brand-new bucket (0/15 used)
      // and would return 401, not 429.  With socket-address keying it's 429.
      const spoofedIp16 = "16.16.16.16";
      const blocked = await agent
        .post("/api/auth/login")
        .set("X-Forwarded-For", spoofedIp16)
        .send({
          email: "xff-bypass-blocked@test.local",
          password: "WrongPassword1!",
        });

      expect(
        blocked.status,
        `16th login attempt (XFF: ${spoofedIp16}) should be 429 (authLimiter exhausted) ` +
          `but got ${blocked.status} — the X-Forwarded-For rotation bypass may still be possible`,
      ).toBe(429);

      expect(
        blocked.body?.message,
        "429 response body should carry the authLimiter message",
      ).toMatch(/too many login attempts/i);
    },
    90_000,
  );
});
