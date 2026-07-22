/**
 * Integration tests: tenantId is stamped on every new record
 *
 * For each major entity (pet, supply, order, appointment, contact, groomer)
 * these tests:
 *   1. Create a record via the storage layer with an explicit tenantId
 *   2. Read the record back from the DB
 *   3. Assert the returned row's tenantId matches the one supplied
 *
 * These tests hit the real database, so they require DATABASE_URL / NEON_DATABASE_URL.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import {
  tenants,
  users,
  pets,
  supplies,
  orders,
  appointments,
  contacts,
  groomers,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

// ─── Shared test state ────────────────────────────────────────────────────────

let tenantId: number;
let userId: string;

// IDs of records created during tests — collected for cleanup
const createdPetIds: number[] = [];
const createdSupplyIds: number[] = [];
const createdOrderIds: number[] = [];
const createdAppointmentIds: number[] = [];
const createdContactIds: number[] = [];
const createdGroomerIds: number[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();

  // Ensure the tenants sequence is ahead of all existing IDs before inserting.
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1))`
  );

  // Use raw SQL to avoid columns that exist in the Drizzle schema but haven't
  // been applied to the DB yet (e.g. trial_warning_email_sent_at).
  const tenantName = `TenantCreate Test ${sfx}`;
  const tenantSlug = `tenant-create-${sfx}`;
  const tenantResult = await db.execute(
    sql`INSERT INTO tenants (name, slug, subscription_status, subscription_tier)
        VALUES (${tenantName}, ${tenantSlug}, 'active', 'starter')
        RETURNING *`
  );
  tenantId = (tenantResult.rows[0] as any).id;

  // Create a test user belonging to that tenant
  const id = `test-create-${sfx}`;
  const [user] = await db
    .insert(users)
    .values({
      id,
      email: `create-test-${sfx}@test.local`,
      firstName: "Create",
      lastName: "Tester",
      tenantId,
      password: "hashed-password-for-test",
    })
    .returning();
  userId = user.id;
});

afterAll(async () => {
  // Delete records in reverse dependency order to satisfy FK constraints
  for (const id of createdOrderIds) {
    await db.delete(orders).where(eq(orders.id, id));
  }
  for (const id of createdAppointmentIds) {
    await db.delete(appointments).where(eq(appointments.id, id));
  }
  for (const id of createdContactIds) {
    await db.delete(contacts).where(eq(contacts.id, id));
  }
  for (const id of createdGroomerIds) {
    await db.delete(groomers).where(eq(groomers.id, id));
  }
  for (const id of createdSupplyIds) {
    await db.delete(supplies).where(eq(supplies.id, id));
  }
  for (const id of createdPetIds) {
    await db.delete(pets).where(eq(pets.id, id));
  }

  if (userId) await db.delete(users).where(eq(users.id, userId));
  if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
});

// ─── Pet ──────────────────────────────────────────────────────────────────────

describe("Pet — tenantId is stamped on create", () => {
  it("createPet stamps the correct tenantId on the returned record", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const pet = await storage.createPet({
      tenantId,
      name: `TestPet-${sfx}`,
      species: "mammals",
      price: "49.99",
    });

    createdPetIds.push(pet.id);

    expect(pet.tenantId).toBe(tenantId);
  });

  it("createPet row persisted in DB has the correct tenantId", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const pet = await storage.createPet({
      tenantId,
      name: `TestPet-DB-${sfx}`,
      species: "bird",
      price: "29.99",
    });

    createdPetIds.push(pet.id);

    // Read directly from DB to confirm persistence
    const [row] = await db.select().from(pets).where(eq(pets.id, pet.id));
    expect(row).toBeDefined();
    expect(row.tenantId).toBe(tenantId);
  });
});

// ─── Supply ───────────────────────────────────────────────────────────────────

describe("Supply — tenantId is stamped on create", () => {
  it("createSupply stamps the correct tenantId on the returned record", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const supply = await storage.createSupply({
      tenantId,
      name: `TestSupply-${sfx}`,
      category: "food",
      price: "12.99",
      isActive: true,
    });

    createdSupplyIds.push(supply.id);

    expect(supply.tenantId).toBe(tenantId);
  });

  it("createSupply row persisted in DB has the correct tenantId", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const supply = await storage.createSupply({
      tenantId,
      name: `TestSupply-DB-${sfx}`,
      category: "toys",
      price: "8.49",
      isActive: true,
    });

    createdSupplyIds.push(supply.id);

    const [row] = await db.select().from(supplies).where(eq(supplies.id, supply.id));
    expect(row).toBeDefined();
    expect(row.tenantId).toBe(tenantId);
  });
});

// ─── Order ────────────────────────────────────────────────────────────────────

describe("Order — tenantId is stamped on create", () => {
  it("createOrder stamps the correct tenantId on the returned record", async () => {
    const { storage } = await import("../storage");

    const order = await storage.createOrder(
      {
        tenantId,
        userId,
        totalAmount: "19.99",
        status: "pending",
      },
      [], // no line items needed for this assertion
    );

    createdOrderIds.push(order.id);

    expect(order.tenantId).toBe(tenantId);
  });

  it("createOrder row persisted in DB has the correct tenantId", async () => {
    const { storage } = await import("../storage");

    const order = await storage.createOrder(
      {
        tenantId,
        userId,
        totalAmount: "39.98",
        status: "pending",
      },
      [],
    );

    createdOrderIds.push(order.id);

    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toBeDefined();
    expect(row.tenantId).toBe(tenantId);
  });
});

// ─── Appointment ──────────────────────────────────────────────────────────────

describe("Appointment — tenantId is stamped on create", () => {
  it("createAppointment stamps the correct tenantId on the returned record", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const appt = await storage.createAppointment({
      tenantId,
      userId,
      serviceType: "grooming",
      appointmentDate: "2099-06-01",
      appointmentTime: "10:00 AM",
      petName: `Buddy-${sfx}`,
      petType: "Dog",
      ownerFirstName: "Jane",
      ownerLastName: `Doe-${sfx}`,
      ownerPhoneNumber: "5550001111",
      price: "55.00",
    });

    createdAppointmentIds.push(appt.id);

    expect(appt.tenantId).toBe(tenantId);
  });

  it("createAppointment row persisted in DB has the correct tenantId", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const appt = await storage.createAppointment({
      tenantId,
      userId,
      serviceType: "bath",
      appointmentDate: "2099-06-02",
      appointmentTime: "11:00 AM",
      petName: `Bella-${sfx}`,
      petType: "Cat",
      ownerFirstName: "John",
      ownerLastName: `Smith-${sfx}`,
      ownerPhoneNumber: "5550002222",
      price: "40.00",
    });

    createdAppointmentIds.push(appt.id);

    const [row] = await db.select().from(appointments).where(eq(appointments.id, appt.id));
    expect(row).toBeDefined();
    expect(row.tenantId).toBe(tenantId);
  });
});

// ─── Contact ──────────────────────────────────────────────────────────────────

describe("Contact — tenantId is stamped on create", () => {
  it("createContact stamps the correct tenantId on the returned record", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const contact = await storage.createContact({
      tenantId,
      name: `Contact-${sfx}`,
      phoneNumber: `555${sfx.slice(0, 7).replace(/[^0-9]/g, "0")}`,
    });

    createdContactIds.push(contact.id);

    expect(contact.tenantId).toBe(tenantId);
  });

  it("createContact row persisted in DB has the correct tenantId", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const contact = await storage.createContact({
      tenantId,
      name: `ContactDB-${sfx}`,
      phoneNumber: `666${sfx.slice(0, 7).replace(/[^0-9]/g, "0")}`,
    });

    createdContactIds.push(contact.id);

    const [row] = await db.select().from(contacts).where(eq(contacts.id, contact.id));
    expect(row).toBeDefined();
    expect(row.tenantId).toBe(tenantId);
  });
});

// ─── Groomer ──────────────────────────────────────────────────────────────────

describe("Groomer — tenantId is stamped on create", () => {
  it("createGroomer stamps the correct tenantId on the returned record", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const groomer = await storage.createGroomer({
      tenantId,
      name: `Groomer-${sfx}`,
      isActive: true,
    });

    createdGroomerIds.push(groomer.id);

    expect(groomer.tenantId).toBe(tenantId);
  });

  it("createGroomer row persisted in DB has the correct tenantId", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const groomer = await storage.createGroomer({
      tenantId,
      name: `GroomerDB-${sfx}`,
      isActive: true,
    });

    createdGroomerIds.push(groomer.id);

    const [row] = await db.select().from(groomers).where(eq(groomers.id, groomer.id));
    expect(row).toBeDefined();
    expect(row.tenantId).toBe(tenantId);
  });
});
