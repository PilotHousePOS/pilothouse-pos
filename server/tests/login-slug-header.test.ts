/**
 * HTTP-level tests: POST /api/auth/login — X-Tenant-Slug header behaviour
 *
 * Unlike signup, login resolves tenant context from the user's stored record
 * (set at signup time), NOT from the X-Tenant-Slug header.  These tests
 * confirm that:
 *
 *  1. Login without X-Tenant-Slug succeeds and the returned user is scoped
 *     to the tenant they signed up under (header absence is safe).
 *  2. Login WITH X-Tenant-Slug still succeeds and the session is still
 *     scoped to the stored tenantId — the slug is intentionally ignored.
 *  3. Login with a slug that refers to a DIFFERENT store still succeeds and
 *     returns the user's real tenantId (the slug cannot hijack the session).
 *
 * This documents the intentional design decision so future engineers don't
 * add slug resolution to the login route thinking it is "missing".
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { hashPassword } from "../passwordUtils";

// ─── Shared state ─────────────────────────────────────────────────────────────

let tenantA: { id: number; slug: string };
let tenantB: { id: number; slug: string };
let testUserEmail: string;
let testUserId: string;
let agent: ReturnType<typeof supertest>;

const TEST_PASSWORD = "LoginSlug1!";

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
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

  // Advance sequence to avoid collisions with parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  // Create two tenants so we can confirm the slug of the "wrong" store cannot
  // override the user's stored tenantId.
  const [tA] = await db
    .insert(tenants)
    .values({
      name: `LoginSlug TenantA ${sfx}`,
      slug: `login-slug-a-${sfx}`,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  const [tB] = await db
    .insert(tenants)
    .values({
      name: `LoginSlug TenantB ${sfx}`,
      slug: `login-slug-b-${sfx}`,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  tenantA = { id: tA.id, slug: tA.slug! };
  tenantB = { id: tB.id, slug: tB.slug! };

  // Insert a pre-verified test user scoped to tenantA directly in the DB so
  // we bypass signup's X-Tenant-Slug requirement and control the tenantId.
  testUserEmail = `login-slug-${sfx}@test.local`;
  const hashed = await hashPassword(TEST_PASSWORD);

  const [inserted] = await db
    .insert(users)
    .values({
      id: `login-slug-test-${sfx}`,
      email: testUserEmail,
      password: hashed,
      firstName: "Login",
      lastName: "SlugTest",
      phoneNumber: `555${sfx.slice(0, 7)}`,
      tenantId: tenantA.id,
      isAdmin: false,
      emailVerified: true,
      tokenVersion: 0,
    } as any)
    .returning({ id: users.id });

  testUserId = inserted.id as string;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (testUserId) {
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(eq(contacts.linkedUserId, testUserId as any));
    await db.delete(users).where(eq(users.id, testUserId as any));
  }
  if (tenantA?.id) {
    await db.delete(tenants).where(eq(tenants.id, tenantA.id));
  }
  if (tenantB?.id) {
    await db.delete(tenants).where(eq(tenants.id, tenantB.id));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login — X-Tenant-Slug header behaviour", () => {
  it("succeeds without X-Tenant-Slug and returns user scoped to their stored tenantId", async () => {
    const res = await agent
      .post("/api/auth/login")
      // No X-Tenant-Slug header — mirrors a frontend that doesn't send it.
      .send({ email: testUserEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    // The response carries the user's stored tenantId, not a slug-derived one.
    expect(res.body.tenantId).toBe(tenantA.id);
  });

  it("succeeds WITH X-Tenant-Slug (matching tenant) and still returns stored tenantId", async () => {
    const res = await agent
      .post("/api/auth/login")
      .set("X-Tenant-Slug", tenantA.slug)
      .send({ email: testUserEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    // Even when the slug matches, tenant is resolved from the stored record.
    expect(res.body.tenantId).toBe(tenantA.id);
  });

  it("succeeds WITH X-Tenant-Slug (different tenant) and still returns stored tenantId — slug cannot hijack the session", async () => {
    // Send tenantB's slug even though the user belongs to tenantA.
    const res = await agent
      .post("/api/auth/login")
      .set("X-Tenant-Slug", tenantB.slug)
      .send({ email: testUserEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    // The slug of a different store must NOT override the user's real tenantId.
    expect(res.body.tenantId).toBe(tenantA.id);
    expect(res.body.tenantId).not.toBe(tenantB.id);
  });
});

// ─── Full sign-up → cross-slug login flow ────────────────────────────────────

/**
 * This describe block covers the end-to-end scenario described in the task:
 *   1. A customer signs up through the real signup endpoint under tenant A
 *      (sending X-Tenant-Slug: tenantA.slug, just as the browser would when
 *       the URL contains ?tenant=<store-a-slug>).
 *   2. Later the same customer visits /auth?tenant=<store-b-slug> and logs in
 *      — the login request carries X-Tenant-Slug: tenantB.slug.
 *   3. The session must still be scoped to tenant A (the stored tenantId wins).
 *
 * Client-side redirect:
 *   After a successful login, auth.tsx calls `window.location.replace('/')`.
 *   The destination is the literal string '/' — it is not derived from the
 *   X-Tenant-Slug header or from the ?tenant= query param that is currently in
 *   the URL.  This means a customer who landed on /auth?tenant=store-b and
 *   logged in will be sent to '/', NOT to any store-B-specific page.
 *   That invariant is captured in the test below by asserting that the server
 *   response carries no tenant-B identity, and is documented here so future
 *   changes to the redirect logic are made consciously.
 */
