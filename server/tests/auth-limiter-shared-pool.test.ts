/**
 * Security test: authLimiter shared pool blocks all 7 sibling auth endpoints
 * when the budget is exhausted on any one of them.
 *
 * Background
 * ----------
 * authLimiter is a single rateLimit() instance imported from sharedLimiters.ts
 * and applied to all 7 auth endpoints:
 *
 *   /api/auth/login              (app.use — routes.ts ~360)
 *   /api/auth/register           (app.use — routes.ts ~361)
 *   /api/auth/forgot-password    (app.use — routes.ts ~362)
 *   /api/auth/reset-password     (app.use — routes.ts ~363)
 *   /api/auth/change-password    (app.use — routes.ts ~364)
 *   /api/auth/verify-email       (inline authLimiter argument — routes.ts ~1075)
 *   /api/auth/resend-verification(inline authLimiter argument — routes.ts ~1119)
 *
 * Because they all share the same rateLimit() instance — not separate instances
 * with the same config — they share one counter per IP.  Exhausting the budget
 * via /api/auth/login must lock out every sibling route for the same real IP.
 *
 * The authLimiter middleware runs before each route's handler, so a 429 fires
 * regardless of whether the request body is valid — the request body content
 * is irrelevant to these assertions.
 *
 * Tenant-middleware interaction
 * -----------------------------
 * The tenantMiddleware (registered at app.use('/api', ...)) runs before
 * authLimiter and returns 400 MISSING_TENANT for routes that are not in its
 * public allowlist when no X-Tenant-Slug header is supplied.  Two of the
 * seven routes are NOT in that allowlist:
 *
 *   /api/auth/register      — tenant-scoped: new users must be linked to a store
 *   /api/auth/change-password — requires an authenticated session with a tenant
 *
 * Without a valid slug, tenantMiddleware short-circuits before authLimiter runs,
 * hiding any budget exhaustion behind a 400.  Setting ALLOW_TENANT_FALLBACK=true
 * makes tenantMiddleware pass all requests through so authLimiter can be reached.
 * This env flag is explicitly designed for single-tenant and test environments.
 *
 * Test design
 * -----------
 * 1. Set ALLOW_TENANT_FALLBACK=true before building the app so every request
 *    reaches authLimiter regardless of tenant context.
 * 2. Send 15 POST /api/auth/login requests from the same rightmost XFF "real IP"
 *    (with a rotating spoofed leftmost prefix) to exhaust the shared pool.
 * 3. Confirm that a subsequent request to each of the remaining 6 auth routes
 *    from the same real IP returns 429 — even though those routes received
 *    zero direct requests.
 *
 * A different "real" IP constant is used here vs. the XFF-bypass test so the
 * two suites do not share rate-limit state.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildTestApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(cookieParser());
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);
  return app;
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;

// Use a distinct "real" IP from the XFF-bypass test so the two suites have
// completely independent rate-limit buckets (no shared state).
const REAL_PROXY_IP = "198.51.100.7"; // TEST-NET-2, never a real client IP

// Helper: build an XFF header with a unique spoofed leftmost entry and the
// fixed real rightmost entry.  getRealIp returns the rightmost value, so all
// requests with the same REAL_PROXY_IP share one counter.
function xffHeader(spoofIndex: number): string {
  return `${spoofIndex}.${spoofIndex}.${spoofIndex}.${spoofIndex}, ${REAL_PROXY_IP}`;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Allow tenantMiddleware to pass all requests through regardless of slug
  // presence.  Without this, /api/auth/register and /api/auth/change-password
  // are not in the UNAUTHENTICATED_NO_SLUG_ALLOWLIST and tenantMiddleware
  // short-circuits with a 400 MISSING_TENANT before authLimiter can run.
  // ALLOW_TENANT_FALLBACK is explicitly designed for single-tenant and test
  // environments (see server/tenantMiddleware.ts).
  process.env.ALLOW_TENANT_FALLBACK = "true";

  // Freeze Date.now() so the 15-minute rate-limit window does not roll over
  // during the test.  We only fake Date (not async timers) so real DB ops and
  // supertest HTTP calls continue to function normally.
  vi.useFakeTimers({ toFake: ["Date"] });

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  delete process.env.ALLOW_TENANT_FALLBACK;
  vi.useRealTimers();
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("authLimiter — shared pool blocks all 7 auth endpoints when the login budget is exhausted", () => {
  it(
    "blocks all 6 sibling auth endpoints after the budget is exhausted via /api/auth/login",
    async () => {
      const AUTH_LIMITER_MAX = 15;

      // ── Phase 1: exhaust the shared budget via 15 POST /api/auth/login ─────
      //
      // Each carries a unique spoofed leftmost XFF entry and the same fixed
      // rightmost "real" IP — mirroring the production edge-proxy topology.
      // The authLimiter keys on the rightmost entry (getRealIp), so all 15
      // requests land in the same bucket.
      for (let i = 1; i <= AUTH_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/auth/login")
          .set("X-Forwarded-For", xffHeader(i))
          .send({
            email: `shared-pool-login-${i}@test.local`,
            password: "WrongPassword1!",
          });

        // Every one of these should be allowed through by the limiter
        // (the handler may return 401 for bad credentials, but not 429).
        expect(
          res.status,
          `login attempt ${i}/${AUTH_LIMITER_MAX} returned 429 before the budget was ` +
            `exhausted — the shared pool counter may be resetting unexpectedly`,
        ).not.toBe(429);
      }

      // ── Phase 2: probe each sibling route with a unique spoofed prefix ─────
      //
      // All probes use the same REAL_PROXY_IP rightmost entry, so they draw
      // from the same (now-exhausted) bucket.  The request body is irrelevant
      // because authLimiter runs before the handler.
      //
      // Spoofed indices start at 100 to guarantee uniqueness vs. Phase 1.

      // 2a. /api/auth/register
      const registerRes = await agent
        .post("/api/auth/register")
        .set("X-Forwarded-For", xffHeader(100))
        .send({
          email: "shared-pool-register@test.local",
          password: "WrongPassword1!",
        });

      expect(
        registerRes.status,
        `POST /api/auth/register should be 429 (shared pool exhausted by login) ` +
          `but got ${registerRes.status} — register may have its own independent limiter instance`,
      ).toBe(429);

      expect(
        registerRes.body?.message,
        "429 body for register should carry the authLimiter message",
      ).toMatch(/too many login attempts/i);

      // 2b. /api/auth/forgot-password
      const forgotRes = await agent
        .post("/api/auth/forgot-password")
        .set("X-Forwarded-For", xffHeader(101))
        .send({ email: "shared-pool-forgot@test.local" });

      expect(
        forgotRes.status,
        `POST /api/auth/forgot-password should be 429 (shared pool exhausted by login) ` +
          `but got ${forgotRes.status} — forgot-password may have its own independent limiter instance`,
      ).toBe(429);

      expect(
        forgotRes.body?.message,
        "429 body for forgot-password should carry the authLimiter message",
      ).toMatch(/too many login attempts/i);

      // 2c. /api/auth/reset-password
      const resetRes = await agent
        .post("/api/auth/reset-password")
        .set("X-Forwarded-For", xffHeader(102))
        .send({
          token: "dummy-token-shared-pool-test",
          password: "NewPassword1!",
        });

      expect(
        resetRes.status,
        `POST /api/auth/reset-password should be 429 (shared pool exhausted by login) ` +
          `but got ${resetRes.status} — reset-password may have its own independent limiter instance`,
      ).toBe(429);

      expect(
        resetRes.body?.message,
        "429 body for reset-password should carry the authLimiter message",
      ).toMatch(/too many login attempts/i);

      // 2d. /api/auth/change-password
      const changeRes = await agent
        .post("/api/auth/change-password")
        .set("X-Forwarded-For", xffHeader(103))
        .send({
          currentPassword: "OldPassword1!",
          newPassword: "NewPassword1!",
        });

      expect(
        changeRes.status,
        `POST /api/auth/change-password should be 429 (shared pool exhausted by login) ` +
          `but got ${changeRes.status} — change-password may have its own independent limiter instance`,
      ).toBe(429);

      expect(
        changeRes.body?.message,
        "429 body for change-password should carry the authLimiter message",
      ).toMatch(/too many login attempts/i);

      // 2e. /api/auth/verify-email
      const verifyRes = await agent
        .post("/api/auth/verify-email")
        .set("X-Forwarded-For", xffHeader(104))
        .send({ token: "dummy-verify-token-shared-pool" });

      expect(
        verifyRes.status,
        `POST /api/auth/verify-email should be 429 (shared pool exhausted by login) ` +
          `but got ${verifyRes.status} — verify-email may have its own independent limiter instance`,
      ).toBe(429);

      expect(
        verifyRes.body?.message,
        "429 body for verify-email should carry the authLimiter message",
      ).toMatch(/too many login attempts/i);

      // 2f. /api/auth/resend-verification
      const resendRes = await agent
        .post("/api/auth/resend-verification")
        .set("X-Forwarded-For", xffHeader(105))
        .send({ email: "shared-pool-resend@test.local" });

      expect(
        resendRes.status,
        `POST /api/auth/resend-verification should be 429 (shared pool exhausted by login) ` +
          `but got ${resendRes.status} — resend-verification may have its own independent limiter instance`,
      ).toBe(429);

      expect(
        resendRes.body?.message,
        "429 body for resend-verification should carry the authLimiter message",
      ).toMatch(/too many login attempts/i);
    },
    90_000,
  );
});
