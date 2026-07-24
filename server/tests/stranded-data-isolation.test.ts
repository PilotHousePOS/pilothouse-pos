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
  appointmentHistory,
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

/** Stranded superior-manager — isSuperiorManager=true, isAdmin=true, tenantId=null */
let strandedSuperiorManagerId: string;
let strandedSuperiorManagerToken: string;

let seededAppointmentId: number;
let seededOrderId: number;
let seededContactId: number;
let seededBoardingRecordId: number;
let seededHistoryId: number;

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

  // Create a stranded superior-manager — isSuperiorManager=true, isAdmin=true, no tenantId
  const strandedSuperiorManagerIdVal = "stranded-supman-" + sfx;
  const [strandedSuperiorManagerRow] = await db
    .insert(users)
    .values({
      id: strandedSuperiorManagerIdVal,
      email: `stranded-supman-${sfx}@test.local`,
      firstName: "StrandedSuperior",
      lastName: "Manager",
      tenantId: null,
      password: "hashed-password-for-test",
      isAdmin: true,
      isGroomer: false,
      isSuperiorManager: true,
      tokenVersion: 0,
    })
    .returning();
  strandedSuperiorManagerId = strandedSuperiorManagerRow.id;
  strandedSuperiorManagerToken = generateToken(strandedSuperiorManagerRow as any);

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

  // Seed a contact history record belonging to the real tenant / real contact
  const [historyRecord] = await db
    .insert(appointmentHistory)
    .values({
      tenantId: realTenantId,
      contactId: seededContactId,
      appointmentDate: "2099-12-31",
      appointmentTime: "10:00 AM",
      petName: "FluffyHistory",
      petType: "Dog",
      serviceType: "Full Grooming",
      status: "completed",
    })
    .returning();
  seededHistoryId = historyRecord.id;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (seededHistoryId)
    await db.delete(appointmentHistory).where(eq(appointmentHistory.id, seededHistoryId));
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
  if (strandedSuperiorManagerId)
    await db.delete(users).where(eq(users.id, strandedSuperiorManagerId));
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

// ─── Storage-layer unit tests — updateBoardingRecord ─────────────────────────

describe("storage.updateBoardingRecord — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.updateBoardingRecord(seededBoardingRecordId, { customerName: "hacked" }, undefined)
    ).rejects.toThrow("tenantId is required to update a boarding record");
  });

  it("does NOT persist changes when tenantId is undefined", async () => {
    // Capture the customerName before the attempted mutation
    const before = await storage.getBoardingRecord(seededBoardingRecordId, realTenantId);
    const originalName = before?.customerName;

    // Attempt the mutation — expected to throw
    await expect(
      storage.updateBoardingRecord(seededBoardingRecordId, { customerName: "hacked" }, undefined)
    ).rejects.toThrow();

    // Verify the record is unchanged
    const after = await storage.getBoardingRecord(seededBoardingRecordId, realTenantId);
    expect(after?.customerName).toBe(originalName);
    expect(after?.customerName).not.toBe("hacked");
  });

  it("succeeds and persists changes when called with the correct tenantId", async () => {
    const result = await storage.updateBoardingRecord(
      seededBoardingRecordId,
      { customerName: "Legitimate Update" },
      realTenantId
    );
    expect(result).toBeDefined();
    expect(result.id).toBe(seededBoardingRecordId);
    expect(result.customerName).toBe("Legitimate Update");
  });
});

// ─── Storage-layer unit tests — checkInBoardingRecord ────────────────────────

describe("storage.checkInBoardingRecord — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.checkInBoardingRecord(seededBoardingRecordId, undefined)
    ).rejects.toThrow("tenantId is required to check in a boarding record");
  });

  it("does NOT update the record when tenantId is undefined", async () => {
    // Capture actualDropOffDate before the attempted mutation
    const before = await storage.getBoardingRecord(seededBoardingRecordId, realTenantId);
    const beforeDate = before?.actualDropOffDate;

    // Attempt the mutation — expected to throw
    await expect(
      storage.checkInBoardingRecord(seededBoardingRecordId, undefined)
    ).rejects.toThrow();

    // Verify the record is unchanged
    const after = await storage.getBoardingRecord(seededBoardingRecordId, realTenantId);
    expect(after?.actualDropOffDate).toStrictEqual(beforeDate);
  });

  it("succeeds and updates the record when called with the correct tenantId", async () => {
    const result = await storage.checkInBoardingRecord(seededBoardingRecordId, realTenantId);
    expect(result).toBeDefined();
    expect(result.id).toBe(seededBoardingRecordId);
    expect(result.actualDropOffDate).toBeDefined();
  });
});

