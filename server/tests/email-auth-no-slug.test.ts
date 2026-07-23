/**
 * Tests: Email verification and password reset endpoints work without X-Tenant-Slug
 *
 * When a user clicks a verification link or password reset link from their
 * email client, the request arrives with no store context — no X-Tenant-Slug
 * header and no ?tenant= query param.  These routes are listed in
 * UNAUTHENTICATED_NO_SLUG_ALLOWLIST in tenantMiddleware.ts so they must
 * reach their route handlers and return meaningful responses instead of 400.
 *
 * Endpoints under test:
 *   GET  /api/auth/verify-email?token=<valid>         — token validity check
 *   POST /api/auth/verify-email                       — actually verify + log in
 *   POST /api/auth/resend-verification                — re-send verification email
 *   POST /api/auth/forgot-password                    — request password reset link
 *   POST /api/auth/reset-password                     — consume reset token
 *
 * For each test the request deliberately omits X-Tenant-Slug and
 * ALLOW_TENANT_FALLBACK is explicitly unset so the allowlist is the only
 * mechanism that can let the request through.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import crypto from "crypto";
import { db } from "../db";
import { tenants, users, passwordResetTokens } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { hashPassword } from "../passwordUtils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix(): string {
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

// ─── Shared state ─────────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;

// Tenant for users that need a tenantId (password reset requires a real user)
let testTenantId: number;

// User + token for verify-email tests
let verifyUserId: string;
let verifyToken: string;

// User + token for POST verify-email (consumed in test, so it needs its own token)
let postVerifyUserId: string;
let postVerifyToken: string;

// User for resend-verification
let resendUserId: string;
let resendEmail: string;

// User for forgot-password / reset-password
let resetUserId: string;
let resetEmail: string;
let resetToken: string;

const createdTenantIds: number[] = [];
const createdUserIds: string[] = [];
const createdResetTokenIds: number[] = [];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Disable the fallback so the allowlist alone must pass requests through.
  delete process.env.ALLOW_TENANT_FALLBACK;

  // Avoid PK collisions with parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const sfx = randomSuffix();

  // Create a tenant so users can be associated with a real tenantId.
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `EmailAuthNoSlug ${sfx}`,
      slug: `email-auth-no-slug-${sfx}`,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();
  testTenantId = tenant.id;
  createdTenantIds.push(testTenantId);

  const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // ── User 1: for GET verify-email (token must be valid, not yet consumed) ──
  const vSfx1 = randomSuffix();
  verifyToken = crypto.randomBytes(32).toString("hex");
  const [vu1] = await db
    .insert(users)
    .values({
      id: `test-email-verify-get-${vSfx1}`,
      email: `email-verify-get-${vSfx1}@test.local`,
      password: await hashPassword("TestPass1!"),
      firstName: "Verify",
      lastName: "GetUser",
      tenantId: testTenantId,
      isAdmin: false,
      emailVerified: false,
      emailVerificationToken: verifyToken,
      emailVerificationExpiry: futureExpiry,
    })
    .returning();
  verifyUserId = vu1.id;
  createdUserIds.push(verifyUserId);

  // ── User 2: for POST verify-email (separate token, consumed by the test) ──
  const vSfx2 = randomSuffix();
  postVerifyToken = crypto.randomBytes(32).toString("hex");
  const [vu2] = await db
    .insert(users)
    .values({
      id: `test-email-verify-post-${vSfx2}`,
      email: `email-verify-post-${vSfx2}@test.local`,
      password: await hashPassword("TestPass1!"),
      firstName: "Verify",
      lastName: "PostUser",
      tenantId: testTenantId,
      isAdmin: false,
      emailVerified: false,
      emailVerificationToken: postVerifyToken,
      emailVerificationExpiry: futureExpiry,
    })
    .returning();
  postVerifyUserId = vu2.id;
  createdUserIds.push(postVerifyUserId);

  // ── User 3: for resend-verification ──
  const reSfx = randomSuffix();
  resendEmail = `email-resend-${reSfx}@test.local`;
  const [ru] = await db
    .insert(users)
    .values({
      id: `test-email-resend-${reSfx}`,
      email: resendEmail,
      password: await hashPassword("TestPass1!"),
      firstName: "Resend",
      lastName: "User",
      tenantId: testTenantId,
      isAdmin: false,
      emailVerified: false,
      emailVerificationToken: crypto.randomBytes(32).toString("hex"),
      emailVerificationExpiry: futureExpiry,
    })
    .returning();
  resendUserId = ru.id;
  createdUserIds.push(resendUserId);

  // ── User 4: for forgot-password / reset-password ──
  const pwSfx = randomSuffix();
  resetEmail = `email-reset-${pwSfx}@test.local`;
  const [pwu] = await db
    .insert(users)
    .values({
      id: `test-email-reset-${pwSfx}`,
      email: resetEmail,
      password: await hashPassword("OldPass1!"),
      firstName: "Reset",
      lastName: "User",
      tenantId: testTenantId,
      isAdmin: false,
      emailVerified: true,
    })
    .returning();
  resetUserId = pwu.id;
  createdUserIds.push(resetUserId);

  // Insert a valid password reset token directly so reset-password can run.
  resetToken = crypto.randomBytes(32).toString("hex");
  const [prt] = await db
    .insert(passwordResetTokens)
    .values({
      token: resetToken,
      userId: resetUserId,
      expiresAt: futureExpiry,
      used: false,
    })
    .returning();
  createdResetTokenIds.push(prt.id);

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  // Clean up password reset tokens first (FK references users)
  for (const id of createdResetTokenIds) {
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.id, id))
      .catch(() => {});
  }
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  for (const id of createdTenantIds) {
    await db.delete(tenants).where(eq(tenants.id, id)).catch(() => {});
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/auth/verify-email — no X-Tenant-Slug", () => {
  it("returns 200 with valid:true for a valid token when no slug header is present", async () => {
    // Simulate a user clicking the email link from their mail client —
    // no store context, no X-Tenant-Slug, no ?tenant= param.
    const res = await agent
      .get(`/api/auth/verify-email?token=${verifyToken}`);
      // Deliberately omit X-Tenant-Slug

    expect(res.status).not.toBe(400); // Must not be the middleware's "Missing tenant" 400
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it("returns 400 from the route handler (not middleware) when the token is missing", async () => {
    const res = await agent.get("/api/auth/verify-email");
    // 400 must come from the route handler's own validation, not middleware
    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/Missing tenant/i);
  });

  it("returns 400 from the route handler (not middleware) for an invalid token", async () => {
    const res = await agent.get("/api/auth/verify-email?token=totally-invalid-token");
    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/Missing tenant/i);
  });
});

describe("POST /api/auth/verify-email — no X-Tenant-Slug", () => {
  it("verifies the email and logs in the user when no slug header is present", async () => {
    // The POST consumes the token, so a dedicated token was set up in beforeAll.
    const res = await agent
      .post("/api/auth/verify-email")
      .send({ token: postVerifyToken });
      // Deliberately omit X-Tenant-Slug

    expect(res.status).not.toBe(400); // Must not be middleware's "Missing tenant" 400
    expect(res.status).toBe(200);
    // Route returns a success message; with a real user it returns the user object too
    expect(res.body.message).toMatch(/verified/i);
  });

  it("returns 400 from the route handler (not middleware) for an already-used token", async () => {
    // Same token again — now consumed, so invalid
    const res = await agent
      .post("/api/auth/verify-email")
      .send({ token: postVerifyToken });

    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/Missing tenant/i);
  });
});

describe("POST /api/auth/resend-verification — no X-Tenant-Slug", () => {
  it("returns 200 when no slug header is present and the email exists", async () => {
    const res = await agent
      .post("/api/auth/resend-verification")
      .send({ email: resendEmail });
      // Deliberately omit X-Tenant-Slug

    expect(res.status).not.toBe(400); // Must not be middleware's "Missing tenant" 400
    expect(res.status).toBe(200);
    // Route always returns a generic message to prevent user enumeration
    expect(res.body.message).toBeTruthy();
  });

  it("returns 200 even for an unknown email (user enumeration protection)", async () => {
    const res = await agent
      .post("/api/auth/resend-verification")
      .send({ email: "nonexistent@test.local" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
  });

  it("returns 400 from the route handler (not middleware) when email field is missing", async () => {
    const res = await agent.post("/api/auth/resend-verification").send({});

    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/Missing tenant/i);
  });
});

describe("POST /api/auth/forgot-password — no X-Tenant-Slug", () => {
  it("returns 200 when no slug header is present and the email exists", async () => {
    const res = await agent
      .post("/api/auth/forgot-password")
      .send({ email: resetEmail });
      // Deliberately omit X-Tenant-Slug

    expect(res.status).not.toBe(400); // Must not be middleware's "Missing tenant" 400
    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
  });

  it("returns 200 even for an unknown email (user enumeration protection)", async () => {
    const res = await agent
      .post("/api/auth/forgot-password")
      .send({ email: "unknown-user@test.local" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
  });

  it("returns 400 from the route handler (not middleware) when email field is missing", async () => {
    const res = await agent.post("/api/auth/forgot-password").send({});

    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/Missing tenant/i);
  });
});

describe("POST /api/auth/reset-password — no X-Tenant-Slug", () => {
  it("resets the password when no slug header is present and the token is valid", async () => {
    const res = await agent
      .post("/api/auth/reset-password")
      .send({ token: resetToken, newPassword: "NewPass1!#" });
      // Deliberately omit X-Tenant-Slug

    expect(res.status).not.toBe(400); // Must not be middleware's "Missing tenant" 400
    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
  });

  it("returns 400 from the route handler (not middleware) for an already-used reset token", async () => {
    // Token was consumed in the previous test
    const res = await agent
      .post("/api/auth/reset-password")
      .send({ token: resetToken, newPassword: "AnotherPass1!#" });

    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/Missing tenant/i);
  });

  it("returns 400 from the route handler (not middleware) when required fields are absent", async () => {
    const res = await agent.post("/api/auth/reset-password").send({});

    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/Missing tenant/i);
  });
});
