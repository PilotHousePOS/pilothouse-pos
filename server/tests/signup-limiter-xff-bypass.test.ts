/**
 * Security test: signupLimiter cannot be bypassed via X-Forwarded-For header rotation
 *
 * Background
 * ----------
 * express-rate-limit uses req.ip as its default key. When Express is configured
 * with `app.set("trust proxy", 1)` (as this app is), req.ip is derived from the
 * LEFTMOST X-Forwarded-For entry, which an attacker controls from a single TCP
 * connection. An attacker can prepend rotating fake IPs to bypass per-IP limits.
 *
 * The signupLimiter guards /api/auth/signup — the customer account-creation path.
 * Without XFF-rotation protection an attacker could automate mass account creation
 * (credential stuffing, fake-account spam) from a single IP.
 *
 * Fix
 * ---
 * signupLimiter uses `keyGenerator: getRealIp`, where getRealIp reads the
 * RIGHTMOST X-Forwarded-For entry — the one appended by Replit's edge proxy that
 * a client cannot forge. All requests that share the same real network connection
 * therefore share one rate-limit bucket regardless of what spoofed IPs they
 * prepend to the XFF header.
 *
 * Note on the skip condition
 * --------------------------
 * signupLimiter skips counting requests when req.tenantId is absent (requests with
 * no valid store slug always return 400 and carry no authentication risk). This test
 * stubs req.tenantId so the limiter is active and counting — the path an attacker
 * with a valid store slug would exercise.
 *
 * Test design
 * -----------
 * We build a minimal Express app that mirrors the production signupLimiter
 * configuration — same windowMs, max, keyGenerator (getRealIp), skip condition, and
 * message — applied to /api/auth/signup. A preceding middleware stub sets
 * req.tenantId so the limiter is not skipped. No tenantMiddleware or other
 * production middleware is included, keeping the test focused on the limiter.
 *
 * We simulate the real production topology: each request carries an XFF header
 * of the form "<spoofed-ip>, <real-ip>". The real-ip (rightmost, constant)
 * represents what the edge proxy appends; the spoofed-ip (leftmost, rotating)
 * represents what an attacker prepends. getRealIp returns the rightmost entry,
 * so all 15 requests share one bucket and the 16th is blocked.
 *
 * Done looks like
 * ---------------
 * 1. 15 POST /api/auth/signup requests each carry XFF "<unique-spoofed>, <fixed-real>".
 * 2. All 15 are passed through (non-429) — the stub handler responds 200.
 * 3. The 16th request (with yet another unique spoofed prefix) returns 429,
 *    proving the limiter keys by the rightmost (real) XFF entry — not the
 *    rotating leftmost entry an attacker controls.
 *    If the limiter used req.ip instead, each request would be a fresh bucket
 *    and the 16th would NOT be 429, meaning the bypass was possible.
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
 * Build a minimal test app that mirrors the production signupLimiter
 * configuration — same windowMs, max, keyGenerator, skip condition, and message
 * — applied to POST /api/auth/signup.
 *
 * A stub middleware sets req.tenantId before the limiter runs so that the
 * skip(req) => !req.tenantId guard is inactive. This represents the realistic
 * attack path: an attacker who knows a valid store slug and wants to mass-create
 * accounts while rotating spoofed XFF prefixes.
 *
 * Why minimal and not full registerRoutes:
 *   tenantMiddleware and the full route handler require a live database. A
 *   focused unit test is more reliable here and tests exactly the limiter
 *   behaviour we care about.
 */
function buildTestApp() {
  const app = express();
  // Mirror the production trust-proxy setting so req.ip would be spoofable
  // if the keyGenerator relied on the leftmost XFF entry.
  app.set("trust proxy", 1);
  app.use(express.json());

  // Stub tenantId so the signupLimiter skip(req) => !req.tenantId is false,
  // meaning the limiter actively counts these requests — the path an attacker
  // with a valid store slug exercises.
  app.use("/api/auth/signup", (req: any, _res, next) => {
    req.tenantId = 1;
    next();
  });

  // signupLimiter — exact mirror of the production configuration in routes.ts.
  // windowMs: 15 * 60 * 1000, max: 15, keyGenerator: getRealIp,
  // skip: (req) => !req.tenantId
  const signupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getRealIp,
    message: { message: "Too many signup attempts, please try again in 15 minutes." },
    skip: (req: any) => !req.tenantId,
  });

  app.use("/api/auth/signup", signupLimiter);
  // Simple stub — real handler requires auth/tenant/DB in production.
  app.post("/api/auth/signup", (_req, res) => res.json({ ok: true }));

  return app;
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;

// The fixed "real" IP that the simulated edge proxy appends as the rightmost
// XFF entry. getRealIp always returns this value, so all requests from the same
// connection share one rate-limit bucket regardless of the spoofed prefix.
const REAL_PROXY_IP = "203.0.113.2"; // TEST-NET-3, never a real client IP

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