// ─── Storage-layer unit tests — checkOutBoardingRecord ───────────────────────

describe("storage.checkOutBoardingRecord — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.checkOutBoardingRecord(seededBoardingRecordId, undefined)
    ).rejects.toThrow("tenantId is required to check out a boarding record");
  });

  it("does NOT update the record when tenantId is undefined", async () => {
    // Capture actualPickUpDate and status before the attempted mutation
    const before = await storage.getBoardingRecord(seededBoardingRecordId, realTenantId);
    const beforePickUp = before?.actualPickUpDate;
    const beforeStatus = before?.status;

    // Attempt the mutation — expected to throw
    await expect(
      storage.checkOutBoardingRecord(seededBoardingRecordId, undefined)
    ).rejects.toThrow();

    // Verify the record is unchanged
    const after = await storage.getBoardingRecord(seededBoardingRecordId, realTenantId);
    expect(after?.actualPickUpDate).toStrictEqual(beforePickUp);
    expect(after?.status).toBe(beforeStatus);
  });

  it("succeeds and updates the record when called with the correct tenantId", async () => {
    const result = await storage.checkOutBoardingRecord(seededBoardingRecordId, realTenantId);
    expect(result).toBeDefined();
    expect(result.id).toBe(seededBoardingRecordId);
    expect(result.actualPickUpDate).toBeDefined();
    expect(result.status).toBe("completed");
  });
});

// ─── Storage-layer unit tests — deleteBoardingRecord ─────────────────────────

describe("storage.deleteBoardingRecord — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.deleteBoardingRecord(seededBoardingRecordId, undefined)
    ).rejects.toThrow("tenantId is required to delete a boarding record");
  });

  it("does NOT delete the record when tenantId is undefined", async () => {
    // Attempt the delete — expected to throw
    await expect(
      storage.deleteBoardingRecord(seededBoardingRecordId, undefined)
    ).rejects.toThrow();

    // Verify the record still exists
    const after = await storage.getBoardingRecord(seededBoardingRecordId, realTenantId);
    expect(after).toBeDefined();
    expect(after!.id).toBe(seededBoardingRecordId);
  });

  it("successfully deletes the record when called with the correct tenantId", async () => {
    // This confirms the guard only blocks undefined tenantId, not valid calls.
    // Re-seed a temporary record so the seededBoardingRecordId remains intact
    // for other tests.
    const [tempRecord] = await db
      .insert(boardingRecords)
      .values({
        tenantId: realTenantId,
        customerName: "TempDeleteOwner",
        customerPhone: "5550009999",
        animalType: "Cat",
        animalName: "TempDeletePet",
        estimatedDropOffDate: "2099-12-30",
        estimatedPickUpDate: "2099-12-31",
        dailyRate: "20.00",
      })
      .returning();

    await expect(
      storage.deleteBoardingRecord(tempRecord.id, realTenantId)
    ).resolves.toBeUndefined();

    // Confirm it is gone
    const gone = await storage.getBoardingRecord(tempRecord.id, realTenantId);
    expect(gone).toBeUndefined();
  });
});

// ─── Storage-layer unit tests — deleteAppointment ────────────────────────────

