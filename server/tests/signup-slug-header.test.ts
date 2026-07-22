/**
 * HTTP-level tests: POST /api/auth/signup — X-Tenant-Slug header requirement
 *
 * The client-side auth page reads ?tenant=<slug> from the URL and forwards it
 * as the X-Tenant-Slug request header.  These tests confirm the server-side
 * behaviour that gives that contract its teeth:
 *
 *  1. Header present + valid slug → new user receives the matching tenantId.
 *  2. Header absent              → server rejects with 400 (no silent fallback).
 *  3. Header present + unknown slug → server rejects with 404.
 *
 * If the frontend drops the header, test (1) will still pass (the account
 * would just land on tenant 1), but test (2) proves that ANY unauthenticated
 * signup without a slug is rejected — making a header-less request visibly
 * broken rather than silently wrong.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";

// ─── Shared state ─────────────────────────────────────────────────────────────

let signupTenantId: number;
let signupTenantSlug: string;
let agent: ReturnType<typeof supertest>;

const createdUserIds: string[] = [];

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
  signupTenantSlug = `slug-hdr-${sfx}`;

  // Advance the tenant sequence so the new row doesn't collide with
  // rows inserted by parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `SlugHeader Test ${sfx}`,
      slug: signupTenantSlug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  signupTenantId = tenant.id;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (createdUserIds.length > 0) {
    // The signup route links contacts by phone number; null out the FK first
    // so the user rows can be deleted without a foreign-key violation.
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(inArray(contacts.linkedUserId, createdUserIds));
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
  }
  if (signupTenantId) {
    await db.delete(tenants).where(eq(tenants.id, signupTenantId));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/signup — X-Tenant-Slug header", () => {
  it("assigns new user to the slug-resolved tenant when X-Tenant-Slug is present", async () => {
    const sfx = randomSuffix();
    const email = `slug-hdr-ok-${sfx}@test.local`;

    const res = await agent
      .post("/api/auth/signup")
      .set("X-Tenant-Slug", signupTenantSlug)
      .send({
        email,
        password: "Test1234!",
        firstName: "Slug",
        lastName: "Header",
        phoneNumber: "5550001111",
      });

    // Accept 200 (immediate session) or 201 / requiresVerification response
    expect([200, 201]).toContain(res.status);

    // Confirm the user row in the DB was scoped to the correct tenant
    const [dbUser] = await db
      .select({ tenantId: users.tenantId })
      .from(users)
      .where(eq(users.email, email));

    expect(dbUser).toBeDefined();
    expect(dbUser.tenantId).toBe(signupTenantId);

    // Track for cleanup
    if (dbUser) {
      const [fullUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (fullUser) createdUserIds.push(fullUser.id);
    }
  });

  /**
   * This is the key guard: if the frontend drops the X-Tenant-Slug header a
   * customer signing up from a store page gets a 400 instead of silently
   * landing in the wrong store.  The test MUST fail when no header is sent.
   */
  it("rejects with 400 when X-Tenant-Slug header is absent", async () => {
    const sfx = randomSuffix();

    const res = await agent
      .post("/api/auth/signup")
      // Intentionally no X-Tenant-Slug header — mirrors a frontend that forgot
      // to attach the slug.
      .send({
        email: `slug-hdr-missing-${sfx}@test.local`,
        password: "Test1234!",
        firstName: "No",
        lastName: "Slug",
        phoneNumber: "5550002222",
      });

    expect(res.status).toBe(400);
    // No user should have been created
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, `slug-hdr-missing-${sfx}@test.local`));
    expect(rows).toHaveLength(0);
  });

  it("rejects with 404 when X-Tenant-Slug refers to an unknown store", async () => {
    const sfx = randomSuffix();

    const res = await agent
      .post("/api/auth/signup")
      .set("X-Tenant-Slug", `no-such-store-${sfx}`)
      .send({
        email: `slug-hdr-404-${sfx}@test.local`,
        password: "Test1234!",
        firstName: "Bad",
        lastName: "Slug",
        phoneNumber: "5550003333",
      });

    expect(res.status).toBe(404);
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, `slug-hdr-404-${sfx}@test.local`));
    expect(rows).toHaveLength(0);
  });
});
