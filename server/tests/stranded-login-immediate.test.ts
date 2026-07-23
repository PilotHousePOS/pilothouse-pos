/**
 * Tests: Stranded-user login — NoTenantScreen renders immediately without a
 * page reload.
 *
 * The `NoTenantScreen` guard in `App.tsx` runs when an authenticated user has
 * `tenantId === null` and `isSuperAdmin !== true`.  For this guard to fire
 * immediately after login (not just after a page reload), two things must be
 * true:
 *
 *   1. POST /api/auth/login must return a falsy `tenantId` in its response
 *      body for a stranded user.  The client seeds the React Query auth cache
 *      with this response, so the Router evaluates the guard in the same
 *      navigation.
 *
 *   2. GET /api/auth/user must also return a falsy `tenantId` once the session
 *      is established, confirming the server state matches the login payload.
 *
 * These tests document the server-side contract that makes the immediate
 * frontend transition possible.  The corresponding frontend change in
 * `handleLogin` (auth.tsx) seeds queryClient with the login response and
 * navigates in-app via `setLocation('/')` for stranded users, bypassing
 * `window.location.replace('/')` (which would require a full page reload).
 *
 * Covered scenarios:
 *
 *  1. Login response for a stranded user (tenantId=null) returns 200 and a
 *     falsy tenantId — the frontend guard receives the data it needs immediately.
 *
 *  2. Login response for a stranded user carries no redirect URL — the client
 *     must not be steered to a broken tenant-scoped page.
 *
 *  3. GET /api/auth/user with the session token issued at login also returns
 *     a falsy tenantId — the server state is consistent with the login payload.
 *
 *  4. A non-stranded user (tenantId=<real id>) still gets a truthy tenantId in
 *     the login response — the normal flow is unaffected.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "../passwordUtils";

// ─── Shared state ──────────────────────────────────────────────────────────────

let testTenantId: number;
let testTenantSlug: string;

/** Stranded user: tenantId=null, emailVerified=true */
let strandedEmail: string;
let strandedUserId: string;

/** Normal user: tenantId=<testTenantId>, emailVerified=true */
let normalEmail: string;
let normalUserId: string;

const TEST_PASSWORD = "StrandedLogin1!";

let agent: ReturnType<typeof supertest>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

// ─── App setup ─────────────────────────────────────────────────────────────────

async function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);
  return app;
}

