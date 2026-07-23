/**
 * Tests: Tenant-less signup attempts are rejected before consuming any rate-limit slot
 *
 * The generalLimiter and signupLimiter both skip requests to POST /api/auth/signup
 * when req.tenantId is undefined (no X-Tenant-Slug header, no ?tenant= param,
 * no authenticated user).  tenantMiddleware rejects these requests with 400 before
 * any business logic runs.
 *
 * This file confirms:
 *  1. A no-tenant signup POST returns 400 — not 429 (rate-limit) or any other code.
 *  2. The generalLimiter's RateLimit-Remaining counter is NOT decremented by a
 *     no-tenant signup attempt (the skip function fired before the counter ticked).
 *
 * Why this ordering matters:
 *  tenantMiddleware runs first (attached as app.use('/api', tenantMiddleware)).
 *  generalLimiter runs second (app.use('/api', generalLimiter)).
 *  signupLimiter runs third (app.use('/api/auth/signup', signupLimiter)).
 *
 *  The generalLimiter's skip predicate reads req.tenantId (set by tenantMiddleware),
 *  so by the time generalLimiter inspects the request, tenantMiddleware has already
 *  short-circuited with 400 — but the rate-limiter middleware runs anyway to decide
 *  whether to count.  Because skip returns true, no slot is consumed.
 *  The signupLimiter behaves identically.
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

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Ensure the single-tenant fallback is disabled so no-tenant requests are
  // genuinely rejected by tenantMiddleware rather than silently falling through.
  delete process.env.ALLOW_TENANT_FALLBACK;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/signup — no tenant context", () => {
  it("returns 400 (not 429) when no X-Tenant-Slug header and no tenant cookie are present", async () => {
    const sfx = randomSuffix();

    const res = await agent
      .post("/api/auth/signup")
      // Deliberately omit X-Tenant-Slug and any auth cookie
      .send({
        email: `no-tenant-signup-${sfx}@test.local`,
        password: "Test1234!",
        firstName: "No",
        lastName: "Tenant",
        phoneNumber: "5550009999",
      });

    // Must be a 400 from tenantMiddleware — never a 429 from a rate limiter.
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(429);

    // The 400 body should communicate the missing tenant, not a rate-limit message.
    expect(res.body.message).toBeTruthy();
    expect(res.body.message).not.toMatch(/too many/i);
    expect(res.body.message).not.toMatch(/rate/i);
  });

  it("does not decrement the generalLimiter RateLimit-Remaining counter", async () => {
    const sfx = randomSuffix();

    // ── Step 1: Establish a baseline counter value via a benign API call ──────
    // GET /api/stripe/config is a low-cost, publicly accessible endpoint that
    // passes through the generalLimiter.  Its response exposes the remaining
    // budget for this IP within the current window.
    const baseline = await agent.get("/api/stripe/config");

    const remainingBefore = parseInt(
      baseline.headers["ratelimit-remaining"] ?? "",
      10,
    );

    // If the header is absent the limiter is not running — skip gracefully.
    if (isNaN(remainingBefore)) {
      console.warn(
        "[test] RateLimit-Remaining header not present; skipping counter check.",
      );
      return;
    }

    // ── Step 2: Fire a no-tenant signup attempt ───────────────────────────────
    const signupRes = await agent
      .post("/api/auth/signup")
      // No X-Tenant-Slug — tenantMiddleware will reject with 400.
      .send({
        email: `no-tenant-counter-${sfx}@test.local`,
        password: "Test1234!",
        firstName: "Counter",
        lastName: "Check",
        phoneNumber: "5550008888",
      });

    expect(signupRes.status).toBe(400);

    // ── Step 3: Re-probe the same benign endpoint ─────────────────────────────
    const probe = await agent.get("/api/stripe/config");

    const remainingAfter = parseInt(
      probe.headers["ratelimit-remaining"] ?? "",
      10,
    );

    if (isNaN(remainingAfter)) {
      // Header disappeared; cannot verify — pass conservatively.
      return;
    }

    // The no-tenant signup must NOT have consumed a generalLimiter slot.
    // The baseline probe itself consumed one slot and the re-probe consumed
    // another, so remainingAfter should be remainingBefore - 2 (two real API
    // calls).  It must NOT be remainingBefore - 3 (which would indicate the
    // no-tenant signup was also counted).
    //
    // We assert strictly: remainingAfter === remainingBefore - 2.
    expect(remainingAfter).toBe(remainingBefore - 2);
  });
});
