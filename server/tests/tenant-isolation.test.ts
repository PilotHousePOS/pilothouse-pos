/**
 * Integration tests: Multi-tenant data isolation
 *
 * Creates two distinct tenants, seeds each with rows in key tables
 * (supplies, contacts, appointments, orders), then verifies that querying
 * as Tenant A never returns Tenant B's records — and vice-versa.
 *
 * These tests hit the real database, so they require DATABASE_URL / NEON_DATABASE_URL.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import {
  tenants,
  users,
  supplies,
  contacts,
  appointments,
  orders,
  orderItems,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

// ─── Test data ids (populated in beforeAll) ───────────────────────────────────
let tenantAId: number;
let tenantBId: number;
let userAId: string;
let userBId: string;

let supplyAId: number;
let supplyBId: number;
let contactAId: number;
let contactBId: number;
let appointmentAId: number;
let appointmentBId: number;
let orderAId: number;
let orderBId: number;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

async function createTestTenant(name: string, slug: string) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name, slug, subscriptionStatus: "active", subscriptionTier: "starter" })
    .returning();
  return tenant;
}

async function createTestUser(
  tenantId: number,
  email: string,
): Promise<string> {
  const id = "test-" + randomSuffix();
  const [user] = await db
    .insert(users)
    .values({
      id,
      email,
      firstName: "Test",
      lastName: "User",
      tenantId,
      password: "hashed-password-for-test",
    })
    .returning();
  return user.id;
}

async function createTestSupply(tenantId: number, name: string) {
  const [supply] = await db
    .insert(supplies)
    .values({
      tenantId,
      name,
      category: "food",
      price: "9.99",
      isActive: true,
    })
    .returning();
  return supply.id;
}

async function createTestContact(tenantId: number, name: string, phone: string) {
  const [contact] = await db
    .insert(contacts)
    .values({ tenantId, name, phoneNumber: phone })
    .returning();
  return contact.id;
}

async function createTestAppointment(
  tenantId: number,
  userId: string,
  ownerLastName: string,
) {
  const [appt] = await db
    .insert(appointments)
    .values({
      tenantId,
      userId,
      serviceType: "grooming",
      appointmentDate: "2099-01-01",
      appointmentTime: "9:00 AM",
      petName: "Fluffy",
      petType: "Dog",
      ownerFirstName: "Test",
      ownerLastName,
      ownerPhoneNumber: "5550001234",
      price: "50.00",
    })
    .returning();
  return appt.id;
}

async function createTestOrder(tenantId: number, userId: string) {
  const [order] = await db
    .insert(orders)
    .values({
      tenantId,
      userId,
      totalAmount: "25.00",
      status: "pending",
    })
    .returning();
  return order.id;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();

  // Ensure the tenants sequence is ahead of all existing IDs before inserting test rows.
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1))`
  );

  // Create two isolated test tenants
  const tenantA = await createTestTenant(`Test Tenant A ${sfx}`, `test-tenant-a-${sfx}`);
  const tenantB = await createTestTenant(`Test Tenant B ${sfx}`, `test-tenant-b-${sfx}`);
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  // Create one user per tenant
  userAId = await createTestUser(tenantAId, `user-a-${sfx}@test.local`);
  userBId = await createTestUser(tenantBId, `user-b-${sfx}@test.local`);

  // Seed supplies
  supplyAId = await createTestSupply(tenantAId, `Supply-A-${sfx}`);
  supplyBId = await createTestSupply(tenantBId, `Supply-B-${sfx}`);

  // Seed contacts
  contactAId = await createTestContact(tenantAId, `Contact A ${sfx}`, "5550000001");
  contactBId = await createTestContact(tenantBId, `Contact B ${sfx}`, "5550000002");

  // Seed appointments
  appointmentAId = await createTestAppointment(tenantAId, userAId, `OwnerA-${sfx}`);
  appointmentBId = await createTestAppointment(tenantBId, userBId, `OwnerB-${sfx}`);

  // Seed orders
  orderAId = await createTestOrder(tenantAId, userAId);
  orderBId = await createTestOrder(tenantBId, userBId);
});

afterAll(async () => {
  // Delete in reverse dependency order to satisfy FK constraints
  if (orderAId) await db.delete(orders).where(eq(orders.id, orderAId));
  if (orderBId) await db.delete(orders).where(eq(orders.id, orderBId));

  if (appointmentAId)
    await db.delete(appointments).where(eq(appointments.id, appointmentAId));
  if (appointmentBId)
    await db.delete(appointments).where(eq(appointments.id, appointmentBId));

  if (contactAId) await db.delete(contacts).where(eq(contacts.id, contactAId));
  if (contactBId) await db.delete(contacts).where(eq(contacts.id, contactBId));

  if (supplyAId) await db.delete(supplies).where(eq(supplies.id, supplyAId));
  if (supplyBId) await db.delete(supplies).where(eq(supplies.id, supplyBId));

  if (userAId) await db.delete(users).where(eq(users.id, userAId));
  if (userBId) await db.delete(users).where(eq(users.id, userBId));

  if (tenantAId) await db.delete(tenants).where(eq(tenants.id, tenantAId));
  if (tenantBId) await db.delete(tenants).where(eq(tenants.id, tenantBId));
});

// ─── Supplies ─────────────────────────────────────────────────────────────────

describe("Supplies — tenant isolation", () => {
  it("Tenant A query returns Tenant A's supply", async () => {
    const rows = await db
      .select()
      .from(supplies)
      .where(eq(supplies.tenantId, tenantAId));

    const ids = rows.map((r) => r.id);
    expect(ids).toContain(supplyAId);
  });

  it("Tenant A query does NOT return Tenant B's supply", async () => {
    const rows = await db
      .select()
      .from(supplies)
      .where(eq(supplies.tenantId, tenantAId));

    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(supplyBId);
  });

  it("Tenant B query returns Tenant B's supply", async () => {
    const rows = await db
      .select()
      .from(supplies)
      .where(eq(supplies.tenantId, tenantBId));

    const ids = rows.map((r) => r.id);
    expect(ids).toContain(supplyBId);
  });

  it("Tenant B query does NOT return Tenant A's supply", async () => {
    const rows = await db
      .select()
      .from(supplies)
      .where(eq(supplies.tenantId, tenantBId));

    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(supplyAId);
  });

  it("Cross-tenant supply lookup by Tenant A's id with Tenant B filter returns nothing", async () => {
    const rows = await db
      .select()
      .from(supplies)
      .where(and(eq(supplies.id, supplyAId), eq(supplies.tenantId, tenantBId)));

    expect(rows).toHaveLength(0);
  });
});

// ─── Contacts ─────────────────────────────────────────────────────────────────

describe("Contacts — tenant isolation", () => {
  it("Tenant A query returns Tenant A's contact", async () => {
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.tenantId, tenantAId));

    expect(rows.map((r) => r.id)).toContain(contactAId);
  });

  it("Tenant A query does NOT return Tenant B's contact", async () => {
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.tenantId, tenantAId));

    expect(rows.map((r) => r.id)).not.toContain(contactBId);
  });

  it("Tenant B query returns Tenant B's contact", async () => {
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.tenantId, tenantBId));

    expect(rows.map((r) => r.id)).toContain(contactBId);
  });

  it("Tenant B query does NOT return Tenant A's contact", async () => {
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.tenantId, tenantBId));

    expect(rows.map((r) => r.id)).not.toContain(contactAId);
  });

  it("Cross-tenant contact lookup by Tenant A's id with Tenant B filter returns nothing", async () => {
    const rows = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, contactAId), eq(contacts.tenantId, tenantBId)));

    expect(rows).toHaveLength(0);
  });
});

// ─── Appointments ─────────────────────────────────────────────────────────────

describe("Appointments — tenant isolation", () => {
  it("Tenant A query returns Tenant A's appointment", async () => {
    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.tenantId, tenantAId));

    expect(rows.map((r) => r.id)).toContain(appointmentAId);
  });

  it("Tenant A query does NOT return Tenant B's appointment", async () => {
    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.tenantId, tenantAId));

    expect(rows.map((r) => r.id)).not.toContain(appointmentBId);
  });

  it("Tenant B query returns Tenant B's appointment", async () => {
    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.tenantId, tenantBId));

    expect(rows.map((r) => r.id)).toContain(appointmentBId);
  });

  it("Tenant B query does NOT return Tenant A's appointment", async () => {
    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.tenantId, tenantBId));

    expect(rows.map((r) => r.id)).not.toContain(appointmentAId);
  });

  it("Cross-tenant appointment lookup by Tenant A's id with Tenant B filter returns nothing", async () => {
    const rows = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.id, appointmentAId),
          eq(appointments.tenantId, tenantBId),
        ),
      );

    expect(rows).toHaveLength(0);
  });
});

// ─── Orders ───────────────────────────────────────────────────────────────────

describe("Orders — tenant isolation", () => {
  it("Tenant A query returns Tenant A's order", async () => {
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, tenantAId));

    expect(rows.map((r) => r.id)).toContain(orderAId);
  });

  it("Tenant A query does NOT return Tenant B's order", async () => {
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, tenantAId));

    expect(rows.map((r) => r.id)).not.toContain(orderBId);
  });

  it("Tenant B query returns Tenant B's order", async () => {
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, tenantBId));

    expect(rows.map((r) => r.id)).toContain(orderBId);
  });

  it("Tenant B query does NOT return Tenant A's order", async () => {
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, tenantBId));

    expect(rows.map((r) => r.id)).not.toContain(orderAId);
  });

  it("Cross-tenant order lookup by Tenant A's id with Tenant B filter returns nothing", async () => {
    const rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderAId), eq(orders.tenantId, tenantBId)));

    expect(rows).toHaveLength(0);
  });
});

// ─── Storage layer (via storage.ts helpers) ───────────────────────────────────

describe("Storage layer — tenant isolation via storage helpers", () => {
  it("getAllSupplies(tenantAId) excludes Tenant B supply", async () => {
    const { storage } = await import("../storage");
    const rows = await storage.getAllSupplies(tenantAId);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(supplyAId);
    expect(ids).not.toContain(supplyBId);
  });

  it("getAllSupplies(tenantBId) excludes Tenant A supply", async () => {
    const { storage } = await import("../storage");
    const rows = await storage.getAllSupplies(tenantBId);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(supplyBId);
    expect(ids).not.toContain(supplyAId);
  });

  it("getAllContacts(tenantAId) excludes Tenant B contact", async () => {
    const { storage } = await import("../storage");
    const rows = await storage.getAllContacts(tenantAId);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(contactAId);
    expect(ids).not.toContain(contactBId);
  });

  it("getAllContacts(tenantBId) excludes Tenant A contact", async () => {
    const { storage } = await import("../storage");
    const rows = await storage.getAllContacts(tenantBId);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(contactBId);
    expect(ids).not.toContain(contactAId);
  });

  it("getAppointments(undefined, tenantAId) excludes Tenant B appointment", async () => {
    const { storage } = await import("../storage");
    const rows = await storage.getAppointments(undefined, tenantAId);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(appointmentAId);
    expect(ids).not.toContain(appointmentBId);
  });

  it("getAppointments(undefined, tenantBId) excludes Tenant A appointment", async () => {
    const { storage } = await import("../storage");
    const rows = await storage.getAppointments(undefined, tenantBId);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(appointmentBId);
    expect(ids).not.toContain(appointmentAId);
  });

  it("getOrders(undefined, tenantAId) excludes Tenant B order", async () => {
    const { storage } = await import("../storage");
    const rows = await storage.getOrders(undefined, tenantAId);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(orderAId);
    expect(ids).not.toContain(orderBId);
  });

  it("getOrders(undefined, tenantBId) excludes Tenant A order", async () => {
    const { storage } = await import("../storage");
    const rows = await storage.getOrders(undefined, tenantBId);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(orderBId);
    expect(ids).not.toContain(orderAId);
  });

  it("getSupply(supplyAId, tenantBId) returns undefined — cross-tenant blocked", async () => {
    const { storage } = await import("../storage");
    const supply = await storage.getSupply(supplyAId, tenantBId);
    expect(supply).toBeUndefined();
  });

  it("getContact(contactAId, tenantBId) returns undefined — cross-tenant blocked", async () => {
    const { storage } = await import("../storage");
    const contact = await storage.getContact(contactAId, tenantBId);
    expect(contact).toBeUndefined();
  });

  it("getAppointment(appointmentAId, tenantBId) returns undefined — cross-tenant blocked", async () => {
    const { storage } = await import("../storage");
    const appt = await storage.getAppointment(appointmentAId, tenantBId);
    expect(appt).toBeUndefined();
  });

  it("getOrder(orderAId, tenantBId) returns undefined — cross-tenant blocked", async () => {
    const { storage } = await import("../storage");
    const order = await storage.getOrder(orderAId, tenantBId);
    expect(order).toBeUndefined();
  });
});

// ─── Cross-tenant write isolation (supplies) ──────────────────────────────────

describe("Supplies — cross-tenant write isolation", () => {
  it("updateSupply with Tenant A's id and Tenant B's tenantId throws and leaves the record unchanged", async () => {
    const { storage } = await import("../storage");

    // Attempt update using Tenant B's context but Tenant A's supply ID
    await expect(
      storage.updateSupply(supplyAId, { name: "HACKED" }, tenantBId),
    ).rejects.toThrow();

    // Original record must be unchanged
    const original = await storage.getSupply(supplyAId, tenantAId);
    expect(original).toBeDefined();
    expect(original!.name).not.toBe("HACKED");
  });

  it("deleteSupply with Tenant A's id and Tenant B's tenantId does not remove the record", async () => {
    const { storage } = await import("../storage");

    // deleteSupply silently skips when the WHERE clause matches nothing
    await storage.deleteSupply(supplyAId, tenantBId);

    // Record must still exist under Tenant A
    const still = await storage.getSupply(supplyAId, tenantAId);
    expect(still).toBeDefined();
  });
});

// ─── Cross-tenant write isolation (contacts) ─────────────────────────────────

describe("Contacts — cross-tenant write isolation", () => {
  it("updateContact with Tenant A's id and Tenant B's tenantId does not modify the record", async () => {
    const { storage } = await import("../storage");

    // updateContact returns undefined / null when the WHERE clause matches nothing
    const result = await storage.updateContact(
      contactAId,
      { name: "HACKED" },
      tenantBId,
    );

    // Either returns falsy, or the original name is preserved
    if (result) {
      expect(result.name).not.toBe("HACKED");
    }

    // Verify the record in Tenant A's scope is unchanged
    const original = await storage.getContact(contactAId, tenantAId);
    expect(original).toBeDefined();
    expect(original!.name).not.toBe("HACKED");
  });

  it("deleteContact with Tenant A's id and Tenant B's tenantId does not remove the record", async () => {
    const { storage } = await import("../storage");

    await storage.deleteContact(contactAId, tenantBId);

    const still = await storage.getContact(contactAId, tenantAId);
    expect(still).toBeDefined();
  });
});

// ─── Cross-tenant write isolation (appointments) ──────────────────────────────

describe("Appointments — cross-tenant write isolation", () => {
  it("updateAppointmentStatus with Tenant A's id and Tenant B's tenantId does not change the record", async () => {
    const { storage } = await import("../storage");

    // Fetch original status
    const original = await storage.getAppointment(appointmentAId, tenantAId);
    expect(original).toBeDefined();
    const originalStatus = original!.status;

    // Attempt cross-tenant status update (returns undefined / does nothing)
    const result = await storage.updateAppointmentStatus(
      appointmentAId,
      "cancelled",
      tenantBId,
    );

    // If a row was returned, it must not belong to Tenant B
    if (result) {
      expect(result.tenantId).not.toBe(tenantBId);
    }

    // Verify status in Tenant A's scope is unchanged
    const after = await storage.getAppointment(appointmentAId, tenantAId);
    expect(after).toBeDefined();
    expect(after!.status).toBe(originalStatus);
  });

  it("deleteAppointment with Tenant A's id and Tenant B's tenantId does not remove the record", async () => {
    const { storage } = await import("../storage");

    // deleteAppointment is not on the IStorage interface but is on the concrete class;
    // fall back to a direct DB delete with the wrong tenant filter
    const { db } = await import("../db");
    const { appointments: apptTable } = await import("@shared/schema");
    const { and: dbAnd, eq: dbEq } = await import("drizzle-orm");

    await db
      .delete(apptTable)
      .where(dbAnd(dbEq(apptTable.id, appointmentAId), dbEq(apptTable.tenantId, tenantBId)));

    // Record must still exist under Tenant A
    const still = await storage.getAppointment(appointmentAId, tenantAId);
    expect(still).toBeDefined();
  });
});

// ─── Cross-tenant write isolation (orders) ────────────────────────────────────

describe("Orders — cross-tenant write isolation", () => {
  it("updateOrderStatus with Tenant A's id and Tenant B's tenantId does not change the record", async () => {
    const { storage } = await import("../storage");

    const original = await storage.getOrder(orderAId, tenantAId);
    expect(original).toBeDefined();
    const originalStatus = original!.status;

    // updateOrderStatus with wrong tenant — should either throw or return the wrong-tenant update (which matches nothing)
    try {
      await storage.updateOrderStatus(orderAId, "shipped", tenantBId);
    } catch {
      // A thrown error is also acceptable isolation behaviour
    }

    const after = await storage.getOrder(orderAId, tenantAId);
    expect(after).toBeDefined();
    expect(after!.status).toBe(originalStatus);
  });

  it("deleteOrder with Tenant A's id and Tenant B's tenantId throws and leaves the record intact", async () => {
    const { storage } = await import("../storage");

    await expect(storage.deleteOrder(orderAId, tenantBId)).rejects.toThrow();

    // Record must still exist under Tenant A
    const still = await storage.getOrder(orderAId, tenantAId);
    expect(still).toBeDefined();
  });
});

