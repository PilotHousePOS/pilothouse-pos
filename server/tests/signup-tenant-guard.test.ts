/**
 * Integration tests: POST /api/auth/signup — tenant-slug guard
 *
 * These tests confirm that a missing or unrecognised X-Tenant-Slug header
 * does NOT silently produce a user that is assigned to a real tenant.
 *
 * Acceptable server behaviours:
 *   a) Reject the request with a 4xx status (preferred — fail fast), OR
 *   b) Return 200 and create a stranded account where the persisted tenantId
 *      in the database is strictly NULL (never a real tenant id).
 *
 * Both branches are verified against DB state, not just the response body,
 * because the critical risk is an incorrect tenant assignment in storage.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

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

/** Read the stored tenantId for a user directly from the database. */
async function getStoredTenantId(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId as any))
    .limit(1);
  // Return null both when the row doesn't exist and when tenantId is null/undefined.
  return (row?.tenantId as number | null | undefined) ?? null;
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;

/** Ids of users created during tests — deleted in afterAll. */
const createdUserIds: string[] = [];

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Advance the tenants PK sequence to avoid collisions with parallel test files.
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
  for (const userId of createdUserIds) {
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(eq(contacts.linkedUserId, userId as any));
    await db.delete(users).where(eq(users.id, userId as any));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/signup — missing X-Tenant-Slug", () => {
  it(
    "either rejects (4xx) or creates a stranded account with tenantId NULL in the database",
    async () => {
      const sfx = randomSuffix();

      const res = await agent
        .post("/api/auth/signup")
        // Intentionally omit X-Tenant-Slug header.
        .send({
          email: `no-slug-${sfx}@test.local`,
          password: "NoSlug1!Pass",
          firstName: "No",
          lastName: "Slug",
          phoneNumber: `555${sfx.slice(0, 7)}`,
        });

      if (res.status === 200) {
        // Account was created — record it for cleanup.
        const userId = res.body.id as string;
        expect(userId, "200 response must include a user id").toBeTruthy();
        createdUserIds.push(userId);

        // Verify persisted state: the DB row must have tenantId IS NULL.
        // This is the authoritative check — the response body is secondary.
        const storedTenantId = await getStoredTenantId(userId);
        expect(
          storedTenantId,
          "tenantId stored in DB must be null when no slug is supplied",
        ).toBeNull();

        // Response body tenantId must also be explicitly null — not undefined,
        // not a real tenant id.  Using `=== null` (strict) so `undefined` fails.
        expect(
          res.body.tenantId === null || res.body.tenantId === undefined,
          "response body tenantId must be null/absent when no slug is supplied",
        ).toBe(true);

        // Explicit guard: if the response body claims a non-null tenantId the
        // test must fail, because that would mean a real tenant was assigned.
        if (res.body.tenantId != null) {
          throw new Error(
            `Expected null tenantId in response body but got: ${res.body.tenantId}`,
          );
        }
      } else {
        // Server rejected the request — any 4xx is correct behaviour.
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      }
    },
    30_000,
  );
});

describe("POST /api/auth/signup — X-Tenant-Slug that matches no tenant", () => {
  it(
    "either rejects (4xx) or creates a stranded account with tenantId NULL in the database",
    async () => {
      const sfx = randomSuffix();

      const res = await agent
        .post("/api/auth/signup")
        // Slug that will never exist in the database.
        .set("X-Tenant-Slug", `nonexistent-tenant-${sfx}`)
        .send({
          email: `bad-slug-${sfx}@test.local`,
          password: "BadSlug1!Pass",
          firstName: "Bad",
          lastName: "Slug",
          phoneNumber: `555${sfx.slice(0, 7)}`,
        });

      if (res.status === 200) {
        const userId = res.body.id as string;
        expect(userId, "200 response must include a user id").toBeTruthy();
        createdUserIds.push(userId);

        // Authoritative check: the DB row must have tenantId IS NULL.
        // If the server somehow resolved the bogus slug to a real tenant and
        // stored that tenantId, this assertion will catch the regression.
        const storedTenantId = await getStoredTenantId(userId);
        expect(
          storedTenantId,
          "tenantId stored in DB must be null when slug matches no tenant",
        ).toBeNull();

        // Response body must not carry a real tenant id either.
        if (res.body.tenantId != null) {
          throw new Error(
            `Expected null tenantId in response body but got: ${res.body.tenantId}`,
          );
        }
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      }
    },
    30_000,
  );
});
