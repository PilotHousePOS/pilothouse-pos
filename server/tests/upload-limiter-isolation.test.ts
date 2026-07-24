/**
 * Integration tests: uploadLimiter budget isolation
 *
 * uploadLimiter is applied to:
 *   - /api/upload             (windowMs: 5 min, max: 30)
 *   - /api/admin/order-photos (windowMs: 5 min, max: 30)
 *
 * Each rateLimit() call creates its own MemoryStore instance.  The
 * uploadLimiter store is completely separate from generalLimiter's store.
 * A misconfigured key prefix in a future refactor could silently
 * cross-pollinate budgets — this test documents and guards that boundary.
 *
 * Middleware execution order for POST /api/upload:
 *   1. tenantMiddleware  — resolves tenant from X-Tenant-Slug (must be present)
 *   2. generalLimiter    — /api/*  (max 200, window 15 min)
 *   3. uploadLimiter     — /api/upload (max 30, window 5 min)
 *   4. authMiddleware    — returns 401 for unauthenticated requests
 *
 * Because tenantMiddleware runs before uploadLimiter, requests must include a
 * valid X-Tenant-Slug header to reach the upload rate limiter at all.
 * Unauthenticated requests are then rejected 401 by authMiddleware — a cheap
 * way to exhaust the upload budget without needing a real file or session.
 *
 * Done looks like:
 *   1. 30 POST /api/upload requests (with a valid slug) exhaust the uploadLimiter.
 *   2. The 31st POST /api/upload returns 429.
 *   3. GET /api/stripe/config (registered before tenantMiddleware, generalLimiter
 *      only, max 200) still returns a non-429 handler response — the
 *      generalLimiter budget is completely unaffected by uploadLimiter exhaustion.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

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
  // Create a real tenant so X-Tenant-Slug resolves req.tenantId, which allows
  // requests to pass through tenantMiddleware and reach the uploadLimiter.
  const sfx = randomSuffix();
  testTenantSlug = `ul-iso-${sfx}`;

  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `UploadLimiterIsolationTest ${sfx}`,
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
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("uploadLimiter isolation — exhaustion does not bleed into generalLimiter", () => {
  /**
   * Limiter layout (from server/routes.ts):
   *
   * generalLimiter  → app.use('/api', ...)            max: 200  window: 15 min
   * uploadLimiter   → app.use('/api/upload', ...)     max:  30  window:  5 min
   *                   app.use('/api/admin/order-photos', ...) (same instance)
   *
   * POST /api/upload has this middleware chain:
   *   tenantMiddleware → generalLimiter → uploadLimiter → authMiddleware → handler
   *
   * Unauthenticated requests with a valid slug are counted by uploadLimiter,
   * then rejected 401 by authMiddleware — no file or real session needed.
   *
   * After 30 POST /api/upload requests (with valid slug):
   *   uploadLimiter  : 30 / 30  → exhausted
   *   generalLimiter : 30 / 200 → plenty of budget remaining
   *
   * The 31st upload must be blocked (429) and the unrelated endpoint must not.
   *
   * Note: GET /api/stripe/config bypasses tenantMiddleware because billing
   * routes are registered inside registerBillingRoutes() which is called before
   * app.use('/api', tenantMiddleware) — Express routes match in registration
   * order, so the handler fires and responds before tenantMiddleware runs.
   * It therefore does not need X-Tenant-Slug to reach its handler.
   */

  it(
    "exhausts uploadLimiter — POST /api/upload returns 429 on the 31st attempt",
    async () => {
      const UPLOAD_LIMITER_MAX = 30;

      // Exhaust the uploadLimiter budget.  We include X-Tenant-Slug so that
      // tenantMiddleware resolves req.tenantId and allows the request to pass
      // through to the uploadLimiter.  The request then hits authMiddleware,
      // which rejects it with 401 (no auth token) — far short of the route
      // handler.  Any non-429 status confirms the request was counted by the
      // uploadLimiter rather than immediately blocked.
      for (let i = 0; i < UPLOAD_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/upload")
          .set("X-Tenant-Slug", testTenantSlug)
          .set("Content-Type", "application/json")
          .send({});

        expect(
          res.status,
          `attempt ${i + 1}/${UPLOAD_LIMITER_MAX} returned 429 before uploadLimiter budget was exhausted`,
        ).not.toBe(429);
      }

      // 31st request must be blocked by uploadLimiter.
      const blockedRes = await agent
        .post("/api/upload")
        .set("X-Tenant-Slug", testTenantSlug)
        .set("Content-Type", "application/json")
        .send({});

      expect(
        blockedRes.status,
        `31st POST /api/upload should return 429 but got ${blockedRes.status}`,
      ).toBe(429);

      expect(
        blockedRes.body?.message,
        "429 body should carry the uploadLimiter message",
      ).toMatch(/too many uploads/i);
    },
    60_000,
  );

  it(
    "GET /api/stripe/config (generalLimiter only) is not blocked after uploadLimiter exhaustion",
    async () => {
      /**
       * generalLimiter max is 200.  The 31 upload attempts above consumed at
       * most 31 slots from the generalLimiter window — well below the 200
       * threshold.  If the uploadLimiter and generalLimiter shared a MemoryStore
       * (or the key prefix was accidentally identical), their counters would be
       * conflated and a future misconfig could push the general budget over its
       * limit far sooner than expected.
       *
       * GET /api/stripe/config is registered by registerBillingRoutes() before
       * tenantMiddleware is mounted, so it does not need X-Tenant-Slug and
       * reaches its handler without interacting with uploadLimiter at all.
       * Only generalLimiter applies to it.
       */
      const configRes = await agent.get("/api/stripe/config");

      expect(
        configRes.status,
        "GET /api/stripe/config returned 429 after uploadLimiter exhaustion — budget leaked into generalLimiter",
      ).not.toBe(429);

      // Must reach the handler (any 2xx–4xx is acceptable; 5xx or 429 is not).
      expect(configRes.status).toBeGreaterThanOrEqual(200);
      expect(configRes.status).toBeLessThan(500);
    },
    30_000,
  );
});
