/**
 * Tests: No-tenant error screen guard
 *
 * The `NoTenantScreen` in `App.tsx` renders when an authenticated user has
 * `tenantId === null` and `isSuperAdmin !== true`.  These tests verify that
 * the API layer (`/api/auth/user`) correctly surfaces the fields that drive
 * that guard, and that the super-admin tenant-assignment endpoint can resolve
 * a stranded account.
 *
 * Covered scenarios:
 *
 *  1. Stranded user (tenantId=null, isSuperAdmin=false) — `/api/auth/user`
 *     returns the user object with a falsy tenantId, causing the client guard
 *     to show NoTenantScreen.
 *
 *  2. Super-admin with no tenant — `/api/auth/user` returns isSuperAdmin=true,
 *     which exempts them from the no-tenant guard regardless of tenantId.
 *
 *  3. `PATCH /api/super-admin/users/:id/tenant` — assigns a tenantId to the
 *     stranded user and persists it to the database.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { generateToken } from "../auth";

// ─── Shared state ─────────────────────────────────────────────────────────────

let testTenantId: number;

/** A normal user with no tenantId — the "stranded account" */
let strandedUserId: string;
let strandedToken: string;

/** A super-admin user with no tenantId — should be exempt from the guard */
let superAdminUserId: string;
let superAdminToken: string;

/** Supertest agent bound to the test Express app */
let agent: ReturnType<typeof supertest>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

async function getDbUser(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

// ─── App setup ────────────────────────────────────────────────────────────────

async function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);
  return app;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();

  // Advance the tenant sequence past any existing max id to avoid PK conflicts
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1))`,
  );

  // Create a tenant so the assignment test has somewhere to send the user
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `NoTenantTest-${sfx}`,
      slug: `no-tenant-test-${sfx}`,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();
  testTenantId = tenant.id;

  // Create stranded user: no tenantId, not a super-admin
  const [stranded] = await db
    .insert(users)
    .values({
      id: `nt-stranded-${sfx}`,
      email: `stranded-${sfx}@test.local`,
      firstName: "Stranded",
      lastName: "User",
      password: "hashed-for-test",
      tenantId: null,          // key: explicitly no tenant
      isAdmin: false,
      isSuperAdmin: false,
      tokenVersion: 0,
    })
    .returning();
  strandedUserId = stranded.id;
  strandedToken = generateToken(stranded as any);

  // Create super-admin user: no tenantId but isSuperAdmin=true
  const [superAdmin] = await db
    .insert(users)
    .values({
      id: `nt-superadmin-${sfx}`,
      email: `superadmin-${sfx}@test.local`,
      firstName: "Super",
      lastName: "Admin",
      password: "hashed-for-test",
      tenantId: null,          // no tenant — same as stranded
      isAdmin: true,
      isSuperAdmin: true,
      tokenVersion: 0,
    })
    .returning();
  superAdminUserId = superAdmin.id;
  superAdminToken = generateToken(superAdmin as any);

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (strandedUserId)
    await db.delete(users).where(eq(users.id, strandedUserId));
  if (superAdminUserId)
    await db.delete(users).where(eq(users.id, superAdminUserId));
  if (testTenantId)
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
}, 30_000);

// ─── 1. Stranded user — NoTenantScreen guard is triggered ─────────────────────

describe("GET /api/auth/user — stranded account (tenantId=null, isSuperAdmin=false)", () => {
  it("returns 200 with the user object", async () => {
    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${strandedToken}`);

    expect(res.status).toBe(200);
  });

  it("response has a falsy tenantId so the client guard shows NoTenantScreen", async () => {
    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${strandedToken}`);

    // The client guard: !user.tenantId && !user.isSuperAdmin → NoTenantScreen
    expect(res.body.tenantId).toBeFalsy();
    expect(res.body.isSuperAdmin).toBe(false);
  });

  it("response does not include the password field (sanitizeUser strips it)", async () => {
    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${strandedToken}`);

    expect(res.body).not.toHaveProperty("password");
  });
});

// ─── 2. Super-admin with no tenant — exempt from NoTenantScreen ───────────────

