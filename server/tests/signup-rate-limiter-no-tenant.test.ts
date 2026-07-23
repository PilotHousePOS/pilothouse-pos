/**
 * Integration tests: signupLimiter does NOT count no-tenant requests
 *
 * The signupLimiter uses `skip: (req) => !req.tenantId` so that requests
 * without a valid X-Tenant-Slug header (which always return 400) are never
 * counted against the rate-limit budget.  A misconfigured client or bot that
 * hammers /api/auth/signup without a slug must never exhaust the budget for
 * real users arriving through a legitimate store link.
 *
 * Done looks like:
 *   1. 20+ POST /api/auth/signup with no X-Tenant-Slug → each returns 400, NEVER 429.
 *   2. A subsequent request from the same IP that includes a valid slug
 *      proceeds to the normal signup logic (returns 200/201, not 429).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";

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

let agent: ReturnType<typeof supertest>;
let testTenantId: number;
let testTenantSlug: string;
const createdUserIds: string[] = [];

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();
  testTenantSlug = `rate-lim-${sfx}`;

  // Advance the tenants PK sequence to avoid collisions with parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `RateLimitTest ${sfx}`,
      slug: testTenantSlug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  testTenantId = tenant.id;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(inArray(contacts.linkedUserId, createdUserIds));
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
  }
  if (testTenantId) {
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("signupLimiter — no-tenant requests do not consume rate-limit budget", () => {
  it(
    "returns 400 (not 429) for each of 20+ no-slug requests, then allows a valid-slug request through",
    async () => {
      const NO_TENANT_ATTEMPTS = 25;

      // ── Phase 1: fire many requests without a tenant slug ─────────────────
      // Each must return 400 (invalid request — no tenant context).
      // None must ever return 429 (rate limited), because the signupLimiter
      // skips counting requests that have no tenantId.
      for (let i = 0; i < NO_TENANT_ATTEMPTS; i++) {
        const sfx = randomSuffix();
        const res = await agent
          .post("/api/auth/signup")
          // Deliberately omit X-Tenant-Slug so req.tenantId stays undefined.
          .send({
            email: `no-tenant-rl-${i}-${sfx}@test.local`,
            password: "NoTenant1!Pass",
            firstName: "Rate",
            lastName: "Test",
            phoneNumber: `555${String(i).padStart(7, "0")}`,
          });

        expect(
          res.status,
          `attempt ${i + 1}/${NO_TENANT_ATTEMPTS}: expected 400 (no tenant), got ${res.status}`,
        ).toBe(400);

        // Fail hard if the limiter kicks in — that is the regression we are guarding against.
        expect(
          res.status,
          `attempt ${i + 1}/${NO_TENANT_ATTEMPTS}: got 429 — no-tenant requests should NEVER exhaust the signup rate-limit budget`,
        ).not.toBe(429);
      }

      // ── Phase 2: request with a valid slug must NOT be blocked ────────────
      // The signupLimiter counter for this IP is still zero because every
      // previous request was skipped.  The valid-slug request should proceed
      // to the normal signup handler and return 200/201 (or a verification
      // response), NOT 429.
      const sfx = randomSuffix();
      const validEmail = `valid-slug-rl-${sfx}@test.local`;

      const validRes = await agent
        .post("/api/auth/signup")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({
          email: validEmail,
          password: "ValidSlug1!Pass",
          firstName: "Valid",
          lastName: "Store",
          phoneNumber: `555${sfx.slice(0, 7)}`,
        });

      // 429 means the no-tenant flood consumed budget it should not have.
      expect(
        validRes.status,
        `valid-slug request returned ${validRes.status} after ${NO_TENANT_ATTEMPTS} no-slug attempts — rate-limit budget must not have been consumed by the no-tenant requests`,
      ).not.toBe(429);

      // The valid request must reach the signup handler and return success
      // (200, 201, or a requiresVerification / email-confirmation response).
      // 400 would indicate a data problem; 404 would indicate a slug problem.
      // Any 2xx is acceptable.
      expect(
        validRes.status,
        `valid-slug signup should succeed (2xx) after many no-tenant requests; got ${validRes.status}: ${JSON.stringify(validRes.body)}`,
      ).toBeGreaterThanOrEqual(200);
      expect(validRes.status).toBeLessThan(300);

      // Track the created user for cleanup.
      const [dbUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, validEmail));
      if (dbUser) {
        createdUserIds.push(dbUser.id);
      }
    },
    60_000,
  );
});
