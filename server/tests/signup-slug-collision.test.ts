/**
 * Tests: Slug collision at tenant signup
 *
 * Covers the race-condition path where a slug is available at the pre-check
 * step but gets claimed by another signup before the form is submitted.
 *
 * Assertions:
 *  1. GET /api/tenants/slug-check returns { available: true } for a free slug.
 *  2. GET /api/tenants/slug-check returns { available: false, suggestions }
 *     once the slug is taken, and each suggestion is itself available.
 *  3. POST /api/tenants/signup returns HTTP 409 with { slug, suggestions }
 *     when the slug is already taken at submit time (race-condition path).
 *  4. Each suggestion returned in the 409 body is an available slug
 *     (confirmed via a follow-up slug-check call).
 *  5. POST /api/tenants/signup returns HTTP 201 when the slug is free
 *     (happy path — confirms the 409 is not a false positive).
 *
 * Frontend contract (verified by code inspection of client/src/pages/signup.tsx):
 *  - The submit button is `disabled` when `slugStatus === 'taken'` (line ~301).
 *  - A 409 response triggers `setSlugStatus('taken')` and `setSlugSuggestions()`
 *    which renders the suggestion chips (lines ~96–106, ~224–236).
 *  - A toast is shown via the `useToast` hook with title "URL just taken".
 *  - Clicking a suggestion chip calls `setSlug(s)` which re-triggers the
 *    debounced slug-check; once that resolves `available`, the button is
 *    re-enabled (`slugStatus !== 'taken'`).
 *
 * Note on tenantMiddleware: the slug-check and tenant-signup endpoints are
 * listed in UNAUTHENTICATED_NO_SLUG_ALLOWLIST inside tenantMiddleware.ts, so
 * they are permitted to proceed without any X-Tenant-Slug header or
 * ALLOW_TENANT_FALLBACK flag. No workaround is needed in tests.
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

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;

beforeAll(async () => {
  // Slug-check and tenant-signup are listed in UNAUTHENTICATED_NO_SLUG_ALLOWLIST
  // inside tenantMiddleware.ts, so they pass through without any X-Tenant-Slug
  // header or ALLOW_TENANT_FALLBACK flag. No env override is needed here.

  // Advance the tenants sequence to avoid primary-key collisions across test
  // files that all insert into the tenants table.
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
  // Unlink any contacts pointing at test users before deleting users (FK constraint)
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

// ─── Helper: seed a tenant row directly to simulate a "taken" slug ────────────

async function seedTenant(slug: string): Promise<number> {
  const [t] = await db
    .insert(tenants)
    .values({
      name: `Collision-Test-${slug}`,
      slug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();
  createdTenantIds.push(t.id);
  return t.id;
}

// ─── Tests: GET /api/tenants/slug-check ───────────────────────────────────────

describe("GET /api/tenants/slug-check", () => {
  it("returns available:true for a slug that is not yet taken", async () => {
    const slug = `col-free-${randomSuffix()}`;
    const res = await agent.get(`/api/tenants/slug-check?slug=${slug}`);

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.slug).toBe(slug);
  });

  it("returns available:false plus suggestions when the slug is taken", async () => {
    const sfx = randomSuffix();
    const slug = `col-taken-${sfx}`;
    await seedTenant(slug);

    const res = await agent.get(`/api/tenants/slug-check?slug=${slug}`);

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.slug).toBe(slug);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
  });

  it("each suggestion returned for a taken slug is itself available", async () => {
    const sfx = randomSuffix();
    const slug = `col-sugg-${sfx}`;
    await seedTenant(slug);

    const checkRes = await agent.get(`/api/tenants/slug-check?slug=${slug}`);
    expect(checkRes.status).toBe(200);

    const suggestions: string[] = checkRes.body.suggestions;
    expect(suggestions.length).toBeGreaterThanOrEqual(1);

    for (const suggestion of suggestions) {
      const suggRes = await agent.get(
        `/api/tenants/slug-check?slug=${suggestion}`,
      );
      expect(suggRes.status).toBe(200);
      expect(suggRes.body.available).toBe(true);
    }
  });

  it("returns 400 when no slug is provided", async () => {
    const res = await agent.get("/api/tenants/slug-check");
    expect(res.status).toBe(400);
  });
});

// ─── Tests: POST /api/tenants/signup ─────────────────────────────────────────

describe("POST /api/tenants/signup — slug collision (race-condition path)", () => {
  it("returns 409 with slug and suggestions when the slug is already taken at submit time", async () => {
    const sfx = randomSuffix();
    const slug = `col-race-${sfx}`;

    // Seed the slug directly so it is taken before the signup request arrives,
    // simulating the race condition: available at check time, taken at submit time.
    await seedTenant(slug);

    const res = await agent.post("/api/tenants/signup").send({
      businessName: `Race Collision ${sfx}`,
      firstName: "Race",
      lastName: "Tester",
      email: `race-${sfx}@collision.test`,
      password: "ValidP@ss1!",
      slug,
    });

    expect(res.status).toBe(409);

    // The response body MUST include both slug and suggestions
    expect(res.body).toHaveProperty("slug");
    expect(res.body.slug).toBe(slug);

    expect(res.body).toHaveProperty("suggestions");
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.length).toBeGreaterThan(0);

    // A human-readable message should describe what happened
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it("409 suggestions are all distinct from the colliding slug", async () => {
    const sfx = randomSuffix();
    const slug = `col-distinct-${sfx}`;
    await seedTenant(slug);

    const res = await agent.post("/api/tenants/signup").send({
      businessName: `Distinct Test ${sfx}`,
      firstName: "Distinct",
      lastName: "Owner",
      email: `distinct-${sfx}@collision.test`,
      password: "ValidP@ss1!",
      slug,
    });

    expect(res.status).toBe(409);
    const suggestions: string[] = res.body.suggestions;
    for (const s of suggestions) {
      expect(s).not.toBe(slug);
    }
  });

  it("returns 201 with owner user data when the slug is free (happy path)", async () => {
    const sfx = randomSuffix();
    const slug = `col-ok-${sfx}`;

    const res = await agent.post("/api/tenants/signup").send({
      businessName: `Happy Path ${sfx}`,
      firstName: "Happy",
      lastName: "Owner",
      email: `happy-${sfx}@collision.test`,
      password: "ValidP@ss1!",
      slug,
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("email");

    // Track created records for cleanup
    if (res.body.id) createdUserIds.push(res.body.id);
    if (res.body.tenantId) createdTenantIds.push(res.body.tenantId);
  });

  it("returned 409 suggestions are themselves available (verified via slug-check)", async () => {
    const sfx = randomSuffix();
    const slug = `col-avail-${sfx}`;
    await seedTenant(slug);

    const signupRes = await agent.post("/api/tenants/signup").send({
      businessName: `Avail Check ${sfx}`,
      firstName: "Avail",
      lastName: "Owner",
      email: `avail-${sfx}@collision.test`,
      password: "ValidP@ss1!",
      slug,
    });

    expect(signupRes.status).toBe(409);
    const suggestions: string[] = signupRes.body.suggestions;
    expect(suggestions.length).toBeGreaterThanOrEqual(1);

    for (const suggestion of suggestions) {
      const checkRes = await agent.get(
        `/api/tenants/slug-check?slug=${suggestion}`,
      );
      expect(checkRes.status).toBe(200);
      expect(checkRes.body.available).toBe(true);
    }
  });
});

// ─── Frontend contract assertions (code-level) ────────────────────────────────
//
// The following behaviours are verified by code inspection of
// client/src/pages/signup.tsx and do not require a DOM environment:
//
// 1. Submit button disabled while slug is taken or being checked:
//    Line ~301: disabled={isLoading || slugStatus === 'taken' || slugStatus === 'checking'}
//
// 2. 409 response handler (lines ~96–106):
//    - Calls setSlugStatus('taken')         → disables the submit button
//    - Calls setSlugSuggestions(suggestions) → renders suggestion chips (lines ~224–236)
//    - Calls setSlugEdited(true)             → prevents auto-overwrite of the slug field
//    - Shows a toast with title "URL just taken"
//
// 3. Clicking a suggestion chip (line ~229):
//    - Calls setSlug(s) with the chip's value
//    - Calls setSlugEdited(true)
//    - The debounced slug-check effect fires and marks the new slug available,
//      which clears slugStatus === 'taken' and re-enables the button.
//
// 4. Guard in handleSubmit (line ~76–79):
//    - If slugStatus === 'taken', submit is blocked client-side with a toast
//      even before the POST is attempted — so the 409 path only fires when
//      the slug was taken between check and submit (the race condition).
