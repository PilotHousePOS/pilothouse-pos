/**
 * Security tests: authLimiter behaviour
 *
 * Test 1 — X-Forwarded-For rotation bypass
 * -----------------------------------------
 * express-rate-limit uses req.ip as its default key. When Express is configured
 * with `app.set("trust proxy", 1)` (as this app is), req.ip is derived from the
 * LEFTMOST X-Forwarded-For entry, which an attacker controls from a single TCP
 * connection. An attacker can prepend rotating fake IPs to bypass per-IP limits.
 *
 * Fix: The authLimiter uses `keyGenerator: getRealIp`, which reads the RIGHTMOST
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
 *
 * Test 2 — window reset
 * ----------------------
 * The authLimiter window is 15 minutes. After the window expires the per-IP
 * counter must reset so legitimate users are not permanently locked out from
 * a short burst of failed attempts.
 *
 * Test design
 * -----------
 * A unique IP (TEST-NET-3, distinct from the XFF-bypass test) exhausts all 15
 * attempts. The 16th request is confirmed to be 429. vi.setSystemTime() then
 * advances the clock by 15 minutes + 1 ms so the MemoryStore window expires.
 * The next request must return non-429, proving the counter was reset.
 *
 * Test 3 — shared pool: exhausting budget via /register blocks /login
 * --------------------------------------------------------------------
 * authLimiter is applied to both /api/auth/login and /api/auth/register using
 * the SAME rateLimit() instance (imported from sharedLimiters.ts). Both routes
 * therefore share one per-IP budget counter.
 *
 * An attacker who is blocked on /api/auth/login cannot reset their counter by
 * switching to /api/auth/register — the shared pool is already exhausted.
 * Conversely, exhausting the budget via register also immediately blocks login.
 *
 * Test design
 * -----------
 * A unique IP (203.0.113.3, distinct from previous tests) sends AUTH_LIMITER_MAX
 * requests to /api/auth/register. All are allowed through by the limiter (the
 * handler itself returns 400 because no valid tenant context exists in the test
 * environment, or 409/422 for other reasons — any non-429 is acceptable here).
 * The next /api/auth/register confirms the pool is exhausted (429). A subsequent
 * POST to /api/auth/login from the same IP must also return 429, proving that
 * the two routes share the same counter and switching endpoints cannot reset it.
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

// ─── Window-reset test ────────────────────────────────────────────────────────
//
// Uses a distinct real IP (203.0.113.2) so this test starts with a fresh
// per-IP bucket and is not affected by the XFF-bypass test above.

describe("authLimiter — per-IP counter resets after the 15-minute window expires", () => {
  it(
    "allows a login attempt from the same IP after the 15-minute window has elapsed",
    async () => {
      // A fresh IP distinct from REAL_PROXY_IP used in the XFF-bypass test.
      // This guarantees an independent counter so the two tests cannot interfere.
      const WINDOW_RESET_IP = "203.0.113.2"; // TEST-NET-3, never a real client IP
      const AUTH_LIMITER_MAX = 15;
      const AUTH_LIMITER_WINDOW_MS = 15 * 60 * 1000; // must match sharedLimiters.ts

      // ── Phase 1: exhaust the budget ──────────────────────────────────────────
      // Send AUTH_LIMITER_MAX requests from WINDOW_RESET_IP.  All must be
      // allowed through by the limiter (handler will 401 for bad credentials).
      for (let i = 1; i <= AUTH_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/auth/login")
          .set("X-Forwarded-For", WINDOW_RESET_IP)
          .send({
            email: `window-reset-exhaust-${i}@test.local`,
            password: "WrongPassword1!",
          });

        expect(
          res.status,
          `exhaustion attempt ${i}/${AUTH_LIMITER_MAX} from ${WINDOW_RESET_IP} ` +
            `returned 429 before the budget was exhausted — another test may have ` +
            `consumed this IP's budget, or the limiter window is shorter than expected`,
        ).not.toBe(429);
      }

      // ── Phase 2: confirm the budget is now exhausted ─────────────────────────
      // The AUTH_LIMITER_MAX + 1 request must be blocked with 429.
      const blockedBefore = await agent
        .post("/api/auth/login")
        .set("X-Forwarded-For", WINDOW_RESET_IP)
        .send({
          email: "window-reset-blocked@test.local",
          password: "WrongPassword1!",
        });

      expect(
        blockedBefore.status,
        `request ${AUTH_LIMITER_MAX + 1} from ${WINDOW_RESET_IP} should be 429 ` +
          `(budget exhausted) but got ${blockedBefore.status} — the limiter may ` +
          `not be accumulating all requests from the same IP in one bucket`,
      ).toBe(429);

      // ── Phase 3: advance the clock past the window ───────────────────────────
      // vi.setSystemTime() shifts Date.now() forward.  express-rate-limit's
      // MemoryStore uses Date.now() to determine whether a window has expired,
      // so advancing the clock by windowMs + 1 ms makes every existing window
      // appear expired.  The next request should open a fresh window (counter = 1)
      // and be allowed through.
      vi.setSystemTime(Date.now() + AUTH_LIMITER_WINDOW_MS + 1);

      // ── Phase 4: confirm the counter has reset ───────────────────────────────
      // The same IP should no longer be blocked; the limiter allows it through
      // and the handler returns 401 (bad credentials), not 429.
      const afterReset = await agent
        .post("/api/auth/login")
        .set("X-Forwarded-For", WINDOW_RESET_IP)
        .send({
          email: "window-reset-after@test.local",
          password: "WrongPassword1!",
        });

      expect(
        afterReset.status,
        `first request from ${WINDOW_RESET_IP} after the window expired should ` +
          `not be 429 (counter should have reset) but got ${afterReset.status} — ` +
          `the authLimiter window may not be resetting, permanently locking users out`,
      ).not.toBe(429);
    },
    90_000,
  );
});

// ─── Shared-pool cross-endpoint test ──────────────────────────────────────────
//
// Uses a distinct real IP (203.0.113.3) so this test starts with a fresh
// per-IP bucket and is not affected by the tests above.
//
// TENANT-MIDDLEWARE INTERACTION
// -----------------------------
// tenantMiddleware is mounted at app.use('/api', ...) and runs before
// authLimiter.  For unauthenticated no-slug requests it only allows a narrow
// allowlist of paths through — /api/auth/register is intentionally NOT on that
// list (customer registration must be store-scoped).  Without intervention,
// tenantMiddleware would short-circuit register requests with 400 before
// authLimiter has a chance to count them.
//
// Setting ALLOW_TENANT_FALLBACK=true makes tenantMiddleware assign tenantId=1
// and call next() for every request regardless of slug, so authLimiter is
// reached.  This flag is designed for single-tenant and test environments and
// is the same technique used in auth-limiter-shared-pool.test.ts.

describe("authLimiter — exhausting the budget via /register also blocks /login (shared pool)", () => {
  it(
    "blocks a login attempt after the per-IP budget is fully consumed by register requests",
    async () => {
      // A fresh IP distinct from those used in the tests above.
      // This guarantees an independent counter so the tests cannot interfere.
      const SHARED_POOL_IP = "203.0.113.3"; // TEST-NET-3, never a real client IP
      const AUTH_LIMITER_MAX = 15;

      // Enable the tenant fallback so tenantMiddleware calls next() for all
      // paths, allowing /api/auth/register requests to reach authLimiter.
      // Restore the original value after the test regardless of outcome.
      const originalFallback = process.env.ALLOW_TENANT_FALLBACK;
      process.env.ALLOW_TENANT_FALLBACK = "true";

      try {
        // ── Phase 1: exhaust the budget via /api/auth/register ─────────────────
        // Send AUTH_LIMITER_MAX requests to /register from SHARED_POOL_IP.
        // With ALLOW_TENANT_FALLBACK=true tenantMiddleware calls next(), so
        // authLimiter runs and counts each request.  The limiter must allow all
        // AUTH_LIMITER_MAX through (the handler itself returns a non-429 status
        // — typically 400 for an invalid/duplicate body, or 409/422 for
        // validation errors — any non-429 is acceptable here).
        // A 429 before the budget is exhausted would indicate test isolation
        // failure (another test consumed this IP's counter).
        for (let i = 1; i <= AUTH_LIMITER_MAX; i++) {
          const res = await agent
            .post("/api/auth/register")
            .set("X-Forwarded-For", SHARED_POOL_IP)
            .send({
              email: `shared-pool-register-${i}@test.local`,
              password: "WrongPassword1!",
              firstName: "Test",
              lastName: "User",
            });

          expect(
            res.status,
            `register attempt ${i}/${AUTH_LIMITER_MAX} from ${SHARED_POOL_IP} ` +
              `returned 429 before the budget was exhausted — another test may have ` +
              `consumed this IP's budget, or the limiter window is shorter than expected`,
          ).not.toBe(429);
        }

        // ── Phase 2: confirm the register budget is now exhausted ──────────────
        // The AUTH_LIMITER_MAX + 1 register request must be blocked with 429.
        const blockedRegister = await agent
          .post("/api/auth/register")
          .set("X-Forwarded-For", SHARED_POOL_IP)
          .send({
            email: "shared-pool-register-blocked@test.local",
            password: "WrongPassword1!",
            firstName: "Test",
            lastName: "User",
          });

        expect(
          blockedRegister.status,
          `request ${AUTH_LIMITER_MAX + 1} to /register from ${SHARED_POOL_IP} should be 429 ` +
            `(budget exhausted) but got ${blockedRegister.status} — the authLimiter may ` +
            `not be counting register requests against the shared budget`,
        ).toBe(429);

        // ── Phase 3: confirm login is also blocked from the same IP ────────────
        // The shared authLimiter pool is exhausted by the register requests above.
        // A subsequent POST to /api/auth/login from the same IP must return 429
        // without any additional register calls — proving the two routes truly
        // share one counter and switching endpoints cannot reset it.
        //
        // /api/auth/login IS on tenantMiddleware's allowlist, so this request
        // reaches authLimiter regardless of the ALLOW_TENANT_FALLBACK flag.
        //
        // If authLimiter were accidentally split into two separate rateLimit()
        // instances (one for /login, one for /register), login would have its
        // own fresh budget (0/15 used) and this request would return 401, not 429.
        const blockedLogin = await agent
          .post("/api/auth/login")
          .set("X-Forwarded-For", SHARED_POOL_IP)
          .send({
            email: "shared-pool-login-blocked@test.local",
            password: "WrongPassword1!",
          });

        expect(
          blockedLogin.status,
          `login attempt from ${SHARED_POOL_IP} after register exhausted the shared pool ` +
            `should be 429 but got ${blockedLogin.status} — authLimiter may have been split ` +
            `into two independent instances, allowing an attacker to bypass the login block ` +
            `by first exhausting the register endpoint`,
        ).toBe(429);

        expect(
          blockedLogin.body?.message,
          "429 login response body should carry the authLimiter message",
        ).toMatch(/too many login attempts/i);
      } finally {
        // Always restore the env var so subsequent tests see the original value.
        if (originalFallback === undefined) {
          delete process.env.ALLOW_TENANT_FALLBACK;
        } else {
          process.env.ALLOW_TENANT_FALLBACK = originalFallback;
        }
      }
    },
    90_000,
  );
});
