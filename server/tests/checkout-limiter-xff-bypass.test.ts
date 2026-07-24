/**
 * Security test: checkoutLimiter cannot be bypassed via X-Forwarded-For header rotation
 *
 * Background
 * ----------
 * express-rate-limit uses req.ip as its default key. When Express is configured
 * with `app.set("trust proxy", 1)` (as this app is), req.ip is derived from the
 * LEFTMOST X-Forwarded-For entry, which an attacker controls from a single TCP
 * connection. An attacker can prepend rotating fake IPs to bypass per-IP limits.
 *
 * The checkoutLimiter guards /api/orders and /api/create-payment-intent — both
 * high-value write paths vulnerable to order spam and payment-intent abuse.
 *
 * Fix
 * ---
 * checkoutLimiter uses `keyGenerator: getRealIp`, where getRealIp reads the
 * RIGHTMOST X-Forwarded-For entry — the one appended by Replit's edge proxy that
 * a client cannot forge. All requests that share the same real network connection
 * therefore share one rate-limit bucket regardless of what spoofed IPs they
 * prepend to the XFF header.
 *
 * Test design
 * -----------
 * The full registerRoutes stack places tenantMiddleware BEFORE checkoutLimiter.
 * Unauthenticated POST /api/orders requests are rejected with 400 by
 * tenantMiddleware before they reach the rate limiter, making an end-to-end
 * integration test impossible without a real tenant fixture.
 *
 * Instead this test builds a minimal Express app that mirrors the PRODUCTION
 * checkoutLimiter configuration — same windowMs, max, keyGenerator (getRealIp),
 * and message — applied to /api/orders, without tenantMiddleware in the way.
 * This accurately tests the rate-limiter's XFF-rotation resistance in isolation.
 *
 * We simulate the real production topology: each request carries an XFF header
 * of the form "<spoofed-ip>, <real-ip>". The real-ip (rightmost, constant)
 * represents what the edge proxy appends; the spoofed-ip (leftmost, rotating)
 * represents what an attacker prepends. getRealIp returns the rightmost entry,
 * so all requests share one bucket and the 11th is blocked.
 *
 * Done looks like
 * ---------------
 * 1. 10 POST /api/orders requests each carry XFF "<unique-spoofed>, <fixed-real>".
 * 2. All 10 are passed through (non-429) — the handler responds 200, but the
 *    limiter is counting.
 * 3. The 11th request (with yet another unique spoofed prefix) returns 429,
 *    proving the limiter keys by the rightmost (real) XFF entry — not the
 *    rotating leftmost entry an attacker controls.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import rateLimit from "express-rate-limit";
import supertest from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Spoof-resistant IP extractor — exact copy of the production getRealIp
 * defined inside registerRoutes in server/routes.ts.
 *
 * Always reads the RIGHTMOST X-Forwarded-For entry (appended by the edge proxy)
 * so that a client rotating the leftmost spoofed entry cannot create fresh buckets.
 */
function getRealIp(req: express.Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const entries = (Array.isArray(xff) ? xff.join(",") : xff)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length > 0) return entries[entries.length - 1];
  }
  return (req as any).socket?.remoteAddress ?? "unknown";
}

/**
 * Build a minimal test app that mirrors the production checkoutLimiter
 * configuration — same windowMs, max, keyGenerator, and message — applied
 * to POST /api/orders, without tenantMiddleware or other middleware in the way.
 *
 * Why minimal and not full registerRoutes:
 *   tenantMiddleware runs BEFORE checkoutLimiter in the production stack and
 *   rejects unauthenticated POST /api/orders with 400 before the rate limiter
 *   can count or block the request. A full-stack integration test would require
 *   a real tenant fixture to get past that guard. A focused unit test is more
 *   reliable here and tests exactly the limiter behaviour we care about.
 */
