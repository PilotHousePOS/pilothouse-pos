/**
 * Integration tests: signupLimiter window reset for valid-slug requests
 *
 * The signupLimiter (windowMs: 15 min, max: 15) counts requests that have a
 * valid tenant slug.  After the window expires, the counter must reset so that
 * a previously rate-limited IP can sign up again.
 *
 * Done looks like:
 *   1. 15 valid-slug POST /api/auth/signup exhaust the budget.
 *   2. The 16th request returns 429.
 *   3. System time is advanced past the 15-minute window.
 *   4. The first request after rollover is NOT 429 — it reaches the signup handler.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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

// Build a fresh Express app with fresh rate-limiter instances (module isolation
// ensures this file's import of routes is independent of other test files).
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
const createdUserIds: string[] = [];

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();
  testTenantSlug = `rl-reset-${sfx}`;

  // Advance the tenants PK sequence to avoid collisions with parallel test files.
  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `RateLimitResetTest ${sfx}`,
      slug: testTenantSlug,
      subscriptionStatus: "active",
      subscriptionTier: "starter",
    })
    .returning();

  testTenantId = tenant.id;

  // Freeze Date.now() so the rate-limiter window starts at a known time.
  // We only fake the Date (not setTimeout/setInterval) so that real async DB
  // operations and supertest HTTP calls continue to work correctly.
  vi.useFakeTimers({ toFake: ["Date"] });

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  // Restore real timers before any cleanup async work.
  vi.useRealTimers();

  if (createdUserIds.length > 0) {
    await db
      .update(contacts)
      .set({ linkedUserId: null })
      .where(inArray(contacts.linkedUserId, createdUserIds));
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
  }
  if (testTenantId) {
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  }
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("signupLimiter — window reset allows requests after expiry", () => {
  it(
    "blocks on the 16th attempt then allows a new request after the window rolls over",
    async () => {
      const MAX_ATTEMPTS = 15; // mirrors signupLimiter max

      // ── Phase 1: exhaust the rate-limit budget ────────────────────────────
      // Send MAX_ATTEMPTS requests with a valid tenant slug.  Each request is
      // counted by the signupLimiter.  We only care that the limiter counts
      // them — not whether the signup itself succeeds — so any non-429 status
      // is acceptable here (200/201 for success, 400/409 for data issues, etc.).
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const sfx = randomSuffix();
        const res = await agent
          .post("/api/auth/signup")
          .set("X-Tenant-Slug", testTenantSlug)
          .send({
            email: `rl-window-${i}-${sfx}@test.local`,
            password: "WindowReset1!Pass",
            firstName: "Window",
            lastName: "Reset",
            phoneNumber: `555${String(i).padStart(7, "0")}`,
          });

        // If this attempt creates a user, track it for cleanup.
        if (res.status === 200 || res.status === 201) {
          const [dbUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, `rl-window-${i}-${sfx}@test.local`));
          if (dbUser) createdUserIds.push(dbUser.id);
        }

        expect(
          res.status,
          `attempt ${i + 1}/${MAX_ATTEMPTS} returned 429 before budget was exhausted`,
        ).not.toBe(429);
      }

      // ── Phase 2: 16th request must be rate-limited ────────────────────────
      const blockedRes = await agent
        .post("/api/auth/signup")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({
          email: `rl-window-blocked-${randomSuffix()}@test.local`,
          password: "WindowReset1!Pass",
          firstName: "Blocked",
          lastName: "User",
          phoneNumber: "5550000000",
        });

      expect(
        blockedRes.status,
        `16th request should be rate-limited (429) but got ${blockedRes.status}`,
      ).toBe(429);

      // ── Phase 3: advance the clock past the 15-minute window ──────────────
      // Moving Date.now() forward causes the MemoryStore to treat the existing
      // window as expired and reset the counter on the next request.
      const WINDOW_MS = 15 * 60 * 1000;
      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1000));

      // ── Phase 4: first request after rollover must not be blocked ─────────
      const sfxAfter = randomSuffix();
      const afterRolloverEmail = `rl-window-after-${sfxAfter}@test.local`;

      const afterRes = await agent
        .post("/api/auth/signup")
        .set("X-Tenant-Slug", testTenantSlug)
        .send({
          email: afterRolloverEmail,
          password: "WindowReset1!Pass",
          firstName: "After",
          lastName: "Rollover",
          phoneNumber: `555${sfxAfter.slice(0, 7)}`,
        });

      // The critical assertion: the window reset must allow new requests through.
      expect(
        afterRes.status,
        `request after window rollover returned 429 — rate-limiter window did not reset correctly`,
      ).not.toBe(429);

      // It must reach the signup handler and return a success-family response.
      expect(
        afterRes.status,
        `post-rollover signup should succeed (2xx) but got ${afterRes.status}: ${JSON.stringify(afterRes.body)}`,
      ).toBeGreaterThanOrEqual(200);
      expect(afterRes.status).toBeLessThan(300);

      // Track for cleanup.
      const [dbUserAfter] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, afterRolloverEmail));
      if (dbUserAfter) createdUserIds.push(dbUserAfter.id);
    },
    90_000,
  );
});