describe("Full signup-under-A → login-with-B-slug flow", () => {
  let signupUserEmail: string;
  let signupUserId: string | undefined;

  const SIGNUP_PASSWORD = "SignupSlug1!";

  beforeAll(async () => {
    const sfx = randomSuffix();
    signupUserEmail = `full-flow-${sfx}@test.local`;

    // Step 1 — sign up via the real signup API endpoint, sending tenant A's slug
    // as the X-Tenant-Slug header (the same header the browser sends when the
    // URL contains ?tenant=<store-a-slug>).
    const signupRes = await agent
      .post("/api/auth/signup")
      .set("X-Tenant-Slug", tenantA.slug)
      .send({
        email: signupUserEmail,
        password: SIGNUP_PASSWORD,
        firstName: "Full",
        lastName: "FlowTest",
        phoneNumber: `555${sfx.slice(0, 7)}`,
      });

    // Signup should succeed (200 with requiresVerification flag — email is not
    // yet verified but the account is created).
    if (signupRes.status !== 200) {
      throw new Error(
        `Signup in beforeAll failed: ${signupRes.status} ${JSON.stringify(signupRes.body)}`
      );
    }

    signupUserId = signupRes.body.id as string;

    // Step 2 — manually verify the email directly in the database so the login
    // attempt below is not blocked by the "unverified email" guard.  In production
    // the user would click the verification link in their inbox; here we shortcut
    // that step because we only care about the tenant-isolation behaviour.
    await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, signupUserId as any));
  }, 60_000);

  afterAll(async () => {
    if (signupUserId) {
      await db
        .update(contacts)
        .set({ linkedUserId: null })
        .where(eq(contacts.linkedUserId, signupUserId as any));
      await db.delete(users).where(eq(users.id, signupUserId as any));
    }
  }, 30_000);

  it("login with tenant B's slug header returns tenant A's id — the stored tenantId wins", async () => {
    // Step 3 — log in while sending tenant B's slug (simulating a customer who
    // navigated to /auth?tenant=<store-b-slug>).
    const res = await agent
      .post("/api/auth/login")
      .set("X-Tenant-Slug", tenantB.slug)
      .send({ email: signupUserEmail, password: SIGNUP_PASSWORD });

    expect(res.status).toBe(200);

    // The tenantId in the response must be tenant A's — the store where the
    // user signed up.  Tenant B's slug in the header must have no effect.
    expect(res.body.tenantId).toBe(tenantA.id);
    expect(res.body.tenantId).not.toBe(tenantB.id);
  });

  it("login response contains no information that would redirect the client to a tenant-B page", async () => {
    const res = await agent
      .post("/api/auth/login")
      .set("X-Tenant-Slug", tenantB.slug)
      .send({ email: signupUserEmail, password: SIGNUP_PASSWORD });

    expect(res.status).toBe(200);

    // The server does not return a redirect URL — the client (auth.tsx) always
    // calls `window.location.replace('/')`, which is hardcoded to '/'.
    // Asserting these fields are absent documents that no server-generated
    // redirect could steer the browser toward a tenant-B page.
    expect(res.body.redirectTo).toBeUndefined();
    expect(res.body.redirect).toBeUndefined();

    // Additionally, the tenantId must be tenant A's so the client-side app
    // initialises with the correct store context after the redirect.
    expect(res.body.tenantId).toBe(tenantA.id);
  });
});

