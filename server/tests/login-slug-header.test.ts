/**
 * HTTP-level tests: POST /api/auth/login — X-Tenant-Slug header behaviour
 *
 * Unlike signup, login resolves tenant context from the user's stored record
 * (set at signup time), NOT from the X-Tenant-Slug header.  These tests
 * confirm that:
 *
 *  1. Login without X-Tenant-Slug succeeds and the returned user is scoped
 *     to the tenant they signed up under (header absence is safe).
 *  2. Login WITH X-Tenant-Slug still succeeds and the session is still
 *     scoped to the stored tenantId — the slug is intentionally ignored.
 *  3. Login with a slug that refers to a DIFFERENT store still succeeds and
 *     returns the user's real tenantId (the slug cannot hijack the session).
 *
 * This documents the intentional design decision so future engineers don't
 * add slug resolution to the login route thinking it is "missing".
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { hashPassword } from "../passwordUtils";

// ─── Shared state ─────────────────────────────────────────────────────────────

let tenantA: { id: number; slug: string };
let tenantB: { id: number; slug: string };
let testUserEmail: string;
let testUserId: string;
let agent: ReturnType<typeof supertest>;

const TEST_PASSWORD = "LoginSlug1!";

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
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

  // Advance sequence to avoid collisions with parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  // Create two tenants so we can confirm the slug of the "wrong" store cannot
  // override the user's stored tenantId.
  const [tA] = await db
    .insert(tenants)
    .values({
      name: `LoginSlug TenantA ${sfx}`,
      slug: `login-slug-a-${sfx}`,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  const [tB] = await db
    .insert(tenants)
    .values({
      name: `LoginSlug TenantB ${sfx}`,
      slug: `login-slug-b-${sfx}`,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  tenantA = { id: tA.id, slug: tA.slug! };
  tenantB = { id: tB.id, slug: tB.slug! };

  // Insert a pre-verified test user scoped to tenantA directly in the DB so
  // we bypass signup's X-Tenant-Slug requirement and control the tenantId.
  testUserEmail = `login-slug-${sfx}@test.local`;
  const hashed = await hashPassword(TEST_PASSWORD);

  const [inserted] = await db
    .insert(users)
    .values({
      id: `login-slug-test-${sfx}`,
      email: testUserEmail,
      password: hashed,
      firstName: "Login",
      lastName: "SlugTest",
      phoneNumber: `555${sfx.slice(0, 7)}`,
      tenantId: tenantA.id,
      isAdmin: false,
      emailVerified: true,
      tokenVersion: 0,
    } as any)
    .returning({ id: users.id });

  testUserId = inserted.id as string;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (testUserId) {
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(eq(contacts.linkedUserId, testUserId as any));
    await db.delete(users).where(eq(users.id, testUserId as any));
  }
  if (tenantA?.id) {
    await db.delete(tenants).where(eq(tenants.id, tenantA.id));
  }
  if (tenantB?.id) {
    await db.delete(tenants).where(eq(tenants.id, tenantB.id));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login — X-Tenant-Slug header behaviour", () => {
  it("succeeds without X-Tenant-Slug and returns user scoped to their stored tenantId", async () => {
    const res = await agent
      .post("/api/auth/login")
      // No X-Tenant-Slug header — mirrors a frontend that doesn't send it.
      .send({ email: testUserEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    // The response carries the user's stored tenantId, not a slug-derived one.
    expect(res.body.tenantId).toBe(tenantA.id);
  });

  it("succeeds WITH X-Tenant-Slug (matching tenant) and still returns stored tenantId", async () => {
    const res = await agent
      .post("/api/auth/login")
      .set("X-Tenant-Slug", tenantA.slug)
      .send({ email: testUserEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    // Even when the slug matches, tenant is resolved from the stored record.
    expect(res.body.tenantId).toBe(tenantA.id);
  });

  it("succeeds WITH X-Tenant-Slug (different tenant) and still returns stored tenantId — slug cannot hijack the session", async () => {
    // Send tenantB's slug even though the user belongs to tenantA.
    const res = await agent
      .post("/api/auth/login")
      .set("X-Tenant-Slug", tenantB.slug)
      .send({ email: testUserEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    // The slug of a different store must NOT override the user's real tenantId.
    expect(res.body.tenantId).toBe(tenantA.id);
    expect(res.body.tenantId).not.toBe(tenantB.id);
  });
});
