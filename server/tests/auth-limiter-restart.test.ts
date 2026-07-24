/**
 * Tests: authLimiter — counter resets cleanly between server restarts
 *
 * The authLimiter is applied to /api/auth/login, /api/auth/register,
 * /api/auth/forgot-password, /api/auth/reset-password, and
 * /api/auth/change-password in routes.ts.  It uses express-rate-limit's
 * default MemoryStore, which is scoped to a single process/instance.
 *
 * This test documents the in-memory-reset guarantee: a fresh Express app
 * instance (simulating a server restart) always starts with a counter of
 * zero, regardless of how many requests the previous instance had already
 * counted.
 *
 * ─── Persistent-store (Redis) edge case — documented decision ─────────────────
 *
 * If a shared persistent store (e.g. rate-limit-redis, ioredis, or any
 * express-rate-limit store adapter) is ever introduced for horizontal scaling,
 * the following guarantees MUST be validated before going live:
 *
 *   a) Cross-restart count inheritance:
 *      Unlike MemoryStore, a Redis store survives server restarts.  A server
 *      that restarted mid-window will inherit whatever counter value Redis holds.
 *      This is usually the desired behaviour for horizontal scaling, but it means
 *      a burst before a crash still counts against the current window.  If a
 *      clean reset on restart is required, the startup code must explicitly
 *      delete the relevant Redis keys before serving requests.
 *
 *   b) Key-namespace isolation:
 *      All rate limiter instances share the same Redis connection.  Without
 *      distinct key prefixes the authLimiter and signupLimiter would share
 *      counters, causing cross-contamination.  Ensure each rateLimit() call
 *      is configured with a unique prefix (e.g. `prefix: 'rl:auth:'`).
 *
 * Until a persistent store is wired in, MemoryStore remains the correct choice
 * and this test is the authoritative documentation of the reset guarantee.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import supertest from "supertest";

// ─── Scenario: counter resets to zero on a fresh server instance ──────────────

describe("authLimiter — counter resets cleanly between server restarts", () => {
  /**
   * Helper that builds a self-contained minimal app whose authLimiter mirrors
   * the real routes.ts definition applied to /api/auth/login.
   *
   * The keyGenerator matches the effective one in routes.ts:
   *   (req) => req.socket?.remoteAddress ?? req.ip
   *
   * supertest uses an in-process socket so remoteAddress is stable across all
   * requests made through the same agent — exactly what we want in order to
   * exercise the per-IP counter reliably without hitting a real network.
   *
   * Returns a supertest agent bound to that app.
   */
  function buildApp(): ReturnType<typeof supertest> {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    // Exact copy of the authLimiter from routes.ts
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 15,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: any) => req.socket?.remoteAddress ?? req.ip,
      message: {
        message: "Too many login attempts, please try again in 15 minutes.",
      },
    });
    app.use("/api/auth/login", limiter);

    // Dummy handler — returns 200 when the limiter allows the request through
    app.post("/api/auth/login", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    return supertest(app);
  }

  it(
    "second app instance starts at counter 0 even after first instance exhausted the limit",
    async () => {
      // ── First instance: exhaust 14 of the 15 allowed requests ──────────────
      const firstAgent = buildApp();

      for (let i = 0; i < 14; i++) {
        const res = await firstAgent
          .post("/api/auth/login")
          .send({ email: `first-${i}@test.local`, password: "Test1234!" });

        // The limiter should not have triggered yet (counter ≤ 14 < 15).
        expect(res.status).not.toBe(429);
      }

      // 15th request — still within budget
      const fifteenth = await firstAgent
        .post("/api/auth/login")
        .send({ email: "first-15@test.local", password: "Test1234!" });
      expect(fifteenth.status).not.toBe(429);

      // 16th request — over the budget of 15, must be rate-limited
      const overLimit = await firstAgent
        .post("/api/auth/login")
        .send({ email: "first-16@test.local", password: "Test1234!" });
      expect(overLimit.status).toBe(429);

      // ── Second instance: simulates a server restart ─────────────────────────
      // A new rateLimit() call creates a brand-new MemoryStore; it has no
      // knowledge of the first instance's counter.
      const secondAgent = buildApp();

      // The second instance must accept requests starting from counter 0.
      // We send 5 requests to confirm it is not blocked from the outset.
      for (let i = 0; i < 5; i++) {
        const res = await secondAgent
          .post("/api/auth/login")
          .send({ email: `second-${i}@test.local`, password: "Test1234!" });

        expect(res.status).toBe(200);
      }
    },
    60_000,
  );
});