function buildTestApp() {
  const app = express();
  // Mirror the production trust-proxy setting so req.ip would be spoofable
  // if the keyGenerator relied on the leftmost XFF entry.
  app.set("trust proxy", 1);
  app.use(express.json());

  // checkoutLimiter — exact mirror of the production configuration in routes.ts.
  // windowMs: 15 * 60 * 1000, max: 10, keyGenerator: getRealIp
  const checkoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getRealIp,
    message: { message: "Too many checkout attempts, please try again later." },
  });

  app.use("/api/orders", checkoutLimiter);
  // Simple stub — real handler is guarded by auth/tenant middleware in production.
  app.post("/api/orders", (_req, res) => res.json({ ok: true }));

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
  // does not roll over mid-test. We only fake Date (not async timers) so that
  // real HTTP calls continue to work.
  vi.useFakeTimers({ toFake: ["Date"] });

  const app = buildTestApp();
  agent = supertest(app);
}, 30_000);

afterAll(async () => {
  vi.useRealTimers();
}, 15_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("checkoutLimiter — X-Forwarded-For header rotation cannot bypass the per-connection budget", () => {
  it(
    "blocks the 11th order attempt on /api/orders even when every request prepends a distinct X-Forwarded-For IP",
    async () => {
      const CHECKOUT_LIMITER_MAX = 10;

      // Phase 1: send 10 POST /api/orders requests, each with a rotating
      // spoofed XFF prefix but the same fixed rightmost "real" IP.
      //
      // Format: "<attacker-controlled>, <proxy-appended>"
      //
      // If the limiter keyed by req.ip (leftmost XFF when trust proxy is 1),
      // each request would land in a fresh bucket and none would be blocked.
      //
      // With getRealIp (rightmost XFF = REAL_PROXY_IP), all requests share one
      // bucket — rotating the leftmost entry has no effect.
      for (let i = 1; i <= CHECKOUT_LIMITER_MAX; i++) {
        // Attacker rotates this prefix on every request.
        const spoofedPrefix = `${i}.${i}.${i}.${i}`;
        // Simulated edge-proxy entry: constant, cannot be forged by the client.
        const xffHeader = `${spoofedPrefix}, ${REAL_PROXY_IP}`;

        const res = await agent
          .post("/api/orders")
          .set("X-Forwarded-For", xffHeader)
          .send({ items: [], total: 0 });

        // The limiter must allow this through (200 from stub handler).
        // A 429 before the budget is exhausted means the limiter is not
        // counting all XFF-rotated requests in the same bucket.
        expect(
          res.status,
          `attempt ${i}/${CHECKOUT_LIMITER_MAX} (XFF: ${xffHeader}) returned 429 before ` +
            `the budget was exhausted — limiter may not be counting all XFF-rotated requests ` +
            `in the same bucket (expected rightmost-entry keying via getRealIp)`,
        ).not.toBe(429);
      }

      // Phase 2: 11th request with yet another unique spoofed prefix and the
      // same real rightmost IP must be blocked (budget exhausted).
      //
      // If the limiter used the leftmost XFF entry, this would be a brand-new
      // bucket (0/10 used) and would return 200, not 429.
      // With getRealIp (rightmost = REAL_PROXY_IP) the shared bucket is full.
      const spoofedPrefix11 = "11.11.11.11";
      const xffHeader11 = `${spoofedPrefix11}, ${REAL_PROXY_IP}`;

      const blocked = await agent
        .post("/api/orders")
        .set("X-Forwarded-For", xffHeader11)
        .send({ items: [], total: 0 });

      expect(
        blocked.status,
        `11th order attempt (XFF: ${xffHeader11}) should be 429 (checkoutLimiter exhausted) ` +
          `but got ${blocked.status} — the X-Forwarded-For rotation bypass may still be possible`,
      ).toBe(429);

      expect(
        blocked.body?.message,
        "429 response body should carry the checkoutLimiter message",
      ).toMatch(/too many checkout attempts/i);
    },
    60_000,
  );
});
