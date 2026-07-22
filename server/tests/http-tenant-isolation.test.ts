/**
 * HTTP-level integration tests: cross-tenant write isolation
 *
 * Spins up the Express app (via registerRoutes), creates two isolated tenants
 * with admin users, seeds records for each tenant, then confirms that HTTP
 * requests authenticated as Tenant A are explicitly rejected (HTTP 404) when
 * targeting Tenant B's records — and that own-tenant writes succeed (HTTP 200).
 *
 * Covered endpoints:
 *   PUT    /api/supplies/:id
 *   DELETE /api/supplies/:id
 *   PUT    /api/contacts/:id
 *   DELETE /api/contacts/:id
 *   PUT    /api/appointments/:id     (status updates)
 *   DELETE /api/admin/orders/:orderId
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import {
  tenants,
  users,
  supplies,
  contacts,
  appointments,
  orders,
  pets,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { generateToken } from "../auth";

// ─── Shared state (populated in beforeAll) ────────────────────────────────────

let tenantAId: number;
let tenantBId: number;
let tenantASlug: string;
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
let petAId: number;
let petBId: number;

// Names/values seeded for Tenant B's records — used to confirm no mutation
let supplyBOriginalName: string;
let contactBOriginalName: string;
let appointmentBOriginalStatus: string | null;
let petBOriginalName: string;

/** Bearer token for Tenant A's admin user */
let tokenA: string;

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

function tenantASlugValue() {
  return tenantASlug;
}

async function createTestAdminUser(tenantId: number, email: string): Promise<string> {
  const id = "http-test-" + randomSuffix();
  const [user] = await db
    .insert(users)
    .values({
      id,
      email,
      firstName: "HTTP",
      lastName: "Test",
      tenantId,
      password: "hashed-password-for-test",
      isAdmin: true,
      tokenVersion: 0,
    })
    .returning();
  return user.id;
}

async function createTestSupply(tenantId: number, name: string): Promise<number> {
  const [supply] = await db
    .insert(supplies)
    .values({ tenantId, name, category: "food", price: "9.99", isActive: true })
    .returning();
  return supply.id;
}

async function createTestContact(
  tenantId: number,
  name: string,
  phone: string,
): Promise<number> {
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
): Promise<number> {
  const [appt] = await db
    .insert(appointments)
    .values({
      tenantId,
      userId,
      serviceType: "grooming",
      appointmentDate: "2099-12-31",
      appointmentTime: "10:00 AM",
      petName: "Buddy",
      petType: "Dog",
      ownerFirstName: "HTTP",
      ownerLastName,
      ownerPhoneNumber: "5559990001",
      price: "40.00",
    })
    .returning();
  return appt.id;
}

async function createTestOrder(tenantId: number, userId: string): Promise<number> {
  const [order] = await db
    .insert(orders)
    .values({ tenantId, userId, totalAmount: "15.00", status: "pending" })
    .returning();
  return order.id;
}

