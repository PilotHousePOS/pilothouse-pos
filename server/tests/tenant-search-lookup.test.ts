/**
 * Integration tests: GET /api/super-admin/tenants?search= returns correct results
 * when two stores share a similar name prefix.
 *
 * Scenarios covered:
 *   1. Searching the shared prefix returns BOTH tenants with distinct IDs
 *   2. Searching the full name of one tenant returns ONLY that tenant
 *   3. A search that matches neither tenant returns an empty list
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

let tenantPawsId: number;
let tenantPawsAndClawsId: number;
let superAdminUserId: string;
let superAdminToken: string;

/** Supertest agent bound to the test Express app */
let agent: ReturnType<typeof supertest>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

async function createTestTenant(name: string, slug: string): Promise<number> {
  const result = await db.execute(
    sql`INSERT INTO tenants (name, slug, subscription_status, subscription_tier)
        VALUES (${name}, ${slug}, 'active', 'starter')
        RETURNING id`,
  );
  return (result.rows[0] as { id: number }).id;
}

async function createSuperAdminUser(email: string): Promise<string> {
  const id = "sa-search-test-" + randomSuffix();
  const [user] = await db
    .insert(users)
    .values({
      id,
      email,
      firstName: "Super",
      lastName: "Admin",
      password: "hashed-password-for-test",
      isAdmin: true,
      isSuperAdmin: true,
      tokenVersion: 0,
    })
    .returning();
  return user.id;
}

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

  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1))`,
  );

  // Create two tenants with overlapping name prefixes
  tenantPawsId = await createTestTenant(`Paws ${sfx}`, `paws-${sfx}`);
  tenantPawsAndClawsId = await createTestTenant(
    `Paws & Claws ${sfx}`,
    `paws-and-claws-${sfx}`,
  );

  // Create a super-admin user (no tenantId needed for super-admins)
  superAdminUserId = await createSuperAdminUser(`sa-search-${sfx}@test.local`);

  // Retrieve the DB row so we get the correct tokenVersion for the JWT
  const [dbUser] = await db.select().from(users).where(eq(users.id, superAdminUserId));
  superAdminToken = generateToken(dbUser as any);

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (superAdminUserId) await db.delete(users).where(eq(users.id, superAdminUserId));
  if (tenantPawsId) await db.delete(tenants).where(eq(tenants.id, tenantPawsId));
  if (tenantPawsAndClawsId)
    await db.delete(tenants).where(eq(tenants.id, tenantPawsAndClawsId));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/super-admin/tenants?search= — overlapping store names", () => {
  it("shared prefix returns both tenants with their correct distinct IDs", async () => {
    // Both tenant names start with "Paws" so ?search=paws must return both
    const res = await agent
      .get("/api/super-admin/tenants?search=paws")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const returnedTenants: Array<{ id: number; name: string }> = res.body.tenants;

    const foundPaws = returnedTenants.find((t) => t.id === tenantPawsId);
    const foundPawsAndClaws = returnedTenants.find((t) => t.id === tenantPawsAndClawsId);

    expect(foundPaws).toBeDefined();
    expect(foundPawsAndClaws).toBeDefined();

    // IDs must be different — they are separate tenants
    expect(tenantPawsId).not.toBe(tenantPawsAndClawsId);
  });

  it("searching the full name 'Paws & Claws' returns only that tenant", async () => {
    // The search string includes " & Claws" which only the second tenant matches
    const res = await agent
      .get("/api/super-admin/tenants?search=paws+%26+claws")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const returnedTenants: Array<{ id: number; name: string }> = res.body.tenants;

    // Only Paws & Claws should be in results
    const ids = returnedTenants.map((t) => t.id);
    expect(ids).toContain(tenantPawsAndClawsId);
    expect(ids).not.toContain(tenantPawsId);
  });

  it("a search term that matches neither tenant returns no results for these two tenants", async () => {
    // Use a unique string that cannot match any real tenant name
    const noMatchTerm = "zzz-no-match-xyz-abc-9999";
    const res = await agent
      .get(`/api/super-admin/tenants?search=${noMatchTerm}`)
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const returnedTenants: Array<{ id: number }> = res.body.tenants;

    expect(returnedTenants.find((t) => t.id === tenantPawsId)).toBeUndefined();
    expect(returnedTenants.find((t) => t.id === tenantPawsAndClawsId)).toBeUndefined();
  });

  it("no search param returns all tenants including both test tenants", async () => {
    const res = await agent
      .get("/api/super-admin/tenants")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const returnedTenants: Array<{ id: number }> = res.body.tenants;
    const ids = returnedTenants.map((t) => t.id);

    expect(ids).toContain(tenantPawsId);
    expect(ids).toContain(tenantPawsAndClawsId);
  });
});