describe("storage.deleteAppointment — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.deleteAppointment(seededAppointmentId, undefined)
    ).rejects.toThrow("tenantId is required to delete an appointment");
  });

  it("does NOT delete the record when tenantId is undefined", async () => {
    // Attempt the delete — expected to throw
    await expect(
      storage.deleteAppointment(seededAppointmentId, undefined)
    ).rejects.toThrow();

    // Verify the record still exists
    const after = await storage.getAppointment(seededAppointmentId, realTenantId);
    expect(after).toBeDefined();
    expect(after!.id).toBe(seededAppointmentId);
  });

  it("successfully deletes the record when called with the correct tenantId", async () => {
    // Re-seed a temporary record so seededAppointmentId remains intact for other tests
    const [tempAppt] = await db
      .insert(appointments)
      .values({
        tenantId: realTenantId,
        userId: realUserId,
        serviceType: "grooming",
        appointmentDate: "2099-11-30",
        appointmentTime: "11:00 AM",
        petName: "TempDeletePet",
        petType: "Cat",
        ownerFirstName: "Temp",
        ownerLastName: "Delete",
        ownerPhoneNumber: "5550007777",
        price: "30.00",
      })
      .returning();

    await expect(
      storage.deleteAppointment(tempAppt.id, realTenantId)
    ).resolves.toBeUndefined();

    // Confirm it is gone
    const gone = await storage.getAppointment(tempAppt.id, realTenantId);
    expect(gone).toBeUndefined();
  });
});

// ─── Storage-layer unit tests — deleteContact ─────────────────────────────────

describe("storage.deleteContact — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.deleteContact(seededContactId, undefined)
    ).rejects.toThrow("tenantId is required to delete a contact");
  });

  it("does NOT delete the record when tenantId is undefined", async () => {
    // Attempt the delete — expected to throw
    await expect(
      storage.deleteContact(seededContactId, undefined)
    ).rejects.toThrow();

    // Verify the record still exists
    const after = await storage.getContact(seededContactId, realTenantId);
    expect(after).toBeDefined();
    expect(after!.id).toBe(seededContactId);
  });

  it("successfully deletes the record when called with the correct tenantId", async () => {
    // Re-seed a temporary contact so seededContactId remains intact for other tests
    const [tempContact] = await db
      .insert(contacts)
      .values({
        tenantId: realTenantId,
        name: "TempDeleteContact",
        phoneNumber: "5550008888",
      })
      .returning();

    await expect(
      storage.deleteContact(tempContact.id, realTenantId)
    ).resolves.toBeUndefined();

    // Confirm it is gone
    const gone = await storage.getContact(tempContact.id, realTenantId);
    expect(gone).toBeUndefined();
  });
});

// ─── Contact sub-resource endpoints — stranded users ─────────────────────────
//
// GET /api/contacts/:id/appointments and GET /api/contacts/:id/history both
// call storage.getContact(contactId, req.tenantId) early in the handler.
// tenantMiddleware rejects stranded accounts (no tenant, no slug header) with
// 403 before the route handler executes, so neither endpoint should expose
// appointment or history data for a contact owned by another store.

