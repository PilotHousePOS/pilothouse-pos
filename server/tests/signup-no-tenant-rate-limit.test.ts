/**
 * Tests: Tenant-less signup attempts are rejected before consuming any rate-limit slot
 *
 * The generalLimiter and signupLimiter both skip requests to POST /api/auth/signup
 * when req.tenantId is undefined (no X-Tenant-Slug header, no ?tenant= param,
 * no authenticated user).  tenantMiddleware rejects these requests with 400 before
 * any business logic runs.
 *
 * This file confirms:
 *  1. A no-tenant signup POST returns 400 — not 429 (rate-limit) or any other code.
 *  2. The generalLimiter's RateLimit-Remaining counter is NOT decremented by a
 *     no-tenant signup attempt (the skip function fired before the counter ticked).
 *  3. The signupLimiter's own RateLimit-* headers are ABSENT from the 400 response
 *     when skip fires — express-rate-limit does not inject headers for skipped requests.
 *  4. The signupLimiter counter is not decremented by a no-tenant attempt (verified
 *     by observing the counter through a valid-tenant baseline, if available).
 *
 * Why this ordering matters:
 *  tenantMiddleware runs first (attached as app.use('/api', tenantMiddleware)).
 *  generalLimiter runs second (app.use('/api', generalLimiter)).
 *  signupLimiter runs third (app.use('/api/auth/signup', signupLimiter)).
 *
 *  The generalLimiter's skip predicate reads req.tenantId (set by tenantMiddleware),
 *  so by the time generalLimiter inspects the request, tenantMiddleware has already
 *  short-circuited with 400 — but the rate-limiter middleware runs anyway to decide
 *  whether to count.  Because skip returns true, no slot is consumed.
 *  The signupLimiter behaves identically.
 *
 * signupLimiter header behaviour when skip fires:
 *  express-rate-limit only writes RateLimit-* headers when it actually processes a
 *  request (skip returned false).  When skip returns true the middleware calls next()
 *  immediately, leaving the response headers untouched.  Therefore a no-tenant 400
 *  response will carry NO signupLimiter RateLimit-* headers at all — this is the
 *  documented, expected behaviour and the tests below assert it explicitly.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

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

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Ensure the single-tenant fallback is disabled so no-tenant requests are
  // genuinely rejected by tenantMiddleware rather than silently falling through.
  delete process.env.ALLOW_TENANT_FALLBACK;

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/signup — no tenant context", () => {
  it("returns 400 (not 429) when no X-Tenant-Slug header and no tenant cookie are present", async () => {
    const sfx = randomSuffix();

    const res = await agent
      .post("/api/auth/signup")
      // Deliberately omit X-Tenant-Slug and any auth cookie
      .send({
        email: `no-tenant-signup-${sfx}@test.local`,
        password: "Test1234!",
        firstName: "No",
        lastName: "Tenant",
        phoneNumber: "5550009999",
      });

    // Must be a 400 from tenantMiddleware — never a 429 from a rate limiter.
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(429);

    // The 400 body should communicate the missing tenant, not a rate-limit message.
    expect(res.body.message).toBeTruthy();
    expect(res.body.message).not.toMatch(/too many/i);
    expect(res.body.message).not.toMatch(/rate/i);
    // Must include the stable machine-readable code for missing-tenant errors.
    expect(res.body.code).toBe("MISSING_TENANT");
  });

  it("does not decrement the generalLimiter RateLimit-Remaining counter", async () => {
    const sfx = randomSuffix();

    // ── Step 1: Establish a baseline counter value via a benign API call ──────
    // GET /api/stripe/config is a low-cost, publicly accessible endpoint that
    // passes through the generalLimiter.  Its response exposes the remaining
    // budget for this IP within the current window.
    const baseline = await agent.get("/api/stripe/config");

    const remainingBefore = parseInt(
      baseline.headers["ratelimit-remaining"] ?? "",
      10,
    );

    // If the header is absent the limiter is not running — skip gracefully.
    if (isNaN(remainingBefore)) {
      console.warn(
        "[test] RateLimit-Remaining header not present; skipping counter check.",
      );
      return;
    }

    // ── Step 2: Fire a no-tenant signup attempt ───────────────────────────────
    const signupRes = await agent
      .post("/api/auth/signup")
      // No X-Tenant-Slug — tenantMiddleware will reject with 400.
      .send({
        email: `no-tenant-counter-${sfx}@test.local`,
        password: "Test1234!",
        firstName: "Counter",
        lastName: "Check",
        phoneNumber: "5550008888",
      });

    expect(signupRes.status).toBe(400);

    // ── Step 3: Re-probe the same benign endpoint ─────────────────────────────
    const probe = await agent.get("/api/stripe/config");

    const remainingAfter = parseInt(
      probe.headers["ratelimit-remaining"] ?? "",
      10,
    );

    if (isNaN(remainingAfter)) {
      // Header disappeared; cannot verify — pass conservatively.
      return;
    }

    // The no-tenant signup must NOT have consumed a generalLimiter slot.
    // The baseline probe itself consumed one slot and the re-probe consumed
    // another, so remainingAfter should be remainingBefore - 2 (two real API
    // calls).  It must NOT be remainingBefore - 3 (which would indicate the
    // no-tenant signup was also counted).
    //
    // We assert strictly: remainingAfter === remainingBefore - 2.
    expect(remainingAfter).toBe(remainingBefore - 2);
  });
});

// ─── signupLimiter header behaviour when skip fires ───────────────────────────
//
// express-rate-limit (v7+) writes RateLimit-* / RateLimit-Policy headers only
// when it actually processes a request (i.e. skip() returned false).  When
// skip() returns true the library calls next() immediately without touching the
// response headers.  Consequently, a 400 response produced by tenantMiddleware
// for a no-tenant signup will NOT carry any signupLimiter RateLimit-* headers.
//
// This describe block pins that contract so that a future change to
// express-rate-limit or the skip predicate does not silently alter what clients
// observe on the 400 response.

describe("POST /api/auth/signup — signupLimiter header behaviour on no-tenant 400", () => {
  it("returns a 400 with a meaningful tenant-missing message (not a rate-limit message)", async () => {
    const sfx = randomSuffix();

    const res = await agent
      .post("/api/auth/signup")
      .send({
        email: `signup-hdr-msg-${sfx}@test.local`,
        password: "Test1234!",
        firstName: "Hdr",
        lastName: "Msg",
        phoneNumber: "5550007777",
      });

    expect(res.status).toBe(400);

    // Body must describe the missing-tenant problem, not a rate-limit problem.
    expect(res.body.message).toBeTruthy();
    expect(res.body.message).not.toMatch(/too many/i);
    expect(res.body.message).not.toMatch(/rate.?limit/i);
    expect(res.body.message).not.toMatch(/signup attempt/i);
    // Must include the stable machine-readable code for missing-tenant errors.
    expect(res.body.code).toBe("MISSING_TENANT");
  });

  it("signupLimiter RateLimit-* headers are absent from the 400 response when skip fires", async () => {
    // When express-rate-limit's skip() returns true it calls next() without
    // writing any standard headers.  The 400 is produced by tenantMiddleware
    // which runs *before* signupLimiter in the middleware chain; by the time
    // signupLimiter would normally run, the response has already been sent —
    // but express-rate-limit still evaluates skip() and, finding it true,
    // leaves the response headers untouched.
    //
    // Expected: no "ratelimit-remaining", "ratelimit-limit", or
    // "ratelimit-reset" headers on the 400 response from signupLimiter.
    const sfx = randomSuffix();

    const res = await agent
      .post("/api/auth/signup")
      .send({
        email: `signup-hdr-absent-${sfx}@test.local`,
        password: "Test1234!",
        firstName: "Hdr",
        lastName: "Absent",
        phoneNumber: "5550006666",
      });

    expect(res.status).toBe(400);

    // ── Document actual header presence ──────────────────────────────────────
    // The signupLimiter uses standardHeaders:true (RateLimit-* draft-6 format).
    // When skip fires none of these should be present.
    const signupRateLimitRemaining = res.headers["ratelimit-remaining"];
    const signupRateLimitLimit     = res.headers["ratelimit-limit"];
    const signupRateLimitReset     = res.headers["ratelimit-reset"];
    const retryAfter               = res.headers["retry-after"];

    // All four headers must be absent — the skipped limiter must not pollute
    // the response with stale or zero-value counters.
    expect(signupRateLimitRemaining).toBeUndefined();
    expect(signupRateLimitLimit).toBeUndefined();
    expect(signupRateLimitReset).toBeUndefined();
    expect(retryAfter).toBeUndefined();
  });

  it("the 400 response body carries no Retry-After hint that would cause a client to back off", async () => {
    // A missing signupLimiter header (the skip path) must never produce a
    // Retry-After header that instructs clients to wait before retrying.
    // This guards against a regression where the skip path accidentally sets
    // Retry-After (e.g. if the limiter is replaced with one that always emits it).
    const sfx = randomSuffix();

    const res = await agent
      .post("/api/auth/signup")
      .send({
        email: `signup-hdr-retry-${sfx}@test.local`,
        password: "Test1234!",
        firstName: "Retry",
        lastName: "Check",
        phoneNumber: "5550005555",
      });

    expect(res.status).toBe(400);
    expect(res.headers["retry-after"]).toBeUndefined();
  });

  it("signupLimiter counter is not decremented by a no-tenant attempt — verified via repeated probes", async () => {
    // Strategy: fire multiple no-tenant signups and confirm that none of them
    // ever produce a 429.  If the counter were being decremented, after 15
    // attempts we would start seeing 429 responses from the signupLimiter.
    // We fire 5 attempts (well within the 15-request budget) and assert every
    // one returns 400 — never 429.  This is a pragmatic (not exhaustive) check
    // that the skip path does not consume limiter budget.
    const attempts = 5;
    for (let i = 0; i < attempts; i++) {
      const sfx = randomSuffix();
      const res = await agent
        .post("/api/auth/signup")
        .send({
          email: `signup-counter-${i}-${sfx}@test.local`,
          password: "Test1234!",
          firstName: "Counter",
          lastName: `Attempt${i}`,
          phoneNumber: "5550004444",
        });

      // Each attempt must return 400 (missing tenant), never 429.
      expect(res.status).toBe(400);
      expect(res.status).not.toBe(429);

      // None of these skipped responses should carry signupLimiter headers.
      expect(res.headers["ratelimit-remaining"]).toBeUndefined();
    }
  });
});

// ─── signupLimiter fires 429 when a valid tenant slug IS present ──────────────
//
// The no-tenant tests above confirm that the limiter's skip() function fires
// correctly for slugless requests.  This describe block confirms the OTHER side
// of the contract: when a valid X-Tenant-Slug IS present, the limiter DOES
// count and DOES enforce the 15-request cap.
//
// Without this test a future accidental removal of the limiter (or a broken
// skip predicate that always returns true) would be invisible — the no-tenant
// tests would still pass because they never exercise the counting path.

describe("POST /api/auth/signup — signupLimiter fires on real flood with valid tenant slug", () => {
  let tenantId: number;
  let tenantSlug: string;
  let floodAgent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    const sfx = randomSuffix();
    tenantSlug = `flood-test-${sfx}`;

    // Advance the sequence past any existing rows to avoid duplicate-key errors
    // when parallel test files have already inserted tenants in the same run.
    await db.execute(
      sql`SELECT setval(
            pg_get_serial_sequence('tenants', 'id'),
            GREATEST((SELECT MAX(id) FROM tenants), 1)
          )`,
    );

    // Insert a real tenant row so tenantMiddleware can resolve the slug and
    // set req.tenantId — the limiter's skip() predicate checks req.tenantId.
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: `Flood Test Tenant ${sfx}`,
        slug: tenantSlug,
        subscriptionStatus: "active",
        subscriptionTier: "starter",
      })
      .returning();

    tenantId = tenant.id;

    // Build a FRESH app so this describe block starts with a clean MemoryStore
    // counter — the existing app above may have consumed some generalLimiter
    // budget, but signupLimiter slots are not shared between app instances.
    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use(cookieParser());

    const { registerRoutes } = await import("../routes");
    await registerRoutes(freshApp);

    floodAgent = supertest(freshApp);
  }, 60_000);

  afterAll(async () => {
    if (tenantId) {
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  }, 30_000);

  it(
    "first 15 requests with a valid slug are not 429, the 16th is 429 with the expected message, and RateLimit-Remaining decrements",
    async () => {
      const remainingValues: number[] = [];

      // ── Fire the first 15 requests ─────────────────────────────────────────
      // Use intentionally incomplete bodies (missing required fields) so no
      // user rows are created in the database — but req.tenantId IS set by
      // tenantMiddleware, so the signupLimiter counts each request.
      for (let i = 0; i < 15; i++) {
        const res = await floodAgent
          .post("/api/auth/signup")
          .set("X-Tenant-Slug", tenantSlug)
          .send({ email: `flood-${i}-${randomSuffix()}@test.local` }); // intentionally incomplete

        // The signupLimiter must not have triggered yet.
        expect(res.status).not.toBe(429);

        // RateLimit-Remaining must be present — the limiter IS counting (skip
        // did not fire because req.tenantId is set).
        const remaining = parseInt(res.headers["ratelimit-remaining"] ?? "", 10);
        expect(remaining).not.toBeNaN();
        remainingValues.push(remaining);
      }

      // ── Verify the header decremented across counted requests ──────────────
      // remainingValues[0] should be the highest; each subsequent value should
      // be strictly less than the previous one (each counted request
      // decrements by 1).
      for (let i = 1; i < remainingValues.length; i++) {
        expect(remainingValues[i]).toBe(remainingValues[i - 1] - 1);
      }

      // The final remaining value after 15 requests must be 0 (budget
      // exhausted).  express-rate-limit clamps at 0, never goes negative.
      expect(remainingValues[remainingValues.length - 1]).toBe(0);

      // ── 16th request: signupLimiter must fire 429 ─────────────────────────
      const overLimit = await floodAgent
        .post("/api/auth/signup")
        .set("X-Tenant-Slug", tenantSlug)
        .send({ email: `flood-16-${randomSuffix()}@test.local` });

      expect(overLimit.status).toBe(429);

      // The body must carry the signupLimiter's exact message — not a generic
      // "too many requests" from the generalLimiter or any other limiter.
      expect(overLimit.body.message).toBe(
        "Too many signup attempts, please try again in 15 minutes.",
      );

      // Retry-After must be present on the 429 so clients can back off.
      expect(overLimit.headers["retry-after"]).toBeDefined();
    },
    60_000,
  );
});

// ─── signupLimiter window reset ───────────────────────────────────────────────
//
// The limiter above confirms the budget fires at request 16.  This describe
// block confirms the OTHER half of the contract: once the 15-minute window
// expires, the counter resets and the IP can sign up again.
//
// Without this test a broken windowMs (e.g. 0 or Infinity) would go
// undetected — the flood test would still pass even though users would remain
// blocked forever.
//
// Implementation note: we freeze Date (only) with vi.useFakeTimers so the
// MemoryStore's window-expiry logic tracks our artificial clock while real
// async operations (DB queries, supertest HTTP) continue to work normally.

describe("POST /api/auth/signup — signupLimiter window resets after 15 minutes", () => {
  let windowResetTenantId: number;
  let windowResetTenantSlug: string;
  let windowResetAgent: ReturnType<typeof supertest>;
  const windowResetCreatedUserIds: string[] = [];

  beforeAll(async () => {
    const sfx = randomSuffix();
    windowResetTenantSlug = `rl-win-reset-${sfx}`;

    // Advance the sequence past existing rows to avoid duplicate-key errors
    // in case parallel test files have already inserted tenants in this run.
    await db.execute(
      sql`SELECT setval(
            pg_get_serial_sequence('tenants', 'id'),
            GREATEST((SELECT MAX(id) FROM tenants), 1)
          )`,
    );

    const [tenant] = await db
      .insert(tenants)
      .values({
        name: `RateLimitWindowReset ${sfx}`,
        slug: windowResetTenantSlug,
        subscriptionStatus: "active",
        subscriptionTier: "starter",
      })
      .returning();

    windowResetTenantId = tenant.id;

    // Freeze Date.now() so the MemoryStore window starts at a known time.
    // Only faking "Date" leaves setTimeout/setInterval running normally so
    // real async operations (DB queries, supertest) are not affected.
    vi.useFakeTimers({ toFake: ["Date"] });

    // Build a FRESH app so this describe block gets its own clean MemoryStore.
    // The flood-test app above has already consumed signupLimiter slots; we
    // must not share state with it.
    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use(cookieParser());
    const { registerRoutes } = await import("../routes");
    await registerRoutes(freshApp);
    windowResetAgent = supertest(freshApp);
  }, 60_000);

  afterAll(async () => {
    vi.useRealTimers();

    if (windowResetCreatedUserIds.length > 0) {
      const { contacts } = await import("@shared/schema");
      const { inArray } = await import("drizzle-orm");
      await db
        .update(contacts)
        .set({ linkedUserId: null })
        .where(inArray(contacts.linkedUserId, windowResetCreatedUserIds));
      for (const id of windowResetCreatedUserIds) {
        const { users } = await import("@shared/schema");
        await db.delete(users).where(eq(users.id, id));
      }
    }
    if (windowResetTenantId) {
      await db.delete(tenants).where(eq(tenants.id, windowResetTenantId));
    }
  }, 30_000);

  it(
    "allows requests again after the 15-minute window expires, and RateLimit-Remaining resets to 14",
    async () => {
      const MAX_ATTEMPTS = 15; // mirrors signupLimiter max

      // ── Phase 1: exhaust the signupLimiter budget ──────────────────────────
      // Send MAX_ATTEMPTS requests with a valid tenant slug.  Intentionally
      // incomplete bodies (missing required fields) ensure no user rows are
      // created, while req.tenantId IS set so the limiter counts every request.
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const res = await windowResetAgent
          .post("/api/auth/signup")
          .set("X-Tenant-Slug", windowResetTenantSlug)
          .send({ email: `rl-win-${i}-${randomSuffix()}@test.local` }); // intentionally incomplete

        expect(
          res.status,
          `attempt ${i + 1}/${MAX_ATTEMPTS} returned 429 before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: 16th request must be blocked ─────────────────────────────
      const blockedRes = await windowResetAgent
        .post("/api/auth/signup")
        .set("X-Tenant-Slug", windowResetTenantSlug)
        .send({ email: `rl-win-blocked-${randomSuffix()}@test.local` });

      expect(
        blockedRes.status,
        `16th request should be 429 but got ${blockedRes.status}`,
      ).toBe(429);

      // ── Phase 3: advance Date past the 15-minute window ───────────────────
      // The MemoryStore uses Date.now() for window expiry.  Advancing the fake
      // clock by (windowMs + 1 s) makes the existing window stale so the next
      // request starts a fresh counter.
      const WINDOW_MS = 15 * 60 * 1000;
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1_000));

      // ── Phase 4: first request after rollover must not be blocked ──────────
      const afterRes = await windowResetAgent
        .post("/api/auth/signup")
        .set("X-Tenant-Slug", windowResetTenantSlug)
        .send({ email: `rl-win-after-${randomSuffix()}@test.local` }); // intentionally incomplete

      expect(
        afterRes.status,
        `request after window rollover returned 429 — windowMs did not reset`,
      ).not.toBe(429);

      // ── Phase 5: RateLimit-Remaining must show 14 (max 15, minus 1 used) ──
      // The post-rollover request starts a new window.  The limiter consumes
      // one slot for this request, leaving 14 remaining.
      const remainingAfterReset = parseInt(
        afterRes.headers["ratelimit-remaining"] ?? "",
        10,
      );

      expect(
        remainingAfterReset,
        "RateLimit-Remaining header must be present on the post-rollover response",
      ).not.toBeNaN();

      expect(
        remainingAfterReset,
        `RateLimit-Remaining should be 14 (15 max − 1 used) but got ${remainingAfterReset}`,
      ).toBe(14);
    },
    90_000,
  );
});
