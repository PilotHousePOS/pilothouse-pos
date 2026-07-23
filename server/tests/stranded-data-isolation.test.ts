/**
 * Integration tests: stranded-account data isolation
 *
 * A stranded user (tenantId = null) who calls GET /api/appointments or
 * GET /api/orders must always receive an empty array — never data seeded
 * for a real tenant.
 *
 * Also verifies that storage.getAppointments(userId, undefined) and
 * storage.getOrders(userId, undefined) return [] when tenantId is absent,
 * confirming the storage-layer guard is in place independently of the route.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import {
  tenants,
  users,
  appointments,
  orders,
  contacts,
  boardingRecords,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { generateToken } from "../auth";
import { storage } from "../storage";

// ─── Shared state ─────────────────────────────────────────────────────────────

let realTenantId: number;
let realTenantSlug: string;
/** User who belongs to the real tenant (owns seeded records) */
let realUserId: string;
/** Stranded user — tenantId = null in the DB */
let strandedUserId: string;
let strandedUserToken: string;

/** Stranded admin — isAdmin=true, tenantId=null */
let strandedAdminId: string;
let strandedAdminToken: string;

/** Stranded groomer — isGroomer=true, tenantId=null */
let strandedGroomerId: string;
let strandedGroomerToken: string;

let seededAppointmentId: number;
let seededOrderId: number;
let seededContactId: number;
let seededBoardingRecordId: number;

