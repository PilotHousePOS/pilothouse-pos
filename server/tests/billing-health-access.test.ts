/**
 * HTTP-level integration tests: GET /api/billing/health — auth & access control
 *
 * Spins up the real Express app (via registerRoutes) and confirms that the
 * authMiddleware + super-admin guard layers apply correctly before any Stripe
 * calls are made.
 *
 * Covered scenarios:
 *   1. Unauthenticated request → 401 (authMiddleware rejects before route handler)
 *   2. Regular tenant admin (isSuperAdmin: false) → 403 (route guard rejects)
 *
 * No real Stripe calls are attempted — the guard fires before the endpoint
 * reaches stripe.accounts.retrieve(), so even with a bad/missing key the
 * status codes are deterministic.
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

let tenantId: number;
let adminUserId: string;

/** JWT for a regular admin (isAdmin=true, isSuperAdmin=false/null) */
let tokenRegularAdmin: string;

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

  // Advance sequence to avoid collisions with parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  // Create a tenant and a regular admin user (not a super-admin).
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `BillingHealthAccess-${sfx}`,
      slug: `bha-${sfx}`,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  tenantId = tenant.id;

  const userId = `bha-test-${sfx}`;
  const [user] = await db
    .insert(users)
    .values({
      id: userId,
      email: `bha-${sfx}@test.local`,
      firstName: "BHA",
      lastName: "Test",
      tenantId,
      password: "hashed-password-for-test",
      isAdmin: true,
      isSuperAdmin: false,
      tokenVersion: 0,
    })
    .returning();

  adminUserId = user.id;

  // generateToken reads the user row directly — use the returned row so
  // tokenVersion in the JWT matches the DB value.
  tokenRegularAdmin = generateToken(user as any);

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
  if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/billing/health — unauthenticated request", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const res = await agent.get("/api/billing/health");

    expect(res.status).toBe(401);
  });

  it("returns 401 when an empty Bearer token is sent", async () => {
    const res = await agent
      .get("/api/billing/health")
      .set("Authorization", "Bearer ");

    expect(res.status).toBe(401);
  });

  it("returns 401 when a clearly invalid token is sent", async () => {
    const res = await agent
      .get("/api/billing/health")
      .set("Authorization", "Bearer not-a-real-jwt");

    expect(res.status).toBe(401);
  });
});

describe("GET /api/billing/health — non-super-admin request", () => {
  it("returns 403 when a regular tenant admin sends a valid JWT", async () => {
    const res = await agent
      .get("/api/billing/health")
      .set("Authorization", `Bearer ${tokenRegularAdmin}`);

    expect(res.status).toBe(403);
  });

  it("returns a message referencing super-admin access", async () => {
    const res = await agent
      .get("/api/billing/health")
      .set("Authorization", `Bearer ${tokenRegularAdmin}`);

    expect(res.body.message).toMatch(/super-admin/i);
  });

  it("does not expose any Stripe account or price data in the 403 response", async () => {
    const res = await agent
      .get("/api/billing/health")
      .set("Authorization", `Bearer ${tokenRegularAdmin}`);

    expect(res.body).not.toHaveProperty("stripeAccountId");
    expect(res.body).not.toHaveProperty("prices");
    expect(res.body).not.toHaveProperty("ok");
  });
});
