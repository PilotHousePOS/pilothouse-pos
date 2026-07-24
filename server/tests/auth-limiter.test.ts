/**
 * Tests: authLimiter — happy-path rate limiting for /api/auth/login and /api/auth/register
 *
 * Task 237 confirms that a broken tenantMiddleware (503 path) blocks login before
 * the authLimiter runs.  This file covers the complementary scenario: when
 * tenantMiddleware is healthy (pass-through), the authLimiter itself fires 429
 * after 15 attempts.
 *
 * Two scenarios:
 *
 *  1. POST /api/auth/login — the first 15 requests are allowed through (they may
 *     return any non-429 status); the 16th returns 429.
 *
 *  2. POST /api/auth/register — same threshold, same assertion.
 *
 * Each scenario builds its own minimal Express app with a fresh MemoryStore so
 * the counters are independent.  No database rows are created; the route
 * handlers are lightweight stubs.
 */

import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import supertest from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal app that reproduces the relevant middleware stack from
 * routes.ts but replaces tenantMiddleware with a healthy pass-through stub.
 *
 * Stack (mirrors routes.ts order):
 *   1. healthyTenantMiddleware  → sets req.tenantId = 1, calls next()
 *   2. authLimiter              → applied to /api/auth/login and /api/auth/register
 *   3. dummy login/register handlers → return 200 when the limiter allows through
 *
 * A fresh rateLimit() instance is created for each call so the MemoryStore
 * starts at zero — no cross-scenario contamination.
 */
function buildHealthyApp(): ReturnType<typeof supertest> {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Healthy tenantMiddleware — sets tenantId and calls next()
  app.use("/api", (req: any, _res: any, next: any) => {
    req.tenantId = 1;
    next();
  });

  // Mirror of the authLimiter from routes.ts (max: 15, no skip function).
  // keyGenerator uses the socket address, matching the effective behaviour in
  // routes.ts (the second keyGenerator declaration overrides the first).
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.socket?.remoteAddress ?? req.ip,
    message: { message: "Too many login attempts, please try again in 15 minutes." },
  });
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/register", authLimiter);

  // Stub handlers — return 200 when the limiter passes the request through
  app.post("/api/auth/login", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.post("/api/auth/register", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return supertest(app);
}

// ─── Scenario 1: authLimiter fires after 15 /api/auth/login attempts ──────────

describe("authLimiter — fires 429 after 15 login attempts when tenantMiddleware is healthy", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(() => {
    agent = buildHealthyApp();
  });

  it(
    "returns non-429 for the first 15 attempts and 429 on the 16th",
    async () => {
      // Send exactly 15 attempts — none should trigger the rate limit yet.
      for (let i = 0; i < 15; i++) {
        const res = await agent
          .post("/api/auth/login")
          .send({ email: `user-${i}@test.local`, password: "Test1234!" });

        expect(res.status).not.toBe(429);
      }

      // The 16th request must be rate-limited.
      const sixteenth = await agent
        .post("/api/auth/login")
        .send({ email: "user-16@test.local", password: "Test1234!" });

      expect(sixteenth.status).toBe(429);
      expect(sixteenth.body.message).toMatch(/Too many login attempts/i);
    },
    60_000,
  );
});

// ─── Scenario 2: authLimiter fires after 15 /api/auth/register attempts ───────

describe("authLimiter — fires 429 after 15 register attempts when tenantMiddleware is healthy", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(() => {
    // Fresh app → fresh MemoryStore → counter starts at 0
    agent = buildHealthyApp();
  });

  it(
    "returns non-429 for the first 15 attempts and 429 on the 16th",
    async () => {
      // Send exactly 15 attempts — none should trigger the rate limit yet.
      for (let i = 0; i < 15; i++) {
        const res = await agent
          .post("/api/auth/register")
          .send({
            email: `register-${i}@test.local`,
            password: "Test1234!",
            firstName: "Test",
            lastName: "User",
          });

        expect(res.status).not.toBe(429);
      }

      // The 16th request must be rate-limited.
      const sixteenth = await agent
        .post("/api/auth/register")
        .send({
          email: "register-16@test.local",
          password: "Test1234!",
          firstName: "Test",
          lastName: "User",
        });

      expect(sixteenth.status).toBe(429);
      expect(sixteenth.body.message).toMatch(/Too many login attempts/i);
    },
    60_000,
  );
});
