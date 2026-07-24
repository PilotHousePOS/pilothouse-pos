/**
 * Integration test: authLimiter counts slug-bearing /api/auth/register attempts
 *
 * Context
 * ───────
 * The authLimiter (windowMs: 15 min, max: 15) is a single shared instance
 * mounted on both /api/auth/login and /api/auth/register.
 *
 * tenantMiddleware's UNAUTHENTICATED_NO_SLUG_ALLOWLIST includes /auth/login
 * but NOT /auth/register. An unauthenticated register request WITHOUT a slug
 * is therefore blocked by tenantMiddleware (returns 400) before it can reach
 * the authLimiter — so it does NOT consume budget.
 *
 * However, an attacker who knows the store slug (visible in the public store
 * URL) CAN include X-Tenant-Slug on their register requests, causing
 * tenantMiddleware to resolve the tenant and pass the request through to the
 * authLimiter. This test confirms that:
 *
 *   1. Slug-bearing /api/auth/register requests reach and consume the shared
 *      authLimiter budget alongside /api/auth/login requests.
 *   2. The combined 16th request (alternating login + register, both with
 *      the slug) returns 429, proving rotation between the two endpoints with
 *      a valid slug cannot bypass the rate limit.
 *   3. After the limit fires, a fresh slug-bearing register attempt is also
 *      blocked — the IP-level block is not endpoint-specific.
 *
 * Done looks like
 * ───────────────
 *  - 15 alternating requests to /api/auth/login and /api/auth/register, all
 *    carrying X-Tenant-Slug, return non-429 (handler may return 400/401).
 *  - The combined 16th request to /api/auth/login returns 429.
 *  - A follow-up request to /api/auth/register (same IP) is also 429.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix() {
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

let tenantId: number;
let tenantSlug: string;
let agent: ReturnType<typeof supertest>;

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Freeze Date so the rate-limiter window starts at a known time.
  // Only the Date is faked — real async DB ops and supertest calls continue
  // to work correctly.
  vi.useFakeTimers({ toFake: ["Date"] });

  const sfx = randomSuffix();
  tenantSlug = `reg-limiter-${sfx}`;

  // Advance the sequence to avoid collisions with parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `Register Limiter Test ${sfx}`,
      slug: tenantSlug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  tenantId = tenant.id;

  // Build a fresh Express app so its in-memory rate-limit store starts at 0.
  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  vi.useRealTimers();
  if (tenantId) {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("authLimiter — slug-bearing /api/auth/register shares budget with /api/auth/login", () => {
  it(
    "blocks the 16th request after 15 alternating slug-bearing login + register attempts",
    async () => {
      const MAX_ATTEMPTS = 15; // mirrors authLimiter max

      // ── Phase 1: exhaust the shared budget across both endpoints ────────────
      //
      // Alternate between /api/auth/login and /api/auth/register, sending all
      // requests with X-Tenant-Slug so tenantMiddleware resolves the tenant and
      // allows the requests through to the authLimiter.
      //
      // - 8 requests go to /api/auth/login   (indices 0, 2, 4, 6, 8, 10, 12, 14)
      // - 7 requests go to /api/auth/register (indices 1, 3, 5, 7, 9, 11, 13)
      //
      // Neither endpoint alone reaches 15, so if the limiter were per-endpoint
      // neither would trigger 429. Because the limiter is shared (correct
      // behaviour), the combined total of 15 fills the IP-level bucket.
      const endpoints = ["/api/auth/login", "/api/auth/register"];

      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const endpoint = endpoints[i % 2];
        const res = await agent
          .post(endpoint)
          .set("X-Tenant-Slug", tenantSlug)
          .send({
            email: `reg-limiter-${i}-${randomSuffix()}@test.local`,
            password: "WrongPassword1!",
            // register may require additional fields; supply them so the handler
            // gets a parseable body and rejects with 400/401 rather than crashing
            firstName: "Rate",
            lastName: "Limit",
            phoneNumber: "5550009999",
          });

        expect(
          res.status,
          `attempt ${i + 1}/${MAX_ATTEMPTS} on ${endpoint} returned 429 before budget was exhausted — ` +
            `the authLimiter fired too early, or this endpoint is not reaching the limiter`,
        ).not.toBe(429);
      }

      // ── Phase 2: 16th request to /api/auth/login must be rate-limited ──────
      // The IP-level bucket is now full (15 combined hits). The next request to
      // any endpoint covered by the same authLimiter instance must return 429.
      const blockedOnLogin = await agent
        .post("/api/auth/login")
        .set("X-Tenant-Slug", tenantSlug)
        .send({
          email: "reg-limiter-blocked-login@test.local",
          password: "WrongPassword1!",
        });

      expect(
        blockedOnLogin.status,
        `16th request to /api/auth/login should be 429 but got ${blockedOnLogin.status} — ` +
          `slug-bearing /api/auth/register requests may not be reaching or consuming the shared authLimiter`,
      ).toBe(429);

      // ── Phase 3: a further slug-bearing register attempt is also blocked ────
      // If the limiter were tracking per-endpoint, /api/auth/register would only
      // have seen 7 hits and would have 8 remaining. Returning 429 here confirms
      // the block is IP-wide, not endpoint-specific.
      const blockedOnRegister = await agent
        .post("/api/auth/register")
        .set("X-Tenant-Slug", tenantSlug)
        .send({
          email: "reg-limiter-blocked-register@test.local",
          password: "WrongPassword1!",
          firstName: "Rate",
          lastName: "Limit",
          phoneNumber: "5550008888",
        });

      expect(
        blockedOnRegister.status,
        `request to /api/auth/register should also be 429 (same shared limiter) but got ${blockedOnRegister.status} — ` +
          `per-endpoint tracking would allow 8 more attempts on /api/auth/register`,
      ).toBe(429);
    },
    90_000,
  );
});
