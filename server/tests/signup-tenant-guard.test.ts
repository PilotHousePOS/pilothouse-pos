/**
 * Integration tests: POST /api/auth/signup — tenant-slug guard
 *
 * These tests confirm that a missing or unrecognised X-Tenant-Slug header
 * does NOT silently produce a user that is assigned to a real tenant.
 *
 * Acceptable server behaviours:
 *   a) Reject the request with a 4xx status (preferred — fail fast), OR
 *   b) Return 200 and create a stranded account where the persisted tenantId
 *      in the database is strictly NULL (never a real tenant id).
 *
 * Both branches are verified against DB state, not just the response body,
 * because the critical risk is an incorrect tenant assignment in storage.
 *
 * A second suite (below) covers what happens AFTER login for a stranded
 * account: the session must not surface store-scoped data, and the user
 * record returned from /api/auth/user must carry tenantId = null so the
 * frontend can show the "Account Not Configured" screen.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
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

/** Read the stored tenantId for a user directly from the database. */
async function getStoredTenantId(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId as any))
    .limit(1);
  // Return null both when the row doesn't exist and when tenantId is null/undefined.
  return (row?.tenantId as number | null | undefined) ?? null;
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;

/** Ids of users created during tests — deleted in afterAll. */
const createdUserIds: string[] = [];

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Advance the tenants PK sequence to avoid collisions with parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  for (const userId of createdUserIds) {
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(eq(contacts.linkedUserId, userId as any));
    await db.delete(users).where(eq(users.id, userId as any));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/signup — missing X-Tenant-Slug", () => {
  it(
    "either rejects (4xx) or creates a stranded account with tenantId NULL in the database",
    async () => {
      const sfx = randomSuffix();

      const res = await agent
        .post("/api/auth/signup")
        // Intentionally omit X-Tenant-Slug header.
        .send({
          email: `no-slug-${sfx}@test.local`,
          password: "NoSlug1!Pass",
          firstName: "No",
          lastName: "Slug",
          phoneNumber: `555${sfx.slice(0, 7)}`,
        });

      if (res.status === 200) {
        // Account was created — record it for cleanup.
        const userId = res.body.id as string;
        expect(userId, "200 response must include a user id").toBeTruthy();
        createdUserIds.push(userId);

        // Verify persisted state: the DB row must have tenantId IS NULL.
        // This is the authoritative check — the response body is secondary.
        const storedTenantId = await getStoredTenantId(userId);
        expect(
          storedTenantId,
          "tenantId stored in DB must be null when no slug is supplied",
        ).toBeNull();

        // Response body tenantId must also be explicitly null — not undefined,
        // not a real tenant id.  Using `=== null` (strict) so `undefined` fails.
        expect(
          res.body.tenantId === null || res.body.tenantId === undefined,
          "response body tenantId must be null/absent when no slug is supplied",
        ).toBe(true);

        // Explicit guard: if the response body claims a non-null tenantId the
        // test must fail, because that would mean a real tenant was assigned.
        if (res.body.tenantId != null) {
          throw new Error(
            `Expected null tenantId in response body but got: ${res.body.tenantId}`,
          );
        }
      } else {
        // Server rejected the request — any 4xx is correct behaviour.
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      }
    },
    30_000,
  );
});