// ─── Email verification cross-tenant replay ───────────────────────────────────

/**
 * This describe block covers the email-verification token replay scenario:
 *
 *   1. A customer signs up under tenant A — the server stores an
 *      emailVerificationToken against the new user record (still tied to
 *      tenant A's tenantId).
 *   2. An attacker (or a confused user) visits /auth?tenant=<store-b-slug>
 *      and POSTs the *same* verification token to POST /api/auth/verify-email
 *      while sending X-Tenant-Slug: tenantB.slug in the request header.
 *   3. The server looks up the user purely by the verification token, not by
 *      the slug header, so the user's stored tenantId (tenant A) must be
 *      unchanged in the response and in any subsequent login.
 *
 * This ensures the email-verification flow cannot be used to "move" a user
 * account from the tenant they signed up under to an arbitrary other tenant.
 */
describe("POST /api/auth/verify-email — cross-tenant token replay", () => {
  let verifUserEmail: string;
  let verifUserId: string | undefined;
  let verifToken: string;

  const VERIF_PASSWORD = "VerifReplay1!";

  beforeAll(async () => {
    const sfx = randomSuffix();
    verifUserEmail = `verif-replay-${sfx}@test.local`;

    // Sign up under tenant A — this creates the user with an
    // emailVerificationToken stored in the DB.
    const signupRes = await agent
      .post("/api/auth/signup")
      .set("X-Tenant-Slug", tenantA.slug)
      .send({
        email: verifUserEmail,
        password: VERIF_PASSWORD,
        firstName: "Verif",
        lastName: "ReplayTest",
        phoneNumber: `555${sfx.slice(0, 7)}`,
      });

    if (signupRes.status !== 200) {
      throw new Error(
        `Signup in beforeAll failed: ${signupRes.status} ${JSON.stringify(signupRes.body)}`
      );
    }

    verifUserId = signupRes.body.id as string;

    // Read the raw verification token directly from the database.
    // In production the user would receive it via email; here we retrieve it
    // directly so we can replay it with a different tenant slug.
    const [row] = await db
      .select({ token: users.emailVerificationToken })
      .from(users)
      .where(eq(users.id, verifUserId as any))
      .limit(1);

    if (!row?.token) {
      throw new Error("emailVerificationToken not found in DB after signup");
    }
    verifToken = row.token;
  }, 60_000);

  afterAll(async () => {
    if (verifUserId) {
      await db
        .update(contacts)
        .set({ linkedUserId: null })
        .where(eq(contacts.linkedUserId, verifUserId as any));
      await db.delete(users).where(eq(users.id, verifUserId as any));
    }
  }, 30_000);

  it("verifying with tenant B's slug header still scopes the account to tenant A", async () => {
    // POST the verification token while sending tenant B's slug — simulating
    // a user (or attacker) who opens the verification link while visiting the
    // store-B subdomain / ?tenant=store-b URL.
    const res = await agent
      .post("/api/auth/verify-email")
      .set("X-Tenant-Slug", tenantB.slug)
      .send({ token: verifToken });

    expect(res.status).toBe(200);

    // The response must carry tenant A's tenantId.  The X-Tenant-Slug header
    // from store B must have had no effect on which tenant owns this user.
    expect(res.body.tenantId).toBe(tenantA.id);
    expect(res.body.tenantId).not.toBe(tenantB.id);
  });

  it("login after cross-tenant verification still returns tenant A's tenantId", async () => {
    // After the verification above the account should be fully usable.
    // Log in while again sending tenant B's slug header — the stored tenantId
    // must still win.
    const res = await agent
      .post("/api/auth/login")
      .set("X-Tenant-Slug", tenantB.slug)
      .send({ email: verifUserEmail, password: VERIF_PASSWORD });

    expect(res.status).toBe(200);

    // The tenantId in the login response must be tenant A's.
    expect(res.body.tenantId).toBe(tenantA.id);
    expect(res.body.tenantId).not.toBe(tenantB.id);
  });
});
