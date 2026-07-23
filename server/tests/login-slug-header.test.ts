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
import { tenants, users, contacts, passwordResetTokens } from "@shared/schema";
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

// ─── Resend-verification cross-tenant isolation ───────────────────────────────

/**
 * This describe block covers the resend-verification token isolation scenario:
 *
 *   1. A customer signs up under tenant A — the server stores an
 *      emailVerificationToken against the new user record (tied to tenant A).
 *   2. The customer (or an attacker) calls POST /api/auth/resend-verification
 *      while sending X-Tenant-Slug: tenantB.slug in the header.
 *   3. The server re-issues a fresh token. Because the endpoint resolves the
 *      user purely by email (not by the slug header), the new token is still
 *      stored on the same user record — which has tenantA's tenantId.
 *   4. Using that fresh token to call POST /api/auth/verify-email must return
 *      tenant A's tenantId, not tenant B's.
 *   5. A subsequent login must also return tenant A's tenantId.
 *
 * This ensures the resend-verification flow cannot be exploited to move a user
 * from one tenant to another via the X-Tenant-Slug header.
 */
describe("POST /api/auth/resend-verification — cross-tenant token isolation", () => {
  let resendUserEmail: string;
  let resendUserId: string | undefined;
  let freshToken: string;

  const RESEND_PASSWORD = "ResendXTenant1!";

  beforeAll(async () => {
    const sfx = randomSuffix();
    resendUserEmail = `resend-xtenant-${sfx}@test.local`;

    // Step 1 — sign up under tenant A so the account + initial token exist.
    const signupRes = await agent
      .post("/api/auth/signup")
      .set("X-Tenant-Slug", tenantA.slug)
      .send({
        email: resendUserEmail,
        password: RESEND_PASSWORD,
        firstName: "Resend",
        lastName: "XTenant",
        phoneNumber: `555${sfx.slice(0, 7)}`,
      });

    if (signupRes.status !== 200) {
      throw new Error(
        `Signup in beforeAll failed: ${signupRes.status} ${JSON.stringify(signupRes.body)}`
      );
    }

    resendUserId = signupRes.body.id as string;

    // Step 2 — call the resend endpoint while sending tenant B's slug header.
    // The endpoint should ignore the slug and regenerate the token for the
    // user found by email — who still belongs to tenant A.
    const resendRes = await agent
      .post("/api/auth/resend-verification")
      .set("X-Tenant-Slug", tenantB.slug)
      .send({ email: resendUserEmail });

    // The endpoint always returns 200 with a generic message (no enumeration).
    if (resendRes.status !== 200) {
      throw new Error(
        `Resend in beforeAll failed: ${resendRes.status} ${JSON.stringify(resendRes.body)}`
      );
    }

    // Step 3 — read the freshly-issued token directly from the database.
    const [row] = await db
      .select({ token: users.emailVerificationToken })
      .from(users)
      .where(eq(users.id, resendUserId as any))
      .limit(1);

    if (!row?.token) {
      throw new Error("emailVerificationToken not found in DB after resend");
    }
    freshToken = row.token;
  }, 60_000);

  afterAll(async () => {
    if (resendUserId) {
      await db
        .update(contacts)
        .set({ linkedUserId: null })
        .where(eq(contacts.linkedUserId, resendUserId as any));
      await db.delete(users).where(eq(users.id, resendUserId as any));
    }
  }, 30_000);

  it("verifying the resent token with tenant B's slug header still scopes the account to tenant A", async () => {
    // POST the fresh token while again sending tenant B's slug — the slug must
    // have no effect on which tenant the verified account belongs to.
    const res = await agent
      .post("/api/auth/verify-email")
      .set("X-Tenant-Slug", tenantB.slug)
      .send({ token: freshToken });

    expect(res.status).toBe(200);

    // The response must carry tenant A's tenantId.  The X-Tenant-Slug header
    // from store B must not redirect ownership to tenant B.
    expect(res.body.tenantId).toBe(tenantA.id);
    expect(res.body.tenantId).not.toBe(tenantB.id);
  });

  it("login after verifying a resent token still returns tenant A's tenantId", async () => {
    // After verification the account is fully usable. Log in while sending
    // tenant B's slug to confirm the stored tenantId always wins.
    const res = await agent
      .post("/api/auth/login")
      .set("X-Tenant-Slug", tenantB.slug)
      .send({ email: resendUserEmail, password: RESEND_PASSWORD });

    expect(res.status).toBe(200);

    // The tenantId in the login response must be tenant A's.
    expect(res.body.tenantId).toBe(tenantA.id);
    expect(res.body.tenantId).not.toBe(tenantB.id);
  });
});