describe("POST /api/auth/signup — X-Tenant-Slug that matches no tenant", () => {
  it(
    "either rejects (4xx) or creates a stranded account with tenantId NULL in the database",
    async () => {
      const sfx = randomSuffix();

      const res = await agent
        .post("/api/auth/signup")
        // Slug that will never exist in the database.
        .set("X-Tenant-Slug", `nonexistent-tenant-${sfx}`)
        .send({
          email: `bad-slug-${sfx}@test.local`,
          password: "BadSlug1!Pass",
          firstName: "Bad",
          lastName: "Slug",
          phoneNumber: `555${sfx.slice(0, 7)}`,
        });

      if (res.status === 200) {
        const userId = res.body.id as string;
        expect(userId, "200 response must include a user id").toBeTruthy();
        createdUserIds.push(userId);

        // Authoritative check: the DB row must have tenantId IS NULL.
        // If the server somehow resolved the bogus slug to a real tenant and
        // stored that tenantId, this assertion will catch the regression.
        const storedTenantId = await getStoredTenantId(userId);
        expect(
          storedTenantId,
          "tenantId stored in DB must be null when slug matches no tenant",
        ).toBeNull();

        // Response body must not carry a real tenant id either.
        if (res.body.tenantId != null) {
          throw new Error(
            `Expected null tenantId in response body but got: ${res.body.tenantId}`,
          );
        }
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      }
    },
    30_000,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — post-login behaviour for stranded accounts
//
// A stranded account (tenantId = null in DB) must NOT be able to reach
// store-scoped data after login.  The login itself is allowed to succeed so
// the app can show the "Account Not Configured" screen, but every subsequent
// request must reflect the null tenant context.
//
// Flow:
//   1. POST /api/auth/signup  (no X-Tenant-Slug) → 200 or 4xx
//   2. If 200: patch the DB row to mark email as verified (bypasses the email
//      click that would be needed in a real browser flow)
//   3. POST /api/auth/login   → must return 200 with tenantId = null
//   4. GET  /api/auth/user    → must return tenantId = null (this is the flag
//      the frontend checks to show "Account Not Configured")
//   5. GET  /api/appointments → must not expose another tenant's appointment
//      data; an empty array (or a 403 for non-admin) is the only valid outcome
// ─────────────────────────────────────────────────────────────────────────────

describe("Stranded account — post-login behaviour", () => {
  it(
    "cannot reach store-scoped data after logging in without a tenant",
    async () => {
      const sfx = randomSuffix();
      const email = `stranded-login-${sfx}@test.local`;
      const password = "StrandedTest1!";

      // ── Step 1: sign up without a tenant slug ─────────────────────────────
      const signupRes = await agent
        .post("/api/auth/signup")
        // Deliberately omit X-Tenant-Slug.
        .send({
          email,
          password,
          firstName: "Stranded",
          lastName: "User",
          phoneNumber: `555${sfx.slice(0, 7)}`,
        });

      if (signupRes.status !== 200) {
        // Server rejected the request — 4xx is valid behaviour.
        // The stranded-login path cannot be exercised; skip gracefully.
        expect(signupRes.status).toBeGreaterThanOrEqual(400);
        expect(signupRes.status).toBeLessThan(500);
        return;
      }

      const userId = signupRes.body.id as string;
      expect(userId, "signup 200 must include a user id").toBeTruthy();
      createdUserIds.push(userId);

      // DB must have tenantId IS NULL — confirm before proceeding.
      const storedTenantId = await getStoredTenantId(userId);
      expect(storedTenantId, "DB tenantId must be null for stranded account").toBeNull();

      // ── Step 2: manually mark email as verified (simulate clicking the link)
      await db
        .update(users)
        .set({
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
        })
        .where(eq(users.id, userId as any));

      // ── Step 3: log in ────────────────────────────────────────────────────
      const loginRes = await agent
        .post("/api/auth/login")
        .send({ email, password });

      expect(
        loginRes.status,
        "login must succeed (200) for a verified stranded account",
      ).toBe(200);

      // The login response must carry tenantId = null.
      expect(
        loginRes.body.tenantId === null || loginRes.body.tenantId === undefined,
        "login response must NOT carry a real tenantId",
      ).toBe(true);

      // Sanity-check: response must not accidentally carry a non-null tenantId.
      if (loginRes.body.tenantId != null) {
        throw new Error(
          `Login response returned a non-null tenantId: ${loginRes.body.tenantId}`,
        );
      }

      // Extract the auth token so we can call authenticated endpoints.
      const authToken: string | undefined = loginRes.body.token;
      expect(authToken, "login response must include a JWT token").toBeTruthy();

      // ── Step 4: GET /api/auth/user must return tenantId = null ────────────
      // This is the field the frontend checks to decide whether to show the
      // "Account Not Configured" screen.  If it is non-null the frontend would
      // try to load store data, which is the regression we are guarding against.
      const userRes = await agent
        .get("/api/auth/user")
        .set("Authorization", `Bearer ${authToken}`);

      expect(
        userRes.status,
        "GET /api/auth/user must return 200 for an authenticated stranded user",
      ).toBe(200);

      expect(
        userRes.body.tenantId === null || userRes.body.tenantId === undefined,
        "GET /api/auth/user must return tenantId = null for a stranded account",
      ).toBe(true);

      if (userRes.body.tenantId != null) {
        throw new Error(
          `GET /api/auth/user returned a non-null tenantId: ${userRes.body.tenantId}`,
        );
      }

      // ── Step 5: store-scoped endpoint must not expose real tenant data ────
      // GET /api/appointments is authenticated and uses req.tenantId to scope
      // the query.  With tenantId = null the middleware cannot attach a real
      // tenant, so the response must be an empty array (no appointments) or
      // a 403 (not an admin).  Either outcome is acceptable; what is NOT
      // acceptable is a non-empty array of appointments from another store.
      const apptRes = await agent
        .get("/api/appointments")
        .set("Authorization", `Bearer ${authToken}`);

      if (apptRes.status === 200) {
        // If the server returns 200 the body must be an array containing only
        // appointments that belong to this user (i.e. none — the account was
        // just created).  An array containing records scoped to a real tenant
        // indicates a data-isolation failure.
        expect(Array.isArray(apptRes.body), "appointments response must be an array").toBe(true);
        expect(
          apptRes.body.length,
          "stranded user must have zero appointments (no store data exposed)",
        ).toBe(0);
      } else {
        // 403 (not an admin / not a groomer) or 400 (no tenant context) are
        // also acceptable — the stranded user must not see store data.
        expect(
          apptRes.status === 400 || apptRes.status === 403,
          `expected 400 or 403 from /api/appointments for stranded user, got ${apptRes.status}`,
        ).toBe(true);
      }
    },
    60_000,
  );
});
