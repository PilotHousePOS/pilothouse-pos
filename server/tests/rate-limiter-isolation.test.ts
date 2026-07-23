/**
 * Integration tests: rate-limiter budget isolation
 *
 * Multiple independent limiters are registered in routes.ts:
 *   - generalLimiter  — /api/*               (windowMs: 15 min, max: 200)
 *   - authLimiter     — /api/auth/login etc.  (windowMs: 15 min, max: 15)
 *   - signupLimiter   — /api/auth/signup      (windowMs: 15 min, max: 15, skips no-tenant)
 *   - searchLimiter   — /api/supplies/search, /api/pets (windowMs: 1 min, max: 60)
 *   - checkoutLimiter — /api/orders etc.      (windowMs: 15 min, max: 10)
 *   - uploadLimiter   — /api/upload etc.      (windowMs: 5 min, max: 30)
 *
 * Each limiter maintains its own MemoryStore keyed by the IP address.
 * A shared-store bug or misconfigured key prefix could cause one limiter's
 * exhausted budget to bleed into another limiter's window.
 *
 * Done looks like:
 *   1. 15 POST /api/auth/login requests exhaust the authLimiter budget.
 *   2. The 16th POST /api/auth/login returns 429.
 *   3. GET /api/stripe/config (only covered by generalLimiter, max 200)
 *      still returns non-429 — generalLimiter budget is unaffected.
 *   4. POST /api/auth/signup WITH a valid tenant slug (signupLimiter active)
 *      also returns non-429 — signupLimiter budget is unaffected.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

// Build a fresh Express app with isolated rate-limiter instances.
// Importing routes inside the function (rather than at module scope) gives each
// test file its own limiter MemoryStore so tests do not interfere with each
// other when run in parallel.
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
let testTenantId: number;
let testTenantSlug: string;

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Create a real tenant so X-Tenant-Slug resolves req.tenantId, which causes
  // signupLimiter to count (rather than skip) the request.
  const sfx = randomSuffix();
  testTenantSlug = `rl-iso-${sfx}`;

  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `RateLimiterIsolationTest ${sfx}`,
      slug: testTenantSlug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  testTenantId = tenant.id;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  if (testTenantId) {
    // Delete any users created by signup requests in this test session,
    // then remove their contact links to avoid FK violations.
    const createdUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, testTenantId));
    const createdUserIds = createdUsers.map((u) => u.id);
    if (createdUserIds.length > 0) {
      await db
        .update(contacts)
        .set({ linkedUserId: null })
        .where(inArray(contacts.linkedUserId, createdUserIds));
      for (const id of createdUserIds) {
        await db.delete(users).where(eq(users.id, id));
      }
    }
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("rate-limiter isolation — authLimiter exhaustion does not bleed into other limiters", () => {
  /**
   * Limiter layout (from server/routes.ts):
   *
   * generalLimiter  → app.use('/api', ...)          max: 200  window: 15 min
   * authLimiter     → app.use('/api/auth/login', .) max:  15  window: 15 min
   * signupLimiter   → app.use('/api/auth/signup',.) max:  15  window: 15 min
   *                   (skip when req.tenantId is absent)
   *
   * After 15 POST /api/auth/login requests:
   *   authLimiter    : 15 / 15  → exhausted
   *   generalLimiter : 15 / 200 → plenty of budget remaining
   *   signupLimiter  :  0 / 15  → untouched (different MemoryStore)
   */

  it(
    "exhausts authLimiter — /api/auth/login returns 429 on the 16th attempt",
    async () => {
      const AUTH_LIMITER_MAX = 15;

      // Exhaust the authLimiter budget with invalid-credential requests.
      // Any non-429 status means the request reached the handler and was counted.
      for (let i = 0; i < AUTH_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/auth/login")
          .send({ email: `rl-iso-${i}@test.local`, password: "wrong" });

        expect(
          res.status,
          `attempt ${i + 1}/${AUTH_LIMITER_MAX} returned 429 before authLimiter budget was exhausted`,
        ).not.toBe(429);
      }

      // 16th request must be blocked by authLimiter.
      const blockedRes = await agent
        .post("/api/auth/login")
        .send({ email: "rl-iso-blocked@test.local", password: "wrong" });

      expect(
        blockedRes.status,
        `16th /api/auth/login should return 429 but got ${blockedRes.status}`,
      ).toBe(429);

      expect(
        blockedRes.body?.message,
        "429 body should carry the authLimiter message",
      ).toMatch(/too many login attempts/i);
    },
    60_000,
  );

  it(
    "GET /api/stripe/config (generalLimiter only) is not blocked after authLimiter exhaustion",
    async () => {
      // generalLimiter max is 200; authLimiter exhaustion consumed at most 16
      // of those slots — far below the threshold. If budgets bled, this would
      // incorrectly return 429.
      const configRes = await agent.get("/api/stripe/config");

      expect(
        configRes.status,
        `GET /api/stripe/config returned 429 after authLimiter exhaustion — budget leaked into generalLimiter`,
      ).not.toBe(429);

      // Must reach the handler (any 2xx–4xx is acceptable; 5xx or 429 is not).
      expect(configRes.status).toBeGreaterThanOrEqual(200);
      expect(configRes.status).toBeLessThan(500);
    },
    30_000,
  );

  it(
    "POST /api/auth/signup with a valid tenant slug (signupLimiter active) is not blocked after authLimiter exhaustion",
    async () => {
      // Sending X-Tenant-Slug causes tenantMiddleware to set req.tenantId,
      // which means signupLimiter does NOT skip the request — it actively
      // counts it. The signupLimiter's counter is still at 0 because no
      // signup requests have been made in this test session.
      //
      // If authLimiter exhaustion bled into signupLimiter's MemoryStore,
      // this request would return 429. It must not.
      const signupRes = await agent
        .post("/api/auth/signup")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({
          email: `rl-iso-signup-${randomSuffix()}@test.local`,
          password: "IsolationTest1!",
          firstName: "Isolated",
          lastName: "User",
          phoneNumber: "5550000001",
        });

      // Must NOT be 429 — that would indicate cross-limiter budget bleed.
      expect(
        signupRes.status,
        `POST /api/auth/signup returned 429 after authLimiter exhaustion — budget leaked into signupLimiter`,
      ).not.toBe(429);

      // The request must have reached the signup handler (any non-429 response
      // from the handler is acceptable — 200/201 for success, 400/409 for
      // duplicate email or validation errors, etc.).
      expect(
        signupRes.status,
        `POST /api/auth/signup should reach the handler (non-429) but got ${signupRes.status}`,
      ).toBeGreaterThanOrEqual(200);
      expect(signupRes.status).toBeLessThan(500);
    },
    30_000,
  );
});