// ─── Password-reset cross-tenant isolation ────────────────────────────────────

/**
 * This describe block covers the password-reset token cross-tenant scenario:
 *
 *   1. A password-reset token is issued for a user who belongs to tenant A.
 *   2. An attacker (or a confused user) POSTs that token to
 *      POST /api/auth/reset-password while sending X-Tenant-Slug: tenantB.slug.
 *   3. The server resolves the user purely from the reset token (not from the
 *      slug header), so the password change must only affect the tenant-A user.
 *   4. The user can still log in as tenant A after the reset.
 *   5. The login response must carry tenant A's tenantId — not tenant B's.
 *
 * This ensures the password-reset flow cannot be used to "move" a user from
 * the tenant they signed up under to an arbitrary other tenant.
 */
describe("POST /api/auth/reset-password — cross-tenant token isolation", () => {
  let resetUserEmail: string;
  let resetUserId: string | undefined;
  let resetRawToken: string;
  const RESET_OLD_PASSWORD = "ResetOldPass1!";
  const RESET_NEW_PASSWORD = "ResetNewPass2@";

  beforeAll(async () => {
    const sfx = randomSuffix();
    resetUserEmail = `reset-xtenant-${sfx}@test.local`;

    // Step 1 — create a pre-verified tenant-A user directly in the DB so we
    // bypass signup's X-Tenant-Slug requirement and control the tenantId.
    const hashed = await hashPassword(RESET_OLD_PASSWORD);
    const [inserted] = await db
      .insert(users)
      .values({
        id: `reset-xtenant-${sfx}`,
        email: resetUserEmail,
        password: hashed,
        firstName: "Reset",
        lastName: "XTenant",
        phoneNumber: `555${sfx.slice(0, 7)}`,
        tenantId: tenantA.id,
        isAdmin: false,
        emailVerified: true,
        tokenVersion: 0,
      } as any)
      .returning({ id: users.id });

    resetUserId = inserted.id as string;

    // Step 2 — issue a password-reset token directly in the DB, mirroring what
    // POST /api/auth/forgot-password does internally.  We bypass the actual
    // endpoint to avoid a SendGrid call and stay focused on isolation behaviour.
    const crypto = await import("crypto");
    resetRawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await db.insert(passwordResetTokens).values({
      token: resetRawToken,
      userId: resetUserId,
      expiresAt,
      used: false,
    } as any);
  }, 60_000);

  afterAll(async () => {
    if (resetUserId) {
      // Remove any leftover reset tokens first (FK constraint).
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId as any, resetUserId as any));
      await db
        .update(contacts)
        .set({ linkedUserId: null })
        .where(eq(contacts.linkedUserId, resetUserId as any));
      await db.delete(users).where(eq(users.id, resetUserId as any));
    }
  }, 30_000);

  it("resets the password when the token is submitted with tenant B's slug header", async () => {
    // POST the reset request while sending tenant B's slug — simulating an
    // attacker who attempts to associate the reset with store B.
    const res = await agent
      .post("/api/auth/reset-password")
      .set("X-Tenant-Slug", tenantB.slug)
      .send({ token: resetRawToken, newPassword: RESET_NEW_PASSWORD });

    // The reset must succeed — the X-Tenant-Slug header is irrelevant to
    // whether the token is valid.
    expect(res.status).toBe(200);
  });

  it("allows the user to log in as tenant A after the cross-tenant reset", async () => {
    // After the password was changed above, login with the NEW password while
    // still sending tenant B's slug — the stored tenantId must still win.
    const res = await agent
      .post("/api/auth/login")
      .set("X-Tenant-Slug", tenantB.slug)
      .send({ email: resetUserEmail, password: RESET_NEW_PASSWORD });

    expect(res.status).toBe(200);

    // The session must be scoped to tenant A — where the user's account lives.
    expect(res.body.tenantId).toBe(tenantA.id);
    expect(res.body.tenantId).not.toBe(tenantB.id);
  });

  it("login response does not expose tenant B's tenantId after the cross-tenant reset", async () => {
    // Log in without any X-Tenant-Slug header to confirm the reset did not
    // permanently associate the user with tenant B.
    const res = await agent
      .post("/api/auth/login")
      .send({ email: resetUserEmail, password: RESET_NEW_PASSWORD });

    expect(res.status).toBe(200);

    // Regardless of which slug header was sent during the reset, the returned
    // tenantId must always be tenant A's.
    expect(res.body.tenantId).toBe(tenantA.id);
    expect(res.body.tenantId).not.toBe(tenantB.id);

    // The server must not return any redirect URL that could steer the browser
    // toward a tenant-B page.
    expect(res.body.redirectTo).toBeUndefined();
    expect(res.body.redirect).toBeUndefined();
  });
});

