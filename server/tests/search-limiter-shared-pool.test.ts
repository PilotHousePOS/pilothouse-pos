/**
 * Integration test: searchLimiter shared-pool behaviour
 *
 * searchLimiter (windowMs: 1 min, max: 60) is applied to both
 * /api/supplies/search and /api/pets via two separate app.use() calls that
 * reference the **same** rateLimit() instance.  Because both registrations
 * share the same MemoryStore, they also share the same per-IP counter.
 *
 * This test documents and confirms that shared-pool design as a contract:
 *   1. 60 GET /api/supplies/search requests exhaust the searchLimiter budget.
 *   2. The 61st GET /api/supplies/search returns 429.
 *   3. GET /api/pets also returns 429 — the budget was already depleted by
 *      the /api/supplies/search burst, proving the shared-pool behaviour.
 *
 * If this test fails with /api/pets NOT returning 429, the two routes have
 * been decoupled onto separate MemoryStore instances — update the comment in
 * routes.ts to reflect the new independent-pool design.
 *
 * NOTE: An X-Tenant-Slug header is required on every request so that
 * tenantMiddleware resolves a tenantId and calls next() rather than returning
 * 400 before the searchLimiter middleware has a chance to run.
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
  // Create a real tenant so X-Tenant-Slug resolves req.tenantId, which causes
  // tenantMiddleware to call next() and lets searchLimiter run.
  const sfx = randomSuffix();
  testTenantSlug = `sl-pool-${sfx}`;

  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `SearchLimiterSharedPoolTest ${sfx}`,
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

describe("searchLimiter shared-pool — /api/supplies/search traffic depletes /api/pets budget", () => {
  /**
   * Limiter layout (from server/routes.ts):
   *
   *   searchLimiter → app.use('/api/supplies/search', searchLimiter)  max: 60
   *   searchLimiter → app.use('/api/pets',            searchLimiter)  max: 60  (same instance)
   *
   * Both registrations share the same MemoryStore and therefore the same
   * per-IP counter.  After 60 GET /api/supplies/search requests the shared
   * counter reaches 60 / 60 and blocks any further request on either path.
   */

  it(
    "exhausts searchLimiter with 60 GET /api/supplies/search requests — 61st returns 429",
    async () => {
      const SEARCH_LIMITER_MAX = 60;

      // Send exactly max requests. The X-Tenant-Slug header ensures tenantMiddleware
      // resolves a tenantId and calls next(), so searchLimiter can run and count each hit.
      // Each request must not be blocked by the limiter (non-429).
      for (let i = 0; i < SEARCH_LIMITER_MAX; i++) {
        const res = await agent
          .get("/api/supplies/search")
          .set("X-Tenant-Slug", testTenantSlug)
          .query({ q: `test-${i}` });

        expect(
          res.status,
          `attempt ${i + 1}/${SEARCH_LIMITER_MAX} was blocked by searchLimiter before budget was exhausted`,
        ).not.toBe(429);
      }

      // The (max + 1)th request must be blocked by searchLimiter.
      const blockedRes = await agent
        .get("/api/supplies/search")
        .set("X-Tenant-Slug", testTenantSlug)
        .query({ q: "over-limit" });

      expect(
        blockedRes.status,
        `61st GET /api/supplies/search should return 429 but got ${blockedRes.status}`,
      ).toBe(429);

      expect(
        blockedRes.body?.message,
        "429 body should carry the searchLimiter message",
      ).toMatch(/too many search requests/i);
    },
    120_000,
  );

  it(
    "GET /api/pets also returns 429 after the searchLimiter budget is depleted by /api/supplies/search — shared-pool confirmed",
    async () => {
      // At this point the searchLimiter counter (shared between both routes)
      // is already past 60.  Any request on /api/pets must also be blocked
      // because it uses the exact same MemoryStore entry.
      const petsRes = await agent
        .get("/api/pets")
        .set("X-Tenant-Slug", testTenantSlug);

      expect(
        petsRes.status,
        `GET /api/pets should return 429 (shared-pool depleted by /api/supplies/search) but got ${petsRes.status}`,
      ).toBe(429);

      expect(
        petsRes.body?.message,
        "429 body on /api/pets should carry the searchLimiter message",
      ).toMatch(/too many search requests/i);
    },
    30_000,
  );
});