/** Supertest agent bound to the test Express app */
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

  // Reset the tenant sequence so concurrent test suites don't hit PK conflicts
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1))`,
  );

  // Create a real tenant
  realTenantSlug = `stranded-test-${sfx}`;
  const result = await db.execute(
    sql`INSERT INTO tenants (name, slug, subscription_status, subscription_tier)
        VALUES (${"StrandedTest-" + sfx}, ${realTenantSlug}, 'active', 'starter')
        RETURNING id`,
  );
  realTenantId = (result.rows[0] as { id: number }).id;

  // Create a regular user in the real tenant (owns the seeded data)
  const realId = "stranded-real-" + sfx;
  await db.insert(users).values({
    id: realId,
    email: `real-${sfx}@test.local`,
    firstName: "Real",
    lastName: "User",
    tenantId: realTenantId,
    password: "hashed-password-for-test",
    isAdmin: false,
    tokenVersion: 0,
  });
  realUserId = realId;

  // Create a stranded user — no tenantId
  const strandedId = "stranded-user-" + sfx;
  const [strandedRow] = await db
    .insert(users)
    .values({
      id: strandedId,
      email: `stranded-${sfx}@test.local`,
      firstName: "Stranded",
      lastName: "User",
      tenantId: null,   // explicitly no tenant
      password: "hashed-password-for-test",
      isAdmin: false,
      tokenVersion: 0,
    })
    .returning();
  strandedUserId = strandedRow.id;
  strandedUserToken = generateToken(strandedRow as any);

  // Create a stranded admin — isAdmin=true, no tenantId
  const strandedAdminIdVal = "stranded-admin-" + sfx;
  const [strandedAdminRow] = await db
    .insert(users)
    .values({
      id: strandedAdminIdVal,
      email: `stranded-admin-${sfx}@test.local`,
      firstName: "StrandedAdmin",
      lastName: "User",
      tenantId: null,
      password: "hashed-password-for-test",
      isAdmin: true,
      isGroomer: false,
      tokenVersion: 0,
    })
    .returning();
  strandedAdminId = strandedAdminRow.id;
  strandedAdminToken = generateToken(strandedAdminRow as any);

  // Create a stranded groomer — isGroomer=true, no tenantId
  const strandedGroomerIdVal = "stranded-groomer-" + sfx;
  const [strandedGroomerRow] = await db
    .insert(users)
    .values({
      id: strandedGroomerIdVal,
      email: `stranded-groomer-${sfx}@test.local`,
      firstName: "StrandedGroomer",
      lastName: "User",
      tenantId: null,
      password: "hashed-password-for-test",
      isAdmin: false,
      isGroomer: true,
      tokenVersion: 0,
    })
    .returning();
  strandedGroomerId = strandedGroomerRow.id;
  strandedGroomerToken = generateToken(strandedGroomerRow as any);

  // Seed an appointment belonging to the real tenant / real user
  const [appt] = await db
    .insert(appointments)
    .values({
      tenantId: realTenantId,
      userId: realUserId,
      serviceType: "grooming",
      appointmentDate: "2099-12-31",
      appointmentTime: "10:00 AM",
      petName: "FluffyReal",
      petType: "Dog",
      ownerFirstName: "Real",
      ownerLastName: "Owner",
      ownerPhoneNumber: "5550001111",
      price: "45.00",
    })
    .returning();
  seededAppointmentId = appt.id;

  // Seed an order belonging to the real tenant / real user
  const [order] = await db
    .insert(orders)
    .values({
      tenantId: realTenantId,
      userId: realUserId,
      totalAmount: "25.00",
      status: "pending",
    })
    .returning();
  seededOrderId = order.id;

  // Seed a contact belonging to the real tenant
  const [contact] = await db
    .insert(contacts)
    .values({
      tenantId: realTenantId,
      name: "RealContact-" + sfx,
      phoneNumber: "5550002222",
    })
    .returning();
  seededContactId = contact.id;

  // Seed a boarding record belonging to the real tenant
  const [boardingRecord] = await db
    .insert(boardingRecords)
    .values({
      tenantId: realTenantId,
      customerName: "RealBoarder-" + sfx,
      customerPhone: "5550003333",
      animalType: "Dog",
      animalName: "RealDog-" + sfx,
      estimatedDropOffDate: "2099-12-30",
      estimatedPickUpDate: "2099-12-31",
      dailyRate: "30.00",
    })
    .returning();
  seededBoardingRecordId = boardingRecord.id;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (seededBoardingRecordId)
    await db.delete(boardingRecords).where(eq(boardingRecords.id, seededBoardingRecordId));
  if (seededContactId)
    await db.delete(contacts).where(eq(contacts.id, seededContactId));
  if (seededOrderId)
    await db.delete(orders).where(eq(orders.id, seededOrderId));
  if (seededAppointmentId)
    await db.delete(appointments).where(eq(appointments.id, seededAppointmentId));
  if (realUserId)
    await db.delete(users).where(eq(users.id, realUserId));
  if (strandedUserId)
    await db.delete(users).where(eq(users.id, strandedUserId));
  if (strandedAdminId)
    await db.delete(users).where(eq(users.id, strandedAdminId));
  if (strandedGroomerId)
    await db.delete(users).where(eq(users.id, strandedGroomerId));
  if (realTenantId)
    await db.delete(tenants).where(eq(tenants.id, realTenantId));
}, 30_000);

// ─── Route-level tests ────────────────────────────────────────────────────────
//
// tenantMiddleware runs first for all /api routes and returns 403 for stranded
// users (no tenant, not super-admin, no slug header).  This is already the
// correct fail-closed behaviour — the stranded account never reaches the route
// handler and therefore cannot receive any store data.
//
// The route handlers also contain an explicit early-return guard (res.json([]))
// for defense-in-depth, active when a future middleware change lets stranded
// users through.

describe("GET /api/appointments — stranded user cannot read appointment data", () => {
  it("returns HTTP 403 for a stranded user (no tenant assigned, no slug header)", async () => {
    // No X-Tenant-Slug header → tenantMiddleware blocks with 403 before the route runs
    const res = await agent
      .get("/api/appointments")
      .set("Authorization", `Bearer ${strandedUserToken}`);

    // 403 is the correct fail-closed response; it also means no data is exposed.
    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's appointment to the stranded user", async () => {
    const res = await agent
      .get("/api/appointments")
      .set("Authorization", `Bearer ${strandedUserToken}`);

    // Response body must not contain any appointment IDs (either 403 body or empty array)
    const ids = Array.isArray(res.body) ? res.body.map((a: any) => a.id) : [];
    expect(ids).not.toContain(seededAppointmentId);
  });
});

describe("GET /api/orders — stranded user cannot read order data", () => {
  it("returns HTTP 403 for a stranded user (no tenant assigned, no slug header)", async () => {
    const res = await agent
      .get("/api/orders")
      .set("Authorization", `Bearer ${strandedUserToken}`);

    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's order to the stranded user", async () => {
    const res = await agent
      .get("/api/orders")
      .set("Authorization", `Bearer ${strandedUserToken}`);

    const ids = Array.isArray(res.body) ? res.body.map((o: any) => o.id) : [];
    expect(ids).not.toContain(seededOrderId);
  });
});

// ─── Admin/groomer branch — stranded accounts ─────────────────────────────────
//
// The admin/groomer branch of GET /api/appointments calls
// getAppointments(undefined, req.tenantId) which would return ALL appointments
// across every store when tenantId is undefined.  tenantMiddleware already
// blocks stranded users with 403 before the route runs; the route handler also
// has a defense-in-depth early-return guard.  These tests confirm both layers
// hold for isAdmin=true and isGroomer=true stranded accounts.

describe("GET /api/appointments — stranded admin cannot read appointment data", () => {
  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant, no slug header)", async () => {
    const res = await agent
      .get("/api/appointments")
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    // tenantMiddleware must block before the route handler executes
    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's appointment to the stranded admin", async () => {
    const res = await agent
      .get("/api/appointments")
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    const ids = Array.isArray(res.body) ? res.body.map((a: any) => a.id) : [];
    expect(ids).not.toContain(seededAppointmentId);
  });
});

describe("GET /api/appointments — stranded groomer cannot read appointment data", () => {
  it("returns HTTP 403 for a stranded groomer (isGroomer=true, no tenant, no slug header)", async () => {
    const res = await agent
      .get("/api/appointments")
      .set("Authorization", `Bearer ${strandedGroomerToken}`);

    // tenantMiddleware must block before the route handler executes
    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's appointment to the stranded groomer", async () => {
    const res = await agent
      .get("/api/appointments")
      .set("Authorization", `Bearer ${strandedGroomerToken}`);

    const ids = Array.isArray(res.body) ? res.body.map((a: any) => a.id) : [];
    expect(ids).not.toContain(seededAppointmentId);
  });
});

// ─── Storage-layer unit tests ──────────────────────────────────────────────────

describe("storage.getAppointments — storage-layer guard", () => {
  it("returns [] when userId is set but tenantId is undefined", async () => {
    const result = await storage.getAppointments(strandedUserId, undefined);
    expect(result).toEqual([]);
  });

  it("does not return the real tenant's appointment when called without tenantId", async () => {
    const result = await storage.getAppointments(realUserId, undefined);
    // The userId branch now returns [] when tenantId is absent
    expect(result).toEqual([]);
  });
});

describe("storage.getOrders — storage-layer guard", () => {
  it("returns [] when userId is set but tenantId is undefined", async () => {
    const result = await storage.getOrders(realUserId, undefined);
    expect(result).toEqual([]);
  });

  it("does not return the real tenant's order when tenantId is absent", async () => {
    const result = await storage.getOrders(strandedUserId, undefined);
    expect(result).toEqual([]);
  });
});

// ─── Contacts endpoint — stranded users ───────────────────────────────────────
//
// GET /api/contacts requires isAdmin or isGroomer. tenantMiddleware already
// blocks stranded users with 403. The storage layer also guards against
// a missing tenantId by returning [].

describe("GET /api/contacts — stranded user cannot read contact data", () => {
  it("returns HTTP 403 for a stranded regular user (no tenant, no slug header)", async () => {
    const res = await agent
      .get("/api/contacts")
      .set("Authorization", `Bearer ${strandedUserToken}`);

    // Non-admin, non-groomer → 403 from the route guard before any DB call
    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant, no slug header)", async () => {
    const res = await agent
      .get("/api/contacts")
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    // tenantMiddleware blocks before the route handler executes
    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's contact to the stranded admin", async () => {
    const res = await agent
      .get("/api/contacts")
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    const ids = Array.isArray(res.body) ? res.body.map((c: any) => c.id) : [];
    expect(ids).not.toContain(seededContactId);
  });

  it("returns HTTP 403 for a stranded groomer (isGroomer=true, no tenant, no slug header)", async () => {
    const res = await agent
      .get("/api/contacts")
      .set("Authorization", `Bearer ${strandedGroomerToken}`);

    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's contact to the stranded groomer", async () => {
    const res = await agent
      .get("/api/contacts")
      .set("Authorization", `Bearer ${strandedGroomerToken}`);

    const ids = Array.isArray(res.body) ? res.body.map((c: any) => c.id) : [];
    expect(ids).not.toContain(seededContactId);
  });
});

// ─── Boarding records endpoint — stranded users ───────────────────────────────
//
// GET /api/admin/boarding requires isAdmin. tenantMiddleware already blocks
// stranded users with 403. The storage layer also guards against a missing
// tenantId by returning [].

describe("GET /api/admin/boarding — stranded user cannot read boarding data", () => {
  it("returns HTTP 403 for a stranded regular user (no tenant, no slug header)", async () => {
    const res = await agent
      .get("/api/admin/boarding")
      .set("Authorization", `Bearer ${strandedUserToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant, no slug header)", async () => {
    const res = await agent
      .get("/api/admin/boarding")
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    // tenantMiddleware blocks before the route handler executes
    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's boarding record to the stranded admin", async () => {
    const res = await agent
      .get("/api/admin/boarding")
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    const ids = Array.isArray(res.body) ? res.body.map((r: any) => r.id) : [];
    expect(ids).not.toContain(seededBoardingRecordId);
  });
});

