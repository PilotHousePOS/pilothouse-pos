/**
 * Security test: searchLimiter cannot be bypassed via X-Forwarded-For header rotation
 *
 * Background
 * ----------
 * express-rate-limit uses req.ip as its default key. When Express is configured
 * with `app.set("trust proxy", 1)` (as this app is), req.ip is derived from the
 * LEFTMOST X-Forwarded-For entry, which an attacker controls from a single TCP
 * connection. An attacker can prepend rotating fake IPs to bypass per-IP limits.
 *
 * The searchLimiter guards /api/supplies/search and /api/pets — high-frequency
 * read paths. Without XFF-rotation protection an attacker could bypass the
 * scraping cap by cycling spoofed IPs from a single connection.
 *
 * Fix
 * ---
 * searchLimiter uses `keyGenerator: getRealIp`, where getRealIp reads the
 * RIGHTMOST X-Forwarded-For entry — the one appended by Replit's edge proxy that
 * a client cannot forge. All requests that share the same real network connection
 * therefore share one rate-limit bucket regardless of what spoofed IPs they
 * prepend to the XFF header.
 *
 * Note on shared-pool design
 * --------------------------
 * The same searchLimiter instance is applied to both /api/supplies/search and
 * /api/pets via two separate app.use() calls. They share one MemoryStore and
 * one per-IP counter (60 req / 1 min). This test exercises each path
 * independently to confirm the XFF-rotation protection holds on both.
 *
 * Test design
 * -----------
 * We build a minimal Express app that mirrors the production searchLimiter
 * configuration — same windowMs, max, keyGenerator (getRealIp), and message —
 * applied to GET /api/supplies/search and GET /api/pets with stub handlers.
 * No tenantMiddleware or other production middleware is included, keeping the
 * test focused on the limiter.
 *
 * We simulate the real production topology: each request carries an XFF header
 * of the form "<spoofed-ip>, <real-ip>". The real-ip (rightmost, constant)
 * represents what the edge proxy appends; the spoofed-ip (leftmost, rotating)
 * represents what an attacker prepends. getRealIp returns the rightmost entry,
 * so all requests share one bucket and the 61st is blocked.
 *
 * Done looks like
 * ---------------
 * 1. 60 GET requests each carry XFF "<unique-spoofed>, <fixed-real>".
 * 2. All 60 are passed through (non-429) — the stub handler responds 200.
 * 3. The 61st request (with yet another unique spoofed prefix) returns 429,
 *    proving the limiter keys by the rightmost (real) XFF entry — not the
 *    rotating leftmost entry an attacker controls.
 *    If the limiter used req.ip instead, each request would be a fresh bucket
 *    and the 61st would NOT be 429, meaning the bypass was possible.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import rateLimit from "express-rate-limit";
import supertest from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Spoof-resistant IP extractor — exact copy of the production getRealIp
 * defined inside registerRoutes in server/routes.ts.
 *
 * Always reads the RIGHTMOST X-Forwarded-For entry (appended by the edge proxy)
 * so that a client rotating the leftmost spoofed entry cannot create fresh buckets.
 */
function getRealIp(req: express.Request): string {
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

/**
 * Build a minimal test app that mirrors the production searchLimiter
 * configuration — same windowMs, max, keyGenerator, and message — applied
 * to GET /api/supplies/search and GET /api/pets with stub handlers.
 *
 * Why minimal and not full registerRoutes:
 *   tenantMiddleware and the real handlers require a live database. A focused
 *   unit test is more reliable here and tests exactly the limiter behaviour we
 *   care about.
 *
 * Why both paths in one app:
 *   The production searchLimiter is a single rateLimit() instance shared across
 *   both paths (shared MemoryStore). This mirrors that design so the shared-pool
 *   XFF protection is confirmed on both endpoints.
 */
function buildTestApp() {
  const app = express();
  // Mirror the production trust-proxy setting so req.ip would be spoofable
  // if the keyGenerator relied on the leftmost XFF entry.
  app.set("trust proxy", 1);
  app.use(express.json());

  // searchLimiter — exact mirror of the production configuration in routes.ts.
  // windowMs: 1 * 60 * 1000, max: 60, keyGenerator: getRealIp
  // Shared across both paths (same MemoryStore instance).
  const searchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getRealIp,
    message: { message: "Too many search requests, please slow down." },
  });

  app.use("/api/supplies/search", searchLimiter);
  app.use("/api/pets", searchLimiter);

  // Simple stubs — real handlers are guarded by auth/tenant in production.
  app.get("/api/supplies/search", (_req, res) => res.json({ results: [] }));
  app.get("/api/pets", (_req, res) => res.json({ pets: [] }));

  return app;
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;

// The fixed "real" IP that the simulated edge proxy appends as the rightmost
// XFF entry. getRealIp always returns this value, so all requests from the same
// connection share one rate-limit bucket regardless of the spoofed prefix.
const REAL_PROXY_IP = "203.0.113.3"; // TEST-NET-3, never a real client IP

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Freeze Date.now() so the rate-limiter window starts at a known point and
  // does not roll over mid-test. We only fake Date (not async timers) so that
  // real HTTP calls continue to work.
  vi.useFakeTimers({ toFake: ["Date"] });

  const app = buildTestApp();
  agent = supertest(app);
}, 30_000);

