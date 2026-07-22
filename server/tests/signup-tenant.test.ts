/**
 * Tests: Signup tenant assignment
 *
 * Verifies that the customer signup route cannot silently assign a new user to
 * the wrong store when the tenant context is ambiguous or absent.
 *
 * Three behaviours are covered:
 *
 *  1. X-Tenant-Slug header present — tenantMiddleware resolves the slug to the
 *     matching tenant's id, and storage.createUser stores that id on the new
 *     user record.
 *
 *  2. No tenant context at all — tenantMiddleware returns HTTP 400 and does NOT
 *     call next(), preventing any silent fallback to tenant 1.
 *     (Set ALLOW_TENANT_FALLBACK=true to restore the dev fallback.)
 *
 *  3. Unknown slug — tenantMiddleware returns HTTP 404 rather than falling
 *     through to tenant 1.
 *
 * These tests hit the real database via the same helpers used in
 * tenant-isolation.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { tenants, users } from "@shared/schema";
import { eq } from "drizzle-orm";

// ─── Shared state ─────────────────────────────────────────────────────────────

let signupTenantId: number;
let signupTenantSlug: string;
const createdUserIds: string[] = [];

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();
  signupTenantSlug = `signup-test-${sfx}`;

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `Signup Test Tenant ${sfx}`,
      slug: signupTenantSlug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  signupTenantId = tenant.id;
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
  if (signupTenantId) {
    await db.delete(tenants).where(eq(tenants.id, signupTenantId));
  }
});

// ─── tenantMiddleware unit-level checks ───────────────────────────────────────

describe("tenantMiddleware — slug resolution for signup", () => {
  it("resolves X-Tenant-Slug header to the correct tenantId", async () => {
    const { tenantMiddleware } = await import("../tenantMiddleware");

    const req: any = {
      cookies: {},
      headers: { "x-tenant-slug": signupTenantSlug },
      query: {},
    };
    // Minimal response stub — next() should be called, not res.status/json
    const res: any = { status: () => res, json: () => res };

    await new Promise<void>((resolve, reject) => {
      tenantMiddleware(req, res as any, () => resolve()).catch(reject);
    });

    expect(req.tenantId).toBe(signupTenantId);
  });

  it("returns 400 and does not call next() when no slug header or auth token is provided", async () => {
    const { tenantMiddleware } = await import("../tenantMiddleware");

    const req: any = {
      cookies: {},
      headers: {},
      query: {},
    };

    let statusCode: number | undefined;
    let nextCalled = false;
    const res: any = {
      status(code: number) { statusCode = code; return res; },
      json() { return res; },
    };

    await new Promise<void>((resolve, reject) => {
      tenantMiddleware(req, res as any, () => { nextCalled = true; resolve(); })
        .then(() => resolve())
        .catch(reject);
    });

    // Middleware must reject with 400 — no silent fallback to tenant 1
    expect(statusCode).toBe(400);
    expect(nextCalled).toBe(false);
    expect(req.tenantId).toBeUndefined();
  });

  it("returns 404 and does not call next() when an unknown slug is provided", async () => {
    const { tenantMiddleware } = await import("../tenantMiddleware");

    const req: any = {
      cookies: {},
      headers: { "x-tenant-slug": "this-slug-does-not-exist-xyz" },
      query: {},
    };

    let statusCode: number | undefined;
    let nextCalled = false;
    const res: any = {
      status(code: number) { statusCode = code; return res; },
      json() { return res; },
    };

    await new Promise<void>((resolve, reject) => {
      tenantMiddleware(req, res as any, () => { nextCalled = true; resolve(); })
        .then(() => resolve())
        .catch(reject);
    });

    // Unknown slug → 404, not a silent fall-through to tenant 1
    expect(statusCode).toBe(404);
    expect(nextCalled).toBe(false);
    expect(req.tenantId).toBeUndefined();
  });
});

// ─── End-to-end: resolved tenantId flows into storage.createUser ─────────────

describe("Signup — tenantId is stored correctly on the new user", () => {
  it("signup with explicit slug: new user receives the slug-resolved tenantId", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    // Mirrors what the signup route does after tenantMiddleware sets req.tenantId
    const newUser = await storage.createUser({
      email: `signup-slug-${sfx}@test.local`,
      password: "hashed-for-test",
      firstName: "Slug",
      lastName: "User",
      tenantId: signupTenantId,
    });
    createdUserIds.push(newUser.id);

    expect(newUser.tenantId).toBe(signupTenantId);
  });

  it("signup with no tenant context: new user receives tenantId 1 (not undefined)", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    // Simulates the ALLOW_TENANT_FALLBACK=true path or an explicit tenantId: 1
    // passed by a known-tenant signup route; verifies storage stores it correctly.
    const newUser = await storage.createUser({
      email: `signup-notenant-${sfx}@test.local`,
      password: "hashed-for-test",
      firstName: "NoTenant",
      lastName: "User",
      tenantId: 1,
    });
    createdUserIds.push(newUser.id);

    // Predictable: tenantId is exactly 1, not undefined/null
    expect(newUser.tenantId).toBe(1);
  });

  it("signup with explicit slug: new user is NOT visible under other tenants", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const newUser = await storage.createUser({
      email: `signup-isolation-${sfx}@test.local`,
      password: "hashed-for-test",
      firstName: "Isolated",
      lastName: "User",
      tenantId: signupTenantId,
    });
    createdUserIds.push(newUser.id);

    // Querying tenant 1's users must not surface a user from signupTenantId
    const tenant1Users = await db
      .select()
      .from(users)
      .where(eq(users.tenantId, 1));

    expect(tenant1Users.map((u) => u.id)).not.toContain(newUser.id);
  });

  it("signup with no tenant context: new user is scoped to tenant 1 only", async () => {
    const { storage } = await import("../storage");
    const sfx = randomSuffix();

    const newUser = await storage.createUser({
      email: `signup-tenant1-${sfx}@test.local`,
      password: "hashed-for-test",
      firstName: "T1",
      lastName: "User",
      tenantId: 1,
    });
    createdUserIds.push(newUser.id);

    // This user must NOT appear under signupTenantId
    const signupTenantUsers = await db
      .select()
      .from(users)
      .where(eq(users.tenantId, signupTenantId));

    expect(signupTenantUsers.map((u) => u.id)).not.toContain(newUser.id);
  });
});
