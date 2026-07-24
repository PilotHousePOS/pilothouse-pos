/**
 * Integration test: register-only flood with a valid slug exhausts the authLimiter
 *
 * Context
 * ───────
 * The authLimiter (windowMs: 15 min, max: 15) is a single shared instance
 * mounted on both /api/auth/login and /api/auth/register.
 *
 * An attacker who knows a store's slug (publicly visible in the store URL) can
 * send 15 slug-bearing POST /api/auth/register requests to fill the IP-level
 * authLimiter bucket, then block legitimate users from logging in from the same
 * IP — without ever submitting a single login attempt themselves.
 *
 * This test verifies that:
 *
 *   1. 15 POST /api/auth/register requests carrying X-Tenant-Slug consume the
 *      shared authLimiter budget (each returns non-429).
 *   2. The 16th request — a POST /api/auth/login — returns 429, proving the
 *      authLimiter block is IP-wide and not gated on which endpoint triggered it.
 *   3. A follow-up register attempt from the same IP is also 429, confirming
 *      the entire shared bucket is exhausted.
 *
 * Done looks like
 * ───────────────
 *  - 15 POST /api/auth/register requests with X-Tenant-Slug return non-429
 *    (handler returns 400 or 401 — budget is consumed but not yet exhausted).
 *  - 16th request to /api/auth/login returns 429.
 *  - A subsequent register attempt from the same IP also returns 429.
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
  vi.useFakeTimers({ toFake: ["Date"] });

  const sfx = randomSuffix();
  tenantSlug = `reg-flood-${sfx}`;

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
      name: `Register Flood Test ${sfx}`,
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

describe("authLimiter — register-only flood with valid slug blocks /api/auth/login", () => {
  it(
    "blocks /api/auth/login after 15 slug-bearing register-only requests exhaust the shared budget",
    async () => {
      const MAX_ATTEMPTS = 15; // mirrors authLimiter max

      // ── Phase 1: exhaust the shared budget via register-only requests ────────
      //
      // Send 15 POST /api/auth/register requests, all carrying X-Tenant-Slug so
      // tenantMiddleware resolves the tenant and allows requests through to the
      // authLimiter. Each should return non-429 (handler returns 400 or 401).
      //
      // If the authLimiter were scoped per-endpoint, these 15 register hits would
      // not affect the login bucket. Because the limiter is shared (correct
      // behaviour), the combined total of 15 fills the IP-level bucket.
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const res = await agent
          .post("/api/auth/register")
          .set("X-Tenant-Slug", tenantSlug)
          .send({
            email: `reg-flood-${i}-${randomSuffix()}@test.local`,
            password: "WrongPassword1!",
            firstName: "Rate",
            lastName: "Limit",
            phoneNumber: "5550009999",
          });

        expect(
          res.status,
          `register attempt ${i + 1}/${MAX_ATTEMPTS} returned 429 before budget was exhausted — ` +
            `the authLimiter fired too early, or slug-bearing register requests are not reaching the limiter`,
        ).not.toBe(429);
      }

      // ── Phase 2: 16th request — a login — must be rate-limited ──────────────
      //
      // The IP-level bucket is now full (15 register hits). The next request to
      // any endpoint covered by the same authLimiter instance must return 429.
      // This is the critical assertion: a register-only flood blocks login from
      // the same IP.
      const blockedOnLogin = await agent
        .post("/api/auth/login")
        .send({
          email: "reg-flood-blocked-login@test.local",
          password: "WrongPassword1!",
        });

      expect(
        blockedOnLogin.status,
        `16th request to /api/auth/login should be 429 but got ${blockedOnLogin.status} — ` +
          `slug-bearing /api/auth/register requests may not be consuming the shared authLimiter budget, ` +
          `or the limiter is tracking per-endpoint rather than per-IP across endpoints`,
      ).toBe(429);

      // ── Phase 3: further register attempts from the same IP are also blocked ─
      //
      // Confirms the block is IP-wide and not endpoint-specific. If the limiter
      // tracked separately per endpoint, /api/auth/register would still have
      // budget remaining (it saw all 15, so it would be at its limit, but login
      // would be at 0 — here we verify register is also at 429, as expected
      // when both share the same store).
      const blockedOnRegister = await agent
        .post("/api/auth/register")
        .set("X-Tenant-Slug", tenantSlug)
        .send({
          email: "reg-flood-blocked-register@test.local",
          password: "WrongPassword1!",
          firstName: "Rate",
          lastName: "Limit",
          phoneNumber: "5550008888",
        });

      expect(
        blockedOnRegister.status,
        `follow-up /api/auth/register should also be 429 (shared IP-level block) but got ${blockedOnRegister.status}`,
      ).toBe(429);
    },
    90_000,
  );
});
