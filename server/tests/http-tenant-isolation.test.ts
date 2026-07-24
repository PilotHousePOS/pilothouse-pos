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
  appointmentItems,
  orders,
  pets,
} from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";
import { generateToken } from "../auth";

// ─── Shared state (populated in beforeAll) ────────────────────────────────────

let tenantAId: number;
let tenantBId: number;
let tenantASlug: string;
let userAId: string;
let userBId: string;

/** Groomer user in Tenant A — non-admin, isGroomer=true */
let groomerAId: string;
/** Bearer token for Tenant A's groomer user */
let tokenGroomerA: string;

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

/** An appointment item seeded for Tenant B — used to test mixed-ID IDOR attacks */
let itemBId: number;

// Names/values seeded for Tenant B's records — used to confirm no mutation
let supplyBOriginalName: string;
let contactBOriginalName: string;
let appointmentBOriginalStatus: string | null;
let appointmentBOriginalOwnerLastName: string;
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

async function createTestGroomerUser(tenantId: number, email: string): Promise<string> {
  const id = "http-test-" + randomSuffix();
  const [user] = await db
    .insert(users)
    .values({
      id,
      email,
      firstName: "HTTP",
      lastName: "Groomer",
      tenantId,
      password: "hashed-password-for-test",
      isAdmin: false,
      isGroomer: true,
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
  // Capture B's current status and ownerLastName from DB
  const [apptB] = await db
    .select({ status: appointments.status, ownerLastName: appointments.ownerLastName })
    .from(appointments)
    .where(eq(appointments.id, appointmentBId));
  appointmentBOriginalStatus = apptB?.status ?? null;
  appointmentBOriginalOwnerLastName = apptB?.ownerLastName ?? "";

  orderAId = await createTestOrder(tenantAId, userAId);
  orderBId = await createTestOrder(tenantBId, userBId);

  // Seed pets
  petBOriginalName = `PetB-${sfx}`;
  petAId = await createTestPet(tenantAId, `PetA-${sfx}`);
  petBId = await createTestPet(tenantBId, petBOriginalName);

  // Seed an appointment item for Tenant B — used in mixed-ID IDOR attack tests
  const [itemB] = await db
    .insert(appointmentItems)
    .values({ appointmentId: appointmentBId, name: `ItemB-${sfx}`, price: "7.50", quantity: 1 })
    .returning();
  itemBId = itemB.id;

  // Generate JWT from the DB user row (tokenVersion must match DB)
  const dbUserA = await getDbUser(userAId);
  tokenA = generateToken(dbUserA as any);

  // Create a groomer user in Tenant A and generate their token
  const sfxG = randomSuffix();
  groomerAId = await createTestGroomerUser(tenantAId, `http-groomer-a-${sfxG}@test.local`);
  const dbGroomerA = await getDbUser(groomerAId);
  tokenGroomerA = generateToken(dbGroomerA as any);

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (orderAId) await db.delete(orders).where(eq(orders.id, orderAId));
  if (orderBId) await db.delete(orders).where(eq(orders.id, orderBId));

  // Delete any contacts auto-created during tests (e.g. grooming-completed auto-contact)
  if (tenantAId) await db.delete(contacts).where(eq(contacts.tenantId, tenantAId));
  if (tenantBId) await db.delete(contacts).where(eq(contacts.tenantId, tenantBId));

  // Delete appointment items before appointments (FK cascade would handle it,
  // but explicit deletion avoids relying on cascade order).
  if (itemBId) await db.delete(appointmentItems).where(eq(appointmentItems.id, itemBId));

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
  if (groomerAId) await db.delete(users).where(eq(users.id, groomerAId));

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

// ─── Admin order action routes ────────────────────────────────────────────────
//
// Each admin action pre-fetches the order scoped to req.tenantId. Cross-tenant
// IDs must be rejected with HTTP 404 before any mutation occurs.

describe("POST /api/admin/orders/:id/approve — cross-tenant action rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's order", async () => {
    const res = await agent
      .post(`/api/admin/orders/${orderBId}/approve`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/orders/:id/ready — cross-tenant action rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's order", async () => {
    const res = await agent
      .post(`/api/admin/orders/${orderBId}/ready`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/orders/:id/picked-up — cross-tenant action rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's order", async () => {
    const res = await agent
      .post(`/api/admin/orders/${orderBId}/picked-up`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it("Tenant B's order status is unchanged after Tenant A's rejected picked-up", async () => {
    const [row] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderBId));
    expect(row?.status).toBe("pending");
  });
});

describe("POST /api/admin/orders/:id/hide — cross-tenant action rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's order", async () => {
    const res = await agent
      .post(`/api/admin/orders/${orderBId}/hide`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it("Tenant B's order is not hidden after Tenant A's rejected hide", async () => {
    const [row] = await db
      .select({ hiddenFromAdmin: orders.hiddenFromAdmin })
      .from(orders)
      .where(eq(orders.id, orderBId));
    expect(row?.hiddenFromAdmin).not.toBe(true);
  });
});

describe("POST /api/admin/orders/:id/discount — cross-tenant action rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's order", async () => {
    const res = await agent
      .post(`/api/admin/orders/${orderBId}/discount`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ discountAmount: "5.00", discountReason: "HACKED" });

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/admin/orders/:id/items — cross-tenant action rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's order", async () => {
    const res = await agent
      .put(`/api/admin/orders/${orderBId}/items`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ items: [] });

    expect(res.status).toBe(404);
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

// ─── GET /api/orders — user-scoped read ──────────────────────────────────────
//
// The endpoint filters by userId (the authenticated caller). A user who belongs
// to Tenant A must not receive orders that were placed by Tenant B's user, even
// if they share the same Express instance.

describe("GET /api/orders — user sees only their own orders", () => {
  it("returns 200 and includes Tenant A user's own order", async () => {
    const res = await agent
      .get("/api/orders")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlugValue());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((o: any) => o.id);
    expect(ids).toContain(orderAId);
  });

  it("does NOT return Tenant B user's order when called by Tenant A user", async () => {
    const res = await agent
      .get("/api/orders")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlugValue());

    expect(res.status).toBe(200);
    const ids = res.body.map((o: any) => o.id);
    expect(ids).not.toContain(orderBId);
  });
});

// ─── GET /api/admin/orders-with-items — tenant-scoped admin read ──────────────
//
// The endpoint passes req.tenantId to getAllOrdersWithItems, so an admin from
// Tenant A must only see Tenant A's orders — never Tenant B's.

describe("GET /api/admin/orders-with-items — tenant-scoped read", () => {
  it("returns 200 and includes Tenant A's order", async () => {
    const res = await agent
      .get("/api/admin/orders-with-items")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlugValue());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((o: any) => o.id);
    expect(ids).toContain(orderAId);
  });

  it("does NOT return Tenant B's order when called by Tenant A admin", async () => {
    const res = await agent
      .get("/api/admin/orders-with-items")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlugValue());

    expect(res.status).toBe(200);
    const ids = res.body.map((o: any) => o.id);
    expect(ids).not.toContain(orderBId);
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

// ─── DELETE /api/pets/:id — stranded admin is rejected by tenantMiddleware ─────
//
// A user who is isAdmin=true but whose tenantId is NULL is "stranded":
// tenantMiddleware returns 403 (STRANDED_ACCOUNT) before the route handler
// runs, so storage.deletePet() is never reached.

let strandedAdminId: string;
let strandedAdminPetId: number;
let tokenStrandedAdmin: string;

describe("DELETE /api/pets/:id — stranded admin gets 403 from tenantMiddleware", () => {
  beforeAll(async () => {
    const sfxS = randomSuffix();
    strandedAdminId = `http-stranded-${sfxS}`;
    await db.insert(users).values({
      id: strandedAdminId,
      email: `stranded-${sfxS}@test.local`,
      firstName: "Stranded",
      lastName: "Admin",
      tenantId: null, // deliberately stranded — no tenant assigned
      password: "hashed-password-for-test",
      isAdmin: true,
      tokenVersion: 0,
    });
    // Pet owned by Tenant A — the stranded call must never delete it
    strandedAdminPetId = await createTestPet(tenantAId, `StrandedTargetPet-${sfxS}`);
    const [dbStranded] = await db.select().from(users).where(eq(users.id, strandedAdminId));
    tokenStrandedAdmin = generateToken(dbStranded as any);
  });

  afterAll(async () => {
    if (strandedAdminPetId) await db.delete(pets).where(eq(pets.id, strandedAdminPetId));
    if (strandedAdminId) await db.delete(users).where(eq(users.id, strandedAdminId));
  });

  it("returns 403 when a stranded admin (tenantId=null) calls DELETE /api/pets/:id", async () => {
    const res = await agent
      .delete(`/api/pets/${strandedAdminPetId}`)
      .set("Authorization", `Bearer ${tokenStrandedAdmin}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("code", "STRANDED_ACCOUNT");
  });

  it("the target pet still exists after the stranded admin's rejected delete", async () => {
    const [row] = await db
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.id, strandedAdminPetId));
    expect(row).toBeDefined();
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

// ─── Groomer cross-tenant isolation ──────────────────────────────────────────
//
// Groomers (isGroomer=true, isAdmin=false) in Tenant A are allowed to call
// PUT /api/contacts/:id and PUT /api/appointments/:id for their own tenant.
// Targeting Tenant B's records must be rejected (HTTP 404) and leave the
// records unchanged.

describe("PUT /api/contacts/:id — groomer cross-tenant write rejected", () => {
  it("returns 404 when Tenant A groomer targets Tenant B's contact", async () => {
    const res = await agent
      .put(`/api/contacts/${contactBId}`)
      .set("Authorization", `Bearer ${tokenGroomerA}`)
      .send({ name: "GROOMER-HACKED", phoneNumber: "5550000022" });

    expect(res.status).toBe(404);
  });

  it("Tenant B's contact name is unchanged after groomer's rejected update", async () => {
    const [row] = await db
      .select({ name: contacts.name })
      .from(contacts)
      .where(eq(contacts.id, contactBId));
    expect(row?.name).toBe(contactBOriginalName);
  });

  it("returns 200 when Tenant A groomer updates their own tenant's contact", async () => {
    // Create a throwaway contact in Tenant A for the groomer to update
    const throwawayId = await createTestContact(tenantAId, "Groomer Throwaway", "5559990099");
    const res = await agent
      .put(`/api/contacts/${throwawayId}`)
      .set("Authorization", `Bearer ${tokenGroomerA}`)
      .send({ name: "Groomer Updated", phoneNumber: "5559990099" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", throwawayId);

    // Cleanup
    await db.delete(contacts).where(eq(contacts.id, throwawayId));
  });
});

describe("DELETE /api/contacts/:id — groomer cross-tenant delete rejected", () => {
  it("returns 404 when Tenant A groomer targets Tenant B's contact", async () => {
    const res = await agent
      .delete(`/api/contacts/${contactBId}`)
      .set("Authorization", `Bearer ${tokenGroomerA}`);

    expect(res.status).toBe(404);
  });

  it("Tenant B's contact still exists after groomer's rejected delete", async () => {
    const [row] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, contactBId));
    expect(row).toBeDefined();
  });

  it("returns 200 when Tenant A groomer deletes their own tenant's contact", async () => {
    const throwawayId = await createTestContact(tenantAId, "Groomer Delete Throwaway", "5559998877");
    const res = await agent
      .delete(`/api/contacts/${throwawayId}`)
      .set("Authorization", `Bearer ${tokenGroomerA}`);

    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/supplies/:id — groomer cross-tenant delete rejected", () => {
  it("returns 404 when Tenant A groomer targets Tenant B's supply", async () => {
    const res = await agent
      .delete(`/api/supplies/${supplyBId}`)
      .set("Authorization", `Bearer ${tokenGroomerA}`);

    expect(res.status).toBe(404);
  });

  it("Tenant B's supply still exists after groomer's rejected delete", async () => {
    const [row] = await db
      .select({ id: supplies.id })
      .from(supplies)
      .where(eq(supplies.id, supplyBId));
    expect(row).toBeDefined();
  });

  it("returns 200 when Tenant A groomer deletes their own tenant's supply", async () => {
    const throwawayId = await createTestSupply(tenantAId, "Groomer Delete Supply");
    const res = await agent
      .delete(`/api/supplies/${throwawayId}`)
      .set("Authorization", `Bearer ${tokenGroomerA}`);

    expect(res.status).toBe(200);
  });
});

describe("PUT /api/appointments/:id — groomer cross-tenant status update rejected", () => {
  it("returns 404 when Tenant A groomer targets Tenant B's appointment", async () => {
    const res = await agent
      .put(`/api/appointments/${appointmentBId}`)
      .set("Authorization", `Bearer ${tokenGroomerA}`)
      .send({ status: "confirmed" });

    expect(res.status).toBe(404);
  });

  it("Tenant B's appointment status is unchanged after groomer's rejected update", async () => {
    const [row] = await db
      .select({ status: appointments.status })
      .from(appointments)
      .where(eq(appointments.id, appointmentBId));
    expect(row?.status).toBe(appointmentBOriginalStatus);
  });

  it("returns 200 when Tenant A groomer updates status on their own appointment (non-scheduled)", async () => {
    // Create a throwaway appointment in Tenant A that is already confirmed
    // so the groomer (non-admin) is allowed to update it
    const throwawayApptId = await createTestAppointment(tenantAId, userAId, "GroomerOwner");
    // Set it to confirmed so groomer can act on it (groomers cannot approve 'scheduled')
    await db
      .update(appointments)
      .set({ status: "confirmed" })
      .where(eq(appointments.id, throwawayApptId));

    const res = await agent
      .put(`/api/appointments/${throwawayApptId}`)
      .set("Authorization", `Bearer ${tokenGroomerA}`)
      .send({ status: "confirmed" });

    // 200 confirms the groomer can write to their own tenant's appointment
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", throwawayApptId);

    // Cleanup
    await db.delete(appointments).where(eq(appointments.id, throwawayApptId));
  });
});

// ─── Appointment sub-action routes ────────────────────────────────────────────
//
// POST   /api/appointments/:id/items
// PATCH  /api/appointments/:id/items/:itemId
// DELETE /api/appointments/:id/items/:itemId
//
// Each route now pre-fetches the appointment scoped to req.tenantId and returns
// 404 before performing any mutation when the appointment belongs to another tenant.

describe("POST /api/appointments/:id/items — cross-tenant add rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's appointment", async () => {
    const res = await agent
      .post(`/api/appointments/${appointmentBId}/items`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "HACKED-ITEM", price: "9.99" });

    expect(res.status).toBe(404);
  });

  it("returns 200 when Tenant A adds an item to their own appointment", async () => {
    const res = await agent
      .post(`/api/appointments/${appointmentAId}/items`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Own-Item", price: "5.00" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("appointmentId", appointmentAId);
  });
});

describe("PATCH /api/appointments/:id/items/:itemId — cross-tenant update rejected", () => {
  it("returns 404 when Tenant A uses Tenant B's appointment ID", async () => {
    const res = await agent
      .patch(`/api/appointments/${appointmentBId}/items/999999`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ price: "99.99" });

    expect(res.status).toBe(404);
  });

  it("returns 404 for mixed-ID attack: own appointment ID + Tenant B's item ID", async () => {
    // Tenant A uses their valid appointment ID but Tenant B's real item ID.
    // The item-appointment membership check must catch this.
    const res = await agent
      .patch(`/api/appointments/${appointmentAId}/items/${itemBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ price: "99.99" });

    expect(res.status).toBe(404);
  });

  it("Tenant B's item price is unchanged after mixed-ID attack rejection", async () => {
    const [row] = await db
      .select({ price: appointmentItems.price })
      .from(appointmentItems)
      .where(eq(appointmentItems.id, itemBId));
    expect(row?.price).toBe("7.50");
  });
});

describe("DELETE /api/appointments/:id/items/:itemId — cross-tenant delete rejected", () => {
  it("returns 404 when Tenant A uses Tenant B's appointment ID", async () => {
    const res = await agent
      .delete(`/api/appointments/${appointmentBId}/items/999999`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it("returns 404 for mixed-ID attack: own appointment ID + Tenant B's item ID", async () => {
    // Tenant A uses their valid appointment ID but Tenant B's real item ID.
    // The item-appointment membership check must catch this.
    const res = await agent
      .delete(`/api/appointments/${appointmentAId}/items/${itemBId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it("Tenant B's item still exists after mixed-ID attack rejection", async () => {
    const [row] = await db
      .select({ id: appointmentItems.id })
      .from(appointmentItems)
      .where(eq(appointmentItems.id, itemBId));
    expect(row).toBeDefined();
  });
});

// ─── Appointment reschedule / cancel sub-action routes ────────────────────────
//
// PATCH /api/user/appointments/:id/reschedule and
// PATCH /api/user/appointments/:id/cancel both call
// storage.getAppointment(id, tenantId) first, so cross-tenant IDs are rejected
// with 404 before any ownership or mutation logic runs.

describe("PATCH /api/user/appointments/:id/reschedule — cross-tenant rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's appointment", async () => {
    const res = await agent
      .patch(`/api/user/appointments/${appointmentBId}/reschedule`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ appointmentDate: "2099-11-01", appointmentTime: "10:00 AM" });

    expect(res.status).toBe(404);
  });

  it("Tenant B's appointment date is unchanged after the rejected reschedule", async () => {
    const [row] = await db
      .select({ appointmentDate: appointments.appointmentDate })
      .from(appointments)
      .where(eq(appointments.id, appointmentBId));
    expect(row?.appointmentDate).toBe("2099-12-31");
  });
});

describe("PATCH /api/user/appointments/:id/cancel — cross-tenant rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's appointment", async () => {
    const res = await agent
      .patch(`/api/user/appointments/${appointmentBId}/cancel`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it("Tenant B's appointment status is unchanged after the rejected cancel", async () => {
    const [row] = await db
      .select({ status: appointments.status })
      .from(appointments)
      .where(eq(appointments.id, appointmentBId));
    expect(row?.status).toBe(appointmentBOriginalStatus);
  });
});

// ─── PATCH /api/appointments/:id/is-here ─────────────────────────────────────

describe("PATCH /api/appointments/:id/is-here — cross-tenant write rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's appointment", async () => {
    const res = await agent
      .patch(`/api/appointments/${appointmentBId}/is-here`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ isHere: true });

    expect(res.status).toBe(404);
  });

  it("Tenant B's appointment isHere field is unchanged after Tenant A's rejected update", async () => {
    const [row] = await db
      .select({ isHere: appointments.isHere })
      .from(appointments)
      .where(eq(appointments.id, appointmentBId));
    expect(row?.isHere).not.toBe(true);
  });

  it("returns 200 when Tenant A updates isHere on their own appointment", async () => {
    const res = await agent
      .patch(`/api/appointments/${appointmentAId}/is-here`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ isHere: true });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", appointmentAId);
  });
});

// ─── PATCH /api/appointments/:id/is-paid ─────────────────────────────────────

describe("PATCH /api/appointments/:id/is-paid — cross-tenant write rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's appointment", async () => {
    const res = await agent
      .patch(`/api/appointments/${appointmentBId}/is-paid`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ isPaid: true });

    expect(res.status).toBe(404);
  });

  it("Tenant B's appointment isPaid field is unchanged after Tenant A's rejected update", async () => {
    const [row] = await db
      .select({ isPaid: appointments.isPaid })
      .from(appointments)
      .where(eq(appointments.id, appointmentBId));
    expect(row?.isPaid).not.toBe(true);
  });

  it("returns 200 when Tenant A updates isPaid on their own appointment", async () => {
    const res = await agent
      .patch(`/api/appointments/${appointmentAId}/is-paid`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ isPaid: true });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", appointmentAId);
  });
});

// ─── PATCH /api/admin/appointments/:id/ready-for-payment ──────────────────────

describe("PATCH /api/admin/appointments/:id/ready-for-payment — cross-tenant write rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's appointment", async () => {
    const res = await agent
      .patch(`/api/admin/appointments/${appointmentBId}/ready-for-payment`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ finalAmount: "40.00", readyForPayment: true });

    expect(res.status).toBe(404);
  });

  it("Tenant B's appointment readyForPayment field is unchanged after Tenant A's rejected update", async () => {
    const [row] = await db
      .select({ readyForPayment: appointments.readyForPayment })
      .from(appointments)
      .where(eq(appointments.id, appointmentBId));
    expect(row?.readyForPayment).not.toBe(true);
  });

  it("returns 200 when Tenant A marks their own appointment ready for payment", async () => {
    const res = await agent
      .patch(`/api/admin/appointments/${appointmentAId}/ready-for-payment`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ finalAmount: "40.00", readyForPayment: true });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", appointmentAId);
  });
});

// ─── PATCH /api/appointments/:id/grooming-completed ──────────────────────────

describe("PATCH /api/appointments/:id/grooming-completed — cross-tenant write rejected", () => {
  it("returns 404 when Tenant A targets Tenant B's appointment", async () => {
    const res = await agent
      .patch(`/api/appointments/${appointmentBId}/grooming-completed`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ groomingCompleted: true });

    expect(res.status).toBe(404);
  });

  it("Tenant B's appointment groomingCompleted field is unchanged after Tenant A's rejected update", async () => {
    const [row] = await db
      .select({ groomingCompleted: appointments.groomingCompleted })
      .from(appointments)
      .where(eq(appointments.id, appointmentBId));
    expect(row?.groomingCompleted).not.toBe(true);
  });

  it("returns 200 when Tenant A marks their own appointment grooming-completed", async () => {
    const res = await agent
      .patch(`/api/appointments/${appointmentAId}/grooming-completed`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ groomingCompleted: true });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", appointmentAId);
  });
});

// ─── PATCH /api/admin/appointments/:id/details — groomer cross-tenant isolation
//
// Groomers (isGroomer=true, isAdmin=false) are permitted to call this endpoint
// for their own tenant. Targeting another tenant's appointment via the :id
// parameter must be rejected with HTTP 404 before any mutation occurs,
// because the route calls storage.getAppointment(id, req.tenantId) which
// scopes the lookup to the caller's tenant.

describe("PATCH /api/admin/appointments/:id/details — groomer cross-tenant write rejected", () => {
  it("returns 404 when Tenant A groomer targets Tenant B's appointment", async () => {
    const res = await agent
      .patch(`/api/admin/appointments/${appointmentBId}/details`)
      .set("Authorization", `Bearer ${tokenGroomerA}`)
      .send({ ownerLastName: "GROOMER-HACKED" });

    expect(res.status).toBe(404);
  });

  it("Tenant B's appointment ownerLastName is unchanged after groomer's rejected update", async () => {
    const [row] = await db
      .select({ ownerLastName: appointments.ownerLastName })
      .from(appointments)
      .where(eq(appointments.id, appointmentBId));
    expect(row?.ownerLastName).toBe(appointmentBOriginalOwnerLastName);
  });

  it("returns 200 when Tenant A groomer patches their own tenant's appointment", async () => {
    // Create a throwaway appointment in Tenant A for the groomer to edit
    const throwawayApptId = await createTestAppointment(tenantAId, userAId, "GroomerPatchOwner");

    const res = await agent
      .patch(`/api/admin/appointments/${throwawayApptId}/details`)
      .set("Authorization", `Bearer ${tokenGroomerA}`)
      .send({ ownerLastName: "UpdatedByGroomer" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", throwawayApptId);

    // Cleanup
    await db.delete(appointments).where(eq(appointments.id, throwawayApptId));
  });
});