async function createTestPet(tenantId: number, name: string): Promise<number> {
  const [pet] = await db
    .insert(pets)
    .values({
      tenantId,
      name,
      species: "dog",
      price: "299.99",
      isAvailable: true,
    })
    .returning();
  return pet.id;
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

  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1))`,
  );

  tenantASlug = `http-a-${sfx}`;
  tenantAId = await createTestTenant(`HTTP-A-${sfx}`, tenantASlug);
  tenantBId = await createTestTenant(`HTTP-B-${sfx}`, `http-b-${sfx}`);

  userAId = await createTestAdminUser(tenantAId, `http-a-${sfx}@test.local`);
  userBId = await createTestAdminUser(tenantBId, `http-b-${sfx}@test.local`);

  // Seed records — capture Tenant B's original values for mutation assertions
  supplyBOriginalName = `SupplyB-${sfx}`;
  supplyAId = await createTestSupply(tenantAId, `SupplyA-${sfx}`);
  supplyBId = await createTestSupply(tenantBId, supplyBOriginalName);

  contactBOriginalName = `ContactB ${sfx}`;
  contactAId = await createTestContact(tenantAId, `ContactA ${sfx}`, "5550000011");
  contactBId = await createTestContact(tenantBId, contactBOriginalName, "5550000022");

  appointmentAId = await createTestAppointment(tenantAId, userAId, `OwnerA-${sfx}`);
  appointmentBId = await createTestAppointment(tenantBId, userBId, `OwnerB-${sfx}`);
  // Capture B's current status from DB
  const [apptB] = await db
    .select({ status: appointments.status })
    .from(appointments)
    .where(eq(appointments.id, appointmentBId));
  appointmentBOriginalStatus = apptB?.status ?? null;

  orderAId = await createTestOrder(tenantAId, userAId);
  orderBId = await createTestOrder(tenantBId, userBId);

  // Seed pets
  petBOriginalName = `PetB-${sfx}`;
  petAId = await createTestPet(tenantAId, `PetA-${sfx}`);
  petBId = await createTestPet(tenantBId, petBOriginalName);

  // Generate JWT from the DB user row (tokenVersion must match DB)
  const dbUserA = await getDbUser(userAId);
  tokenA = generateToken(dbUserA as any);

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
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

  if (petAId) await db.delete(pets).where(eq(pets.id, petAId));
  if (petBId) await db.delete(pets).where(eq(pets.id, petBId));

  if (userAId) await db.delete(users).where(eq(users.id, userAId));
  if (userBId) await db.delete(users).where(eq(users.id, userBId));

  if (tenantAId) await db.delete(tenants).where(eq(tenants.id, tenantAId));
  if (tenantBId) await db.delete(tenants).where(eq(tenants.id, tenantBId));
}, 30_000);

// ─── PUT /api/supplies/:id ────────────────────────────────────────────────────

describe("PUT /api/supplies/:id — cross-tenant write rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's supply", async () => {
    const res = await agent
      .put(`/api/supplies/${supplyBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "HACKED-SUPPLY" });

    expect(res.status).toBe(404);
  });

  it("Tenant B's supply name is unchanged after Tenant A's rejected update", async () => {
    const [row] = await db
      .select({ name: supplies.name })
      .from(supplies)
      .where(eq(supplies.id, supplyBId));
    expect(row?.name).toBe(supplyBOriginalName);
  });

  it("returns 200 when Tenant A updates their own supply", async () => {
    const res = await agent
      .put(`/api/supplies/${supplyAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Updated-By-A", category: "food", price: "9.99" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", supplyAId);
  });
});

// ─── DELETE /api/supplies/:id ─────────────────────────────────────────────────

describe("DELETE /api/supplies/:id — cross-tenant delete rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's supply", async () => {
    const res = await agent
      .delete(`/api/supplies/${supplyBId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it("Tenant B's supply still exists after Tenant A's rejected delete", async () => {
    const [row] = await db
      .select({ id: supplies.id })
      .from(supplies)
      .where(eq(supplies.id, supplyBId));
    expect(row).toBeDefined();
  });
});

// ─── PUT /api/contacts/:id ────────────────────────────────────────────────────

describe("PUT /api/contacts/:id — cross-tenant write rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's contact", async () => {
    const res = await agent
      .put(`/api/contacts/${contactBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "HACKED-CONTACT", phoneNumber: "5550000022" });

    expect(res.status).toBe(404);
  });

  it("Tenant B's contact name is unchanged after Tenant A's rejected update", async () => {
    const [row] = await db
      .select({ name: contacts.name })
      .from(contacts)
      .where(eq(contacts.id, contactBId));
    expect(row?.name).toBe(contactBOriginalName);
  });

  it("returns 200 when Tenant A updates their own contact", async () => {
    const res = await agent
      .put(`/api/contacts/${contactAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Updated Contact A", phoneNumber: "5550000011" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", contactAId);
  });
});

// ─── DELETE /api/contacts/:id ─────────────────────────────────────────────────

describe("DELETE /api/contacts/:id — cross-tenant delete rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's contact", async () => {
    const res = await agent
      .delete(`/api/contacts/${contactBId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it("Tenant B's contact still exists after Tenant A's rejected delete", async () => {
    const [row] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, contactBId));
    expect(row).toBeDefined();
  });

  it("returns 200 when Tenant A deletes their own contact", async () => {
    // Create a throwaway contact to delete
    const throwawayId = await createTestContact(tenantAId, "Throwaway A", "5559991111");
    const res = await agent
      .delete(`/api/contacts/${throwawayId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
  });
});

// ─── PUT /api/appointments/:id ────────────────────────────────────────────────
//
// The route pre-fetches the appointment scoped to req.tenantId before touching
// the DB — cross-tenant IDs are rejected with 404 at that point.

describe("PUT /api/appointments/:id — cross-tenant status update rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's appointment", async () => {
    const res = await agent
      .put(`/api/appointments/${appointmentBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ status: "confirmed" });

    expect(res.status).toBe(404);
  });

  it("Tenant B's appointment status is unchanged after Tenant A's rejected update", async () => {
    const [row] = await db
      .select({ status: appointments.status })
      .from(appointments)
      .where(eq(appointments.id, appointmentBId));
    expect(row?.status).toBe(appointmentBOriginalStatus);
  });

  it("returns 200 when Tenant A updates status on their own appointment", async () => {
    const res = await agent
      .put(`/api/appointments/${appointmentAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ status: "confirmed" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", appointmentAId);
  });
});

// ─── DELETE /api/admin/orders/:orderId ────────────────────────────────────────

describe("DELETE /api/admin/orders/:orderId — cross-tenant delete rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's order", async () => {
    const res = await agent
      .delete(`/api/admin/orders/${orderBId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it("Tenant B's order still exists after Tenant A's rejected delete", async () => {
    const [row] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderBId));
    expect(row).toBeDefined();
  });
});

// ─── PUT /api/pets/:id ───────────────────────────────────────────────────────

describe("PUT /api/pets/:id — cross-tenant write rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's pet", async () => {
    const res = await agent
      .put(`/api/pets/${petBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "HACKED-PET", species: "dog", price: "1.00" });

    expect(res.status).toBe(404);
  });

  it("Tenant B's pet name is unchanged after Tenant A's rejected update", async () => {
    const [row] = await db
      .select({ name: pets.name })
      .from(pets)
      .where(eq(pets.id, petBId));
    expect(row?.name).toBe(petBOriginalName);
  });

  it("returns 200 when Tenant A updates their own pet", async () => {
    const res = await agent
      .put(`/api/pets/${petAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Updated-PetA", species: "dog", price: "350.00" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", petAId);
  });
});

// ─── DELETE /api/pets/:id ─────────────────────────────────────────────────────

describe("DELETE /api/pets/:id — cross-tenant delete rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's pet", async () => {
    const res = await agent
      .delete(`/api/pets/${petBId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it("Tenant B's pet still exists after Tenant A's rejected delete", async () => {
    const [row] = await db
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.id, petBId));
    expect(row).toBeDefined();
  });

  it("returns 200 when Tenant A deletes their own pet", async () => {
    // Create a throwaway pet to delete so petAId remains available for earlier tests
    const throwawayId = await createTestPet(tenantAId, "Throwaway-PetA");
    const res = await agent
      .delete(`/api/pets/${throwawayId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
  });
});

// ─── Unauthenticated requests are rejected ────────────────────────────────────
//
// tenantMiddleware runs before authMiddleware for all /api routes.  Without a
// tenant slug, it short-circuits with 400. Providing X-Tenant-Slug lets the
// middleware resolve the tenant so authMiddleware can then return 401.

describe("Unauthenticated requests are rejected with 401", () => {
  it("PUT /api/supplies/:id without token → 401", async () => {
    const res = await agent
      .put(`/api/supplies/${supplyAId}`)
      .set("X-Tenant-Slug", tenantASlug)
      .send({ name: "no-auth" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/supplies/:id without token → 401", async () => {
    const res = await agent
      .delete(`/api/supplies/${supplyAId}`)
      .set("X-Tenant-Slug", tenantASlug);
    expect(res.status).toBe(401);
  });

  it("DELETE /api/contacts/:id without token → 401", async () => {
    const res = await agent
      .delete(`/api/contacts/${contactAId}`)
      .set("X-Tenant-Slug", tenantASlug);
    expect(res.status).toBe(401);
  });

  it("DELETE /api/admin/orders/:orderId without token → 401", async () => {
    const res = await agent
      .delete(`/api/admin/orders/${orderAId}`)
      .set("X-Tenant-Slug", tenantASlug);
    expect(res.status).toBe(401);
  });

  it("PUT /api/pets/:id without token → 401", async () => {
    const res = await agent
      .put(`/api/pets/${petAId}`)
      .set("X-Tenant-Slug", tenantASlug)
      .send({ name: "no-auth" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/pets/:id without token → 401", async () => {
    const res = await agent
      .delete(`/api/pets/${petAId}`)
      .set("X-Tenant-Slug", tenantASlug);
    expect(res.status).toBe(401);
  });
});
