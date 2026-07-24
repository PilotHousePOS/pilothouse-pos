/**
 * Integration tests: authLimiter cross-endpoint counter sharing
 *
 * The authLimiter (windowMs: 15 min, max: 15) is a SINGLE shared instance
 * mounted on multiple endpoints:
 *   - /api/auth/login
 *   - /api/auth/register
 *   - /api/forgot-password
 *   - /api/auth/reset-password
 *   - /api/auth/change-password
 *
 * Because the limiter instance is shared (not duplicated per route), all
 * requests from the same IP count towards one pool — an attacker cannot
 * rotate between endpoints to exceed the 15-attempt cap without triggering 429.
 *
 * Only endpoints that pass through tenantMiddleware without a slug are used
 * here.  tenantMiddleware allowlists /auth/login and /auth/reset-password for
 * unauthenticated, no-slug requests; the others require a slug header and are
 * rejected before the authLimiter runs.  Both allowlisted endpoints carry the
 * same authLimiter instance, so their counts are shared per-IP.
 *
 * Done looks like:
 *   1. 15 POST requests spread across /api/auth/login and /api/auth/reset-password
 *      all pass the authLimiter (non-429 — handler may return 400/401).
 *   2. The combined 16th request — sent to either endpoint — returns 429.
 *   3. A subsequent request to the other covered endpoint also returns 429,
 *      confirming the block is IP-wide, not endpoint-specific.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  vi.useRealTimers();
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("authLimiter — shared counter across endpoints", () => {
  it(
    "blocks the 16th request regardless of which endpoint it targets when prior attempts are spread across two endpoints",
    async () => {
      const MAX_ATTEMPTS = 15; // mirrors authLimiter max

      // Both endpoints are on tenantMiddleware's UNAUTHENTICATED_NO_SLUG_ALLOWLIST
      // (/auth/login and /auth/reset-password), so unauthenticated requests without
      // a slug header pass tenantMiddleware and reach the shared authLimiter.
      //
      // /api/auth/register and /api/forgot-password are NOT on the allowlist —
      // tenantMiddleware rejects them with 400 before the limiter runs, so they
      // cannot be used to verify shared counting in an unauthenticated test.
      const endpoints = ["/api/auth/login", "/api/auth/reset-password"];

      // ── Phase 1: exhaust the shared budget across two endpoints ─────────────
      // Alternate requests: 8 to login, 7 to reset-password = 15 total.
      // Neither endpoint alone reaches the 15-attempt cap, so if the limiter
      // were per-endpoint neither would trigger 429.  If the limiter is shared
      // (correct behaviour), the combined total of 15 fills the bucket.
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const endpoint = endpoints[i % 2];
        const res = await agent
          .post(endpoint)
          .send({
            email: `rotation-test-${i}@test.local`,
            password: "WrongPassword1!",
            // reset-password requires a token field; supply a bogus one so the
            // handler can parse the body (it will reject with 400/401, not crash)
            token: "bogus-reset-token",
            newPassword: "NewPassword1!",
          });

        expect(
          res.status,
          `attempt ${i + 1}/${MAX_ATTEMPTS} on ${endpoint} returned 429 before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: 16th request to /api/auth/login must be rate-limited ──────
      // After 15 combined requests the IP-level bucket is full.  The next
      // request to *any* covered endpoint must be blocked with 429.
      const blockedOnLogin = await agent
        .post("/api/auth/login")
        .send({
          email: "rotation-blocked-login@test.local",
          password: "WrongPassword1!",
        });

      expect(
        blockedOnLogin.status,
        `16th request to /api/auth/login should be 429 but got ${blockedOnLogin.status} — ` +
          `limiter may be tracking counts per-endpoint instead of per-IP across all endpoints`,
      ).toBe(429);

      // ── Phase 3: same blocked IP is also rejected on /api/auth/reset-password
      // If the limiter were per-endpoint, reset-password would have only seen 7
      // hits (below the cap of 15), so this distinguishes per-endpoint from
      // shared behaviour.
      const blockedOnReset = await agent
        .post("/api/auth/reset-password")
        .send({
          token: "bogus-reset-token",
          newPassword: "NewPassword1!",
        });

      expect(
        blockedOnReset.status,
        `request to /api/auth/reset-password should also be 429 (same shared limiter) but got ${blockedOnReset.status} — ` +
          `per-endpoint tracking would allow 8 more attempts on this endpoint`,
      ).toBe(429);
    },
    90_000,
  );
});
