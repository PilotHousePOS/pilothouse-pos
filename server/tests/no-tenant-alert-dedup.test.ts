/**
 * Tests: No-tenant alert email deduplication
 *
 * The `noTenantAlertSentToday` in-memory map inside `server/routes.ts` ensures
 * that calling GET /api/auth/user for the same stranded user multiple times in
 * the same UTC day fires `sendNoTenantAlertToSuperAdmins` at most once,
 * regardless of how many times the user reloads the page.
 *
 * Covered scenarios:
 *
 *  1. Three consecutive calls for the same stranded user on the same UTC day
 *     result in exactly one email being dispatched.
 *
 *  2. A super-admin with no tenantId is exempt and never triggers the alert.
 *
 *  3. A user who gained a tenantId (resolved stranded account) no longer
 *     triggers the alert.
 *
 * Known limitation — one-per-server-restart edge case:
 *   The deduplication map is held in process memory. If the server restarts
 *   mid-day, the map is cleared and a stranded user who already received an
 *   alert that day could trigger a second email after the restart. This is
 *   accepted as a reasonable tradeoff: the alert is an operational safety net,
 *   not a billing-critical event, and the alternative (persisting seen-state to
 *   the database) would add complexity for a rarely-exercised path. A follow-up
 *   task ("Persist the stranded-account flag so alerts survive server restarts")
 *   tracks a proper fix if this becomes a real concern.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { generateToken } from "../auth";

// ── Hoisted mock state ────────────────────────────────────────────────────────
// vi.hoisted runs before vi.mock factories, so the mock fn is available inside
// the factory closure.

const { mockSendNoTenantAlert } = vi.hoisted(() => {
  return { mockSendNoTenantAlert: vi.fn(async () => {}) };
});

// Mock the entire sendgrid module so no real email is dispatched during tests.
vi.mock("../sendgrid", async (importOriginal) => {
  const original = await importOriginal<typeof import("../sendgrid")>();
  return {
    ...original,
    sendNoTenantAlertToSuperAdmins: mockSendNoTenantAlert,
  };
});

// ── Shared state ──────────────────────────────────────────────────────────────

let strandedUserId: string;
let strandedToken: string;

let superAdminUserId: string;
let superAdminToken: string;

let resolvedUserId: string;
let resolvedToken: string;

let testTenantId: number;

let agent: ReturnType<typeof supertest>;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();

  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1))`,
  );

  // Create a tenant so we can assign the "resolved" user to it
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `AlertDedupTest-${sfx}`,
      slug: `alert-dedup-test-${sfx}`,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();
  testTenantId = tenant.id;

  // Stranded user: no tenantId, not a super-admin
  const [stranded] = await db
    .insert(users)
    .values({
      id: `ad-stranded-${sfx}`,
      email: `ad-stranded-${sfx}@test.local`,
      firstName: "Dedup",
      lastName: "Test",
      password: "hashed-for-test",
      tenantId: null,
      isAdmin: false,
      isSuperAdmin: false,
      tokenVersion: 0,
    })
    .returning();
  strandedUserId = stranded.id;
  strandedToken = generateToken(stranded as any);

  // Super-admin with no tenantId — must be exempt from the alert
  const [superAdmin] = await db
    .insert(users)
    .values({
      id: `ad-superadmin-${sfx}`,
      email: `ad-superadmin-${sfx}@test.local`,
      firstName: "Super",
      lastName: "Admin",
      password: "hashed-for-test",
      tenantId: null,
      isAdmin: true,
      isSuperAdmin: true,
      tokenVersion: 0,
    })
    .returning();
  superAdminUserId = superAdmin.id;
  superAdminToken = generateToken(superAdmin as any);

  // Resolved user: starts stranded, then gets a tenantId assigned before tests run
  const [resolved] = await db
    .insert(users)
    .values({
      id: `ad-resolved-${sfx}`,
      email: `ad-resolved-${sfx}@test.local`,
      firstName: "Resolved",
      lastName: "User",
      password: "hashed-for-test",
      tenantId: testTenantId,   // already has a tenant — not stranded
      isAdmin: false,
      isSuperAdmin: false,
      tokenVersion: 0,
    })
    .returning();
  resolvedUserId = resolved.id;
  resolvedToken = generateToken(resolved as any);

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (strandedUserId)
    await db.delete(users).where(eq(users.id, strandedUserId));
  if (superAdminUserId)
    await db.delete(users).where(eq(users.id, superAdminUserId));
  if (resolvedUserId)
    await db.delete(users).where(eq(users.id, resolvedUserId));
  if (testTenantId)
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
}, 30_000);

// ── 1. Deduplication: three calls → one email ─────────────────────────────────

describe("GET /api/auth/user — no-tenant alert fires at most once per day per user", () => {
  it("first call for a stranded user sends exactly one alert email", async () => {
    mockSendNoTenantAlert.mockClear();

    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${strandedToken}`);

    expect(res.status).toBe(200);
    // Fire-and-forget: give the async task a tick to register
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendNoTenantAlert).toHaveBeenCalledTimes(1);
  });

  it("second call for the same stranded user on the same day does NOT send another email", async () => {
    mockSendNoTenantAlert.mockClear();

    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${strandedToken}`);

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    // The deduplication map already holds today's date for this user
    expect(mockSendNoTenantAlert).toHaveBeenCalledTimes(0);
  });

  it("third call for the same stranded user still does NOT send another email", async () => {
    mockSendNoTenantAlert.mockClear();

    await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${strandedToken}`);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendNoTenantAlert).toHaveBeenCalledTimes(0);
  });

  it("alert email includes the correct user id", async () => {
    // Re-read the first call's argument by replaying with a fresh user not yet
    // in the map. We verify field shape here via the earlier first-call invocation.
    // Reset and use a fresh token for a second stranded user to check the payload.
    const sfx2 = Math.random().toString(36).slice(2, 9);
    const [secondStranded] = await db
      .insert(users)
      .values({
        id: `ad-second-${sfx2}`,
        email: `ad-second-${sfx2}@test.local`,
        firstName: "Second",
        lastName: "Stranded",
        password: "hashed-for-test",
        tenantId: null,
        isAdmin: false,
        isSuperAdmin: false,
        tokenVersion: 0,
      })
      .returning();

    const secondToken = generateToken(secondStranded as any);
    mockSendNoTenantAlert.mockClear();

    await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${secondToken}`);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendNoTenantAlert).toHaveBeenCalledTimes(1);

    const [calledWith] = mockSendNoTenantAlert.mock.calls[0];
    expect(calledWith).toMatchObject({
      id: secondStranded.id,
      email: secondStranded.email,
      firstName: "Second",
      lastName: "Stranded",
    });

    // Cleanup
    await db.delete(users).where(eq(users.id, secondStranded.id));
  });
});

// ── 2. Super-admin exemption ───────────────────────────────────────────────────

describe("GET /api/auth/user — super-admin is exempt from the no-tenant alert", () => {
  it("calling the endpoint as a super-admin with no tenantId never sends an alert", async () => {
    mockSendNoTenantAlert.mockClear();

    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendNoTenantAlert).not.toHaveBeenCalled();
  });
});

// ── 3. Resolved account — no alert after tenantId is assigned ─────────────────

describe("GET /api/auth/user — resolved account (has tenantId) never sends an alert", () => {
  it("a user who already has a tenantId does not trigger the no-tenant alert", async () => {
    mockSendNoTenantAlert.mockClear();

    const res = await agent
      .get("/api/auth/user")
      .set("Authorization", `Bearer ${resolvedToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(testTenantId);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendNoTenantAlert).not.toHaveBeenCalled();
  });
});