describe("GET /api/auth/user — super-admin with no tenantId is NOT shown NoTenantScreen", () => {
  it("returns 200 with the super-admin user object", async () => {
    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
  });

  it("isSuperAdmin=true exempts the user from the no-tenant guard even with tenantId=null", async () => {
    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${superAdminToken}`);

    // tenantId is null — same as the stranded user
    expect(res.body.tenantId).toBeFalsy();
    // But isSuperAdmin=true short-circuits the guard: NoTenantScreen is NOT rendered
    expect(res.body.isSuperAdmin).toBe(true);
  });
});

// ─── 3. Stranded user is blocked from tenant-scoped endpoints ─────────────────
//
// Only the allowlisted auth routes (e.g. /api/auth/user) pass through for
// stranded users.  Every other tenant-scoped endpoint must still return 403.

describe("Stranded user is blocked from tenant-scoped endpoints (403)", () => {
  it("GET /api/supplies returns 403 for a stranded user with no slug", async () => {
    const res = await agent
      .get("/api/supplies")
      .set("Authorization", `Bearer ${strandedToken}`);

    expect(res.status).toBe(403);
  });

  it("GET /api/contacts returns 403 for a stranded user with no slug", async () => {
    const res = await agent
      .get("/api/contacts")
      .set("Authorization", `Bearer ${strandedToken}`);

    expect(res.status).toBe(403);
  });

  it("GET /api/appointments returns 403 for a stranded user with no slug", async () => {
    const res = await agent
      .get("/api/appointments")
      .set("Authorization", `Bearer ${strandedToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── 3b. Stranded user cannot create records via POST endpoints ───────────────
//
// tenantMiddleware blocks non-allowlisted routes with 403 before the route
// handler even runs, so POST endpoints share the same protection as GETs.
// These tests confirm the rejection is present and carries a helpful message
// (not a silent 500 or a 200 with data from another tenant).

describe("Stranded user cannot create records via POST endpoints (403)", () => {
  it("POST /api/supplies returns 403 with a helpful message", async () => {
    const res = await agent
      .post("/api/supplies")
      .set("Authorization", `Bearer ${strandedToken}`)
      .send({ name: "Test Supply", quantity: 1, unit: "box", category: "Other" });

    expect(res.status).toBe(403);
    // Must carry a human-readable error, not a blank body
    expect(res.body).toHaveProperty("message");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it("POST /api/contacts returns 403 with a helpful message", async () => {
    const res = await agent
      .post("/api/contacts")
      .set("Authorization", `Bearer ${strandedToken}`)
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("message");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it("POST /api/appointments returns 403 with a helpful message", async () => {
    const res = await agent
      .post("/api/appointments")
      .set("Authorization", `Bearer ${strandedToken}`)
      .send({ petId: 1, groomerId: 1, scheduledAt: new Date().toISOString() });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("message");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it("response body is not empty — client can display the reason without guessing", async () => {
    const res = await agent
      .post("/api/supplies")
      .set("Authorization", `Bearer ${strandedToken}`)
      .send({ name: "Blocked Supply", quantity: 5, unit: "bag" });

    // Must not be an empty object or HTML error page
    expect(res.body).not.toEqual({});
    expect(res.body.message).toMatch(/tenant/i);
  });
});

// ─── 4. PATCH /api/super-admin/users/:id/tenant — resolves a stranded account ─

describe("PATCH /api/super-admin/users/:id/tenant — assigns tenant to stranded user", () => {
  it("returns 4xx when called without authentication", async () => {
    // tenantMiddleware runs first for all /api/* routes. With no auth token and
    // no X-Tenant-Slug header, it returns 400 before the route handler fires.
    const res = await agent
      .patch(`/api/super-admin/users/${strandedUserId}/tenant`)
      .send({ tenantId: testTenantId });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("returns 403 when called by a non-super-admin", async () => {
    // strandedToken belongs to a regular (non-super-admin) user
    const res = await agent
      .patch(`/api/super-admin/users/${strandedUserId}/tenant`)
      .set("Authorization", `Bearer ${strandedToken}`)
      .send({ tenantId: testTenantId });

    expect(res.status).toBe(403);
  });

  it("returns 200 and the updated user when called by a super-admin", async () => {
    const res = await agent
      .patch(`/api/super-admin/users/${strandedUserId}/tenant`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ tenantId: testTenantId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", strandedUserId);
    expect(res.body.tenantId).toBe(testTenantId);
  });

  it("persists the tenantId in the database after a successful PATCH", async () => {
    const dbUser = await getDbUser(strandedUserId);
    expect(dbUser?.tenantId).toBe(testTenantId);
  });

  it("after assignment, /api/auth/user returns a truthy tenantId — guard no longer triggers", async () => {
    // Refresh token version from DB (tenant assignment doesn't rotate the token,
    // but the token we already have still works since tokenVersion is unchanged)
    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${strandedToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(testTenantId);
  });

  it("returns 400 when tenantId is omitted from the request body", async () => {
    const res = await agent
      .patch(`/api/super-admin/users/${strandedUserId}/tenant`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