describe("signupLimiter — X-Forwarded-For header rotation cannot bypass the per-connection budget", () => {
  it(
    "blocks the 16th signup attempt even when every request prepends a distinct X-Forwarded-For IP",
    async () => {
      const SIGNUP_LIMITER_MAX = 15;

      // Phase 1: send 15 POST /api/auth/signup requests, each with a rotating
      // spoofed XFF prefix but the same fixed rightmost "real" IP.
      //
      // Format: "<attacker-controlled>, <proxy-appended>"
      //
      // If the limiter keyed by req.ip (leftmost XFF when trust proxy is 1),
      // each request would land in a fresh bucket and none would be blocked.
      //
      // With getRealIp (rightmost XFF = REAL_PROXY_IP), all requests share one
      // bucket — rotating the leftmost entry has no effect.
      for (let i = 1; i <= SIGNUP_LIMITER_MAX; i++) {
        // Attacker rotates this prefix on every request.
        const spoofedPrefix = `${i}.${i}.${i}.${i}`;
        // Simulated edge-proxy entry: constant, cannot be forged by the client.
        const xffHeader = `${spoofedPrefix}, ${REAL_PROXY_IP}`;

        const res = await agent
          .post("/api/auth/signup")
          .set("X-Forwarded-For", xffHeader)
          .send({ email: `xff-signup-${i}@test.local`, password: "TestPass1!" });

        // The limiter must allow this through (200 from stub handler).
        // A 429 before the budget is exhausted means the limiter is not
        // counting all XFF-rotated requests in the same bucket.
        expect(
          res.status,
          `attempt ${i}/${SIGNUP_LIMITER_MAX} (XFF: ${xffHeader}) returned 429 before ` +
            `the budget was exhausted — signupLimiter may not be counting all ` +
            `XFF-rotated requests in the same bucket (expected rightmost-entry keying via getRealIp)`,
        ).not.toBe(429);
      }

      // Phase 2: 16th request with yet another unique spoofed prefix and the
      // same real rightmost IP must be blocked (budget exhausted).
      //
      // If the limiter used the leftmost XFF entry, this would be a brand-new
      // bucket (0/15 used) and would return 200, not 429.
      // With getRealIp (rightmost = REAL_PROXY_IP) the shared bucket is full.
      const spoofedPrefix16 = "16.16.16.16";
      const xffHeader16 = `${spoofedPrefix16}, ${REAL_PROXY_IP}`;

      const blocked = await agent
        .post("/api/auth/signup")
        .set("X-Forwarded-For", xffHeader16)
        .send({ email: "xff-signup-blocked@test.local", password: "TestPass1!" });

      expect(
        blocked.status,
        `16th signup attempt (XFF: ${xffHeader16}) should be 429 (signupLimiter exhausted) ` +
          `but got ${blocked.status} — the X-Forwarded-For rotation bypass may still be possible`,
      ).toBe(429);

      expect(
        blocked.body?.message,
        "429 response body should carry the signupLimiter message",
      ).toMatch(/too many signup attempts/i);
    },
    60_000,
  );

  it(
    "does NOT count requests that lack a tenantId (skip condition is respected)",
    async () => {
      // Build a separate app WITHOUT the tenantId stub so the skip fires.
      // All requests to this app should pass through regardless of XFF,
      // because the limiter skips them entirely.
      const appNoTenant = express();
      appNoTenant.set("trust proxy", 1);
      appNoTenant.use(express.json());

      const limiterForSkipTest = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3, // very low so the bypass is visible if the skip doesn't fire
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: getRealIp,
        message: { message: "Too many signup attempts, please try again in 15 minutes." },
        skip: (req: any) => !req.tenantId, // skip when no tenant (req.tenantId not set)
      });

      appNoTenant.use("/api/auth/signup", limiterForSkipTest);
      appNoTenant.post("/api/auth/signup", (_req, res) => res.json({ ok: true }));

      const agentNoTenant = supertest(appNoTenant);
      const SKIP_TEST_COUNT = 10; // well above the limiter max of 3

      for (let i = 1; i <= SKIP_TEST_COUNT; i++) {
        const xffHeader = `${i}.${i}.${i}.${i}, ${REAL_PROXY_IP}`;
        const res = await agentNoTenant
          .post("/api/auth/signup")
          .set("X-Forwarded-For", xffHeader)
          .send({ email: `xff-skip-${i}@test.local`, password: "TestPass1!" });

        // Because tenantId is absent, the limiter skips these requests entirely.
        // None should be 429 even beyond the max=3 budget.
        expect(
          res.status,
          `skip-condition request ${i} (no tenantId) returned 429 — ` +
            `the skip condition may not be firing correctly`,
        ).not.toBe(429);
      }
    },
    30_000,
  );
});