describe("GET /api/contacts/:id/appointments — stranded user cannot read contact appointment history", () => {
  it("returns HTTP 403 for a stranded regular user (no tenant, no slug header)", async () => {
    const res = await agent
      .get(`/api/contacts/${seededContactId}/appointments`)
      .set("Authorization", `Bearer ${strandedUserToken}`);

    // tenantMiddleware blocks before the route handler executes
    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant, no slug header)", async () => {
    const res = await agent
      .get(`/api/contacts/${seededContactId}/appointments`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's appointment data to the stranded admin", async () => {
    const res = await agent
      .get(`/api/contacts/${seededContactId}/appointments`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    // Must be 403; body must not be an array containing real appointment data
    expect(res.status).toBe(403);
    const ids = Array.isArray(res.body) ? res.body.map((a: any) => a.id) : [];
    expect(ids).not.toContain(seededAppointmentId);
  });

  it("returns HTTP 403 for a stranded groomer (isGroomer=true, no tenant, no slug header)", async () => {
    const res = await agent
      .get(`/api/contacts/${seededContactId}/appointments`)
      .set("Authorization", `Bearer ${strandedGroomerToken}`);

    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's appointment data to the stranded groomer", async () => {
    const res = await agent
      .get(`/api/contacts/${seededContactId}/appointments`)
      .set("Authorization", `Bearer ${strandedGroomerToken}`);

    expect(res.status).toBe(403);
    const ids = Array.isArray(res.body) ? res.body.map((a: any) => a.id) : [];
    expect(ids).not.toContain(seededAppointmentId);
  });
});

describe("GET /api/contacts/:id/history — stranded user cannot read contact history", () => {
  it("returns HTTP 403 for a stranded regular user (no tenant, no slug header)", async () => {
    const res = await agent
      .get(`/api/contacts/${seededContactId}/history`)
      .set("Authorization", `Bearer ${strandedUserToken}`);

    // tenantMiddleware blocks before the route handler executes
    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant, no slug header)", async () => {
    const res = await agent
      .get(`/api/contacts/${seededContactId}/history`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's history data to the stranded admin", async () => {
    const res = await agent
      .get(`/api/contacts/${seededContactId}/history`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    // Must be 403; body must not be a non-empty array of history records
    expect(res.status).toBe(403);
    const items = Array.isArray(res.body) ? res.body : [];
    expect(items.length).toBe(0);
  });

  it("returns HTTP 403 for a stranded groomer (isGroomer=true, no tenant, no slug header)", async () => {
    const res = await agent
      .get(`/api/contacts/${seededContactId}/history`)
      .set("Authorization", `Bearer ${strandedGroomerToken}`);

    expect(res.status).toBe(403);
  });

  it("does NOT expose the real tenant's history data to the stranded groomer", async () => {
    const res = await agent
      .get(`/api/contacts/${seededContactId}/history`)
      .set("Authorization", `Bearer ${strandedGroomerToken}`);

    expect(res.status).toBe(403);
    const items = Array.isArray(res.body) ? res.body : [];
    expect(items.length).toBe(0);
  });

  it("returns HTTP 403 for a stranded superior-manager (isSuperiorManager=true, no tenant)", async () => {
    // The GET route does not have an early isSuperiorManager check — tenantMiddleware
    // blocks the request before the handler executes, so the superior-manager flag
    // provides no special bypass on this endpoint.
    const res = await agent
      .get(`/api/contacts/${seededContactId}/history`)
      .set("Authorization", `Bearer ${strandedSuperiorManagerToken}`);

    expect(res.status).toBe(403);
  });

  it("does NOT expose history data to the stranded superior-manager", async () => {
    const res = await agent
      .get(`/api/contacts/${seededContactId}/history`)
      .set("Authorization", `Bearer ${strandedSuperiorManagerToken}`);

    // Must be 403; body must not contain any history records
    expect(res.status).toBe(403);
    const items = Array.isArray(res.body) ? res.body : [];
    expect(items.length).toBe(0);
  });
});

// ─── PATCH /api/contacts/:id/sms-opt-out — stranded users ────────────────────
//
// The handler calls resolveWriteTenantId which relies on req.tenantId set by
// tenantMiddleware.  A stranded account has no tenant, so tenantMiddleware
// rejects the request with 403 before the storage call is ever reached.
// The seeded contact's sms_opt_out flag must remain false after every
// rejected attempt.

describe("PATCH /api/contacts/:id/sms-opt-out — stranded user cannot update SMS opt-out", () => {
  it("returns HTTP 403 for a stranded regular user", async () => {
    const res = await agent
      .patch(`/api/contacts/${seededContactId}/sms-opt-out`)
      .set("Authorization", `Bearer ${strandedUserToken}`)
      .send({ optOut: true });

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant)", async () => {
    const res = await agent
      .patch(`/api/contacts/${seededContactId}/sms-opt-out`)
      .set("Authorization", `Bearer ${strandedAdminToken}`)
      .send({ optOut: true });

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded groomer (isGroomer=true, no tenant)", async () => {
    const res = await agent
      .patch(`/api/contacts/${seededContactId}/sms-opt-out`)
      .set("Authorization", `Bearer ${strandedGroomerToken}`)
      .send({ optOut: true });

    expect(res.status).toBe(403);
  });

  it("leaves the seeded contact's sms_opt_out unchanged after all rejected requests", async () => {
    // All three stranded callers already attempted optOut: true above and were
    // blocked.  The contact must still have sms_opt_out = false in the DB.
    const [row] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, seededContactId));

    expect(row).toBeDefined();
    expect(row.smsOptOut).toBe(false);
  });
});

// ─── PUT /api/contacts/history/:historyId — stranded users ───────────────────
//
// The handler first checks isSuperiorManager, but tenantMiddleware should
// block any stranded account (tenantId = null) before the handler executes,
// returning 403.  The seeded history record must remain unmodified after every
// rejected attempt.

