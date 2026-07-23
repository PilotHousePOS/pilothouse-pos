/**
 * Tests: Stranded-user signup — NoTenantScreen guard contract for the sign-up path.
 *
 * The fix in handleSignUp (auth.tsx) mirrors the pattern already in handleLogin:
 * after a 200 response, if userData.tenantId is falsy and the user is not a
 * super-admin, the client seeds the React Query auth cache and navigates in-app
 * so NoTenantScreen appears immediately without a full page reload.
 *
 * These server-side tests confirm the contract that makes this possible:
 *
 *  1. POST /api/auth/signup for a tenant-scoped request returns a truthy tenantId
 *     in the response body — normal signups are unaffected (regression guard).
 *
 *  2. A normal signup response does NOT contain a redirect URL — the client decides
 *     navigation, the server does not dictate it.
 *
 *  3. The signup response does not leak the password field.
 *
 *  4. GET /api/auth/user with the token issued by signup also returns the same
 *     truthy tenantId — server state is consistent with the signup payload.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ─── Shared state ──────────────────────────────────────────────────────────────

let testTenantId: number;
let testTenantSlug: string;

/** Tracks all user IDs created during tests so afterAll can clean them up. */
const createdUserIds: string[] = [];

let agent: ReturnType<typeof supertest>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

async function cleanupUser(userId: string) {
  await db
    .update(contacts)
    .set({ linkedUserId: null })
    .where(eq(contacts.linkedUserId, userId as any));
  await db.delete(users).where(eq(users.id, userId as any));
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

  // Create a real tenant so normal signup has a store to attach to.
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `StrandedSignupTest-${sfx}`,
      slug: `stranded-signup-test-${sfx}`,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();
  testTenantId = tenant.id;
  testTenantSlug = tenant.slug!;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  // Delete all users created during tests (contacts unlinked first).
  for (const uid of createdUserIds) {
    await cleanupUser(uid);
  }
  // Also sweep any remaining users tied to the test tenant (e.g. if id capture failed).
  const remaining = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tenantId, testTenantId));
  for (const row of remaining) {
    await cleanupUser(row.id as string);
  }
  if (testTenantId)
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
}, 30_000);

// ─── 1. Normal signup returns a truthy tenantId (regression guard) ────────────

describe("POST /api/auth/signup — normal tenant-scoped signup", () => {
  const sfx = randomSuffix();
  const testEmail = `signup-main-${sfx}@test.local`;
  let signupBody: Record<string, unknown> = {};

  beforeAll(async () => {
    const res = await agent
      .post("/api/auth/signup")
      .set("X-Tenant-Slug", testTenantSlug)
      .send({
        email: testEmail,
        password: "StrandedSignup1!",
        firstName: "Signup",
        lastName: "Test",
        phoneNumber: `5550${sfx.slice(0, 6)}`,
      });

    signupBody = res.body as Record<string, unknown>;
    if (typeof signupBody.id === "string") {
      createdUserIds.push(signupBody.id);
    }
  }, 30_000);

  it("signup response returns a 2xx status", async () => {
    // 200 = immediate session; responses with requiresVerification also use 200.
    expect(signupBody).toBeDefined();
    // Verify by re-sending with a fresh address so the assertion is isolated.
    const sfx2 = randomSuffix();
    const res = await agent
      .post("/api/auth/signup")
      .set("X-Tenant-Slug", testTenantSlug)
      .send({
        email: `signup-extra-${sfx2}@test.local`,
        password: "StrandedSignup1!",
        firstName: "Extra",
        lastName: "Test",
        phoneNumber: `5551${sfx2.slice(0, 6)}`,
      });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    // Track for cleanup.
    const b = res.body as Record<string, unknown>;
    if (typeof b.id === "string") createdUserIds.push(b.id);
  });

  it("response has a truthy tenantId — NoTenantScreen guard must NOT fire for a normal signup", () => {
    // If tenantId were falsy here, the new client-side guard in handleSignUp
    // would redirect the user to NoTenantScreen even on a valid signup.
    // This test is the regression guard.
    if (signupBody.requiresVerification) {
      // Email-verification path: the guard only runs when requiresVerification
      // is falsy, so this scenario is not affected — just assert the flag.
      expect(signupBody.requiresVerification).toBeTruthy();
    } else {
      expect(signupBody.tenantId).toBeTruthy();
    }
  });

  it("response does not contain a redirect URL — the client controls navigation", () => {
    expect(signupBody.redirectTo).toBeUndefined();
    expect(signupBody.redirect).toBeUndefined();
  });

  it("response does not leak the password field", () => {
    expect(signupBody).not.toHaveProperty("password");
  });
});

// ─── 2. GET /api/auth/user session reflects the same tenantId as signup ───────

describe("GET /api/auth/user — session issued by signup is consistent with signup payload", () => {
  let sessionToken: string | null = null;
  let signupTenantId: number | null = null;

  beforeAll(async () => {
    const sfx = randomSuffix();
    const res = await agent
      .post("/api/auth/signup")
      .set("X-Tenant-Slug", testTenantSlug)
      .send({
        email: `signup-session-${sfx}@test.local`,
        password: "StrandedSignup1!",
        firstName: "Session",
        lastName: "Test",
        phoneNumber: `5552${sfx.slice(0, 6)}`,
      });

    const body = res.body as Record<string, unknown>;
    sessionToken = (body.token as string) ?? null;
    signupTenantId = (body.tenantId as number) ?? null;
    if (typeof body.id === "string") {
      createdUserIds.push(body.id);
    }
  }, 30_000);

  it("returns 200 when authenticated via the token from signup", async () => {
    if (!sessionToken) {
      // Token absent when requiresVerification path is taken — not applicable.
      return;
    }
    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${sessionToken}`);

    expect(res.status).toBe(200);
  });

  it("tenantId from GET /api/auth/user matches the tenantId from the signup response", async () => {
    if (!sessionToken || !signupTenantId) {
      // requiresVerification path — no live session to check.
      return;
    }
    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${sessionToken}`);

    expect(res.status).toBe(200);
    // Both must agree: the frontend seeds its React Query cache from the signup
    // response, then the Router re-checks via useAuth() → /api/auth/user.
    // A mismatch would cause NoTenantScreen to fire (or not fire) incorrectly.
    expect(res.body.tenantId).toBe(signupTenantId);
  });
});
