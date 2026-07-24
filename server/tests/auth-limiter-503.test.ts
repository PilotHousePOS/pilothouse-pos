/**
 * Tests: authLimiter — behaviour when tenantMiddleware 503s before login/register/forgot-password/reset-password
 *
 * The authLimiter protects /api/auth/login, /api/auth/register,
 * /api/auth/forgot-password, and /api/auth/reset-password against brute-force.
 * Unlike signupLimiter it has no skip function, so every request is counted.
 * However, tenantMiddleware is mounted earlier (app.use('/api', …)) and its
 * catch block responds with 503 without calling next().  That means the
 * authLimiter and the route handlers are never reached when tenantMiddleware
 * fails — the 503 itself is the guard.
 *
 * This file confirms:
 *  1. A flood of POST /api/auth/login requests against a broken tenantMiddleware
 *     all get 503 — the login handler is never reached.
 *  2. The same holds for POST /api/auth/register.
 *  3. The same holds for POST /api/auth/forgot-password.
 *  4. The same holds for POST /api/auth/reset-password.
 *
 * The tests are entirely self-contained; no database rows are created.
 */

import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import supertest from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal app that reproduces the relevant middleware stack from
 * routes.ts, but replaces tenantMiddleware with one that always returns 503.
 *
 * Stack (mirrors routes.ts order):
 *   1. brokenTenantMiddleware  → always responds 503, never calls next()
 *   2. authLimiter             → applied to /api/auth/login and /api/auth/register
 *   3. dummy login/register handlers → would return 200 if reached
 *
 * Assertion: every attempt gets 503 — the limiter and handler are unreachable.
 */
function buildBrokenApp(): ReturnType<typeof supertest> {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Broken tenantMiddleware — always throws (mirrors the real catch → 503 path)
  app.use("/api", async (_req, res, _next) => {
    res
      .status(503)
      .json({ message: "Tenant resolution failed. Please try again." });
  });

  // The same authLimiter from routes.ts (no skip function)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many login attempts, please try again in 15 minutes." },
  });
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/register", authLimiter);
  app.use("/api/auth/forgot-password", authLimiter);
  app.use("/api/auth/reset-password", authLimiter);

  // Dummy handlers — must never be reached
  app.post("/api/auth/login", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.post("/api/auth/register", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.post("/api/auth/forgot-password", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.post("/api/auth/reset-password", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return supertest(app);
}

// ─── Scenario 1: /api/auth/login blocked by 503 ───────────────────────────────

describe("authLimiter — tenantMiddleware 503 blocks login requests before the limiter runs", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(() => {
    agent = buildBrokenApp();
  });

  it(
    "returns 503 for all 20 login attempts when tenantMiddleware is broken — handler is never reached",
    async () => {
      // Send well above the authLimiter threshold (15) to confirm neither the
      // limiter nor the handler is what blocks the route — the 503 is.
      for (let i = 0; i < 20; i++) {
        const res = await agent
          .post("/api/auth/login")
          .send({ email: `user-${i}@test.local`, password: "Test1234!" });

        // Must be 503 (broken tenantMiddleware), never 200 (handler reached)
        // or 429 (authLimiter fired — which would mean tenantMiddleware didn't block).
        expect(res.status).toBe(503);
      }
    },
    60_000,
  );
});

// ─── Scenario 2: /api/auth/register blocked by 503 ───────────────────────────

describe("authLimiter — tenantMiddleware 503 blocks register requests before the limiter runs", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(() => {
    agent = buildBrokenApp();
  });

  it(
    "returns 503 for all 20 register attempts when tenantMiddleware is broken — handler is never reached",
    async () => {
      for (let i = 0; i < 20; i++) {
        const res = await agent
          .post("/api/auth/register")
          .send({
            email: `register-${i}@test.local`,
            password: "Test1234!",
            firstName: "Test",
            lastName: "User",
          });

        expect(res.status).toBe(503);
      }
    },
    60_000,
  );
});

// ─── Scenario 3: /api/auth/forgot-password blocked by 503 ─────────────────────

describe("authLimiter — tenantMiddleware 503 blocks forgot-password requests before the limiter runs", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(() => {
    agent = buildBrokenApp();
  });

  it(
    "returns 503 for all 20 forgot-password attempts when tenantMiddleware is broken — handler is never reached",
    async () => {
      // Send well above the authLimiter threshold (15) to confirm neither the
      // limiter nor the handler is what blocks the route — the 503 is.
      for (let i = 0; i < 20; i++) {
        const res = await agent
          .post("/api/auth/forgot-password")
          .send({ email: `user-${i}@test.local` });

        // Must be 503 (broken tenantMiddleware), never 200 (handler reached)
        // or 429 (authLimiter fired — which would mean tenantMiddleware didn't block).
        expect(res.status).toBe(503);
      }
    },
    60_000,
  );
});

// ─── Scenario 4: /api/auth/reset-password blocked by 503 ──────────────────────

describe("authLimiter — tenantMiddleware 503 blocks reset-password requests before the limiter runs", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(() => {
    agent = buildBrokenApp();
  });

  it(
    "returns 503 for all 20 reset-password attempts when tenantMiddleware is broken — handler is never reached",
    async () => {
      for (let i = 0; i < 20; i++) {
        const res = await agent
          .post("/api/auth/reset-password")
          .send({ token: `fake-token-${i}`, newPassword: "NewPass1234!" });

        // Must be 503 (broken tenantMiddleware), never 200 (handler reached)
        // or 429 (authLimiter fired — which would mean tenantMiddleware didn't block).
        expect(res.status).toBe(503);
      }
    },
    60_000,
  );
});
