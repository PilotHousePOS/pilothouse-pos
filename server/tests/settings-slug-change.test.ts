/**
 * Tests: Store URL (slug) change in settings
 *
 * Covers the PATCH /api/tenants/current route's slug-uniqueness enforcement
 * and the frontend contract in client/src/pages/settings.tsx.
 *
 * Assertions:
 *  1. PATCH with a slug already owned by another tenant → 400 with a clear
 *     human-readable error message ("already taken").
 *  2. PATCH with the tenant's own current slug → allowed (no false conflict).
 *     The route treats "same as mine" as a no-op update and returns 200.
 *  3. PATCH with a genuinely available new slug → 200 with the updated slug.
 *  4. Unauthenticated PATCH → 401 (no auth token provided).
 *  5. Non-admin PATCH → 403 (staff user, not admin).
 *
 * Frontend contract (verified by code inspection of client/src/pages/settings.tsx):
 *  - The "Update Store URL" button is disabled when slugStatus?.available === false
 *    (lines ~994–1001): the disabled prop includes `slugStatus?.available === false`.
 *  - handleUpdateSlug() (line ~675) early-returns when slugStatus is falsy-available,
 *    providing a second client-side guard that prevents the PATCH from being sent.
 *  - When slugStatus.available is false the field shows an XCircle icon and the
 *    message "This URL is already taken." (lines ~955–971).
 *  - Suggestion chips are rendered in a flex-wrap container (lines ~973–987)
 *    when slugStatus.suggestions.length > 0; clicking a chip calls handleSlugChange(s)
 *    which re-triggers the debounced slug-check with the suggested value.
 *  - When the slug field value equals currentTenant.slug the debounce handler
 *    skips the API call (line ~652) and the save button is disabled (line ~997),
 *    preventing a pointless PATCH.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { generateToken } from "../auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 9);
}

// Track records created during tests for cleanup
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

async function createTestTenant(name: string, slug: string): Promise<number> {
  const result = await db.execute(
    sql`INSERT INTO tenants (name, slug, subscription_status, subscription_tier)
        VALUES (${name}, ${slug}, 'active', 'starter')
        RETURNING id`,
  );
  const id = (result.rows[0] as { id: number }).id;
  createdTenantIds.push(id);
  return id;
}

async function createTestAdminUser(
  tenantId: number,
  email: string,
  isAdmin = true,
): Promise<string> {
  const id = "slug-test-" + randomSuffix();
  const [user] = await db
    .insert(users)
    .values({
      id,
      email,
      firstName: "Slug",
      lastName: "Tester",
      tenantId,
      password: "hashed-password-for-test",
      isAdmin,
      tokenVersion: 0,
    })
    .returning();
  createdUserIds.push(user.id);
  return user.id;
}

async function getDbUser(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;

/** Tenant A — the acting tenant whose slug we want to change */
let tenantAId: number;
let tenantASlug: string;
let tokenA: string;

/** Tenant B — a bystander whose slug is "taken" */
let tenantBId: number;
let tenantBSlug: string;

/** Staff user belonging to Tenant A (non-admin) */
let staffUserId: string;
let tokenStaff: string;

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();

  // Advance the sequence to avoid PK collisions with parallel test files
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  tenantASlug = `slug-a-${sfx}`;
  tenantBSlug = `slug-b-${sfx}`;

  tenantAId = await createTestTenant(`Slug-Tenant-A-${sfx}`, tenantASlug);
  tenantBId = await createTestTenant(`Slug-Tenant-B-${sfx}`, tenantBSlug);

  const adminUserId = await createTestAdminUser(
    tenantAId,
    `slug-admin-${sfx}@test.local`,
    true,
  );
  staffUserId = await createTestAdminUser(
    tenantAId,
    `slug-staff-${sfx}@test.local`,
    false,
  );

  const dbAdmin = await getDbUser(adminUserId);
  tokenA = generateToken(dbAdmin as any);

  const dbStaff = await getDbUser(staffUserId);
  tokenStaff = generateToken(dbStaff as any);

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

// ─── PATCH /api/tenants/current — duplicate slug rejection ────────────────────

