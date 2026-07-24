/**
 * Integration test: uploadLimiter shared-pool behaviour
 *
 * uploadLimiter (windowMs: 5 min, max: 30) is applied to both
 * /api/upload and /api/admin/order-photos via two separate app.use() calls
 * that reference the **same** rateLimit() instance.  Because both
 * registrations share the same MemoryStore, they also share the same per-IP
 * counter.
 *
 * This test documents and confirms that shared-pool design as a contract:
 *   1. 30 POST /api/upload requests exhaust the uploadLimiter budget.
 *   2. The 31st POST /api/upload returns 429.
 *   3. POST /api/admin/order-photos also returns 429 — the budget was already
 *      depleted by the /api/upload burst, proving the shared-pool behaviour.
 *
 * If this test fails with /api/admin/order-photos NOT returning 429, the two
 * routes have been decoupled onto separate MemoryStore instances — update the
 * comment in routes.ts to reflect the new independent-pool design.
 *
 * NOTE: An X-Tenant-Slug header is required on every request so that
 * tenantMiddleware resolves a tenantId and calls next() rather than returning
 * 400 before the uploadLimiter middleware has a chance to run.
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
  // tenantMiddleware to call next() and lets uploadLimiter run.
  const sfx = randomSuffix();
  testTenantSlug = `ul-pool-${sfx}`;

  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `UploadLimiterSharedPoolTest ${sfx}`,
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

describe("uploadLimiter shared-pool — /api/upload traffic depletes /api/admin/order-photos budget", () => {
  /**
   * Limiter layout (from server/routes.ts):
   *
   *   uploadLimiter → app.use('/api/upload',              uploadLimiter)  max: 30
   *   uploadLimiter → app.use('/api/admin/order-photos',  uploadLimiter)  max: 30  (same instance)
   *
   * Both registrations share the same MemoryStore and therefore the same
   * per-IP counter.  After 30 POST /api/upload requests the shared counter
   * reaches 30 / 30 and blocks any further request on either path.
   */

  it(
    "exhausts uploadLimiter with 30 POST /api/upload requests — 31st returns 429",
    async () => {
      const UPLOAD_LIMITER_MAX = 30;

      // Send exactly max requests. The X-Tenant-Slug header ensures
      // tenantMiddleware resolves a tenantId and calls next(), so uploadLimiter
      // can run and count each hit.  Each request must not be blocked by the
      // limiter (non-429).  We don't include a real file because multer is
      // downstream of the rate-limiter middleware — the limiter fires first and
      // the response status reflects the rate-limiter decision, not the
      // payload validation.
      for (let i = 0; i < UPLOAD_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/upload")
          .set("X-Tenant-Slug", testTenantSlug);

        expect(
          res.status,
          `attempt ${i + 1}/${UPLOAD_LIMITER_MAX} was blocked by uploadLimiter before budget was exhausted`,
        ).not.toBe(429);
      }

      // The (max + 1)th request must be blocked by uploadLimiter.
      const blockedRes = await agent
        .post("/api/upload")
        .set("X-Tenant-Slug", testTenantSlug);

      expect(
        blockedRes.status,
        `31st POST /api/upload should return 429 but got ${blockedRes.status}`,
      ).toBe(429);

      expect(
        blockedRes.body?.message,
        "429 body should carry the uploadLimiter message",
      ).toMatch(/too many uploads/i);
    },
    120_000,
  );

  it(
    "POST /api/admin/order-photos also returns 429 after the uploadLimiter budget is depleted by /api/upload — shared-pool confirmed",
    async () => {
      // At this point the uploadLimiter counter (shared between both routes)
      // is already past 30.  Any request on /api/admin/order-photos must also
      // be blocked because it uses the exact same MemoryStore entry.
      const orderPhotosRes = await agent
        .post("/api/admin/order-photos")
        .set("X-Tenant-Slug", testTenantSlug);

      expect(
        orderPhotosRes.status,
        `POST /api/admin/order-photos should return 429 (shared-pool depleted by /api/upload) but got ${orderPhotosRes.status}`,
      ).toBe(429);

      expect(
        orderPhotosRes.body?.message,
        "429 body on /api/admin/order-photos should carry the uploadLimiter message",
      ).toMatch(/too many uploads/i);
    },
    30_000,
  );
});