// ─── Single-contact endpoints — stranded users ────────────────────────────────
//
// PUT /api/contacts/:id and DELETE /api/contacts/:id accept a tenantId from
// req.tenantId. tenantMiddleware rejects stranded accounts (no tenant, no
// slug header) with 403 before the route handler executes, so these endpoints
// must never expose or mutate another store's contact.

describe("PUT /api/contacts/:id — stranded user cannot update a contact", () => {
  it("returns HTTP 403 for a stranded regular user", async () => {
    const res = await agent
      .put(`/api/contacts/${seededContactId}`)
      .set("Authorization", `Bearer ${strandedUserToken}`)
      .send({ name: "Hacked Name" });

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant)", async () => {
    const res = await agent
      .put(`/api/contacts/${seededContactId}`)
      .set("Authorization", `Bearer ${strandedAdminToken}`)
      .send({ name: "Hacked Name" });

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded groomer (isGroomer=true, no tenant)", async () => {
    const res = await agent
      .put(`/api/contacts/${seededContactId}`)
      .set("Authorization", `Bearer ${strandedGroomerToken}`)
      .send({ name: "Hacked Name" });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/contacts/:id — stranded user cannot delete a contact", () => {
  it("returns HTTP 403 for a stranded regular user", async () => {
    const res = await agent
      .delete(`/api/contacts/${seededContactId}`)
      .set("Authorization", `Bearer ${strandedUserToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant)", async () => {
    const res = await agent
      .delete(`/api/contacts/${seededContactId}`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded groomer (isGroomer=true, no tenant)", async () => {
    const res = await agent
      .delete(`/api/contacts/${seededContactId}`)
      .set("Authorization", `Bearer ${strandedGroomerToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── Storage-layer unit tests — contacts and boarding ─────────────────────────

describe("storage.getContact — storage-layer guard (single record)", () => {
  it("returns undefined when tenantId is undefined", async () => {
    const result = await storage.getContact(seededContactId, undefined);
    expect(result).toBeUndefined();
  });

  it("does not return the real tenant's contact when tenantId is absent", async () => {
    const result = await storage.getContact(seededContactId, undefined);
    expect(result).toBeUndefined();
  });

  it("returns the contact when called with the correct tenantId", async () => {
    const result = await storage.getContact(seededContactId, realTenantId);
    expect(result).toBeDefined();
    expect(result!.id).toBe(seededContactId);
  });
});

describe("storage.getAllContacts — storage-layer guard", () => {
  it("returns [] when tenantId is undefined", async () => {
    const result = await storage.getAllContacts(undefined);
    expect(result).toEqual([]);
  });

  it("does not return the real tenant's contact when tenantId is absent", async () => {
    const result = await storage.getAllContacts(undefined);
    const ids = result.map((c) => c.id);
    expect(ids).not.toContain(seededContactId);
  });

  it("returns the real tenant's contact when called with the correct tenantId", async () => {
    const result = await storage.getAllContacts(realTenantId);
    const ids = result.map((c) => c.id);
    expect(ids).toContain(seededContactId);
  });
});

describe("storage.getAllBoardingRecords — storage-layer guard", () => {
  it("returns [] when tenantId is undefined", async () => {
    const result = await storage.getAllBoardingRecords(undefined);
    expect(result).toEqual([]);
  });

  it("does not return the real tenant's boarding record when tenantId is absent", async () => {
    const result = await storage.getAllBoardingRecords(undefined);
    const ids = result.map((r) => r.id);
    expect(ids).not.toContain(seededBoardingRecordId);
  });

  it("returns the real tenant's boarding record when called with the correct tenantId", async () => {
    const result = await storage.getAllBoardingRecords(realTenantId);
    const ids = result.map((r) => r.id);
    expect(ids).toContain(seededBoardingRecordId);
  });
});

// ─── Single boarding-record endpoints — stranded users ────────────────────────
//
// GET /api/admin/boarding/:id, PUT /api/admin/boarding/:id,
// PATCH /api/admin/boarding/:id/check-in, PATCH /api/admin/boarding/:id/check-out,
// and DELETE /api/admin/boarding/:id all pass tenantId from req.tenantId.
// tenantMiddleware rejects stranded accounts (no tenant, no slug header) with
// 403 before the route handler executes, so none of these endpoints should
// expose or mutate another store's boarding record.

describe("GET /api/admin/boarding/:id — stranded user cannot read a single boarding record", () => {
  it("returns HTTP 403 for a stranded regular user", async () => {
    const res = await agent
      .get(`/api/admin/boarding/${seededBoardingRecordId}`)
      .set("Authorization", `Bearer ${strandedUserToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant)", async () => {
    const res = await agent
      .get(`/api/admin/boarding/${seededBoardingRecordId}`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's boarding record body to the stranded admin", async () => {
    const res = await agent
      .get(`/api/admin/boarding/${seededBoardingRecordId}`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    expect(res.status).toBe(403);
    const body = res.body ?? {};
    expect(body.id).not.toBe(seededBoardingRecordId);
  });
});

describe("PUT /api/admin/boarding/:id — stranded user cannot update a boarding record", () => {
  it("returns HTTP 403 for a stranded regular user", async () => {
    const res = await agent
      .put(`/api/admin/boarding/${seededBoardingRecordId}`)
      .set("Authorization", `Bearer ${strandedUserToken}`)
      .send({ customerName: "Hacked Name" });

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant)", async () => {
    const res = await agent
      .put(`/api/admin/boarding/${seededBoardingRecordId}`)
      .set("Authorization", `Bearer ${strandedAdminToken}`)
      .send({ customerName: "Hacked Name" });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/admin/boarding/:id/check-in — stranded user cannot check in a boarding record", () => {
  it("returns HTTP 403 for a stranded regular user", async () => {
    const res = await agent
      .patch(`/api/admin/boarding/${seededBoardingRecordId}/check-in`)
      .set("Authorization", `Bearer ${strandedUserToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant)", async () => {
    const res = await agent
      .patch(`/api/admin/boarding/${seededBoardingRecordId}/check-in`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/admin/boarding/:id/check-out — stranded user cannot check out a boarding record", () => {
  it("returns HTTP 403 for a stranded regular user", async () => {
    const res = await agent
      .patch(`/api/admin/boarding/${seededBoardingRecordId}/check-out`)
      .set("Authorization", `Bearer ${strandedUserToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant)", async () => {
    const res = await agent
      .patch(`/api/admin/boarding/${seededBoardingRecordId}/check-out`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/boarding/:id — stranded user cannot delete a boarding record", () => {
  it("returns HTTP 403 for a stranded regular user", async () => {
    const res = await agent
      .delete(`/api/admin/boarding/${seededBoardingRecordId}`)
      .set("Authorization", `Bearer ${strandedUserToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant)", async () => {
    const res = await agent
      .delete(`/api/admin/boarding/${seededBoardingRecordId}`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── Storage-layer unit tests — single boarding record ────────────────────────

describe("storage.getBoardingRecord — storage-layer guard (single record)", () => {
  it("returns undefined when tenantId is undefined", async () => {
    const result = await storage.getBoardingRecord(seededBoardingRecordId, undefined);
    expect(result).toBeUndefined();
  });

  it("does not return the real tenant's record when tenantId is absent", async () => {
    const result = await storage.getBoardingRecord(seededBoardingRecordId, undefined);
    expect(result).toBeUndefined();
  });

  it("returns the record when called with the correct tenantId", async () => {
    const result = await storage.getBoardingRecord(seededBoardingRecordId, realTenantId);
    expect(result).toBeDefined();
    expect(result!.id).toBe(seededBoardingRecordId);
  });
});
