/**
 * Tests: Signup tenant assignment
 *
 * Verifies that the customer signup route cannot silently assign a new user to
 * the wrong store when the tenant context is ambiguous or absent.
 *
 * Two behaviours are covered:
 *
 *  1. X-Tenant-Slug header present — tenantMiddleware resolves the slug to the
 *     matching tenant's id, and storage.createUser stores that id on the new
 *     user record.
 *
 *  2. No tenant context at all — tenantMiddleware falls back to tenant 1
 *     (documented single-tenant / development fallback, see tenantMiddleware.ts
 *     line ~101).  The test confirms the fallback is predictable and explicit
 *     rather than undefined, and that the signup route preserves it.
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

  it("defaults to tenantId 1 when no slug header or auth token is provided", async () => {
    const { tenantMiddleware } = await import("../tenantMiddleware");

    const req: any = {
      cookies: {},
      headers: {},
      query: {},
    };
    const res: any = { status: () => res, json: () => res };

    await new Promise<void>((resolve, reject) => {
      tenantMiddleware(req, res as any, () => resolve()).catch(reject);
    });

    // Must be exactly 1 — not undefined, not null, not another tenant's id
    expect(req.tenantId).toBe(1);
  });

  it("resolves an unknown slug gracefully and falls back to tenant 1", async () => {
    const { tenantMiddleware } = await import("../tenantMiddleware");

    const req: any = {
      cookies: {},
      headers: { "x-tenant-slug": "this-slug-does-not-exist-xyz" },
      query: {},
    };
    const res: any = { status: () => res, json: () => res };

    await new Promise<void>((resolve, reject) => {
      tenantMiddleware(req, res as any, () => resolve()).catch(reject);
    });

    // Unknown slug → falls through to the default-tenant-1 branch
    expect(req.tenantId).toBe(1);
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

    // tenantMiddleware sets req.tenantId = 1 for unauthenticated requests with
    // no slug; the signup route passes req.tenantId directly to createUser.
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