describe("PUT /api/contacts/history/:historyId — stranded user cannot mutate a history record", () => {
  it("returns HTTP 403 for a stranded regular user (no tenant, no slug header)", async () => {
    const res = await agent
      .put(`/api/contacts/history/${seededHistoryId}`)
      .set("Authorization", `Bearer ${strandedUserToken}`)
      .send({ notes: "stranded-user-injection" });

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant)", async () => {
    const res = await agent
      .put(`/api/contacts/history/${seededHistoryId}`)
      .set("Authorization", `Bearer ${strandedAdminToken}`)
      .send({ notes: "stranded-admin-injection" });

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded groomer (isGroomer=true, no tenant)", async () => {
    const res = await agent
      .put(`/api/contacts/history/${seededHistoryId}`)
      .set("Authorization", `Bearer ${strandedGroomerToken}`)
      .send({ notes: "stranded-groomer-injection" });

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded superior-manager (isSuperiorManager=true, no tenant)", async () => {
    // The handler checks isSuperiorManager before resolveWriteTenantId, but a
    // stranded superior-manager has tenantId=null so resolveWriteTenantId must
    // still block the request with 403 before any mutation occurs.
    const res = await agent
      .put(`/api/contacts/history/${seededHistoryId}`)
      .set("Authorization", `Bearer ${strandedSuperiorManagerToken}`)
      .send({ notes: "stranded-supman-injection" });

    expect(res.status).toBe(403);
  });

  it("leaves the seeded history record unmodified after all rejected PUT attempts", async () => {
    const [row] = await db
      .select()
      .from(appointmentHistory)
      .where(eq(appointmentHistory.id, seededHistoryId));

    expect(row).toBeDefined();
    // notes was null when seeded; all injection attempts must have been blocked
    expect(row.notes).toBeNull();
  });
});

// ─── DELETE /api/contacts/history/:historyId — stranded users ────────────────
//
// Same tenantMiddleware gate applies.  The seeded history record must still
// exist in the database after every rejected DELETE attempt.

describe("DELETE /api/contacts/history/:historyId — stranded user cannot delete a history record", () => {
  it("returns HTTP 403 for a stranded regular user (no tenant, no slug header)", async () => {
    const res = await agent
      .delete(`/api/contacts/history/${seededHistoryId}`)
      .set("Authorization", `Bearer ${strandedUserToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant)", async () => {
    const res = await agent
      .delete(`/api/contacts/history/${seededHistoryId}`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded groomer (isGroomer=true, no tenant)", async () => {
    const res = await agent
      .delete(`/api/contacts/history/${seededHistoryId}`)
      .set("Authorization", `Bearer ${strandedGroomerToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded superior-manager (isSuperiorManager=true, no tenant)", async () => {
    // Even though the handler checks isSuperiorManager first, a stranded
    // superior-manager has tenantId=null so resolveWriteTenantId must block
    // the deletion with 403 before the record is touched.
    const res = await agent
      .delete(`/api/contacts/history/${seededHistoryId}`)
      .set("Authorization", `Bearer ${strandedSuperiorManagerToken}`);

    expect(res.status).toBe(403);
  });

  it("confirms the seeded history record still exists after all rejected DELETE attempts", async () => {
    const [row] = await db
      .select()
      .from(appointmentHistory)
      .where(eq(appointmentHistory.id, seededHistoryId));

    // Record must still be present — none of the stranded deletes went through
    expect(row).toBeDefined();
    expect(row.id).toBe(seededHistoryId);
  });
});

// ─── Storage-layer unit tests — updateAppointmentStatus ──────────────────────

describe("storage.updateAppointmentStatus — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.updateAppointmentStatus(seededAppointmentId, "cancelled", undefined)
    ).rejects.toThrow("tenantId is required to update an appointment");
  });

  it("does NOT persist changes when tenantId is undefined", async () => {
    // Capture the current status before the attempted mutation
    const [before] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    const originalStatus = before?.status;

    // Attempt the mutation — expected to throw
    await expect(
      storage.updateAppointmentStatus(seededAppointmentId, "cancelled", undefined)
    ).rejects.toThrow();

    // Verify the record is unchanged
    const [after] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    expect(after?.status).toBe(originalStatus);
    expect(after?.status).not.toBe("cancelled");
  });

  it("succeeds and persists changes when called with the correct tenantId", async () => {
    const result = await storage.updateAppointmentStatus(
      seededAppointmentId,
      "confirmed",
      realTenantId
    );
    expect(result).toBeDefined();
    expect(result.id).toBe(seededAppointmentId);
    expect(result.status).toBe("confirmed");
  });
});

