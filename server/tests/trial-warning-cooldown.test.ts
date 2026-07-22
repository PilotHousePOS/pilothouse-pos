/**
 * Tests: POST /api/billing/send-trial-warning — daily cooldown guard
 *
 * The endpoint checks `tenant.trialWarningEmailSentAt` and rejects with 429
 * when the last reminder was sent on the same UTC calendar day.  These tests
 * verify the boundary conditions so a regression in the guard logic (or an
 * accidental clearing of the field) is caught immediately.
 *
 * Scenarios covered:
 * 1. Returns 429 when `trialWarningEmailSentAt` is 30 minutes ago (same day — within guard).
 * 2. Returns 200 when `trialWarningEmailSentAt` is yesterday (different day — outside guard).
 * 3. Returns 200 when `trialWarningEmailSentAt` is null (never sent — guard does not apply).
 *
 * Storage, SendGrid, and auth are fully mocked — no real DB or email calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const {
  mockGetUser,
  mockGetTenant,
  mockUpdateTenant,
  mockSendTrialWarningEmail,
  mockGetUncachableStripeClient,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockGetTenant = vi.fn();
  const mockUpdateTenant = vi.fn(async () => {});
  const mockSendTrialWarningEmail = vi.fn(async () => {});
  const mockGetUncachableStripeClient = vi.fn(async () => ({
    accounts: { retrieve: vi.fn() },
    prices: { retrieve: vi.fn() },
  }));

  return {
    mockGetUser,
    mockGetTenant,
    mockUpdateTenant,
    mockSendTrialWarningEmail,
    mockGetUncachableStripeClient,
  };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../storage", () => ({
  storage: {
    getUser: mockGetUser,
    getTenant: mockGetTenant,
    updateTenant: mockUpdateTenant,
  },
}));

vi.mock("../sendgrid", () => ({
  sendTrialWarningEmail: mockSendTrialWarningEmail,
}));

vi.mock("../stripeClient", () => ({
  clearCredentialCache: vi.fn(),
  getUncachableStripeClient: mockGetUncachableStripeClient,
}));

// authMiddleware stub: injects req.user = { id: "sa-1" }
vi.mock("../auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: "sa-1" };
    next();
  },
}));

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUPER_ADMIN = {
  id: "sa-1",
  isSuperAdmin: true,
  isAdmin: true,
  tenantId: null,
};

const OWNER_RECORD = {
  id: "owner-1",
  email: "owner@example.com",
  firstName: "Alice",
};

function makeTenant(trialWarningEmailSentAt: Date | null) {
  return {
    id: 42,
    name: "Pawfect Grooming",
    ownerId: "owner-1",
    subscriptionStatus: "trial",
    trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    trialWarningEmailSentAt,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeCurrentPeriodEnd: null,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateTenant.mockResolvedValue(undefined);
  mockSendTrialWarningEmail.mockResolvedValue(undefined);

  mockGetUser.mockImplementation(async (id: string) => {
    if (id === "sa-1") return SUPER_ADMIN;
    if (id === "owner-1") return OWNER_RECORD;
    return null;
  });
});

// ── Tests: cooldown active (same UTC calendar day) ────────────────────────────

describe("POST /api/billing/send-trial-warning — daily cooldown guard", () => {
  it("returns 429 when the reminder was sent 30 minutes ago (same UTC day)", async () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    mockGetTenant.mockResolvedValue(makeTenant(thirtyMinutesAgo));

    const agent = buildApp();
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/already sent today/i);
  });

  it("does NOT call sendTrialWarningEmail when the cooldown is active", async () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    mockGetTenant.mockResolvedValue(makeTenant(thirtyMinutesAgo));

    const agent = buildApp();
    await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });

  it("includes sentAt in the 429 response body", async () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    mockGetTenant.mockResolvedValue(makeTenant(thirtyMinutesAgo));

    const agent = buildApp();
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(res.status).toBe(429);
    expect(res.body.sentAt).toBeDefined();
    expect(new Date(res.body.sentAt).toISOString()).toBe(thirtyMinutesAgo.toISOString());
  });

  // ── Tests: cooldown expired (different UTC calendar day) ──────────────────

  it("returns 200 when the reminder was sent yesterday (different UTC day)", async () => {
    // yesterday UTC: subtract 24 hours then force to the previous calendar day
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Ensure it is strictly on a different UTC date regardless of test run time
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    mockGetTenant.mockResolvedValue(makeTenant(yesterday));

    const agent = buildApp();
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sent successfully/i);
  });

  it("calls sendTrialWarningEmail when the cooldown has expired (yesterday)", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    mockGetTenant.mockResolvedValue(makeTenant(yesterday));

    const agent = buildApp();
    await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(mockSendTrialWarningEmail).toHaveBeenCalledOnce();
  });

  it("records a new trialWarningEmailSentAt after a successful send (post-cooldown)", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    mockGetTenant.mockResolvedValue(makeTenant(yesterday));

    const agent = buildApp();
    await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(mockUpdateTenant).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ trialWarningEmailSentAt: expect.any(Date) }),
    );
  });

  // ── Tests: field cleared (null — guard must not fire) ─────────────────────

  it("returns 200 when trialWarningEmailSentAt is null (never sent)", async () => {
    mockGetTenant.mockResolvedValue(makeTenant(null));

    const agent = buildApp();
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sent successfully/i);
  });

  it("calls sendTrialWarningEmail when trialWarningEmailSentAt is null", async () => {
    mockGetTenant.mockResolvedValue(makeTenant(null));

    const agent = buildApp();
    await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(mockSendTrialWarningEmail).toHaveBeenCalledOnce();
  });

  it("records trialWarningEmailSentAt on first-ever send (null → set)", async () => {
    mockGetTenant.mockResolvedValue(makeTenant(null));

    const agent = buildApp();
    await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(mockUpdateTenant).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ trialWarningEmailSentAt: expect.any(Date) }),
    );
  });
});
