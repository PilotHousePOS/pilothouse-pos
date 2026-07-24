/**
 * Integration tests: deleteGroomerAvailability and deleteGroomerBlockedDay route guards
 *
 * Verifies that the HTTP routes for DELETE /api/admin/groomer-availability/:id
 * and DELETE /api/admin/groomer-blocked-days/:id correctly enforce tenant
 * ownership after the storage layer was hardened to throw instead of silently
 * returning when ownership checks fail.
 *
 * Scenarios covered for each endpoint:
 *   1. Own-tenant admin can delete their own record → 200
 *   2. Stranded admin (tenantId = null) is rejected by tenantMiddleware → 403
 *   3. Cross-tenant admin targeting another tenant's record → 403 or 404, never a silent no-op
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import {
  tenants,
  users,
  groomers,
  groomerAvailability,
  groomerBlockedDays,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { generateToken } from "../auth";

// ─── Shared state ─────────────────────────────────────────────────────────────

let tenantAId: number;
let tenantBId: number;
let tenantASlug: string;
let tenantBSlug: string;

let adminAId: string;
let adminBId: string;
let tokenA: string;
let tokenB: string;

let strandedAdminId: string;
let strandedAdminToken: string;

/** Groomer records belonging to Tenant A and Tenant B */
let groomerAId: number;
let groomerBId: number;

/** Availability records seeded per tenant */
let availAId: number;
let availBId: number;

/** Blocked-day records seeded per tenant */
let blockedDayAId: number;
let blockedDayBId: number;

