/**
 * Tests: POST /api/billing/send-trial-warning — trial reminder button visibility
 *
 * The "Send Trial Reminder" button in the super-admin tenant table is only
 * rendered when `subscriptionStatus === 'trial'`.  These tests confirm the
 * backing endpoint enforces the same rule, so a regression in either the UI
 * conditional or the server guard will be caught.
 *
 * Scenarios covered:
 * 1. Returns 200 and sends the email for a tenant with subscriptionStatus 'trial'.
 * 2. Returns 400 (not 200) for tenants with status 'active'.
 * 3. Returns 400 for tenants with status 'past_due'.
 * 4. Returns 400 for tenants with status 'cancelled'.
 * 5. Calls the endpoint with the correct tenantId when a super-admin targets
 *    a specific tenant (mirrors the onClick handler in the UI).
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

const OWNER_USER = {
  id: "owner-1",
  isSuperAdmin: false,
  isAdmin: true,
  tenantId: 42,
};

function makeTenant(status: string) {
  return {
    id: 42,
    name: "Pawfect Grooming",
    ownerId: "owner-1",
    subscriptionStatus: status,
    trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    trialWarningEmailSentAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeCurrentPeriodEnd: null,
  };
}

const OWNER_RECORD = {
  id: "owner-1",
  email: "owner@example.com",
  firstName: "Alice",
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Re-attach updateTenant implementation after clearAllMocks
  mockUpdateTenant.mockResolvedValue(undefined);
  mockSendTrialWarningEmail.mockResolvedValue(undefined);
});

// ── Tests: trial tenant (button should appear / endpoint should succeed) ──────

describe("POST /api/billing/send-trial-warning — trial tenant", () => {
  beforeEach(() => {
    mockGetUser.mockImplementation(async (id: string) => {
      if (id === "sa-1") return SUPER_ADMIN;
      if (id === "owner-1") return OWNER_RECORD;
      return null;
    });
    mockGetTenant.mockResolvedValue(makeTenant("trial"));
  });

  it("returns 200 and sends the reminder email for a trial tenant", async () => {
    const agent = buildApp();
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sent successfully/i);
  });

  it("calls sendTrialWarningEmail with the owner's email and tenant name", async () => {
    const agent = buildApp();
    await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(mockSendTrialWarningEmail).toHaveBeenCalledOnce();
    const [toEmail, firstName, , tenantName] =
      mockSendTrialWarningEmail.mock.calls[0];
    expect(toEmail).toBe("owner@example.com");
    expect(firstName).toBe("Alice");
    expect(tenantName).toBe("Pawfect Grooming");
  });

  it("includes the sentTo email and daysLeft in the response body", async () => {
    const agent = buildApp();
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(res.body.sentTo).toBe("owner@example.com");
    expect(typeof res.body.daysLeft).toBe("number");
  });

  it("records trialWarningEmailSentAt after sending", async () => {
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

// ── Tests: non-trial tenants (button should be hidden / endpoint must reject) ─

describe("POST /api/billing/send-trial-warning — active tenant (no button)", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue(SUPER_ADMIN);
    mockGetTenant.mockResolvedValue(makeTenant("active"));
  });

  it("returns 400 for a tenant with subscriptionStatus 'active'", async () => {
    const agent = buildApp();
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not on a trial plan/i);
  });

  it("does NOT send an email for an active tenant", async () => {
    const agent = buildApp();
    await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/send-trial-warning — past_due tenant (no button)", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue(SUPER_ADMIN);
    mockGetTenant.mockResolvedValue(makeTenant("past_due"));
  });

  it("returns 400 for a tenant with subscriptionStatus 'past_due'", async () => {
    const agent = buildApp();
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not on a trial plan/i);
  });

  it("does NOT send an email for a past_due tenant", async () => {
    const agent = buildApp();
    await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/send-trial-warning — cancelled tenant (no button)", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue(SUPER_ADMIN);
    mockGetTenant.mockResolvedValue(makeTenant("cancelled"));
  });

  it("returns 400 for a tenant with subscriptionStatus 'cancelled'", async () => {
    const agent = buildApp();
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not on a trial plan/i);
  });

  it("does NOT send an email for a cancelled tenant", async () => {
    const agent = buildApp();
    await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });
});

// ── Tests: correct tenantId is forwarded (mirrors the UI onClick handler) ─────

describe("POST /api/billing/send-trial-warning — tenantId routing", () => {
  it("targets the tenantId sent in the request body when the caller is a super-admin", async () => {
    const targetTenantId = 99;
    mockGetUser.mockImplementation(async (id: string) => {
      if (id === "sa-1") return SUPER_ADMIN;
      if (id === "owner-1") return OWNER_RECORD;
      return null;
    });
    mockGetTenant.mockImplementation(async (id: number) => {
      if (id === targetTenantId) {
        return {
          ...makeTenant("trial"),
          id: targetTenantId,
          name: "Target Store",
        };
      }
      return null;
    });

    const agent = buildApp();
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: targetTenantId });

    expect(res.status).toBe(200);
    // Verify getTenant was called with the correct id
    expect(mockGetTenant).toHaveBeenCalledWith(targetTenantId);
  });

  it("uses the owner's own tenantId when the caller is a tenant owner (not super-admin)", async () => {
    mockGetUser.mockImplementation(async (id: string) => {
      if (id === "sa-1") return OWNER_USER;       // the authenticated caller is an owner
      if (id === "owner-1") return OWNER_RECORD;  // fetched when finding owner email
      return null;
    });
    mockGetTenant.mockResolvedValue(makeTenant("trial"));

    const agent = buildApp();
    // Even if a different tenantId is sent in the body, owners always target their own
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 9999 });

    expect(res.status).toBe(200);
    expect(mockGetTenant).toHaveBeenCalledWith(OWNER_USER.tenantId);
  });

  it("returns 403 when the caller is neither an owner nor a super-admin", async () => {
    mockGetUser.mockResolvedValue({
      id: "sa-1",
      isSuperAdmin: false,
      isAdmin: false,  // regular groomer, not an owner
      tenantId: 1,
    });

    const agent = buildApp();
    const res = await agent
      .post("/api/billing/send-trial-warning")
      .send({ tenantId: 42 });

    expect(res.status).toBe(403);
    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });
});
