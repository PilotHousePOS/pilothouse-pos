/**
 * Unit tests: GET /api/billing/health
 *
 * Verifies that the billing health endpoint:
 * 1. Returns 500 with ok: false when stripe.accounts.retrieve() throws
 *    (bad or rotated Stripe key).
 * 2. Returns 200 with ok: true and the correct stripeAccountId when the key
 *    and all configured prices are valid.
 * 3. Returns 500 with ok: false and a per-price error when a price is inactive.
 *
 * Storage, Stripe client, and auth middleware are fully mocked — no real DB
 * or Stripe calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const {
  mockGetUser,
  mockClearCredentialCache,
  mockGetUncachableStripeClient,
  mockStripe,
} = vi.hoisted(() => {
  /** A minimal mock Stripe client. Tests override individual methods per scenario. */
  const mockStripe = {
    accounts: {
      retrieve: vi.fn(),
    },
    prices: {
      retrieve: vi.fn(),
    },
  };

  const mockGetUser = vi.fn();
  const mockClearCredentialCache = vi.fn();
  const mockGetUncachableStripeClient = vi.fn(async () => mockStripe);

  return {
    mockGetUser,
    mockClearCredentialCache,
    mockGetUncachableStripeClient,
    mockStripe,
  };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../storage", () => ({
  storage: { getUser: mockGetUser },
}));

vi.mock("../stripeClient", () => ({
  clearCredentialCache: mockClearCredentialCache,
  getUncachableStripeClient: mockGetUncachableStripeClient,
}));

// Replace authMiddleware with a stub that injects req.user = { id: "sa-1" }
vi.mock("../auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: "sa-1" };
    next();
  },
}));

// sendgrid is imported transitively via billingRoutes; stub it to avoid side effects
vi.mock("../sendgrid", () => ({ sendTrialWarningEmail: vi.fn() }));
vi.mock("../utils", () => ({ getBaseUrl: () => "http://localhost:5000" }));

// ── Import SUT after mocks ────────────────────────────────────────────────────

import { registerBillingRoutes } from "../billingRoutes";

// ── Test app factory ──────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  registerBillingRoutes(app);
  return supertest(app);
}

// ── Shared super-admin user fixture ──────────────────────────────────────────

const SUPER_ADMIN = { id: "sa-1", isSuperAdmin: true, isAdmin: true };

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: user is a super-admin
  mockGetUser.mockResolvedValue(SUPER_ADMIN);
  // Default: Stripe client factory returns the shared mock
  mockGetUncachableStripeClient.mockResolvedValue(mockStripe);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/billing/health — bad Stripe key", () => {
  it("returns 500 with ok: false when stripe.accounts.retrieve() throws", async () => {
    mockStripe.accounts.retrieve.mockRejectedValue(
      new Error("No such API key: sk_test_bad"),
    );

    const agent = buildApp();
    const res = await agent.get("/api/billing/health");

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/stripe key invalid/i);
  });

  it("clears the credential cache before checking the key", async () => {
    mockStripe.accounts.retrieve.mockRejectedValue(
      new Error("Invalid API Key provided"),
    );

    const agent = buildApp();
    await agent.get("/api/billing/health");

    expect(mockClearCredentialCache).toHaveBeenCalledOnce();
  });
});

describe("GET /api/billing/health — healthy configuration", () => {
  beforeEach(() => {
    // Set price ID env vars for this suite
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_test";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_test";

    mockStripe.accounts.retrieve.mockResolvedValue({ id: "acct_HEALTHY123" });

    // Both prices are active recurring prices
    mockStripe.prices.retrieve.mockImplementation(async (priceId: string) => {
      const prices: Record<string, object> = {
        price_starter_test: { id: "price_starter_test", active: true, type: "recurring" },
        price_pro_test: { id: "price_pro_test", active: true, type: "recurring" },
      };
      return prices[priceId];
    });
  });

  afterEach(() => {
    delete process.env.STRIPE_STARTER_PRICE_ID;
    delete process.env.STRIPE_PRO_PRICE_ID;
  });

  it("returns 200 with ok: true and the correct stripeAccountId", async () => {
    const agent = buildApp();
    const res = await agent.get("/api/billing/health");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.stripeAccountId).toBe("acct_HEALTHY123");
  });

  it("reports both prices as ok in the prices map", async () => {
    const agent = buildApp();
    const res = await agent.get("/api/billing/health");

    expect(res.body.prices.starter.ok).toBe(true);
    expect(res.body.prices.pro.ok).toBe(true);
  });
});

describe("GET /api/billing/health — inactive price", () => {
  beforeEach(() => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_ok";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_inactive";

    mockStripe.accounts.retrieve.mockResolvedValue({ id: "acct_INACTIVE_PRICE" });

    mockStripe.prices.retrieve.mockImplementation(async (priceId: string) => {
      if (priceId === "price_starter_ok") {
        return { id: priceId, active: true, type: "recurring" };
      }
      // Inactive price
      return { id: priceId, active: false, type: "recurring" };
    });
  });

  afterEach(() => {
    delete process.env.STRIPE_STARTER_PRICE_ID;
    delete process.env.STRIPE_PRO_PRICE_ID;
  });

  it("returns 500 with ok: false when one price is inactive", async () => {
    const agent = buildApp();
    const res = await agent.get("/api/billing/health");

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });

  it("populates the per-price error for the inactive price", async () => {
    const agent = buildApp();
    const res = await agent.get("/api/billing/health");

    expect(res.body.prices.starter.ok).toBe(true);
    expect(res.body.prices.pro.ok).toBe(false);
    expect(res.body.prices.pro.error).toMatch(/inactive/i);
  });

  it("still returns the stripeAccountId even when a price fails", async () => {
    const agent = buildApp();
    const res = await agent.get("/api/billing/health");

    expect(res.body.stripeAccountId).toBe("acct_INACTIVE_PRICE");
  });
});

describe("GET /api/billing/health — access control", () => {
  it("returns 403 when the requesting user is not a super-admin", async () => {
    mockGetUser.mockResolvedValue({ id: "regular-user", isSuperAdmin: false, isAdmin: true });

    const agent = buildApp();
    const res = await agent.get("/api/billing/health");

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/super-admin/i);
  });
});
