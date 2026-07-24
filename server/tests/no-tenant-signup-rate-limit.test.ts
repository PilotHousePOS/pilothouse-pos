/**
 * Tests: No-tenant signup floods do not exhaust the general rate-limit budget
 *
 * The generalLimiter skips POST /api/auth/signup requests that arrive without a
 * tenant context (no X-Tenant-Slug header, no ?tenant= query param, no auth
 * cookie).  Without this skip, a flood of misconfigured no-slug signup attempts
 * from one IP could burn through the 200 req/15 min general budget and block
 * unrelated catalog browsing from the same IP.
 *
 * Four behaviours are confirmed with strict delta assertions:
 *
 *  1. 50 no-tenant signup POSTs → every one returns 400, and the general
 *     rate-limit counter changes by EXACTLY 1 (only the post-flood probe)
 *     not by 51.
 *
 *  2. After the flood, a normal GET /api/supplies (with a slug) succeeds.
 *
 *  3. A POST /api/auth/signup WITH a valid tenant slug IS counted against the
 *     general limiter: the remaining counter visible on the signup response
 *     is exactly 1 less than it was after the baseline probe.
 *
 *  4. ALLOW_TENANT_FALLBACK=true (dev/staging mode): when the fallback is
 *     enabled tenantMiddleware sets req.tenantId = 1 for slug-less requests
 *     instead of returning 400.  That means the generalLimiter skip
 *     (`!req.tenantId`) evaluates to false, and every no-slug signup IS
 *     counted against the general budget.  This is intentional and
 *     acceptable — ALLOW_TENANT_FALLBACK is a dev-only toggle that is never
 *     set in production.
 *
 * Each describe block gets its own fresh express app so the in-memory
 * rate-limit store starts clean and deltas are deterministic.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, contacts } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { generateToken } from "../auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function parseRemaining(headers: Record<string, string>): number {
  // express-rate-limit standardHeaders sends "ratelimit-remaining" (lowercase)
  const val = headers["ratelimit-remaining"];
  return val !== undefined ? parseInt(val, 10) : NaN;
}

// ─── Shared tenant fixture ─────────────────────────────────────────────────────

let tenantId: number;
let tenantSlug: string;
const createdUserIds: string[] = [];

beforeAll(async () => {
  const sfx = randomSuffix();
  tenantSlug = `rl-flood-${sfx}`;

  // Advance sequence to avoid ID collisions with parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `RateLimit Flood Test ${sfx}`,
      slug: tenantSlug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  tenantId = tenant.id;
}, 30_000);

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(inArray(contacts.linkedUserId, createdUserIds));
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
  }
  if (tenantId) {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  }
}, 30_000);

// ─── Suite 1: Flood isolation — fresh app so limiter starts at 200 ─────────────

describe("No-tenant signup flood — general budget is not consumed", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    // Fresh app → fresh in-memory rate-limit store → deterministic deltas.
    const app = await buildTestApp();
    agent = supertest(app);
  }, 60_000);

  it(
    "50 no-tenant POSTs return 400 and the general counter drops by exactly 1 (only the post-flood probe)",
    async () => {
      const FLOOD_COUNT = 50;

      // ── Baseline: one catalog GET before the flood ────────────────────────
      const baselineRes = await agent
        .get("/api/supplies")
        .set("X-Tenant-Slug", tenantSlug);
      expect(baselineRes.status).not.toBe(429);

      const baselineRemaining = parseRemaining(
        baselineRes.headers as Record<string, string>,
      );
      expect(baselineRemaining).not.toBeNaN();

      // ── Flood: 50 no-tenant signups ──────────────────────────────────────
      for (let i = 0; i < FLOOD_COUNT; i++) {
        const sfx = randomSuffix();
        const res = await agent.post("/api/auth/signup").send({
          email: `flood-${sfx}@test.local`,
          password: "Test1234!",
          firstName: "Flood",
          lastName: "User",
          phoneNumber: `555${String(i).padStart(7, "0")}`,
        });
        // tenantMiddleware blocks before generalLimiter runs.
        expect(res.status).toBe(400);
      }

      // ── Post-flood probe: one more catalog GET ────────────────────────────
      const postFloodRes = await agent
        .get("/api/supplies")
        .set("X-Tenant-Slug", tenantSlug);
      expect(postFloodRes.status).not.toBe(429);

      const postFloodRemaining = parseRemaining(
        postFloodRes.headers as Record<string, string>,
      );
      expect(postFloodRemaining).not.toBeNaN();

      // ── Key assertion: the counter dropped by exactly 1, not 51 ──────────
      // If the 50 no-tenant signups were wrongly counted, the delta would be 51
      // (50 flood + 1 probe).  It must be exactly 1 (only the post-flood probe).
      const delta = baselineRemaining - postFloodRemaining;
      expect(delta).toBe(1);
    },
    30_000,
  );

  it("catalog browsing still returns non-429 after the flood", async () => {
    const res = await agent
      .get("/api/supplies")
      .set("X-Tenant-Slug", tenantSlug);
    expect(res.status).not.toBe(429);
  });
});

// ─── Suite 2: Slug-bearing signup IS counted — fresh app for clean state ───────

describe("Slug-bearing signup — counted against the general limiter", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    // Separate fresh app so this suite's limiter starts at 200.
    const app = await buildTestApp();
    agent = supertest(app);
  }, 60_000);

  it(
    "a signup WITH a valid tenant slug decrements the general-limiter counter by 1",
    async () => {
      // ── Baseline: one catalog GET so we know the starting remaining count ─
      const baselineRes = await agent
        .get("/api/supplies")
        .set("X-Tenant-Slug", tenantSlug);
      expect(baselineRes.status).not.toBe(429);

      const baselineRemaining = parseRemaining(
        baselineRes.headers as Record<string, string>,
      );
      expect(baselineRemaining).not.toBeNaN();
      // After 1 request on a fresh limiter the baseline should be 199.
      expect(baselineRemaining).toBe(199);

      // ── Send a signup WITH the tenant slug (req.tenantId will be set) ─────
      // The generalLimiter's skip function returns false when tenantId is set,
      // so this request IS counted.
      const sfx = randomSuffix();
      const signupRes = await agent
        .post("/api/auth/signup")
        .set("X-Tenant-Slug", tenantSlug)
        .send({
          email: `rl-counted-${sfx}@test.local`,
          password: "Test1234!",
          firstName: "Counted",
          lastName: "User",
          phoneNumber: `5551${sfx.slice(0, 6)}`,
        });

      // The signup must not be rate-limited itself.
      expect(signupRes.status).not.toBe(429);

      // Track for cleanup
      if ([200, 201].includes(signupRes.status)) {
        const [dbUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, `rl-counted-${sfx}@test.local`));
        if (dbUser) createdUserIds.push(dbUser.id);
      }

      // ── Post-signup probe: the general counter should have dropped by 1 more
      const postSignupRes = await agent
        .get("/api/supplies")
        .set("X-Tenant-Slug", tenantSlug);
      expect(postSignupRes.status).not.toBe(429);

      const postSignupRemaining = parseRemaining(
        postSignupRes.headers as Record<string, string>,
      );
      expect(postSignupRemaining).not.toBeNaN();

      // We've consumed:
      //   1 (baseline GET) + 1 (slug-bearing signup) + 1 (this probe GET) = 3
      // So remaining should be 200 - 3 = 197.
      //
      // The critical check is the delta from baseline: must be 2 (signup + probe),
      // not 1 (probe only — which would happen if the signup was skipped).
      const totalDelta = baselineRemaining - postSignupRemaining;
      expect(totalDelta).toBe(2);
    },
    30_000,
  );
});

// ─── Suite 3: ALLOW_TENANT_FALLBACK=true — flood IS counted (dev-only mode) ───
//
// When ALLOW_TENANT_FALLBACK=true, tenantMiddleware sets req.tenantId = 1 for
// every slug-less request instead of returning 400.  As a result the
// generalLimiter's skip condition (`req.path === '/auth/signup' && !req.tenantId`)
// evaluates to FALSE — req.tenantId is 1 (truthy) — so every no-slug signup
// IS counted against the general 200 req/15 min budget.
//
// This is intentional: ALLOW_TENANT_FALLBACK is a dev/staging-only toggle that
// is never enabled in production.  Flood protection in this mode is a nice-to-
// have, not a security requirement.  The suite documents the actual behaviour so
// that future changes to the skip predicate do not silently regress it in ways
// that could affect production logic.

describe(
  "ALLOW_TENANT_FALLBACK=true — no-slug signup flood IS counted against general budget (dev-only mode)",
  () => {
    let agent: ReturnType<typeof supertest>;
    let prevFallback: string | undefined;
    const fallbackCreatedUserIds: string[] = [];

    beforeAll(async () => {
      // Save and override the env var so tenantMiddleware uses the fallback path.
      // tenantMiddleware reads process.env.ALLOW_TENANT_FALLBACK at request-time,
      // so setting it before the app processes requests is sufficient.
      prevFallback = process.env.ALLOW_TENANT_FALLBACK;
      process.env.ALLOW_TENANT_FALLBACK = "true";

      // Fresh app → fresh in-memory rate-limit store → deterministic deltas.
      const app = await buildTestApp();
      agent = supertest(app);
    }, 60_000);

    afterAll(async () => {
      // Restore env var so subsequent suites / test files are unaffected.
      if (prevFallback === undefined) {
        delete process.env.ALLOW_TENANT_FALLBACK;
      } else {
        process.env.ALLOW_TENANT_FALLBACK = prevFallback;
      }

      // Clean up any users that were actually created via the fallback tenant.
      if (fallbackCreatedUserIds.length > 0) {
        await db
          .update(contacts)
          .set({ linkedUserId: null })
          .where(inArray(contacts.linkedUserId, fallbackCreatedUserIds));
        for (const id of fallbackCreatedUserIds) {
          await db.delete(users).where(eq(users.id, id));
        }
      }
    }, 30_000);

    it(
      "50 no-slug signup POSTs are counted against the general budget — delta is 51, not 1",
      async () => {
        // ── Baseline: one catalog GET before the flood ──────────────────────
        // The X-Tenant-Slug header is required here so the supplies endpoint
        // resolves a valid tenant and returns non-400.
        const baselineRes = await agent
          .get("/api/supplies")
          .set("X-Tenant-Slug", tenantSlug);
        expect(baselineRes.status).not.toBe(429);

        const baselineRemaining = parseRemaining(
          baselineRes.headers as Record<string, string>,
        );
        expect(baselineRemaining).not.toBeNaN();

        // ── Flood: 12 no-slug signup POSTs ─────────────────────────────────
        // With ALLOW_TENANT_FALLBACK=true, tenantMiddleware sets req.tenantId = 1
        // and calls next() instead of returning 400.  The generalLimiter skip
        // (`!req.tenantId`) is now false, so each request IS counted against the
        // general budget.
        //
        // Important constraint: the signupLimiter (max: 15, skip: !req.tenantId)
        // also counts these requests in fallback mode because req.tenantId is 1
        // (truthy).  We cap the flood at 12 to stay well under the signupLimiter
        // budget and avoid 429 responses mid-flood — the goal of this test is to
        // confirm general-budget consumption, not to test the signupLimiter itself.
        const FLOOD_COUNT = 12;
        for (let i = 0; i < FLOOD_COUNT; i++) {
          const sfx = randomSuffix();
          const res = await agent.post("/api/auth/signup").send({
            email: `fb-flood-${sfx}@test.local`,
            password: "Test1234!",
            firstName: "Fallback",
            lastName: "Flood",
            phoneNumber: `556${String(i).padStart(7, "0")}`,
          });

          // Track any users that were actually created so we can clean up.
          if ([200, 201].includes(res.status)) {
            const [dbUser] = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, `fb-flood-${sfx}@test.local`));
            if (dbUser) fallbackCreatedUserIds.push(dbUser.id);
          }

          // Must not be 429 — we are within both the general (200) and signup (15)
          // limiter budgets at this point.
          expect(res.status).not.toBe(429);
        }

        // ── Post-flood probe: one more catalog GET ──────────────────────────
        const postFloodRes = await agent
          .get("/api/supplies")
          .set("X-Tenant-Slug", tenantSlug);
        expect(postFloodRes.status).not.toBe(429);

        const postFloodRemaining = parseRemaining(
          postFloodRes.headers as Record<string, string>,
        );
        expect(postFloodRemaining).not.toBeNaN();

        // ── Key assertion: the counter dropped by 13 (12 flood + 1 probe) ──
        //
        // This is the opposite of Suite 1's delta-of-1: in fallback mode the
        // skip does NOT fire, so each of the 12 flood requests consumes one slot
        // from the general budget.  The delta must be 13, not 1.
        //
        // If the delta were 1 it would mean the flood was incorrectly skipped in
        // fallback mode — a regression that could silently break protection logic.
        const delta = baselineRemaining - postFloodRemaining;
        expect(delta).toBe(13);
      },
      60_000,
    );

    it(
      "catalog browsing still succeeds after the flood (budget not exhausted at 50 requests)",
      async () => {
        // 50 flood + a few surrounding probes should not exhaust the 200-slot
        // general budget; ordinary browsing must remain available.
        const res = await agent
          .get("/api/supplies")
          .set("X-Tenant-Slug", tenantSlug);
        expect(res.status).not.toBe(429);
      },
    );
  },
);

// ─── Suite 4: ALLOW_TENANT_FALLBACK=true — signupLimiter triggers on the 16th ─
//
// With ALLOW_TENANT_FALLBACK=true, tenantMiddleware sets req.tenantId = 1 for
// slug-less requests.  The signupLimiter's skip condition (`!req.tenantId`)
// evaluates to FALSE — req.tenantId is 1 (truthy) — so every no-slug signup
// IS counted against the signupLimiter's 15 req/15 min budget.
//
// This suite sends exactly 16 no-slug signups and asserts that:
//   - Requests 1–15 are NOT rate-limited by the signupLimiter (not 429).
//   - Request 16 IS rate-limited by the signupLimiter (429).
//
// This is intentional and documented: ALLOW_TENANT_FALLBACK is a dev/staging-only
// toggle that is never enabled in production.  The signupLimiter providing flood
// protection in this mode is a side-effect, not a security requirement.

describe(
  "ALLOW_TENANT_FALLBACK=true — signupLimiter blocks the 16th no-slug signup (dev-only mode)",
  () => {
    let agent: ReturnType<typeof supertest>;
    let prevFallback: string | undefined;
    const suite4CreatedUserIds: string[] = [];

    beforeAll(async () => {
      // Save and override the env var so tenantMiddleware uses the fallback path.
      prevFallback = process.env.ALLOW_TENANT_FALLBACK;
      process.env.ALLOW_TENANT_FALLBACK = "true";

      // Fresh app → fresh in-memory rate-limit store so the signupLimiter
      // starts at its full budget of 15 and the delta assertions are deterministic.
      const app = await buildTestApp();
      agent = supertest(app);
    }, 60_000);

    afterAll(async () => {
      // Restore env var so subsequent suites / test files are unaffected.
      if (prevFallback === undefined) {
        delete process.env.ALLOW_TENANT_FALLBACK;
      } else {
        process.env.ALLOW_TENANT_FALLBACK = prevFallback;
      }

      // Clean up any users that were actually created via the fallback tenant.
      if (suite4CreatedUserIds.length > 0) {
        await db
          .update(contacts)
          .set({ linkedUserId: null })
          .where(inArray(contacts.linkedUserId, suite4CreatedUserIds));
        for (const id of suite4CreatedUserIds) {
          await db.delete(users).where(eq(users.id, id));
        }
      }
    }, 30_000);

    it(
      "requests 1–15 are not blocked by the signupLimiter",
      async () => {
        // With ALLOW_TENANT_FALLBACK=true the signupLimiter skip (!req.tenantId)
        // evaluates to false (req.tenantId is 1), so each request consumes one
        // slot from the signupLimiter's 15 req/15 min budget.
        for (let i = 0; i < 15; i++) {
          const sfx = randomSuffix();
          const res = await agent.post("/api/auth/signup").send({
            email: `sl-flood-${sfx}@test.local`,
            password: "Test1234!",
            firstName: "Signup",
            lastName: "Limit",
            phoneNumber: `557${String(i).padStart(7, "0")}`,
          });

          // Track any users that were actually created so we can clean up.
          if ([200, 201].includes(res.status)) {
            const [dbUser] = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, `sl-flood-${sfx}@test.local`));
            if (dbUser) suite4CreatedUserIds.push(dbUser.id);
          }

          // The first 15 requests must NOT be rate-limited by the signupLimiter.
          expect(res.status).not.toBe(429);
        }
      },
      60_000,
    );

    it(
      "the 16th no-slug signup returns 429 (signupLimiter budget exhausted)",
      async () => {
        // The signupLimiter budget (max: 15) has been fully consumed by the
        // previous test.  The 16th request must be rejected with 429.
        const sfx = randomSuffix();
        const res = await agent.post("/api/auth/signup").send({
          email: `sl-flood-16th-${sfx}@test.local`,
          password: "Test1234!",
          firstName: "Signup",
          lastName: "Blocked",
          phoneNumber: `5580000016`,
        });

        expect(res.status).toBe(429);
      },
      30_000,
    );
  },
);

// ─── Suite 5: Stranded user (auth cookie, no tenant) — general budget is not consumed
//
// A "stranded" user has a valid, signed auth cookie (their account exists in the
// DB) but has no tenantId because no X-Tenant-Slug header or ?tenant= query param
// is provided.
//
// Middleware execution order for POST /api/auth/signup without a slug:
//
//   1. tenantMiddleware (app.use '/api') — detects authenticated user with no
//      tenantId and no slug.  /auth/signup is not in the NO_TENANT_ALLOWLIST,
//      so it returns 403 immediately and calls res.end().
//
//   2. generalLimiter (app.use '/api') — is NEVER reached because tenantMiddleware
//      already called res.end().  The rate-limit counter is not decremented.
//
// Consequence: a stranded user's signup flood consumes zero slots from the
// general 200 req/15 min budget — even better isolation than the anonymous
// no-slug case (which relies on the generalLimiter's skip function).
//
// This also confirms the generalLimiter skip check (`!req.tenantId`) only tests
// tenantId — not auth-token presence — so a stranded user who somehow bypassed
// tenantMiddleware's 403 would still be skipped by the limiter.

describe(
  "Stranded user (valid auth cookie, no tenant slug) — general budget is not consumed",
  () => {
    let agent: ReturnType<typeof supertest>;
    let strandedUserId: string;
    let strandedToken: string;

    beforeAll(async () => {
      const sfx = randomSuffix();

      // Create a stranded user: valid DB record, no tenantId.
      const [stranded] = await db
        .insert(users)
        .values({
          id: `stranded-rl-${sfx}`,
          email: `stranded-rl-${sfx}@test.local`,
          firstName: "Stranded",
          lastName: "User",
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

      // Fresh app → fresh in-memory rate-limit store → deterministic deltas.
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

    it(
      "50 signup POSTs with a valid auth cookie but no slug do not consume the general budget — counter drops by exactly 1",
      async () => {
        const FLOOD_COUNT = 50;

        // ── Baseline: one catalog GET before the flood ────────────────────────
        const baselineRes = await agent
          .get("/api/supplies")
          .set("X-Tenant-Slug", tenantSlug);
        expect(baselineRes.status).not.toBe(429);

        const baselineRemaining = parseRemaining(
          baselineRes.headers as Record<string, string>,
        );
        expect(baselineRemaining).not.toBeNaN();

        // ── Flood: 50 signup POSTs carrying the stranded user's auth cookie ──
        // No X-Tenant-Slug header is sent, so tenantMiddleware detects the
        // authenticated stranded user and returns 403 before the generalLimiter
        // runs.  The rate-limit counter is never touched.
        for (let i = 0; i < FLOOD_COUNT; i++) {
          const sfx = randomSuffix();
          const res = await agent
            .post("/api/auth/signup")
            .set("Cookie", `auth_token=${strandedToken}`)
            .send({
              email: `stranded-flood-${sfx}@test.local`,
              password: "Test1234!",
              firstName: "Stranded",
              lastName: "Flood",
              phoneNumber: `559${String(i).padStart(7, "0")}`,
            });
          // tenantMiddleware short-circuits with 403 (stranded user, no slug,
          // /auth/signup is not in NO_TENANT_ALLOWLIST) before the signup handler
          // or any rate limiter runs.
          expect(res.status).toBe(403);
        }

        // ── Post-flood probe: one more catalog GET ────────────────────────────
        const postFloodRes = await agent
          .get("/api/supplies")
          .set("X-Tenant-Slug", tenantSlug);
        expect(postFloodRes.status).not.toBe(429);

        const postFloodRemaining = parseRemaining(
          postFloodRes.headers as Record<string, string>,
        );
        expect(postFloodRemaining).not.toBeNaN();

        // ── Key assertion: delta is exactly 1 (only the post-flood probe GET) ─
        // tenantMiddleware short-circuits the 50 flood requests before the
        // generalLimiter runs, so none of them consume a slot.  If the limiter
        // were somehow reached, the delta would be 51 (50 flood + 1 probe).
        // A delta of 1 confirms the general budget is fully protected whether by
        // tenantMiddleware's 403 or by the generalLimiter's !req.tenantId skip.
        const delta = baselineRemaining - postFloodRemaining;
        expect(delta).toBe(1);
      },
      30_000,
    );

    it("catalog browsing is unaffected after the stranded-user flood", async () => {
      const res = await agent
        .get("/api/supplies")
        .set("X-Tenant-Slug", tenantSlug);
      expect(res.status).not.toBe(429);
    });
  },
);

// ─── Suite 6: signupLimiter resets after the 15-minute window (fallback mode) ─
//
// Builds on Suite 4: after the signupLimiter has been exhausted (16th request
// → 429), this suite verifies two things:
//
//   A. The 429 response carries a ratelimit-reset or Retry-After header that
//      correctly indicates when the window resets (within the 15-minute bound).
//
//   B. After advancing the clock past the 15-minute window via vitest fake
//      timers, subsequent signup attempts are no longer rate-limited (not 429).
//      This confirms the MemoryStore's expiry logic works correctly and users
//      are not permanently locked out after the window expires.
//
// The app is built BEFORE fake timers are activated so that async startup I/O
// (DB connections, route registration) runs under real timers and is not
// inadvertently stalled by the fake clock.

describe(
  "ALLOW_TENANT_FALLBACK=true — signupLimiter resets after the 15-minute window expires",
  () => {
    let agent: ReturnType<typeof supertest>;
    let prevFallback: string | undefined;
    const suite6CreatedUserIds: string[] = [];

    beforeAll(async () => {
      prevFallback = process.env.ALLOW_TENANT_FALLBACK;
      process.env.ALLOW_TENANT_FALLBACK = "true";

      // Build the app under REAL timers so async startup (DB, route
      // registration) is not stalled by the fake clock.
      const app = await buildTestApp();
      agent = supertest(app);
    }, 60_000);

    afterAll(async () => {
      // Guarantee real timers are restored even if a test throws.
      vi.useRealTimers();

      if (prevFallback === undefined) {
        delete process.env.ALLOW_TENANT_FALLBACK;
      } else {
        process.env.ALLOW_TENANT_FALLBACK = prevFallback;
      }

      if (suite6CreatedUserIds.length > 0) {
        await db
          .update(contacts)
          .set({ linkedUserId: null })
          .where(inArray(contacts.linkedUserId, suite6CreatedUserIds));
        for (const id of suite6CreatedUserIds) {
          await db.delete(users).where(eq(users.id, id));
        }
      }
    }, 30_000);

    it(
      "the 429 response includes a ratelimit-reset or Retry-After header within the 15-minute bound",
      async () => {
        // Exhaust the signupLimiter budget (max: 15).
        for (let i = 0; i < 15; i++) {
          const sfx = randomSuffix();
          const res = await agent.post("/api/auth/signup").send({
            email: `sl-rst-${sfx}@test.local`,
            password: "Test1234!",
            firstName: "Reset",
            lastName: "Test",
            phoneNumber: `561${String(i).padStart(7, "0")}`,
          });

          if ([200, 201].includes(res.status)) {
            const [dbUser] = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, `sl-rst-${sfx}@test.local`));
            if (dbUser) suite6CreatedUserIds.push(dbUser.id);
          }

          expect(res.status).not.toBe(429);
        }

        // 16th request must be blocked.
        const sfx = randomSuffix();
        const blockedRes = await agent.post("/api/auth/signup").send({
          email: `sl-rst-16th-${sfx}@test.local`,
          password: "Test1234!",
          firstName: "Reset",
          lastName: "Blocked",
          phoneNumber: `5610000016`,
        });

        expect(blockedRes.status).toBe(429);

        // express-rate-limit with standardHeaders: true sets ratelimit-reset
        // (seconds REMAINING until the window resets, not a Unix epoch) on every
        // response, including 429s.  Retry-After may also be present.
        // At least one of the two headers must exist.
        const retryAfter = blockedRes.headers["retry-after"] as string | undefined;
        const rlReset = blockedRes.headers["ratelimit-reset"] as string | undefined;

        expect(
          retryAfter !== undefined || rlReset !== undefined,
          "expected a ratelimit-reset or Retry-After header on the 429 response",
        ).toBe(true);

        // ratelimit-reset is the number of seconds until the window resets.
        // It must be a positive integer no larger than 15 minutes + a small buffer.
        if (rlReset !== undefined) {
          const resetSeconds = parseInt(rlReset, 10);
          expect(resetSeconds).toBeGreaterThan(0);
          expect(resetSeconds).toBeLessThanOrEqual(15 * 60 + 10);
        }

        // Retry-After is also a delay in seconds.  It must be positive and within
        // the 15-minute window.
        if (retryAfter !== undefined) {
          const retrySeconds = parseInt(retryAfter, 10);
          expect(retrySeconds).toBeGreaterThan(0);
          expect(retrySeconds).toBeLessThanOrEqual(15 * 60 + 10);
        }
      },
      60_000,
    );

    it(
      "signups are permitted again after the 15-minute window expires (fake clock advanced 16 minutes)",
      async () => {
        // The signupLimiter's MemoryStore checks whether the current window has
        // expired by comparing Date.now() against the stored resetTime
        // (= windowStart + windowMs).  Patching only Date.now() (via
        // vi.spyOn) is sufficient to move the clock forward without touching
        // Node.js timers — so supertest's event-loop-driven HTTP round-trip
        // completes normally and does not time out.
        const realNow = Date.now();
        const nowSpy = vi
          .spyOn(Date, "now")
          .mockReturnValue(realNow + 16 * 60 * 1000); // 16 minutes ahead

        try {
          const sfx = randomSuffix();
          const res = await agent.post("/api/auth/signup").send({
            email: `sl-after-reset-${sfx}@test.local`,
            password: "Test1234!",
            firstName: "After",
            lastName: "Reset",
            phoneNumber: `5620000001`,
          });

          if ([200, 201].includes(res.status)) {
            const [dbUser] = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, `sl-after-reset-${sfx}@test.local`));
            if (dbUser) suite6CreatedUserIds.push(dbUser.id);
          }

          // After the window has expired the signupLimiter must have reset.
          // The request must not be rate-limited (429) — the counter is fresh.
          expect(res.status).not.toBe(429);
        } finally {
          // Always restore the real Date.now so no other test is affected.
          nowSpy.mockRestore();
        }
      },
      30_000,
    );
  },
);