/** Supertest agent */
let agent: ReturnType<typeof supertest>;

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

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();

  // Reset tenant sequence to avoid PK conflicts in parallel test suites
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1))`,
  );

  // Create two isolated tenants
  tenantASlug = `grdel-a-${sfx}`;
  tenantBSlug = `grdel-b-${sfx}`;

  const resA = await db.execute(
    sql`INSERT INTO tenants (name, slug, subscription_status, subscription_tier)
        VALUES (${"GrDelA-" + sfx}, ${tenantASlug}, 'active', 'starter')
        RETURNING id`,
  );
  tenantAId = (resA.rows[0] as { id: number }).id;

  const resB = await db.execute(
    sql`INSERT INTO tenants (name, slug, subscription_status, subscription_tier)
        VALUES (${"GrDelB-" + sfx}, ${tenantBSlug}, 'active', 'starter')
        RETURNING id`,
  );
  tenantBId = (resB.rows[0] as { id: number }).id;

  // Create admin users for each tenant
  const adminADbId = "grdel-admin-a-" + sfx;
  const [adminARow] = await db
    .insert(users)
    .values({
      id: adminADbId,
      email: `grdel-a-${sfx}@test.local`,
      firstName: "AdminA",
      lastName: "Test",
      tenantId: tenantAId,
      password: "hashed-password-for-test",
      isAdmin: true,
      tokenVersion: 0,
    })
    .returning();
  adminAId = adminARow.id;
  tokenA = generateToken(adminARow as any);

  const adminBDbId = "grdel-admin-b-" + sfx;
  const [adminBRow] = await db
    .insert(users)
    .values({
      id: adminBDbId,
      email: `grdel-b-${sfx}@test.local`,
      firstName: "AdminB",
      lastName: "Test",
      tenantId: tenantBId,
      password: "hashed-password-for-test",
      isAdmin: true,
      tokenVersion: 0,
    })
    .returning();
  adminBId = adminBRow.id;
  tokenB = generateToken(adminBRow as any);

  // Create a stranded admin — no tenantId
  const strandedAdminDbId = "grdel-stranded-" + sfx;
  const [strandedAdminRow] = await db
    .insert(users)
    .values({
      id: strandedAdminDbId,
      email: `grdel-stranded-${sfx}@test.local`,
      firstName: "Stranded",
      lastName: "Admin",
      tenantId: null,
      password: "hashed-password-for-test",
      isAdmin: true,
      tokenVersion: 0,
    })
    .returning();
  strandedAdminId = strandedAdminRow.id;
  strandedAdminToken = generateToken(strandedAdminRow as any);

  // Seed a groomer for each tenant
  const [groomerA] = await db
    .insert(groomers)
    .values({ tenantId: tenantAId, name: "GroomerA-" + sfx, isActive: true })
    .returning();
  groomerAId = groomerA.id;

  const [groomerB] = await db
    .insert(groomers)
    .values({ tenantId: tenantBId, name: "GroomerB-" + sfx, isActive: true })
    .returning();
  groomerBId = groomerB.id;

  // Seed a groomerAvailability record for each tenant
  const [availA] = await db
    .insert(groomerAvailability)
    .values({
      tenantId: tenantAId,
      groomerId: groomerAId,
      dayOfWeek: 1,
      isAvailable: true,
      startTime: "09:00",
      endTime: "17:00",
    })
    .returning();
  availAId = availA.id;

  const [availB] = await db
    .insert(groomerAvailability)
    .values({
      tenantId: tenantBId,
      groomerId: groomerBId,
      dayOfWeek: 2,
      isAvailable: true,
      startTime: "10:00",
      endTime: "18:00",
    })
    .returning();
  availBId = availB.id;

  // Seed a groomerBlockedDay record for each tenant
  const [blockedA] = await db
    .insert(groomerBlockedDays)
    .values({
      tenantId: tenantAId,
      groomerId: groomerAId,
      date: "2099-06-15",
      reason: "vacation",
    })
    .returning();
  blockedDayAId = blockedA.id;

  const [blockedB] = await db
    .insert(groomerBlockedDays)
    .values({
      tenantId: tenantBId,
      groomerId: groomerBId,
      date: "2099-07-20",
      reason: "sick",
    })
    .returning();
  blockedDayBId = blockedB.id;

  // Build test app
  const app = await buildTestApp();
  agent = supertest(app);
});

afterAll(async () => {
  // Clean up in dependency order (blocked days and availability cascade from groomers)
  await db.execute(sql`DELETE FROM groomer_blocked_days WHERE tenant_id IN (${tenantAId}, ${tenantBId})`);
  await db.execute(sql`DELETE FROM groomer_availability WHERE tenant_id IN (${tenantAId}, ${tenantBId})`);
  await db.execute(sql`DELETE FROM groomers WHERE tenant_id IN (${tenantAId}, ${tenantBId})`);
  await db.execute(sql`DELETE FROM users WHERE tenant_id IN (${tenantAId}, ${tenantBId}) OR tenant_id IS NULL AND id LIKE 'grdel-%'`);
  await db.execute(sql`DELETE FROM tenants WHERE id IN (${tenantAId}, ${tenantBId})`);
});

// ─── Tests: Groomer Availability ──────────────────────────────────────────────

describe("DELETE /api/admin/groomer-availability/:id", () => {
  it("own-tenant admin can delete their own groomer availability record (200)", async () => {
    const res = await agent
      .delete(`/api/admin/groomer-availability/${availAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlug);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it("stranded admin (no tenantId) is rejected by tenantMiddleware before storage (403)", async () => {
    // Note: availBId still exists since only A's record was deleted above
    const res = await agent
      .delete(`/api/admin/groomer-availability/${availBId}`)
      .set("Authorization", `Bearer ${strandedAdminToken}`)
      // No X-Tenant-Slug header — stranded user has no slug
      ;

    // tenantMiddleware rejects the request before it reaches the storage layer
    expect(res.status).toBe(403);
    expect(res.body).not.toMatchObject({ success: true });
  });

  it("cross-tenant admin gets 404 or 403 — not a silent no-op — when targeting another tenant's availability record", async () => {
    // Tenant A's admin targets Tenant B's availability record
    const res = await agent
      .delete(`/api/admin/groomer-availability/${availBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlug);

    // The storage layer must throw, which the route handler converts to 500,
    // OR the record is simply not found under tenantA (404). Either way it must
    // NOT return 200 — a 500 from a thrown guard error is also acceptable as it
    // proves the guard is active (not a silent no-op), but we expect the route
    // returns a non-success status.
    expect([403, 404, 500]).toContain(res.status);
    expect(res.body).not.toMatchObject({ success: true });

    // Confirm the record was NOT actually deleted
    const surviving = await db
      .select()
      .from(groomerAvailability)
      .where(eq(groomerAvailability.id, availBId));
    expect(surviving).toHaveLength(1);
  });
});

// ─── Tests: Groomer Blocked Days ──────────────────────────────────────────────

describe("DELETE /api/admin/groomer-blocked-days/:id", () => {
  it("own-tenant admin can delete their own groomer blocked-day record (200)", async () => {
    const res = await agent
      .delete(`/api/admin/groomer-blocked-days/${blockedDayAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlug);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it("stranded admin (no tenantId) is rejected by tenantMiddleware before storage (403)", async () => {
    const res = await agent
      .delete(`/api/admin/groomer-blocked-days/${blockedDayBId}`)
      .set("Authorization", `Bearer ${strandedAdminToken}`)
      // No X-Tenant-Slug header — stranded user has no slug
      ;

    expect(res.status).toBe(403);
    expect(res.body).not.toMatchObject({ success: true });
  });

  it("cross-tenant admin gets 404 or 403 — not a silent no-op — when targeting another tenant's blocked-day record", async () => {
    // Tenant A's admin targets Tenant B's blocked-day record
    const res = await agent
      .delete(`/api/admin/groomer-blocked-days/${blockedDayBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlug);

    expect([403, 404, 500]).toContain(res.status);
    expect(res.body).not.toMatchObject({ success: true });

    // Confirm the record was NOT actually deleted
    const surviving = await db
      .select()
      .from(groomerBlockedDays)
      .where(eq(groomerBlockedDays.id, blockedDayBId));
    expect(surviving).toHaveLength(1);
  });
});
