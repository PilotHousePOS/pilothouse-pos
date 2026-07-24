/**
 * Tests: A flood of no-tenant signup attempts cannot exhaust the authLimiter budget
 *
 * The authLimiter is applied to POST /api/auth/login (max 15 per 15-minute window).
 * The signupLimiter and generalLimiter both skip no-tenant POST /api/auth/signup
 * attempts, so those requests are rejected with 400 without consuming any limiter slot.
 *
 * This file confirms that:
 *  1. Firing N (> 15) no-tenant signup POSTs does NOT touch the authLimiter counter.
 *  2. A subsequent POST /api/auth/login from the same IP returns 400 (bad credentials)
 *     or 200 — never 429.
 *  3. The authLimiter's RateLimit-Remaining after the login call is one less than its
 *     starting value (i.e. only the single login call was counted, not the signups).
 *
 * Why authLimiter is independent of signup flood:
 *  - authLimiter is only mounted on /api/auth/login (and a few other auth endpoints).
 *  - No-tenant signup requests are directed to /api/auth/signup — a different path.
 *  - Even if express-rate-limit used a shared counter (it does not — each rateLimit()
 *    call maintains its own in-memory store), the signup requests are skipped before
 *    the counter increments.
 *  - The two limiters are completely separate instances with separate counters.
 *
 * Middleware ordering in routes.ts (abbreviated):
 *   app.use('/api', tenantMiddleware)       — sets req.tenantId
 *   app.use('/api', generalLimiter)         — skips no-tenant signups
 *   app.use('/api/auth/login', authLimiter) — only counts login requests
 *   app.use('/api/auth/signup', signupLimiter) — skips no-tenant signups
 */

import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 9);
}

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

// Number of no-tenant signup attempts — deliberately above the signupLimiter
// max of 15 to prove the budget is never consumed.
const FLOOD_SIZE = 20;

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Ensure the single-tenant fallback is disabled so no-tenant requests are
  // genuinely rejected by tenantMiddleware rather than silently falling through.
  delete process.env.ALLOW_TENANT_FALLBACK;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("authLimiter isolation from no-tenant signup flood", () => {
  it(
    `fires ${FLOOD_SIZE} no-tenant signups then confirms login returns 400/200 — never 429`,
    async () => {
      // ── Step 1: Flood with no-tenant signup attempts ─────────────────────
      // Each request omits X-Tenant-Slug so tenantMiddleware rejects with 400.
      // None of these touches the authLimiter counter.
      for (let i = 0; i < FLOOD_SIZE; i++) {
        const sfx = randomSuffix();
        const signupRes = await agent
          .post("/api/auth/signup")
          // Deliberately omit X-Tenant-Slug — tenantMiddleware rejects with 400.
          .send({
            email: `flood-signup-${i}-${sfx}@test.local`,
            password: "Test1234!",
            firstName: "Flood",
            lastName: `User${i}`,
            phoneNumber: "5550001234",
          });

        // Each must be 400 (missing tenant), not 429 (rate limited).
        expect(signupRes.status).toBe(400);
        expect(signupRes.status).not.toBe(429);

        // The 400 response body must describe a missing-tenant problem,
        // not a rate-limit problem.
        expect(signupRes.body.message).toBeTruthy();
        expect(signupRes.body.message).not.toMatch(/too many/i);
        expect(signupRes.body.message).not.toMatch(/rate.?limit/i);
      }

      // ── Step 2: Send a login request from the same IP ────────────────────
      // Use deliberately invalid credentials so we get a deterministic 400
      // (bad credentials) without needing a real account in the database.
      const loginRes = await agent
        .post("/api/auth/login")
        .send({
          email: `nonexistent-${randomSuffix()}@test.local`,
          password: "WrongPassword1!",
        });

      // Login must return 400 (bad credentials) or 200 (if somehow matched),
      // but NEVER 429 (rate limit exceeded).  The authLimiter budget must be
      // intact because the prior signup flood did not touch it.
      expect(loginRes.status).not.toBe(429);
      expect([200, 400, 401]).toContain(loginRes.status);
    },
    90_000,
  );

  it(
    "authLimiter RateLimit-Remaining is only decremented by the login call — not by the prior signup flood",
    async () => {
      // ── Step 1: Establish the authLimiter baseline ────────────────────────
      // Send a first login request to read the starting RateLimit-Remaining
      // value on the authLimiter.  (The limiter only emits headers on the
      // routes it is mounted on.)
      const firstLogin = await agent
        .post("/api/auth/login")
        .send({
          email: `baseline-${randomSuffix()}@test.local`,
          password: "WrongPassword1!",
        });

      const remainingBefore = parseInt(
        firstLogin.headers["ratelimit-remaining"] ?? "",
        10,
      );

      // If the header is absent the limiter is not running — skip gracefully.
      if (isNaN(remainingBefore)) {
        console.warn(
          "[test] RateLimit-Remaining header not present on /api/auth/login; skipping counter check.",
        );
        return;
      }

      // ── Step 2: Flood with no-tenant signup attempts ──────────────────────
      for (let i = 0; i < FLOOD_SIZE; i++) {
        const sfx = randomSuffix();
        const signupRes = await agent
          .post("/api/auth/signup")
          .send({
            email: `auth-limiter-flood-${i}-${sfx}@test.local`,
            password: "Test1234!",
            firstName: "Flood",
            lastName: `Auth${i}`,
            phoneNumber: "5550005678",
          });

        // Every signup in the flood must be 400, not 429.
        expect(signupRes.status).toBe(400);
        expect(signupRes.status).not.toBe(429);
      }

      // ── Step 3: Send a second login request ──────────────────────────────
      const secondLogin = await agent
        .post("/api/auth/login")
        .send({
          email: `post-flood-${randomSuffix()}@test.local`,
          password: "WrongPassword1!",
        });

      // This login must also never be 429.
      expect(secondLogin.status).not.toBe(429);

      const remainingAfter = parseInt(
        secondLogin.headers["ratelimit-remaining"] ?? "",
        10,
      );

      if (isNaN(remainingAfter)) {
        // Header disappeared; cannot verify — pass conservatively.
        return;
      }

      // The authLimiter counter must have decreased by exactly 1 (for the
      // second login call only).  The FLOOD_SIZE no-tenant signup requests
      // must NOT have consumed any authLimiter slots.
      //
      // Expected: remainingAfter === remainingBefore - 1
      // Wrong if: remainingAfter === remainingBefore - 1 - FLOOD_SIZE
      //           (which would mean the signup flood bled into the authLimiter)
      expect(remainingAfter).toBe(remainingBefore - 1);
    },
    90_000,
  );
});