// ─── Expired password-reset token rejection ───────────────────────────────────

/**
 * This describe block confirms that a password-reset token whose `expiresAt`
 * timestamp is in the past is rejected BEFORE the password is changed:
 *
 *   1. A user is created with a known password.
 *   2. A password-reset token is inserted directly into the DB with
 *      `expiresAt` set one hour in the past.
 *   3. POST /api/auth/reset-password with that token must return 400 with
 *      "Reset token has expired".
 *   4. A login attempt with the original password must still succeed —
 *      confirming the password was never changed.
 *
 * This guards against a regression where the `expiresAt` check is removed or
 * bypassed, which would allow stale links to reset passwords.
 */
describe("POST /api/auth/reset-password — expired token rejection", () => {
  let expiredUserEmail: string;
  let expiredUserId: string | undefined;
  let expiredRawToken: string;

  const EXPIRED_ORIGINAL_PASSWORD = "ExpiredOrig1!";
  const EXPIRED_NEW_PASSWORD = "ExpiredNew2@";

  beforeAll(async () => {
    const sfx = randomSuffix();
    expiredUserEmail = `reset-expired-${sfx}@test.local`;

    // Create a pre-verified tenant-A user directly in the DB.
    const hashed = await hashPassword(EXPIRED_ORIGINAL_PASSWORD);
    const [inserted] = await db
      .insert(users)
      .values({
        id: `reset-expired-${sfx}`,
        email: expiredUserEmail,
        password: hashed,
        firstName: "Expired",
        lastName: "TokenTest",
        phoneNumber: `555${sfx.slice(0, 7)}`,
        tenantId: tenantA.id,
        isAdmin: false,
        emailVerified: true,
        tokenVersion: 0,
      } as any)
      .returning({ id: users.id });

    expiredUserId = inserted.id as string;

    // Insert a password-reset token with expiresAt in the past — one hour ago.
    // This simulates a link that was generated but never clicked until it expired.
    const crypto = await import("crypto");
    expiredRawToken = crypto.randomBytes(32).toString("hex");
    const expiredAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    await db.insert(passwordResetTokens).values({
      token: expiredRawToken,
      userId: expiredUserId,
      expiresAt: expiredAt,
      used: false,
    } as any);
  }, 60_000);

  afterAll(async () => {
    if (expiredUserId) {
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId as any, expiredUserId as any));
      await db
        .update(contacts)
        .set({ linkedUserId: null })
        .where(eq(contacts.linkedUserId, expiredUserId as any));
      await db.delete(users).where(eq(users.id, expiredUserId as any));
    }
  }, 30_000);

  it("returns 400 with 'Reset token has expired' when the token's expiresAt is in the past", async () => {
    const res = await agent
      .post("/api/auth/reset-password")
      .send({ token: expiredRawToken, newPassword: EXPIRED_NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Reset token has expired/i);
  });

  it("the stored password hash is unchanged — the original password would still let the user log in", async () => {
    // Read the stored password hash directly from the DB.  This approach avoids
    // consuming additional slots from the shared auth rate-limiter (login,
    // reset-password, etc. all count toward the same pool of 15 per window).
    const [row] = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.id, expiredUserId as any))
      .limit(1);

    expect(row).toBeDefined();

    const { verifyPassword: vp } = await import("../passwordUtils");

    // The original password must still match — the expired token must not have
    // caused any write to the database.  bcrypt matching here is equivalent to
    // a successful login: if the hash matches, the login endpoint would accept it.
    const originalMatches = await vp(EXPIRED_ORIGINAL_PASSWORD, row!.password!);
    expect(originalMatches).toBe(true);

    // The "new" password the caller tried to set must NOT match — confirming
    // the reset was blocked before any DB write occurred.
    const newMatches = await vp(EXPIRED_NEW_PASSWORD, row!.password!);
    expect(newMatches).toBe(false);
  });
});

// ─── Password-reset token replay protection ───────────────────────────────────