// ─── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();

  // Advance the tenant sequence to avoid PK conflicts with parallel tests.
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1))`,
  );

  // Create a tenant so the normal user has a real tenantId.
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `StrandedLoginTest-${sfx}`,
      slug: `stranded-login-test-${sfx}`,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();
  testTenantId = tenant.id;
  testTenantSlug = tenant.slug!;

  const hashed = await hashPassword(TEST_PASSWORD);

  // Stranded user: no tenantId, email verified so login is not blocked.
  strandedEmail = `stranded-login-${sfx}@test.local`;
  const [stranded] = await db
    .insert(users)
    .values({
      id: `sl-stranded-${sfx}`,
      email: strandedEmail,
      password: hashed,
      firstName: "Stranded",
      lastName: "LoginTest",
      phoneNumber: `555${sfx.slice(0, 7)}`,
      tenantId: null,
      isAdmin: false,
      isSuperAdmin: false,
      emailVerified: true,
      tokenVersion: 0,
    } as any)
    .returning({ id: users.id });
  strandedUserId = stranded.id as string;

  // Normal user: has a real tenantId, email verified.
  normalEmail = `normal-login-${sfx}@test.local`;
  const [normal] = await db
    .insert(users)
    .values({
      id: `sl-normal-${sfx}`,
      email: normalEmail,
      password: hashed,
      firstName: "Normal",
      lastName: "LoginTest",
      phoneNumber: `556${sfx.slice(0, 7)}`,
      tenantId: testTenantId,
      isAdmin: false,
      isSuperAdmin: false,
      emailVerified: true,
      tokenVersion: 0,
    } as any)
    .returning({ id: users.id });
  normalUserId = normal.id as string;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (strandedUserId)
    await db.delete(users).where(eq(users.id, strandedUserId));
  if (normalUserId) {
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(eq(contacts.linkedUserId, normalUserId as any));
    await db.delete(users).where(eq(users.id, normalUserId));
  }
  if (testTenantId)
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
}, 30_000);

// ─── 1. Login response for a stranded user ────────────────────────────────────

describe("POST /api/auth/login — stranded user (tenantId=null)", () => {
  it("returns 200 so the client processes the response body", async () => {
    const res = await agent
      .post("/api/auth/login")
      .send({ email: strandedEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
  });

  it("response has a falsy tenantId — the NoTenantScreen guard triggers immediately", async () => {
    const res = await agent
      .post("/api/auth/login")
      .send({ email: strandedEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    // The client seeds the React Query auth cache with this payload.
    // Router evaluates: !user.tenantId && !user.isSuperAdmin → NoTenantScreen.
    expect(res.body.tenantId).toBeFalsy();
  });

  it("response has isSuperAdmin=false so the guard is not bypassed", async () => {
    const res = await agent
      .post("/api/auth/login")
      .send({ email: strandedEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.isSuperAdmin).toBe(false);
  });

  it("response contains no redirect URL — the client decides navigation, not the server", async () => {
    const res = await agent
      .post("/api/auth/login")
      .send({ email: strandedEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    // If the server returned a redirectTo pointing at a tenant-scoped page, a
    // stranded user would land on a broken screen.  The contract is: no redirect.
    expect(res.body.redirectTo).toBeUndefined();
    expect(res.body.redirect).toBeUndefined();
  });

  it("response does not contain a password field (sanitizeUser strips it)", async () => {
    const res = await agent
      .post("/api/auth/login")
      .send({ email: strandedEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("password");
  });
});

// ─── 2. GET /api/auth/user reflects the same tenantId=null after login ────────

describe("GET /api/auth/user — stranded user session is consistent with login payload", () => {
  let sessionToken: string;

  beforeAll(async () => {
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: strandedEmail, password: TEST_PASSWORD });

    if (loginRes.status !== 200) {
      throw new Error(
        `Login in beforeAll failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`,
      );
    }
    sessionToken = loginRes.body.token as string;
  }, 30_000);

  it("returns 200 when authenticated as the stranded user", async () => {
    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${sessionToken}`);

    expect(res.status).toBe(200);
  });

  it("tenantId is falsy — consistent with the login response that was cached client-side", async () => {
    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${sessionToken}`);

    expect(res.status).toBe(200);
    // The frontend seeds its cache from the login response and navigates to '/'.
    // On arrival at Router the guard checks this same field via useAuth().
    // Both must be falsy so the NoTenantScreen fires without a second network
    // trip or a full page reload.
    expect(res.body.tenantId).toBeFalsy();
    expect(res.body.isSuperAdmin).toBe(false);
  });
});

// ─── 3. Normal user login is unaffected ───────────────────────────────────────

describe("POST /api/auth/login — normal user (tenantId=<real id>) still gets truthy tenantId", () => {
  it("login response has a truthy tenantId — normal flow is not affected by the stranded-user fix", async () => {
    const res = await agent
      .post("/api/auth/login")
      .send({ email: normalEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    // For normal users the client still calls window.location.replace('/') for
    // a clean reload, while stranded users use in-app navigation.  Both paths
    // start with the server returning the correct tenantId in the login body.
    expect(res.body.tenantId).toBe(testTenantId);
  });

  it("normal user login response also has no server-generated redirect URL", async () => {
    const res = await agent
      .post("/api/auth/login")
      .send({ email: normalEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.redirectTo).toBeUndefined();
    expect(res.body.redirect).toBeUndefined();
  });
});