// ─── Storage-layer unit tests — updateContact ────────────────────────────────

describe("storage.updateContact — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.updateContact(seededContactId, { name: "hacked" }, undefined)
    ).rejects.toThrow("tenantId is required to update a contact");
  });

  it("does NOT persist changes when tenantId is undefined", async () => {
    // Capture the current name before the attempted mutation
    const [before] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, seededContactId));
    const originalName = before?.name;

    // Attempt the mutation — expected to throw
    await expect(
      storage.updateContact(seededContactId, { name: "hacked" }, undefined)
    ).rejects.toThrow();

    // Verify the record is unchanged
    const [after] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, seededContactId));
    expect(after?.name).toBe(originalName);
    expect(after?.name).not.toBe("hacked");
  });

  it("succeeds and persists changes when called with the correct tenantId", async () => {
    const result = await storage.updateContact(
      seededContactId,
      { name: "Legitimate Update" },
      realTenantId
    );
    expect(result).toBeDefined();
    expect(result.id).toBe(seededContactId);
    expect(result.name).toBe("Legitimate Update");
  });
});

// ─── Storage-layer unit tests — updateAppointmentIsHere ──────────────────────

describe("storage.updateAppointmentIsHere — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.updateAppointmentIsHere(seededAppointmentId, true, undefined)
    ).rejects.toThrow("tenantId is required to update an appointment");
  });

  it("does NOT persist changes when tenantId is undefined", async () => {
    const [before] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    const originalIsHere = before?.isHere;

    await expect(
      storage.updateAppointmentIsHere(seededAppointmentId, !originalIsHere, undefined)
    ).rejects.toThrow();

    const [after] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    expect(after?.isHere).toBe(originalIsHere);
  });

  it("succeeds and persists changes when called with the correct tenantId", async () => {
    const result = await storage.updateAppointmentIsHere(
      seededAppointmentId,
      true,
      realTenantId
    );
    expect(result).toBeDefined();
    expect(result.id).toBe(seededAppointmentId);
    expect(result.isHere).toBe(true);
  });
});

// ─── Storage-layer unit tests — updateAppointmentIsPaid ──────────────────────

describe("storage.updateAppointmentIsPaid — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.updateAppointmentIsPaid(seededAppointmentId, true, undefined)
    ).rejects.toThrow("tenantId is required to update an appointment");
  });

  it("does NOT persist changes when tenantId is undefined", async () => {
    const [before] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    const originalIsPaid = before?.isPaid;

    await expect(
      storage.updateAppointmentIsPaid(seededAppointmentId, !originalIsPaid, undefined)
    ).rejects.toThrow();

    const [after] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    expect(after?.isPaid).toBe(originalIsPaid);
  });

  it("succeeds and persists changes when called with the correct tenantId", async () => {
    const result = await storage.updateAppointmentIsPaid(
      seededAppointmentId,
      true,
      realTenantId
    );
    expect(result).toBeDefined();
    expect(result.id).toBe(seededAppointmentId);
    expect(result.isPaid).toBe(true);
  });
});

// ─── Storage-layer unit tests — updateAppointmentReadyForPayment ──────────────

describe("storage.updateAppointmentReadyForPayment — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.updateAppointmentReadyForPayment(seededAppointmentId, "50.00", true, undefined)
    ).rejects.toThrow("tenantId is required to update an appointment");
  });

  it("does NOT persist changes when tenantId is undefined", async () => {
    const [before] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    const originalReadyForPayment = before?.readyForPayment;

    await expect(
      storage.updateAppointmentReadyForPayment(seededAppointmentId, "99.99", true, undefined)
    ).rejects.toThrow();

    const [after] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    expect(after?.readyForPayment).toBe(originalReadyForPayment);
    expect(after?.finalAmount).not.toBe("99.99");
  });

  it("succeeds and persists changes when called with the correct tenantId", async () => {
    const result = await storage.updateAppointmentReadyForPayment(
      seededAppointmentId,
      "50.00",
      true,
      realTenantId
    );
    expect(result).toBeDefined();
    expect(result.id).toBe(seededAppointmentId);
    expect(result.readyForPayment).toBe(true);
    expect(result.finalAmount).toBe("50.00");
  });
});

