/**
 * @file sharedLimiters.ts
 *
 * ─── SHARED-POOL RATE LIMITERS — READ BEFORE TOUCHING ───────────────────────
 *
 * This module is the single source of truth for every rate-limiter instance
 * that intentionally spans more than one route.  The shared-pool guarantee
 * (two routes counting against the same per-IP budget) only holds as long as
 * BOTH route registrations reference the EXACT SAME rateLimit() object.
 *
 * HOW THE POOL SHARING WORKS
 * ---------------------------
 * express-rate-limit ties each counter to the MemoryStore that was passed to
 * (or implicitly created by) a particular rateLimit() call.  Two separate
 * rateLimit() calls always produce two separate MemoryStore instances, which
 * means two fully independent per-IP budgets — even if the configuration is
 * identical.
 *
 * HOW TO USE THESE LIMITERS
 * --------------------------
 * 1. Import the named export from this file:
 *      import { uploadLimiter } from './sharedLimiters';
 * 2. Register it on every route that should share the budget:
 *      app.use('/api/upload',              uploadLimiter);
 *      app.use('/api/admin/order-photos',  uploadLimiter);
 *
 * WHAT TO NEVER DO
 * ----------------
 * ✗  const uploadLimiter = rateLimit({ ... });   // ← new instance → new pool
 *
 *    Creating a second rateLimit() call — anywhere, for any route covered here
 *    — silently breaks the shared-pool contract.  The new route gets its own
 *    full budget and can no longer be saturated by traffic on the sibling route.
 *    There will be NO runtime error or warning.
 *
 * ADDING A NEW SHARED-POOL LIMITER
 * ---------------------------------
 * Define it here, export it, and register it on all intended routes.  Do NOT
 * create it inline in routes.ts or any other route file.
 *
 * REGRESSION TESTS
 * ----------------
 * server/tests/upload-limiter-shared-pool.test.ts
 * server/tests/search-limiter-shared-pool.test.ts
 * server/tests/checkout-limiter-shared-pool.test.ts
 * server/tests/auth-limiter-xff-bypass.test.ts
 *
 * These tests verify the shared-pool property by exhausting the budget on one
 * route and confirming the sibling route is also blocked.  If you ever split a
 * limiter into two independent instances, those tests will fail — which is the
 * intended catch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import rateLimit from "express-rate-limit";
import type { Request } from "express";

// ─── Spoof-resistant IP key ───────────────────────────────────────────────────
//
// express-rate-limit's default key is req.ip.  When Express is configured with
// `app.set("trust proxy", 1)`, req.ip resolves to the LEFTMOST X-Forwarded-For
// entry — a value the client controls directly.  A single attacker can prepend
// a different fake IP on every request, rotating through fresh buckets and
// completely defeating any per-IP limiter.
//
// getRealIp always reads the RIGHTMOST XFF entry — the one Replit's edge proxy
// appended and that the client cannot forge.  All requests from the same real
// TCP connection share one rate-limit bucket regardless of the spoofed prefix.
//
// This function is exported so that non-shared limiters (authLimiter,
// generalLimiter, signupLimiter) defined in routes.ts can reuse the same logic
// without duplicating it.
export function getRealIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const entries = (Array.isArray(xff) ? xff.join(",") : xff)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length > 0) return entries[entries.length - 1];
  }
  return (req as any).socket?.remoteAddress ?? "unknown";
}

// ─── authLimiter — brute-force protection for all auth endpoints ──────────────
//
// Applied to /api/auth/login, /api/auth/register, /api/auth/forgot-password,
// /api/auth/reset-password, /api/auth/change-password, /api/auth/verify-email,
// and /api/auth/resend-verification (same instance → same pool).
//
// All auth routes share one 15-attempt / 15-minute budget per real IP.
// Moving any auth route to a separate router file MUST still import this export
// — creating a new rateLimit() call there would give that route its own
// independent budget and silently bypass the brute-force protection.
//
// WHY keyGenerator: getRealIp EXISTS
// ------------------------------------
// express-rate-limit's default key is req.ip.  When Express is configured with
// `app.set("trust proxy", 1)` (as this app is), req.ip resolves to the LEFTMOST
// X-Forwarded-For entry — a value the client controls directly.
//
// An attacker can prepend a different fake IP on every request from a single
// TCP connection, creating a new per-IP counter each time and completely
// defeating the limit.  getRealIp always reads the RIGHTMOST XFF entry — the
// one Replit's edge proxy appends and that the client cannot forge.
//
// CONSEQUENCE OF REMOVING OR REPLACING keyGenerator
// ---------------------------------------------------
// Removing `keyGenerator: getRealIp` (or replacing it with a function that
// reads req.ip or the leftmost XFF entry) silently re-opens this bypass.
// A single attacker with one IP can make unlimited login attempts.
//
// Regression test: server/tests/auth-limiter-xff-bypass.test.ts
// See also: docs/adr/002-auth-limiter-xff-keyGenerator.md
//
// ⚠  DO NOT create a second rateLimit() call for any auth route.
//    If you need independent budgets per endpoint, define two named exports here.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRealIp,
  message: { message: "Too many login attempts, please try again in 15 minutes." },
});

// ─── searchLimiter — shared-pool design (intentional) ────────────────────────
//
// Applied to /api/supplies/search AND /api/pets (same instance → same pool).
// A burst on either route depletes the shared 60 req/min budget for both.
// Intent: aggregate scraping cap for all high-frequency read endpoints.
// Regression test: server/tests/search-limiter-shared-pool.test.ts
//
// ⚠  DO NOT create a second rateLimit() call for these routes.
//    If you need independent budgets, define two separate named exports here.
export const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRealIp,
  message: { message: "Too many search requests, please slow down." },
});

// ─── checkoutLimiter — shared-pool design (intentional) ──────────────────────
//
// Applied to /api/orders AND /api/create-payment-intent (same instance → same pool).
// A burst on either route depletes the shared 10 req/15 min budget for both.
// Intent: aggregate cap for the complete checkout flow to prevent order-spam
// and payment-intent abuse.
// Regression test: (shared-pool behaviour covered by checkout flow tests)
//
// ⚠  DO NOT create a second rateLimit() call for these routes.
//    If you need independent budgets, define two separate named exports here.
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRealIp,
  message: { message: "Too many checkout attempts, please try again later." },
});

// ─── uploadLimiter — shared-pool design (intentional) ────────────────────────
//
// Applied to /api/upload AND /api/admin/order-photos (same instance → same pool).
// A burst on either route depletes the shared 30 req/5 min budget for both.
// Intent: aggregate cap for all high-cost file-processing paths to prevent
// upload abuse.
// Regression test: server/tests/upload-limiter-shared-pool.test.ts
//
// ⚠  DO NOT create a second rateLimit() call for these routes.
//    If you need independent budgets, define two separate named exports here.
export const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRealIp,
  message: { message: "Too many uploads, please wait a few minutes." },
});

// ─── overridePinLimiter — brute-force protection for the store override PIN ───
//
// Applied to /api/auth/admin-override.
// The store override PIN is a 4-digit numeric code (10,000 combinations).
// Without a rate limit a bad actor could exhaust all combinations in seconds.
// This limiter caps attempts at 10 per 15 minutes per real IP, making an
// exhaustive attack take ~250 hours.
//
// WHY keyGenerator: getRealIp EXISTS
// ------------------------------------
// Same rationale as authLimiter — see the comment block above that export.
// Using req.ip (the leftmost XFF entry) would allow an attacker to spoof a
// fresh IP on every request and bypass the limit entirely.
//
// ⚠  DO NOT create a second rateLimit() call for /api/auth/admin-override.
//    Always import this export from sharedLimiters.ts.
export const overridePinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRealIp,
  message: { message: "Too many override PIN attempts, please try again in 15 minutes." },
});