describe("PATCH /api/tenants/current — slug already taken by another tenant", () => {
  it("returns 400 when the requested slug is owned by a different tenant", async () => {
    const res = await agent
      .patch("/api/tenants/current")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlug)
      .send({ slug: tenantBSlug });

    expect(res.status).toBe(400);
  });

  it("400 response includes a human-readable 'taken' message", async () => {
    const res = await agent
      .patch("/api/tenants/current")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlug)
      .send({ slug: tenantBSlug });

    expect(res.status).toBe(400);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.toLowerCase()).toMatch(/taken|already|use/);
  });

  it("Tenant B's slug is unchanged after the rejected PATCH", async () => {
    const [row] = await db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, tenantBId));
    expect(row?.slug).toBe(tenantBSlug);
  });
});

// ─── PATCH /api/tenants/current — own slug is allowed (no false conflict) ─────

describe("PATCH /api/tenants/current — slug identical to own current slug", () => {
  it("returns 200 when patching with the tenant's own current slug", async () => {
    const res = await agent
      .patch("/api/tenants/current")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlug)
      .send({ slug: tenantASlug });

    expect(res.status).toBe(200);
  });

  it("response body contains the slug unchanged", async () => {
    const res = await agent
      .patch("/api/tenants/current")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlug)
      .send({ slug: tenantASlug });

    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(tenantASlug);
  });
});

// ─── PATCH /api/tenants/current — successful slug change ─────────────────────

describe("PATCH /api/tenants/current — successful slug change", () => {
  it("returns 200 and the updated slug when a free slug is supplied", async () => {
    const sfx = randomSuffix();
    const newSlug = `slug-new-${sfx}`;

    const res = await agent
      .patch("/api/tenants/current")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", tenantASlug)
      .send({ slug: newSlug });

    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(newSlug);

    // Restore the original slug so later tests are not affected
    await agent
      .patch("/api/tenants/current")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", newSlug)
      .send({ slug: tenantASlug });
  });
});

// ─── PATCH /api/tenants/current — auth / permission guards ───────────────────

describe("PATCH /api/tenants/current — auth and permission guards", () => {
  it("returns 401 when no auth token is supplied", async () => {
    const res = await agent
      .patch("/api/tenants/current")
      .set("X-Tenant-Slug", tenantASlug)
      .send({ slug: "any-slug" });

    expect(res.status).toBe(401);
  });

  it("returns 403 when a non-admin staff user attempts the update", async () => {
    const sfx = randomSuffix();
    const res = await agent
      .patch("/api/tenants/current")
      .set("Authorization", `Bearer ${tokenStaff}`)
      .set("X-Tenant-Slug", tenantASlug)
      .send({ slug: `slug-staff-${sfx}` });

    expect(res.status).toBe(403);
  });
});

// ─── Frontend contract assertions (code-level) ────────────────────────────────
//
// The following behaviours are verified by code inspection of
// client/src/pages/settings.tsx and do not require a DOM environment:
//
// 1. Save button disabled when slug is taken (lines ~994–1001):
//    disabled={... || slugStatus?.available === false || slugStatus === null}
//    → The button cannot be clicked while slugStatus.available is false.
//
// 2. handleUpdateSlug() guard (line ~675):
//    if (slugStatus && !slugStatus.available) return;
//    → Even if the button were somehow clicked, the handler bails out before
//    calling updateSlugMutation.mutate(), so no PATCH is ever sent.
//
// 3. "Taken" visual feedback (lines ~955–988):
//    - XCircle icon appears in the input's right adornment.
//    - "This URL is already taken." text shown below the input.
//    - Suggestion chips are rendered in a flex-wrap row when
//      slugStatus.suggestions.length > 0.
//
// 4. Clicking a suggestion chip (line ~980):
//    onClick={() => handleSlugChange(s)}
//    → Resets slugStatus to null, re-runs the debounced slug-check, and once
//    the check resolves available:true the save button is re-enabled.
//
// 5. Own-slug guard in the debounce handler (line ~652):
//    if (!sanitized || sanitized === currentTenant?.slug) { setIsCheckingSlug(false); return; }
//    → When the field value matches the current slug, the API call is skipped
//    entirely and the save button stays disabled (slugStatus remains null),
//    matching the "no-op" server behaviour verified above.
