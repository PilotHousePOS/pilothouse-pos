/**
 * Tests: POST /api/auth/admin-override rejects requests with no valid tenant context
 *
 * A stranded employee session — one whose store was removed — has no tenantId
 * attached by tenantMiddleware.  The actual protection is layered:
 *
 *  1. tenantMiddleware (app-level, runs before the route handler) intercepts
 *     requests from stranded/anonymous sessions and returns an error response
 *     before the PIN lookup can begin.
 *
 *  2. The handler itself has a defense-in-depth check at line 15803 of
 *     server/routes.ts:
 *       `if (!tenantId) return res.status(400).json({ message: "No tenant context" });`
 *     This fires when tenantMiddleware somehow passes without setting req.tenantId.
 *
 *  3. A membership guard prevents a stranded admin who knows a foreign store's
 *     slug and PIN from writing override_audit_log entries for that store:
 *       `if (!actingUser || actingUser.tenantId !== tenantId) → 403`
 *
 * Middleware execution order for POST /api/auth/admin-override:
 *   tenantMiddleware → overridePinLimiter → authMiddleware → route handler
 *
 * Observed behaviour (confirmed by these tests):
 *
 *  - Anonymous (no auth token, no slug): tenantMiddleware returns 400 before the
 *    route handler runs — the PIN check is never reached.
 *
 *  - Stranded user (valid auth cookie, no slug): tenantMiddleware detects the
 *    authenticated user with no tenant and returns 403 "Tenant not configured" —
 *    again the PIN check is never reached.
 *
 *  - Stranded admin with a foreign slug + correct PIN: tenantMiddleware resolves
 *    the foreign tenant via the slug, but the handler's membership guard returns
 *    403 before the PIN is verified — no audit log entry is written.
 *
 *  - Super-admin with no tenantId + store slug + correct PIN: tenantMiddleware
 *    resolves the tenant via the slug and sets req.isSuperAdmin = true. The
 *    handler's membership guard is skipped. The PIN is verified and 200 is
 *    returned. An override_audit_log entry is written for that tenant.
 *
 *  - In all cases no PIN is looked up and no success response is returned for
 *    non-super-admin callers without a matching tenant.
 *
 * The handler's own `if (!tenantId)` guard (line 15803) provides defense-in-depth
 * and is confirmed present via a source-code inspection assertion.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { users, contacts, tenants } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { generateToken } from "../auth";
import { hashPassword } from "../passwordUtils";
import * as fs from "fs";
import * as path from "path";

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

// ─── Shared fixtures ──────────────────────────────────────────────────────────

let strandedUserId: string;
let strandedToken: string;
let agent: ReturnType<typeof supertest>;

beforeAll(async () => {
  const sfx = randomSuffix();

  // Create a stranded user: valid DB record, no tenantId.
  const [stranded] = await db
    .insert(users)
    .values({
      id: `stranded-ov-${sfx}`,
      email: `stranded-ov-${sfx}@test.local`,
      firstName: "Stranded",
      lastName: "Employee",
      password: "hashed-for-test",
      tenantId: null,
      isAdmin: false,
      isSuperAdmin: false,
      tokenVersion: 0,
    })
    .returning();

  strandedUserId = stranded.id;
  // generateToken produces a valid signed JWT — identical to what the real
  // login flow issues, so the cookie is indistinguishable from a real session.
  strandedToken = generateToken(stranded as any);

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (strandedUserId) {
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(eq(contacts.linkedUserId, strandedUserId));
    await db.delete(users).where(eq(users.id, strandedUserId));
  }
}, 30_000);

// ─── Suite: no-tenant PIN verification ───────────────────────────────────────

describe("POST /api/auth/admin-override — no tenant context", () => {
  it(
    "rejects an anonymous request (no auth token) before the PIN check runs — tenantMiddleware returns 4xx",
    async () => {
      // No auth cookie, no X-Tenant-Slug header.
      // tenantMiddleware runs before authMiddleware and returns 400 for
      // unauthenticated callers that have no tenant context at all.
      const res = await agent
        .post("/api/auth/admin-override")
        .send({ pin: "1234", action: "void_transaction" });

      // Must be a 4xx — PIN lookup must never succeed.
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      // Must not be a success response.
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
    },
    15_000,
  );

  it(
    "rejects a stranded session (valid auth cookie, store removed) with 403 before the PIN check runs",
    async () => {
      // Stranded user: valid JWT, tenantId = null in DB, no X-Tenant-Slug header.
      // tenantMiddleware detects the authenticated user with no tenant and
      // returns 403 "Tenant not configured for this account. Contact support."
      // The route handler's own tenant check is never reached.
      const res = await agent
        .post("/api/auth/admin-override")
        .set("Cookie", `auth_token=${strandedToken}`)
        .send({ pin: "1234", action: "void_transaction" });

      expect(res.status).toBe(403);
      // The error body must contain a meaningful message — not an empty response.
      expect(typeof res.body.message).toBe("string");
      expect(res.body.message.length).toBeGreaterThan(0);
    },
    15_000,
  );

  it(
    "a stranded session does not receive a success response regardless of PIN value",
    async () => {
      // Belt-and-suspenders: regardless of PIN value, any stranded session must
      // receive an error response, not a 200/201 success.
      for (const pin of ["1234", "0000", "9999"]) {
        const res = await agent
          .post("/api/auth/admin-override")
          .set("Cookie", `auth_token=${strandedToken}`)
          .send({ pin, action: "open_drawer" });

        expect(res.status).not.toBe(200);
        expect(res.status).not.toBe(201);
      }
    },
    15_000,
  );

  it(
    "the handler has a defense-in-depth tenant check that returns 400 'No tenant context' when tenantMiddleware passes without setting req.tenantId",
    () => {
      // Source-code inspection: confirm the defense-in-depth guard exists in
      // the admin-override route handler.  This check fires when tenantMiddleware
      // somehow passes through without setting req.tenantId — e.g. in future
      // refactors where /api/auth/admin-override is added to a public allowlist.
      const routesPath = path.resolve(__dirname, "../routes.ts");
      const source = fs.readFileSync(routesPath, "utf8");

      // Find the admin-override handler block.
      const handlerStart = source.indexOf('"/api/auth/admin-override"');
      expect(handlerStart).toBeGreaterThan(0);

      // Extract a reasonable window after the handler declaration (2000 chars).
      const handlerWindow = source.slice(handlerStart, handlerStart + 2000);

      // The defense-in-depth check must be present inside the handler.
      expect(handlerWindow).toContain("No tenant context");
      // It must return a 400 status for the missing-tenant case.
      expect(handlerWindow).toContain("status(400)");
    },
  );
});

// ─── Suite: overridePinLimiter blocks slug-injection brute-force ──────────────

describe("POST /api/auth/admin-override — PIN limiter blocks stranded employee with slug injection", () => {
  // A stranded employee who knows a valid store slug can bypass the
  // tenantMiddleware 403 (because the slug resolves a real tenant) and reach
  // the overridePinLimiter.  This suite confirms the limiter fires and returns
  // 429 after 10 attempts — before the PIN check or membership guard matter.

  let slugTenantId: number;
  let slugTenantSlug: string;
  let slugStrandedToken: string;
  let slugStrandedUserId: string;
  let slugAgent: ReturnType<typeof supertest>;

  // Unique rightmost XFF entry so this suite's counter is isolated from every
  // other test.  getRealIp reads the RIGHTMOST X-Forwarded-For entry — the
  // one that cannot be spoofed by the client — so using a dedicated value here
  // keeps the limiter bucket separate from real traffic and other suites.
  let uniqueRealIp: string;

  beforeAll(async () => {
    const sfx = randomSuffix();
    slugTenantSlug = `slug-inject-store-${sfx}`;
    uniqueRealIp = `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    // Create a real tenant — the slug must resolve so tenantMiddleware passes
    // and the overridePinLimiter gets a chance to fire.
    const [slugTenant] = await db
      .insert(tenants)
      .values({
        name: `Slug Inject Store ${sfx}`,
        slug: slugTenantSlug,
        // No adminOverridePin set — the handler would 400 anyway, but the limiter
        // fires before the handler is reached after the budget is exhausted.
      })
      .returning();

    slugTenantId = slugTenant.id;

    // Stranded employee: valid JWT, tenantId = null in DB.
    const [slugStranded] = await db
      .insert(users)
      .values({
        id: `slug-inject-${sfx}`,
        email: `slug-inject-${sfx}@test.local`,
        firstName: "Slug",
        lastName: "Injector",
        password: "hashed-for-test",
        tenantId: null,
        isAdmin: false,
        isSuperAdmin: false,
        tokenVersion: 0,
      })
      .returning();

    slugStrandedUserId = slugStranded.id;
    slugStrandedToken = generateToken(slugStranded as any);

    const app = await buildTestApp();
    slugAgent = supertest(app);
  }, 60_000);

  afterAll(async () => {
    if (slugStrandedUserId) {
      await db
        .update(contacts)
        .set({ linkedUserId: null })
        .where(eq(contacts.linkedUserId, slugStrandedUserId));
      await db.delete(users).where(eq(users.id, slugStrandedUserId));
    }
    if (slugTenantId) {
      await db.execute(
        sql`DELETE FROM override_audit_log WHERE tenant_id = ${slugTenantId}`,
      );
      await db.delete(tenants).where(eq(tenants.id, slugTenantId));
    }
  }, 30_000);

  it(
    "blocks a stranded employee with a valid slug after 10 attempts (429 before handler logic)",
    async () => {
      // Send 10 requests to exhaust the per-IP PIN limiter budget.
      // Each one carries:
      //  • A valid auth cookie (stranded user)
      //  • X-Tenant-Slug pointing at a real store → tenantMiddleware passes
      //  • A forged X-Forwarded-For whose RIGHTMOST entry is uniqueRealIp
      //    (getRealIp reads the rightmost entry, so all 10 share one bucket)
      //
      // The handler rejects each of these early (no PIN configured or
      // membership guard), but the limiter COUNTS them because they pass
      // tenantMiddleware successfully.
      const responses: number[] = [];
      for (let i = 0; i < 10; i++) {
        const res = await slugAgent
          .post("/api/auth/admin-override")
          .set("Cookie", `auth_token=${slugStrandedToken}`)
          .set("X-Tenant-Slug", slugTenantSlug)
          .set("X-Forwarded-For", `192.0.2.${i}, ${uniqueRealIp}`)
          .send({ pin: String(1000 + i).padStart(4, "0"), action: "open_drawer" });

        responses.push(res.status);
        // Each attempt must be rejected by the handler (4xx) — never a success.
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
        expect(res.status).not.toBe(429); // limiter not yet exhausted
      }

      // 11th request: the limiter budget is now exhausted → must be 429.
      const limitedRes = await slugAgent
        .post("/api/auth/admin-override")
        .set("Cookie", `auth_token=${slugStrandedToken}`)
        .set("X-Tenant-Slug", slugTenantSlug)
        .set("X-Forwarded-For", `192.0.2.99, ${uniqueRealIp}`)
        .send({ pin: "9999", action: "open_drawer" });

      expect(limitedRes.status).toBe(429);
      // The rate-limit message must be present.
      expect(typeof limitedRes.body.message).toBe("string");
      expect(limitedRes.body.message).toContain("override PIN");
    },
    30_000,
  );

  it(
    "the 429 response arrives before any PIN lookup or membership guard (limiter fires first)",
    () => {
      // Source-code inspection: confirm the overridePinLimiter is registered as
      // app-level middleware BEFORE the route handler, so the budget check
      // happens before authMiddleware or the handler's own guards.
      const routesPath = path.resolve(__dirname, "../routes.ts");
      const source = fs.readFileSync(routesPath, "utf8");

      // The limiter registration must appear before the route handler.
      const limiterPos = source.indexOf(
        "app.use('/api/auth/admin-override', overridePinLimiter)",
      );
      const handlerPos = source.indexOf('"/api/auth/admin-override"');

      expect(limiterPos).toBeGreaterThan(0);
      expect(handlerPos).toBeGreaterThan(0);
      // Middleware must be registered at a lower offset (earlier in file) than
      // the handler declaration.
      expect(limiterPos).toBeLessThan(handlerPos);
    },
  );
});

// ─── Suite: cross-tenant audit log pollution ──────────────────────────────────

describe("POST /api/auth/admin-override — cross-tenant audit log pollution", () => {
  const PIN = "7391"; // plaintext PIN used for this test's foreign tenant

  let foreignTenantId: number;
  let foreignTenantSlug: string;
  let strandedAdminUserId: string;
  let strandedAdminToken: string;
  let localAgent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    const sfx = randomSuffix();
    foreignTenantSlug = `foreign-store-${sfx}`;

    // Hash the PIN the same way the real PUT /api/admin/override-pin route does.
    const hashedPin = await hashPassword(PIN);

    // Create a foreign tenant with a configured override PIN.
    const [foreignTenant] = await db
      .insert(tenants)
      .values({
        name: `Foreign Store ${sfx}`,
        slug: foreignTenantSlug,
        adminOverridePin: hashedPin,
      })
      .returning();

    foreignTenantId = foreignTenant.id;

    // Create a stranded admin: valid JWT, but tenantId is null in DB.
    // They used to belong to some other store (now gone) and know the foreign
    // store's slug and PIN — perhaps from prior employment.
    const [strandedAdmin] = await db
      .insert(users)
      .values({
        id: `stranded-admin-ov-${sfx}`,
        email: `stranded-admin-ov-${sfx}@test.local`,
        firstName: "Stranded",
        lastName: "Admin",
        password: "hashed-for-test",
        tenantId: null, // ← stranded: no current tenant
        isAdmin: true,
        isSuperAdmin: false,
        tokenVersion: 0,
      })
      .returning();

    strandedAdminUserId = strandedAdmin.id;
    strandedAdminToken = generateToken(strandedAdmin as any);

    const app = await buildTestApp();
    localAgent = supertest(app);
  }, 60_000);

  afterAll(async () => {
    if (strandedAdminUserId) {
      await db
        .update(contacts)
        .set({ linkedUserId: null })
        .where(eq(contacts.linkedUserId, strandedAdminUserId));
      await db.delete(users).where(eq(users.id, strandedAdminUserId));
    }
    if (foreignTenantId) {
      // Clean up any stray audit log rows first (should be none, but defensive).
      await db.execute(
        sql`DELETE FROM override_audit_log WHERE tenant_id = ${foreignTenantId}`,
      );
      await db.delete(tenants).where(eq(tenants.id, foreignTenantId));
    }
  }, 30_000);

  it(
    "rejects a stranded admin supplying a foreign store's slug + correct PIN with 403",
    async () => {
      // The stranded admin passes X-Tenant-Slug for the foreign store.
      // tenantMiddleware resolves the foreign tenant from the slug and sets
      // req.tenantId to foreignTenantId.  The handler's membership guard then
      // detects that actingUser.tenantId (null) !== foreignTenantId and rejects
      // the request before the PIN is ever verified.
      const res = await localAgent
        .post("/api/auth/admin-override")
        .set("Cookie", `auth_token=${strandedAdminToken}`)
        .set("X-Tenant-Slug", foreignTenantSlug)
        .send({ pin: PIN, action: "void_transaction" });

      expect(res.status).toBe(403);
      expect(typeof res.body.message).toBe("string");
      expect(res.body.message.length).toBeGreaterThan(0);
    },
    15_000,
  );

  it(
    "leaves no override_audit_log entries for the foreign tenant after the rejected attempt",
    async () => {
      // Confirm the audit log is clean — the rejected request must not have
      // produced any rows for the foreign tenant.
      const rows = await db.execute(
        sql`SELECT id FROM override_audit_log WHERE tenant_id = ${foreignTenantId} AND actor_user_id = ${strandedAdminUserId}`,
      );
      expect(rows.rows.length).toBe(0);
    },
    15_000,
  );

  it(
    "the handler has a membership guard that returns 403 when the user does not belong to the resolved tenant",
    () => {
      // Source-code inspection: confirm the membership guard exists in the
      // admin-override route handler so it is not accidentally removed in a
      // future refactor.
      const routesPath = path.resolve(__dirname, "../routes.ts");
      const source = fs.readFileSync(routesPath, "utf8");

      const handlerStart = source.indexOf('"/api/auth/admin-override"');
      expect(handlerStart).toBeGreaterThan(0);

      // Extract a generous window after the handler declaration (3000 chars).
      const handlerWindow = source.slice(handlerStart, handlerStart + 3000);

      // The membership guard must be present.
      expect(handlerWindow).toContain("actingUser.tenantId !== tenantId");
      // It must return 403 for the cross-tenant case.
      expect(handlerWindow).toContain("You do not have access to this store's override PIN.");
      // Super-admins must be exempt.
      expect(handlerWindow).toContain("isSuperAdmin");
    },
  );
});

// ─── Suite: super-admin exemption from membership guard ──────────────────────

describe("POST /api/auth/admin-override — super-admin bypasses membership guard", () => {
  /**
   * A super-admin has isSuperAdmin = true in the DB and no tenant of their own.
   * When they supply X-Tenant-Slug for a store they do not belong to,
   * tenantMiddleware resolves the slug and sets req.isSuperAdmin = true.
   * The handler skips the membership guard and verifies the PIN directly.
   * A 200 is returned and an override_audit_log entry is written.
   */

  const SA_PIN = "8472"; // plaintext PIN used for the super-admin's target store

  let saTenantId: number;
  let saTenantSlug: string;
  let saUserId: string;
  let saToken: string;
  let saAgent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    const sfx = randomSuffix();
    saTenantSlug = `sa-target-store-${sfx}`;

    // Hash the PIN the same way the real PUT /api/admin/override-pin route does.
    const hashedPin = await hashPassword(SA_PIN);

    // Create a tenant with a configured override PIN.
    const [saTenant] = await db
      .insert(tenants)
      .values({
        name: `SA Target Store ${sfx}`,
        slug: saTenantSlug,
        adminOverridePin: hashedPin,
      })
      .returning();

    saTenantId = saTenant.id;

    // Create a super-admin user with no tenantId — they do not belong to the
    // target store, which is the cross-tenant access scenario being tested.
    const [saUser] = await db
      .insert(users)
      .values({
        id: `super-admin-ov-${sfx}`,
        email: `super-admin-ov-${sfx}@test.local`,
        firstName: "Super",
        lastName: "Admin",
        password: "hashed-for-test",
        tenantId: null, // ← no matching tenant
        isAdmin: true,
        isSuperAdmin: true,
        tokenVersion: 0,
      })
      .returning();

    saUserId = saUser.id;
    saToken = generateToken(saUser as any);

    const app = await buildTestApp();
    saAgent = supertest(app);
  }, 60_000);

  afterAll(async () => {
    if (saUserId) {
      await db
        .update(contacts)
        .set({ linkedUserId: null })
        .where(eq(contacts.linkedUserId, saUserId));
      await db.delete(users).where(eq(users.id, saUserId));
    }
    if (saTenantId) {
      // Clean up audit log rows written by the super-admin during the test.
      await db.execute(
        sql`DELETE FROM override_audit_log WHERE tenant_id = ${saTenantId} AND actor_user_id = ${saUserId}`,
      );
      await db.delete(tenants).where(eq(tenants.id, saTenantId));
    }
  }, 30_000);

  it(
    "returns 200 when a super-admin supplies a valid store slug and correct PIN",
    async () => {
      // The super-admin has no tenantId in the DB. They pass X-Tenant-Slug so
      // tenantMiddleware resolves the target tenant and sets req.isSuperAdmin = true.
      // The handler's membership guard (`if (!req.isSuperAdmin)`) is skipped, the
      // PIN is verified against the stored hash, and 200 is returned.
      const res = await saAgent
        .post("/api/auth/admin-override")
        .set("Cookie", `auth_token=${saToken}`)
        .set("X-Tenant-Slug", saTenantSlug)
        .send({ pin: SA_PIN, action: "void_transaction", purpose: "super-admin test" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    },
    15_000,
  );

  it(
    "writes an override_audit_log entry for the target tenant after a successful super-admin override",
    async () => {
      // After the successful 200 in the previous test, the handler must have
      // inserted a row into override_audit_log for the target tenant.
      const rows = await db.execute(
        sql`SELECT id, action, actor_user_id FROM override_audit_log
            WHERE tenant_id = ${saTenantId} AND actor_user_id = ${saUserId}`,
      );
      expect(rows.rows.length).toBeGreaterThanOrEqual(1);
      // The logged action must match what was sent.
      const loggedActions = rows.rows.map((r: any) => r.action);
      expect(loggedActions).toContain("void_transaction");
    },
    15_000,
  );

  it(
    "returns 401 when a super-admin supplies the correct slug but an incorrect PIN",
    async () => {
      // The membership guard is still skipped for super-admins, but the PIN
      // verification itself must still catch a wrong PIN.
      const res = await saAgent
        .post("/api/auth/admin-override")
        .set("Cookie", `auth_token=${saToken}`)
        .set("X-Tenant-Slug", saTenantSlug)
        .send({ pin: "0000", action: "open_drawer" });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain("Incorrect override PIN");
    },
    15_000,
  );

  it(
    "the membership guard exempts isSuperAdmin callers in source code",
    () => {
      // Source-code inspection: confirm the isSuperAdmin exemption wrapping the
      // membership guard is present and has not been accidentally removed.
      const routesPath = path.resolve(__dirname, "../routes.ts");
      const source = fs.readFileSync(routesPath, "utf8");

      const handlerStart = source.indexOf('"/api/auth/admin-override"');
      expect(handlerStart).toBeGreaterThan(0);

      // Extract a generous window after the handler declaration (3000 chars).
      const handlerWindow = source.slice(handlerStart, handlerStart + 3000);

      // The exemption must be an explicit isSuperAdmin guard wrapping the
      // membership check — not just a comment.
      expect(handlerWindow).toContain("if (!req.isSuperAdmin)");
      // The membership guard must be nested inside that block.
      const exemptionIdx = handlerWindow.indexOf("if (!req.isSuperAdmin)");
      const membershipIdx = handlerWindow.indexOf("actingUser.tenantId !== tenantId");
      // The membership check must come after the super-admin exemption open brace.
      expect(membershipIdx).toBeGreaterThan(exemptionIdx);
    },
  );
});
