/**
 * Security test: authLimiter cannot be bypassed via X-Forwarded-For header rotation
 *
 * Background
 * ----------
 * express-rate-limit uses req.ip as its default key. When Express is configured
 * with `app.set("trust proxy", 1)` (as this app is), req.ip is derived from the
 * LEFTMOST X-Forwarded-For entry, which an attacker controls from a single TCP
 * connection. An attacker can prepend rotating fake IPs to bypass per-IP limits.
 *
 * Fix
 * ---
 * The authLimiter uses `keyGenerator: getRealIp`, which reads the RIGHTMOST
 * X-Forwarded-For entry — the one appended by Replit's edge proxy that a client
 * cannot forge. Rotating the leftmost spoofed entry does not create separate
 * rate-limit buckets; all requests from the same real connection share one counter.
 *
 * Test design
 * -----------
 * We simulate the real production topology: each request carries an XFF header
 * of the form "<spoofed-ip>, <real-ip>". The real-ip (rightmost, constant)
 * represents what the edge proxy appends; the spoofed-ip (leftmost, rotating)
 * represents what an attacker prepends. getRealIp returns the rightmost entry,
 * so all 15 requests share one bucket and the 16th is blocked.
 *
 * Done looks like
 * ---------------
 * 1. 15 POST /api/auth/login requests each carry XFF "<unique-spoofed>, <fixed-real>".
 * 2. All 15 are passed through (non-429) — the handler rejects them with 401
 *    because the credentials are wrong, but the limiter allows each one.
 * 3. The 16th request (with yet another unique spoofed prefix) returns 429,
 *    proving the limiter keys by the rightmost (real) XFF entry — not the
 *    rotating leftmost entry an attacker controls.
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
  // if the keyGenerator relied on it directly.
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(cookieParser());
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);
  return app;
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;

// The fixed "real" IP that the simulated edge proxy appends as the rightmost
// XFF entry. getRealIp always returns this value, so all requests from the same
// connection share one rate-limit bucket regardless of the spoofed prefix.
const REAL_PROXY_IP = "203.0.113.1"; // TEST-NET-3, never a real client IP

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

      // Phase 1: send 15 requests, each with a rotating spoofed XFF prefix
      // but the same fixed rightmost "real" IP.
      //
      // Format: "<attacker-controlled>, <proxy-appended>"
      //
      // If the limiter keyed by req.ip (leftmost XFF when trust proxy is 1),
      // each request would land in a fresh bucket and none would be blocked.
      //
      // With getRealIp (rightmost XFF = REAL_PROXY_IP), all requests share one
      // bucket — rotating the leftmost entry has no effect.
      for (let i = 1; i <= AUTH_LIMITER_MAX; i++) {
        // Generate a unique fake source IP for every request (attacker-controlled).
        const spoofedPrefix = `${i}.${i}.${i}.${i}`;
        // Simulated edge-proxy entry: constant, cannot be forged by the client.
        const xffHeader = `${spoofedPrefix}, ${REAL_PROXY_IP}`;

        const res = await agent
          .post("/api/auth/login")
          .set("X-Forwarded-For", xffHeader)
          .send({
            email: `xff-bypass-${i}@test.local`,
            password: "WrongPassword1!",
          });

        // The limiter should allow this through (handler returns 401 for bad creds).
        // A 429 here means the bucket rolled over unexpectedly — surface the index.
        expect(
          res.status,
          `attempt ${i}/${AUTH_LIMITER_MAX} (XFF: ${xffHeader}) returned 429 before the ` +
            `budget was exhausted — limiter may not be counting all XFF-rotated requests in the same bucket`,
        ).not.toBe(429);
      }

      // Phase 2: 16th request with yet another unique spoofed prefix and the
      // same real rightmost IP must be blocked (budget exhausted).
      //
      // If the limiter used the leftmost XFF entry, this would be a brand-new
      // bucket (0/15 used) and would return 401, not 429.
      // With getRealIp (rightmost = REAL_PROXY_IP) the shared bucket is full.
      const spoofedPrefix16 = "16.16.16.16";
      const xffHeader16 = `${spoofedPrefix16}, ${REAL_PROXY_IP}`;
      const blocked = await agent
        .post("/api/auth/login")
        .set("X-Forwarded-For", xffHeader16)
        .send({
          email: "xff-bypass-blocked@test.local",
          password: "WrongPassword1!",
        });

      expect(
        blocked.status,
        `16th login attempt (XFF: ${xffHeader16}) should be 429 (authLimiter exhausted) ` +
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
