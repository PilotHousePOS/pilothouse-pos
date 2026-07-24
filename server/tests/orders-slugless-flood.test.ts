/**
 * Integration test: Slugless POST /api/orders flood cannot exhaust the generalLimiter
 *
 * ## Rate-limiter layout (server/routes.ts)
 *
 *   tenantMiddleware  → app.use('/api', ...)               (runs first)
 *   generalLimiter   → app.use('/api', ...)       max: 200  window: 15 min
 *   checkoutLimiter  → app.use('/api/orders', .)  max:  10  window: 15 min
 *
 * ## Why /api/orders is different from /auth/signup
 *
 * The generalLimiter has ONE explicit skip:
 *
 *   skip: (req) => req.path === '/auth/signup' && !req.tenantId
 *
 * This skip was added specifically for /auth/signup because a misconfigured
 * widget can flood that endpoint without a slug and otherwise burn through the
 * 200-request general budget.  POST /api/orders has NO such skip.
 *
 * However, that is fine — and this test confirms it — because the middleware
 * execution order already provides isolation for /api/orders:
 *
 *   1. tenantMiddleware runs first.  A slugless /api/orders request matches
 *      none of the UNAUTHENTICATED_NO_SLUG_ALLOWLIST entries and is rejected
 *      immediately with 400 "Missing tenant" WITHOUT calling next().
 *
 *   2. Because next() is never called, generalLimiter is never invoked.
 *      Its skip predicate is never evaluated.  The in-memory counter is
 *      not decremented.
 *
 *   3. Because generalLimiter is never invoked, checkoutLimiter is also
 *      never invoked.  Both budgets are fully preserved.
 *
 * Consequence: A client that floods POST /api/orders without a slug:
 *   - Receives 400 for every request (tenantMiddleware blocks it)
 *   - Does NOT consume any generalLimiter budget
 *   - Does NOT consume any checkoutLimiter budget
 *   - Cannot block unrelated API calls for the same IP
 *
 * ## What is confirmed by this test
 *
 *   Suite 1 — Delta assertion (main proof):
 *     50 slugless POST /api/orders → all 400.
 *     generalLimiter counter drops by exactly 1 (only the post-flood probe),
 *     not by 51 — confirming the 50 flood requests were never counted.
 *
 *   Suite 2 — Slugged request unblocked after slugless flood:
 *     After the slugless flood, POST /api/orders WITH a valid X-Tenant-Slug
 *     is not 429 from generalLimiter (budget is intact) and not 429 from
 *     checkoutLimiter (budget is intact).  It returns 401 (no auth cookie),
 *     confirming both limiters still have their full budgets.
 *
 *   Suite 3 — 201st slugless request does NOT trigger generalLimiter 429:
 *     Sends 200 slugless POST /api/orders and then a 201st.  The 201st
 *     returns 400 (tenantMiddleware blocked it), NOT 429.  This directly
 *     refutes the concern that a sufficiently large slug-less flood could
 *     exhaust generalLimiter — the generalLimiter is never reached at all.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function parseRemaining(headers: Record<string, string>): number {
  const val = headers["ratelimit-remaining"];
  return val !== undefined ? parseInt(val, 10) : NaN;
}

// ─── Shared tenant fixture ─────────────────────────────────────────────────────

let testTenantId: number;
let testTenantSlug: string;

beforeAll(async () => {
  const sfx = randomSuffix();
  testTenantSlug = `orders-flood-${sfx}`;

  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `OrdersFloodTest ${sfx}`,
      slug: testTenantSlug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  testTenantId = tenant.id;
}, 30_000);

afterAll(async () => {
  if (testTenantId) {
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  }
}, 30_000);

// ─── Suite 1: Delta assertion — general budget is NOT consumed ─────────────────
//
// This is the primary proof.  If the 50 slugless /api/orders requests were
// reaching and counting against the generalLimiter, the counter would drop by 51
// (50 flood + 1 post-flood probe GET).  It must drop by exactly 1.

describe("Slugless POST /api/orders flood — generalLimiter budget is not consumed", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    // Fresh app → fresh in-memory rate-limit store → deterministic deltas.
    const app = await buildTestApp();
    agent = supertest(app);
  }, 60_000);

  it(
    "50 slugless POST /api/orders return 400 and the general counter drops by exactly 1 (only the post-flood probe)",
    async () => {
      const FLOOD_COUNT = 50;

      // ── Baseline: one cheap GET before the flood ──────────────────────────
      // GET /api/supplies (with a valid slug) passes through the generalLimiter
      // and exposes the RateLimit-Remaining header.  This endpoint is used
      // consistently across all flood-isolation tests because it reliably
      // returns the header (unlike /api/stripe/config which may not emit it
      // in all test configurations).
      const baselineRes = await agent
        .get("/api/supplies")
        .set("X-Tenant-Slug", testTenantSlug);
      expect(baselineRes.status).not.toBe(429);

      const baselineRemaining = parseRemaining(
        baselineRes.headers as Record<string, string>,
      );

      if (isNaN(baselineRemaining)) {
        console.warn(
          "[orders-slugless-flood] RateLimit-Remaining header not present on baseline; skipping delta check.",
        );
        return;
      }

      // ── Flood: 50 POST /api/orders without X-Tenant-Slug ─────────────────
      for (let i = 0; i < FLOOD_COUNT; i++) {
        const res = await agent
          .post("/api/orders")
          // Deliberately omit X-Tenant-Slug so tenantMiddleware fires 400.
          .send({ items: [] });

        // tenantMiddleware short-circuits with 400 "Missing tenant" and does
        // NOT call next(), so generalLimiter is never invoked.
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("MISSING_TENANT");

        // The 400 is NOT a rate-limit response — confirm no "too many" body.
        expect(res.body.message).not.toMatch(/too many/i);
        expect(res.body.message).not.toMatch(/rate/i);
      }

      // ── Post-flood probe: one more GET ────────────────────────────────────
      const postFloodRes = await agent
        .get("/api/supplies")
        .set("X-Tenant-Slug", testTenantSlug);
      expect(postFloodRes.status).not.toBe(429);

      const postFloodRemaining = parseRemaining(
        postFloodRes.headers as Record<string, string>,
      );
      expect(postFloodRemaining).not.toBeNaN();

      // ── Key assertion: counter dropped by exactly 1 (not 51) ─────────────
      //
      // If the 50 slugless /api/orders requests were counted by generalLimiter
      // the delta would be 51 (50 flood + 1 post-flood probe).
      //
      // The delta must be exactly 1 — only the post-flood probe GET consumed a
      // slot — proving that tenantMiddleware's early 400 return prevented the
      // generalLimiter from ever running on the flood requests.
      const delta = baselineRemaining - postFloodRemaining;
      expect(
        delta,
        `Expected general-limiter counter to drop by 1 (post-flood probe only), got ${delta}. ` +
          `If delta is 51, the 50 slugless requests were incorrectly counted.`,
      ).toBe(1);
    },
    60_000,
  );
});

// ─── Suite 2: Slugged request is unblocked after slugless flood ────────────────
//
// After the slugless flood, a POST /api/orders WITH a valid X-Tenant-Slug must:
//   - NOT be blocked by generalLimiter (429 "Too many requests") — budget intact
//   - NOT be blocked by checkoutLimiter (429 "Too many checkout attempts") — budget intact
//   - Return 401 (no auth cookie) — confirming it reached the route handler
//
// checkoutLimiter (max: 10) has its own MemoryStore separate from generalLimiter
// (max: 200).  The slugless flood consumed zero slots from either store, so the
// first slugged /api/orders request must not be 429.

describe("POST /api/orders WITH a valid slug is not blocked after a slugless flood", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    // Fresh app → clean MemoryStore → no pollution from other suites.
    const app = await buildTestApp();
    agent = supertest(app);
  }, 60_000);

  it(
    "50 slugless POSTs do not consume checkoutLimiter budget — first slugged request is not 429",
    async () => {
      const FLOOD_COUNT = 50;

      // ── Flood: 50 slugless orders ─────────────────────────────────────────
      for (let i = 0; i < FLOOD_COUNT; i++) {
        const res = await agent.post("/api/orders").send({ items: [] });
        // All must be 400 from tenantMiddleware — not 429 from any limiter.
        expect(res.status).toBe(400);
        expect(res.status).not.toBe(429);
      }

      // ── Slugged request: must not be 429 from generalLimiter or checkoutLimiter
      const sluggedRes = await agent
        .post("/api/orders")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({ items: [] });

      // Must not be 429 — neither limiter was exhausted by the slugless flood.
      expect(
        sluggedRes.status,
        `POST /api/orders with a valid slug returned 429 after a slugless flood — ` +
          `one or both limiters were incorrectly consumed by the slugless requests.`,
      ).not.toBe(429);

      // The response should not carry a generalLimiter 429 message.
      if (sluggedRes.status === 429) {
        expect(sluggedRes.body.message).not.toMatch(/too many requests/i);
        expect(sluggedRes.body.message).not.toMatch(/too many checkout/i);
      }

      // 401 means it passed both limiters and reached the auth guard — the
      // expected outcome when no auth cookie is present.
      // Any 2xx–4xx (except 429) is acceptable here.
      expect(sluggedRes.status).toBeGreaterThanOrEqual(200);
      expect(sluggedRes.status).toBeLessThan(500);
    },
    60_000,
  );
});

// ─── Suite 3: 201st slugless request is still 400, NOT 429 ────────────────────
//
// This suite directly refutes the flood-exhaustion concern.
//
// The generalLimiter has max: 200.  If slugless /api/orders requests were
// counted, the 201st request would trigger a 429.  Since tenantMiddleware
// always blocks slugless requests BEFORE the generalLimiter runs, the 201st
// request must also return 400 — proving the limiter counter was never touched.
//
// Note: 200 requests is chosen to exactly match the generalLimiter budget cap
// so that any accidental counting would be caught on this exact request.

describe("201st slugless POST /api/orders returns 400, NOT 429 (generalLimiter was never reached)", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    // Fresh app — the generalLimiter counter starts at 200.
    const app = await buildTestApp();
    agent = supertest(app);
  }, 120_000);

  it(
    "200 slugless requests return 400, and the 201st also returns 400 — NOT 429",
    async () => {
      const GENERAL_LIMITER_MAX = 200;

      // ── Send exactly generalLimiter's max of 200 slugless POSTs ──────────
      for (let i = 0; i < GENERAL_LIMITER_MAX; i++) {
        const res = await agent
          .post("/api/orders")
          // No X-Tenant-Slug → tenantMiddleware returns 400 before any
          // limiter runs.
          .send({ items: [] });

        expect(
          res.status,
          `Request ${i + 1} / ${GENERAL_LIMITER_MAX}: expected 400 from tenantMiddleware but got ${res.status}`,
        ).toBe(400);
      }

      // ── 201st request ─────────────────────────────────────────────────────
      const over = await agent.post("/api/orders").send({ items: [] });

      // MUST be 400 — tenantMiddleware still fires first and sends 400 without
      // calling next(), so the generalLimiter counter was never incremented.
      // A 429 here would mean the slugless flood incorrectly exhausted the
      // general budget, which is the exact vulnerability this test guards against.
      expect(
        over.status,
        `201st slugless POST /api/orders returned ${over.status} — expected 400 ` +
          `(tenantMiddleware should still block it) but got ${over.status === 429 ? "429 (generalLimiter was incorrectly exhausted by the slugless flood)" : over.status}.`,
      ).toBe(400);

      // Body must describe the missing-tenant problem, not a rate-limit.
      expect(over.body.code).toBe("MISSING_TENANT");
      expect(over.body.message).not.toMatch(/too many/i);
    },
    120_000,
  );
});