/**
 * This describe block confirms that a password-reset token cannot be replayed
 * once it has been used:
 *
 *   1. A valid reset token is issued for a user.
 *   2. A first POST /api/auth/reset-password with the token succeeds.
 *   3. A second POST with the SAME token is rejected with 400.
 *   4. The password remains as set by the first (successful) reset — a login
 *      with the new password still works.
 *   5. A login with a hypothetical "third password" (one the attacker tried to
 *      set via the replay) does not work.
 *
 * This guards against a regression where `markTokenAsUsed` is accidentally
 * skipped, which would allow token replay attacks.
 */
describe("POST /api/auth/reset-password — token replay protection", () => {
  let replayUserEmail: string;
  let replayUserId: string | undefined;
  let replayRawToken: string;
  // Own app instance so this block gets a fresh authLimiter counter that is
  // independent of the quota consumed by earlier describe blocks in this file.
  // Each call to registerRoutes() creates a new rateLimit() instance, so
  // requests to `replayAgent` never share a counter with `agent`.
  let replayAgent: ReturnType<typeof supertest>;

  const REPLAY_OLD_PASSWORD = "ReplayOld1!";
  const REPLAY_NEW_PASSWORD = "ReplayNew2@";
  const REPLAY_THIRD_PASSWORD = "ReplayThird3#";

  beforeAll(async () => {
    const sfx = randomSuffix();
    replayUserEmail = `reset-replay-${sfx}@test.local`;

    // Create a pre-verified tenant-A user directly in the DB.
    const hashed = await hashPassword(REPLAY_OLD_PASSWORD);
    const [inserted] = await db
      .insert(users)
      .values({
        id: `reset-replay-${sfx}`,
        email: replayUserEmail,
        password: hashed,
        firstName: "Replay",
        lastName: "ResetTest",
        phoneNumber: `555${sfx.slice(0, 7)}`,
        tenantId: tenantA.id,
        isAdmin: false,
        emailVerified: true,
        tokenVersion: 0,
      } as any)
      .returning({ id: users.id });

    replayUserId = inserted.id as string;

    // Issue a password-reset token directly in the DB (avoids a SendGrid call).
    const crypto = await import("crypto");
    replayRawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await db.insert(passwordResetTokens).values({
      token: replayRawToken,
      userId: replayUserId,
      expiresAt,
      used: false,
    } as any);

    // Spin up a dedicated app so this block's reset-password calls don't share
    // the rate-limit window that the earlier describe blocks have already
    // partially consumed.
    replayAgent = supertest(await buildTestApp());
  }, 60_000);

  afterAll(async () => {
    if (replayUserId) {
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId as any, replayUserId as any));
      await db
        .update(contacts)
        .set({ linkedUserId: null })
        .where(eq(contacts.linkedUserId, replayUserId as any));
      await db.delete(users).where(eq(users.id, replayUserId as any));
    }
  }, 30_000);

  it("first use of the token resets the password successfully", async () => {
    const res = await replayAgent
      .post("/api/auth/reset-password")
      .send({ token: replayRawToken, newPassword: REPLAY_NEW_PASSWORD });

    expect(res.status).toBe(200);
  });

  it("second use of the same token is rejected with 400", async () => {
    // Attempt to replay the already-used token with a different password.
    const res = await replayAgent
      .post("/api/auth/reset-password")
      .send({ token: replayRawToken, newPassword: REPLAY_THIRD_PASSWORD });

    // The server must reject the replay — the token is already marked as used.
    expect(res.status).toBe(400);
    // The response should indicate the token was already used (not a generic
    // "invalid token" which could mask the replay-check being skipped entirely).
    expect(res.body.message).toMatch(/already been used/i);
  });

  it("the stored password hash matches the new password and not the third — replay did not write to the DB", async () => {
    // Read the current password hash directly from the database so we can
    // verify both conditions without consuming additional rate-limited API
    // calls (the auth limiter is shared across all tests in this file).
    const [row] = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.id, replayUserId as any))
      .limit(1);

    expect(row).toBeDefined();

    const { verifyPassword: vp } = await import("../passwordUtils");

    // The stored hash MUST match the new password — confirming the first
    // (legitimate) reset succeeded and the password is now REPLAY_NEW_PASSWORD.
    const newPasswordMatches = await vp(REPLAY_NEW_PASSWORD, row!.password!);
    expect(newPasswordMatches).toBe(true);

    // The stored hash must NOT match the third password — confirming the
    // replay POST was blocked before any DB write occurred.
    const thirdPasswordMatches = await vp(REPLAY_THIRD_PASSWORD, row!.password!);
    expect(thirdPasswordMatches).toBe(false);
  });
});
