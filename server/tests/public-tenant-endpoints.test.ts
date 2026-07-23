/**
 * Tests: Public tenant-creation endpoints are reachable without a tenant slug header
 *
 * GET /api/tenants/slug-check and POST /api/tenants/signup must succeed for
 * completely unauthenticated requests with no X-Tenant-Slug header and
 * regardless of the ALLOW_TENANT_FALLBACK environment flag.
 *
 * These routes are listed in UNAUTHENTICATED_NO_SLUG_ALLOWLIST inside
 * tenantMiddleware.ts, so tenantMiddleware calls next() without setting
 * req.tenantId and without requiring a tenant slug. This is the correct
 * production behaviour: the routes create tenants, so no pre-existing tenant
 * context can exist.
 *
 * Assertions:
 *  1. GET /api/tenants/slug-check?slug=<free> → 200, not blocked by middleware.
 *  2. GET /api/tenants/slug-check with no X-Tenant-Slug and
 *     ALLOW_TENANT_FALLBACK unset → still 200 (not 400).
 *  3. POST /api/tenants/signup with no X-Tenant-Slug and
 *     ALLOW_TENANT_FALLBACK unset → 201 (not 400 from middleware).
 *  4. Neither route requires ALLOW_TENANT_FALLBACK=true to work.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 9);
}

const createdTenantIds: number[] = [];
const createdUserIds: string[] = [];

async function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);
  return app;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;

beforeAll(async () => {
  // Explicitly ensure ALLOW_TENANT_FALLBACK is NOT set so the tests prove
  // the allowlist mechanism works independently of the fallback flag.
  delete process.env.ALLOW_TENANT_FALLBACK;

  // Advance the tenants sequence to avoid primary-key collisions with other
  // test files that also insert into the tenants table.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  // Unlink contacts before deleting users (FK constraint)
  if (createdUserIds.length > 0) {
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(inArray(contacts.linkedUserId, createdUserIds))
      .catch(() => {});
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id)).catch(() => {});
    }
  }
  for (const id of createdTenantIds) {
    await db.delete(tenants).where(eq(tenants.id, id)).catch(() => {});
  }
}, 30_000);

// ─── Tests: middleware allowlist — no slug header, no ALLOW_TENANT_FALLBACK ───

describe("GET /api/tenants/slug-check — reachable without X-Tenant-Slug", () => {
  it("returns 200 when no X-Tenant-Slug header is provided and ALLOW_TENANT_FALLBACK is unset", async () => {
    const slug = `pub-free-${randomSuffix()}`;

    // Deliberately omit X-Tenant-Slug to confirm the allowlist lets this through
    const res = await agent.get(`/api/tenants/slug-check?slug=${slug}`);

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.slug).toBe(slug);
  });

  it("returns 400 (from route handler, not middleware) when no slug query param is supplied", async () => {
    // This 400 must come from the route handler's own validation, not from
    // tenantMiddleware (which would also return 400 but for a different reason).
    // The key distinction: no X-Tenant-Slug header is sent, yet the request
    // reaches the route handler and is rejected for a missing ?slug= param.
    const res = await agent.get("/api/tenants/slug-check");

    expect(res.status).toBe(400);
    // Must NOT be the middleware's generic "Missing tenant" error
    expect(res.body.message).not.toMatch(/Missing tenant/i);
    expect(res.body.message).toMatch(/slug/i);
  });
});

describe("POST /api/tenants/signup — reachable without X-Tenant-Slug", () => {
  it("returns 201 (not 400 from middleware) when no X-Tenant-Slug header is provided", async () => {
    const sfx = randomSuffix();
    const slug = `pub-signup-${sfx}`;

    // No X-Tenant-Slug header — the middleware allowlist must pass this through
    const res = await agent.post("/api/tenants/signup").send({
      businessName: `Public Signup Test ${sfx}`,
      firstName: "Public",
      lastName: "Owner",
      email: `pub-signup-${sfx}@test.local`,
      password: "ValidP@ss1!",
      slug,
    });

    // 201 means the route handler ran; any middleware 400 would mean it was blocked
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("email");

    // Track created records for cleanup
    if (res.body.id) createdUserIds.push(res.body.id);
    if (res.body.tenantId) createdTenantIds.push(res.body.tenantId);
  });

  it("returns 400 from route validation (not middleware) when required body fields are missing", async () => {
    // Confirms the request reaches the route handler even without a slug header.
    // Missing businessName triggers the handler's own 400, not the middleware's.
    const res = await agent.post("/api/tenants/signup").send({
      firstName: "Missing",
      lastName: "BusinessName",
      email: `pub-missing-${randomSuffix()}@test.local`,
      password: "ValidP@ss1!",
    });

    expect(res.status).toBe(400);
    // Must NOT be the middleware's "Missing tenant" error
    expect(res.body.message).not.toMatch(/Missing tenant/i);
  });
});

describe("Middleware allowlist — ALLOW_TENANT_FALLBACK independence", () => {
  it("slug-check succeeds when ALLOW_TENANT_FALLBACK is explicitly set to false", async () => {
    // Temporarily set to a value that disables the fallback to confirm the
    // allowlist alone is sufficient (not the fallback env var).
    const original = process.env.ALLOW_TENANT_FALLBACK;
    process.env.ALLOW_TENANT_FALLBACK = "false";

    try {
      const slug = `pub-nofallback-${randomSuffix()}`;
      const res = await agent.get(`/api/tenants/slug-check?slug=${slug}`);
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    } finally {
      if (original === undefined) {
        delete process.env.ALLOW_TENANT_FALLBACK;
      } else {
        process.env.ALLOW_TENANT_FALLBACK = original;
      }
    }
  });
});
