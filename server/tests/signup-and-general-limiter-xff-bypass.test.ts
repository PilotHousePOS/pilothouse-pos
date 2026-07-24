/**
 * Security test: signupLimiter and generalLimiter cannot be bypassed
 * via X-Forwarded-For header rotation.
 *
 * Background
 * ----------
 * Both limiters are defined in routes.ts with `keyGenerator: getRealIp`.
 * getRealIp reads the RIGHTMOST X-Forwarded-For entry — the one appended by
 * Replit's edge proxy that the client cannot forge.  If keyGenerator were ever
 * accidentally removed during a refactor, an attacker could prepend a rotating
 * fake IP on every request from a single TCP connection, creating a fresh
 * rate-limit bucket each time and completely defeating the budget.
 *
 * signupLimiter
 * -------------
 * Defined in routes.ts at /api/auth/signup, max 15 per 15-minute window.
 * It skips counting when !req.tenantId (unauthenticated slugless requests always
 * return 400 and carry no authentication risk, so they must not burn the budget).
 * tenantMiddleware is mocked below to always set req.tenantId = 1 so the
 * limiter counts every simulated signup attempt.
 *
 * generalLimiter
 * --------------
 * Defined in routes.ts on /api, max 200 per 15-minute window.
 * It skips counting for /auth/signup when !req.tenantId (same reason as above).
 * The test uses an unregistered /api path so no route-specific limiter interferes
 * and the skip condition is never triggered.
 *
 * Test design (both suites)
 * -------------------------
 * 1. Each request carries XFF "<spoofed-ip>, <real-ip>" where the real-ip is a
 *    fixed constant (simulating what the edge proxy appends) and the spoofed-ip
 *    rotates (simulating what an attacker prepends from one connection).
 * 2. getRealIp returns the rightmost entry, so all requests share one bucket.
 * 3. Phase 1: N requests all pass (non-429) — rotating the leftmost entry has
 *    no effect on the shared counter.
 * 4. Phase 2: request N+1 is blocked (429) — the shared bucket is exhausted.
 *    If the limiter used req.ip / the leftmost entry instead, each request would
 *    open a fresh bucket and request N+1 would NOT be 429.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";

// ─── Module mock ──────────────────────────────────────────────────────────────
//
// signupLimiter has `skip: (req) => !req.tenantId`.  Without a real database
// tenant, tenantMiddleware would return 400 before generalLimiter or
// signupLimiter ever sees the request.  We replace tenantMiddleware with a
// lightweight stub that always sets req.tenantId = 1 and calls next(), so the
// limiters count every request as expected.
//
// requireSuperAdminMiddleware is included because routes.ts imports it from the
// same module; the stub returns 403 for any super-admin route — acceptable here
// since our test paths do not exercise those routes.

vi.mock("../tenantMiddleware", () => ({
  tenantMiddleware: (req: any, _res: any, next: any) => {
    req.tenantId = 1;
    next();
  },
  requireSuperAdminMiddleware: (_req: any, res: any, _next: any) => {
    res.status(403).json({ message: "Forbidden" });
  },
}));

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

// ─── signupLimiter — XFF bypass test ─────────────────────────────────────────

describe(
  "signupLimiter — X-Forwarded-For header rotation cannot bypass the per-connection budget",
  () => {
    let agent: ReturnType<typeof supertest>;

    // Fixed "real" IP appended by the simulated edge proxy.  getRealIp always
    // returns this value, so all requests share one bucket regardless of what
    // the attacker prepends.  Using TEST-NET-3 (RFC 5737) — never a real client.
    const REAL_PROXY_IP = "203.0.113.2";

    beforeAll(async () => {
      // Freeze Date.now() so the rate-limiter window starts at a known point
      // and does not roll over mid-test.
      vi.useFakeTimers({ toFake: ["Date"] });

      // Each registerRoutes() call creates fresh rateLimit() instances, so this
      // app's signupLimiter counter starts at zero and is independent of any
      // other describe block's app.
      const app = await buildTestApp();
      agent = supertest(app);
    }, 60_000);

    afterAll(async () => {
      vi.useRealTimers();
    }, 30_000);

    it(
      "blocks the 16th signup attempt even when every request carries a distinct X-Forwarded-For IP",
      async () => {
        const SIGNUP_LIMITER_MAX = 15;

        // Phase 1: send 15 requests, each with a unique spoofed leftmost XFF
        // entry but the same fixed rightmost "real" IP.
        //
        // If the limiter keyed by req.ip (leftmost XFF when trust proxy is 1),
        // each request would land in a fresh bucket and none would be blocked.
        //
        // With getRealIp (rightmost XFF = REAL_PROXY_IP), all 15 share one
        // bucket — rotating the leftmost entry has no effect.
        for (let i = 1; i <= SIGNUP_LIMITER_MAX; i++) {
          const spoofedPrefix = `${i}.${i}.${i}.${i}`;
          const xffHeader = `${spoofedPrefix}, ${REAL_PROXY_IP}`;

          const res = await agent
            .post("/api/auth/signup")
            .set("X-Forwarded-For", xffHeader)
            .send({
              email: `xff-signup-${i}@test.local`,
              password: "TestPassword1!",
            });

          // The limiter should allow this through; the route itself will reject
          // the incomplete body with a 4xx, but NOT 429 until budget is full.
          expect(
            res.status,
            `attempt ${i}/${SIGNUP_LIMITER_MAX} (XFF: ${xffHeader}) returned 429 before the ` +
              `budget was exhausted — limiter may not be counting XFF-rotated requests in the same bucket`,
          ).not.toBe(429);
        }

        // Phase 2: 16th request with yet another unique spoofed prefix and the
        // same real rightmost IP must be blocked (budget exhausted).
        //
        // If the limiter used the leftmost XFF entry, this would be a fresh
        // bucket (0/15 used) and would return a non-429 status instead.
        const spoofedPrefix16 = "16.16.16.16";
        const xffHeader16 = `${spoofedPrefix16}, ${REAL_PROXY_IP}`;
        const blocked = await agent
          .post("/api/auth/signup")
          .set("X-Forwarded-For", xffHeader16)
          .send({
            email: "xff-signup-blocked@test.local",
            password: "TestPassword1!",
          });

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
      90_000,
    );
  },
);

// ─── generalLimiter — XFF bypass test ────────────────────────────────────────

describe(
  "generalLimiter — X-Forwarded-For header rotation cannot bypass the per-connection budget",
  () => {
    let agent: ReturnType<typeof supertest>;

    // Use a distinct fixed "real" IP so this suite's counter is completely
    // independent of the signupLimiter suite even if they ran on the same app.
    const REAL_PROXY_IP = "203.0.113.3";

    beforeAll(async () => {
      // Freeze Date.now() so the rate-limiter window does not roll over mid-test.
      vi.useFakeTimers({ toFake: ["Date"] });

      // Fresh app → fresh generalLimiter instance with an empty counter.
      const app = await buildTestApp();
      agent = supertest(app);
    }, 60_000);

    afterAll(async () => {
      vi.useRealTimers();
    }, 30_000);

    it(
      "blocks the 201st request even when every request carries a distinct X-Forwarded-For IP",
      async () => {
        const GENERAL_LIMITER_MAX = 200;

        // Use an unregistered /api path so only generalLimiter applies.
        // No route-specific limiter (authLimiter, signupLimiter, etc.) fires,
        // so the budget can reach its true 200-request ceiling before being
        // blocked.  Express returns 404 for this path — non-429, as required.
        //
        // Phase 1: send 200 requests, each with a unique spoofed leftmost XFF
        // entry but the same fixed rightmost "real" IP.
        for (let i = 1; i <= GENERAL_LIMITER_MAX; i++) {
          // Spread across four octets to avoid collisions between iterations.
          const a = Math.floor((i - 1) / 255) + 1;
          const b = ((i - 1) % 255) + 1;
          const spoofedPrefix = `10.${a}.${b}.1`;
          const xffHeader = `${spoofedPrefix}, ${REAL_PROXY_IP}`;

          const res = await agent
            .get("/api/xff-general-limiter-probe")
            .set("X-Forwarded-For", xffHeader);

          // generalLimiter should allow this through (returns 404 since the
          // path has no handler, but not 429 until the budget is exhausted).
          expect(
            res.status,
            `attempt ${i}/${GENERAL_LIMITER_MAX} (XFF: ${xffHeader}) returned 429 before the ` +
              `budget was exhausted — limiter may not be counting XFF-rotated requests in the same bucket`,
          ).not.toBe(429);
        }

        // Phase 2: 201st request with yet another unique spoofed prefix and the
        // same real rightmost IP must be blocked (budget exhausted).
        const spoofedPrefix201 = "10.1.201.1";
        const xffHeader201 = `${spoofedPrefix201}, ${REAL_PROXY_IP}`;
        const blocked = await agent
          .get("/api/xff-general-limiter-probe")
          .set("X-Forwarded-For", xffHeader201);

        expect(
          blocked.status,
          `201st request (XFF: ${xffHeader201}) should be 429 (generalLimiter exhausted) ` +
            `but got ${blocked.status} — the X-Forwarded-For rotation bypass may still be possible`,
        ).toBe(429);

        expect(
          blocked.body?.message,
          "429 response body should carry the generalLimiter message",
        ).toMatch(/too many requests/i);
      },
      120_000,
    );
  },
);
