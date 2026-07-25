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
 *  - In both cases no PIN is looked up and no success response is returned.
 *
 * The handler's own `if (!tenantId)` guard (line 15803) provides defense-in-depth
 * and is confirmed present via a source-code inspection assertion.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { users, contacts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { generateToken } from "../auth";
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