afterAll(async () => {
  vi.useRealTimers();
}, 15_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("searchLimiter — X-Forwarded-For header rotation cannot bypass the per-connection budget", () => {
  it(
    "blocks the 61st search request on /api/supplies/search even when every request prepends a distinct X-Forwarded-For IP",
    async () => {
      const SEARCH_LIMITER_MAX = 60;

      // Phase 1: send 60 GET /api/supplies/search requests, each with a
      // rotating spoofed XFF prefix but the same fixed rightmost "real" IP.
      //
      // Format: "<attacker-controlled>, <proxy-appended>"
      //
      // If the limiter keyed by req.ip (leftmost XFF when trust proxy is 1),
      // each request would land in a fresh bucket and none would be blocked.
      //
      // With getRealIp (rightmost XFF = REAL_PROXY_IP), all requests share one
      // bucket — rotating the leftmost entry has no effect.
      for (let i = 1; i <= SEARCH_LIMITER_MAX; i++) {
        // Attacker rotates this prefix on every request.
        const a = Math.floor((i - 1) / 256);
        const b = (i - 1) % 256;
        const spoofedPrefix = `10.${a}.${b}.1`;
        // Simulated edge-proxy entry: constant, cannot be forged by the client.
        const xffHeader = `${spoofedPrefix}, ${REAL_PROXY_IP}`;

        const res = await agent
          .get("/api/supplies/search")
          .query({ q: `xff-test-${i}` })
          .set("X-Forwarded-For", xffHeader);

        // The limiter must allow this through (200 from stub handler).
        // A 429 before the budget is exhausted means the limiter is not
        // counting all XFF-rotated requests in the same bucket.
        expect(
          res.status,
          `attempt ${i}/${SEARCH_LIMITER_MAX} (XFF: ${xffHeader}) returned 429 before ` +
            `the budget was exhausted — searchLimiter may not be counting all ` +
            `XFF-rotated requests in the same bucket (expected rightmost-entry keying via getRealIp)`,
        ).not.toBe(429);
      }

      // Phase 2: 61st request with yet another unique spoofed prefix and the
      // same real rightmost IP must be blocked (budget exhausted).
      //
      // If the limiter used the leftmost XFF entry, this would be a brand-new
      // bucket (0/60 used) and would return 200, not 429.
      // With getRealIp (rightmost = REAL_PROXY_IP) the shared bucket is full.
      const xffHeader61 = `61.61.61.61, ${REAL_PROXY_IP}`;

      const blocked = await agent
        .get("/api/supplies/search")
        .query({ q: "xff-blocked" })
        .set("X-Forwarded-For", xffHeader61);

      expect(
        blocked.status,
        `61st search request (XFF: ${xffHeader61}) should be 429 (searchLimiter exhausted) ` +
          `but got ${blocked.status} — the X-Forwarded-For rotation bypass may still be possible`,
      ).toBe(429);

      expect(
        blocked.body?.message,
        "429 response body should carry the searchLimiter message",
      ).toMatch(/too many search requests/i);
    },
    120_000,
  );

  it(
    "blocks the 61st search request on /api/pets even when every request prepends a distinct X-Forwarded-For IP",
    async () => {
      const SEARCH_LIMITER_MAX = 60;

      // Build a fresh app for this test so the /api/pets budget starts at zero.
      // (The shared-pool instance in the main agent was already exhausted by the
      // /api/supplies/search test above — using a fresh instance isolates counts.)
      const freshApp = buildTestApp();
      const freshAgent = supertest(freshApp);

      // Use a different REAL_PROXY_IP to avoid sharing a bucket with the
      // /api/supplies/search test above.
      const PETS_REAL_IP = "203.0.113.4";

      for (let i = 1; i <= SEARCH_LIMITER_MAX; i++) {
        const a = Math.floor((i - 1) / 256);
        const b = (i - 1) % 256;
        const spoofedPrefix = `172.16.${a}.${b}`;
        const xffHeader = `${spoofedPrefix}, ${PETS_REAL_IP}`;

        const res = await freshAgent
          .get("/api/pets")
          .set("X-Forwarded-For", xffHeader);

        expect(
          res.status,
          `attempt ${i}/${SEARCH_LIMITER_MAX} on /api/pets (XFF: ${xffHeader}) returned 429 before ` +
            `the budget was exhausted — searchLimiter may not be counting all ` +
            `XFF-rotated requests in the same bucket (expected rightmost-entry keying via getRealIp)`,
        ).not.toBe(429);
      }

      const xffHeader61 = `61.61.61.62, ${PETS_REAL_IP}`;

      const blocked = await freshAgent
        .get("/api/pets")
        .set("X-Forwarded-For", xffHeader61);

      expect(
        blocked.status,
        `61st /api/pets request (XFF: ${xffHeader61}) should be 429 (searchLimiter exhausted) ` +
          `but got ${blocked.status} — the X-Forwarded-For rotation bypass may still be possible`,
      ).toBe(429);

      expect(
        blocked.body?.message,
        "429 response body should carry the searchLimiter message",
      ).toMatch(/too many search requests/i);
    },
    120_000,
  );
});