// ─── Storage-layer unit tests — updateAppointmentPaidOnline ──────────────────

describe("storage.updateAppointmentPaidOnline — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.updateAppointmentPaidOnline(seededAppointmentId, "sess_fake", undefined)
    ).rejects.toThrow("tenantId is required to update an appointment");
  });

  it("does NOT persist changes when tenantId is undefined", async () => {
    const [before] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    const originalPaidOnline = before?.paidOnline;

    await expect(
      storage.updateAppointmentPaidOnline(seededAppointmentId, "sess_hacked", undefined)
    ).rejects.toThrow();

    const [after] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    expect(after?.paidOnline).toBe(originalPaidOnline);
    expect(after?.groomingStripeSessionId).not.toBe("sess_hacked");
  });

  it("succeeds and persists changes when called with the correct tenantId", async () => {
    const result = await storage.updateAppointmentPaidOnline(
      seededAppointmentId,
      "sess_legit",
      realTenantId
    );
    expect(result).toBeDefined();
    expect(result.id).toBe(seededAppointmentId);
    expect(result.paidOnline).toBe(true);
    expect(result.groomingStripeSessionId).toBe("sess_legit");
  });
});

// ─── Storage-layer unit tests — updateAppointmentGroomingCompleted ────────────

describe("storage.updateAppointmentGroomingCompleted — storage-layer guard", () => {
  it("throws when tenantId is undefined", async () => {
    await expect(
      storage.updateAppointmentGroomingCompleted(seededAppointmentId, true, undefined)
    ).rejects.toThrow("tenantId is required to update an appointment");
  });

  it("does NOT persist changes when tenantId is undefined", async () => {
    const [before] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    const originalGroomingCompleted = before?.groomingCompleted;

    await expect(
      storage.updateAppointmentGroomingCompleted(seededAppointmentId, !originalGroomingCompleted, undefined)
    ).rejects.toThrow();

    const [after] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));
    expect(after?.groomingCompleted).toBe(originalGroomingCompleted);
  });

  it("succeeds and persists changes when called with the correct tenantId", async () => {
    const result = await storage.updateAppointmentGroomingCompleted(
      seededAppointmentId,
      true,
      realTenantId
    );
    expect(result).toBeDefined();
    expect(result.id).toBe(seededAppointmentId);
    expect(result.groomingCompleted).toBe(true);
  });
});

// ─── Route-level tests — DELETE /api/admin/appointments/:id ──────────────────

describe("DELETE /api/admin/appointments/:id — stranded user cannot delete an appointment", () => {
  it("returns HTTP 403 for a stranded regular user (no tenant, no slug header)", async () => {
    const res = await agent
      .delete(`/api/admin/appointments/${seededAppointmentId}`)
      .set("Authorization", `Bearer ${strandedUserToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded admin (isAdmin=true, no tenant, no slug header)", async () => {
    const res = await agent
      .delete(`/api/admin/appointments/${seededAppointmentId}`)
      .set("Authorization", `Bearer ${strandedAdminToken}`);

    expect(res.status).toBe(403);
  });

  it("returns HTTP 403 for a stranded groomer (isGroomer=true, no tenant, no slug header)", async () => {
    const res = await agent
      .delete(`/api/admin/appointments/${seededAppointmentId}`)
      .set("Authorization", `Bearer ${strandedGroomerToken}`);

    expect(res.status).toBe(403);
  });

  it("confirms the seeded appointment still exists after all rejected DELETE attempts", async () => {
    const [row] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, seededAppointmentId));

    // Record must still be present — none of the stranded deletes went through
    expect(row).toBeDefined();
    expect(row.id).toBe(seededAppointmentId);
    expect(row.tenantId).toBe(realTenantId);
  });
});
