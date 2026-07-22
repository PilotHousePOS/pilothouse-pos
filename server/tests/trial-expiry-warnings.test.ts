/**
 * Unit tests: Trial expiry warning emails
 *
 * Verifies that:
 * 1. A trial tenant within the 3-day window receives exactly one warning email.
 * 2. Once a tenant's subscriptionStatus changes to 'active', no further warning
 *    is sent on subsequent scheduler runs.
 * 3. trialWarningEmailSentAt prevents a second email within the same trial period
 *    even if the tenant is still on 'trial'.
 *
 * These tests mock storage and SendGrid — no real DB or email calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state (vi.hoisted runs before vi.mock factories) ──────────────

type MockTenant = {
  id: number;
  name: string;
  ownerId: string;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  trialWarningEmailSentAt: Date | null;
};

const { mockTenants, mockStorage, mockSendTrialWarningEmail } = vi.hoisted(() => {
  const mockTenants: MockTenant[] = [];

  const mockStorage = {
    getAllTenants: vi.fn(async () => mockTenants),
    getUser: vi.fn(async (_id: string) => ({
      id: "owner-1",
      email: "owner@example.com",
      firstName: "Alice",
    })),
    updateTenant: vi.fn(async (id: number, updates: Partial<MockTenant>) => {
      const tenant = mockTenants.find((t) => t.id === id);
      if (tenant) Object.assign(tenant, updates);
    }),
  };

  const mockSendTrialWarningEmail = vi.fn(async () => {});

  return { mockTenants, mockStorage, mockSendTrialWarningEmail };
});

vi.mock("../storage", () => ({ storage: mockStorage }));
vi.mock("../sendgrid", () => ({ sendTrialWarningEmail: mockSendTrialWarningEmail }));

// ── Import SUT (after mocks are registered) ───────────────────────────────────

import { runTrialExpiryWarnings } from "../scheduler";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a Date that is `days` days from now. */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function resetTenants(...tenants: MockTenant[]) {
  mockTenants.splice(0, mockTenants.length, ...tenants);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockTenants.splice(0);
  // Re-attach the mutating implementation after clearAllMocks resets it
  mockStorage.updateTenant.mockImplementation(async (id: number, updates: Partial<MockTenant>) => {
    const tenant = mockTenants.find((t) => t.id === id);
    if (tenant) Object.assign(tenant, updates);
  });
  mockStorage.getAllTenants.mockImplementation(async () => mockTenants);
  mockStorage.getUser.mockImplementation(async (_id: string) => ({
    id: "owner-1",
    email: "owner@example.com",
    firstName: "Alice",
  }));
});

describe("runTrialExpiryWarnings — basic email send", () => {
  it("sends a warning email to a trial tenant expiring within 3 days", async () => {
    resetTenants({
      id: 1,
      name: "Acme Pet Store",
      ownerId: "owner-1",
      subscriptionStatus: "trial",
      trialEndsAt: daysFromNow(2), // 2 days left — within the 3-day window
      trialWarningEmailSentAt: null,
    });

    await runTrialExpiryWarnings();

    expect(mockSendTrialWarningEmail).toHaveBeenCalledOnce();
    const [toEmail, firstName, daysLeft, tenantName] =
      mockSendTrialWarningEmail.mock.calls[0];
    expect(toEmail).toBe("owner@example.com");
    expect(firstName).toBe("Alice");
    expect(daysLeft).toBeGreaterThanOrEqual(1);
    expect(tenantName).toBe("Acme Pet Store");
  });

  it("does NOT send a warning email to a trial tenant expiring MORE than 3 days away", async () => {
    resetTenants({
      id: 2,
      name: "Far Future Store",
      ownerId: "owner-1",
      subscriptionStatus: "trial",
      trialEndsAt: daysFromNow(5), // 5 days left — outside the window
      trialWarningEmailSentAt: null,
    });

    await runTrialExpiryWarnings();

    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });

  it("does NOT send a warning email to an already-expired trial", async () => {
    resetTenants({
      id: 3,
      name: "Expired Store",
      ownerId: "owner-1",
      subscriptionStatus: "trial",
      trialEndsAt: daysFromNow(-1), // expired yesterday
      trialWarningEmailSentAt: null,
    });

    await runTrialExpiryWarnings();

    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });
});

describe("runTrialExpiryWarnings — subscribing mid-trial stops further emails", () => {
  it("sends a warning email on the first run (tenant still on trial)", async () => {
    resetTenants({
      id: 10,
      name: "Converts Store",
      ownerId: "owner-1",
      subscriptionStatus: "trial",
      trialEndsAt: daysFromNow(2),
      trialWarningEmailSentAt: null,
    });

    await runTrialExpiryWarnings();

    expect(mockSendTrialWarningEmail).toHaveBeenCalledOnce();
    expect(mockStorage.updateTenant).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ trialWarningEmailSentAt: expect.any(Date) }),
    );
  });

  it("sends NO email after the tenant subscribes (subscriptionStatus → 'active')", async () => {
    // Simulate the tenant having subscribed: status is now 'active'
    resetTenants({
      id: 10,
      name: "Converts Store",
      ownerId: "owner-1",
      subscriptionStatus: "active", // ← converted
      trialEndsAt: daysFromNow(2),
      trialWarningEmailSentAt: null,
    });

    await runTrialExpiryWarnings();

    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });

  it("sends NO email on a second run after subscribing, even if email was sent during trial", async () => {
    // Tenant subscribed AND already received a warning email during trial
    resetTenants({
      id: 11,
      name: "Subscribed With Prior Warning",
      ownerId: "owner-1",
      subscriptionStatus: "active",
      trialEndsAt: daysFromNow(1),
      trialWarningEmailSentAt: new Date(Date.now() - 60_000), // sent 1 minute ago
    });

    await runTrialExpiryWarnings();

    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });
});

describe("runTrialExpiryWarnings — trialWarningEmailSentAt deduplication", () => {
  it("does NOT send a second warning email if trialWarningEmailSentAt is already set", async () => {
    resetTenants({
      id: 20,
      name: "Already Warned Store",
      ownerId: "owner-1",
      subscriptionStatus: "trial",
      trialEndsAt: daysFromNow(2),
      trialWarningEmailSentAt: new Date(), // warning was already sent today
    });

    await runTrialExpiryWarnings();

    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });

  it("sends exactly one email across two consecutive runs for the same trial tenant", async () => {
    resetTenants({
      id: 30,
      name: "Double Run Store",
      ownerId: "owner-1",
      subscriptionStatus: "trial",
      trialEndsAt: daysFromNow(1),
      trialWarningEmailSentAt: null,
    });

    // First run — email should be sent and trialWarningEmailSentAt marked
    await runTrialExpiryWarnings();
    expect(mockSendTrialWarningEmail).toHaveBeenCalledOnce();

    // Confirm the in-memory tenant now has trialWarningEmailSentAt set
    const tenant = mockTenants.find((t) => t.id === 30);
    expect(tenant?.trialWarningEmailSentAt).toBeInstanceOf(Date);

    vi.clearAllMocks();
    // Re-attach implementations after clearAllMocks
    mockStorage.getAllTenants.mockImplementation(async () => mockTenants);
    mockStorage.getUser.mockImplementation(async (_id: string) => ({
      id: "owner-1",
      email: "owner@example.com",
      firstName: "Alice",
    }));
    mockStorage.updateTenant.mockImplementation(async (id: number, updates: Partial<MockTenant>) => {
      const t = mockTenants.find((x) => x.id === id);
      if (t) Object.assign(t, updates);
    });

    // Second run — trialWarningEmailSentAt is set, so NO second email
    await runTrialExpiryWarnings();
    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });
});

describe("runTrialExpiryWarnings — retry after failed delivery", () => {
  it("does NOT mark trialWarningEmailSentAt after a SendGrid failure, and re-sends on next run", async () => {
    resetTenants({
      id: 70,
      name: "Retry Store",
      ownerId: "owner-1",
      subscriptionStatus: "trial",
      trialEndsAt: daysFromNow(2),
      trialWarningEmailSentAt: null,
    });

    // First run — SendGrid throws
    mockSendTrialWarningEmail.mockRejectedValueOnce(new Error("SendGrid 503"));

    await runTrialExpiryWarnings();

    // Email was attempted but failed — trialWarningEmailSentAt must NOT be set
    expect(mockSendTrialWarningEmail).toHaveBeenCalledOnce();
    const tenant = mockTenants.find((t) => t.id === 70);
    expect(tenant?.trialWarningEmailSentAt).toBeNull();
    expect(mockStorage.updateTenant).not.toHaveBeenCalled();

    // Reset call counts but keep tenant state (trialWarningEmailSentAt still null)
    vi.clearAllMocks();
    mockStorage.getAllTenants.mockImplementation(async () => mockTenants);
    mockStorage.getUser.mockImplementation(async (_id: string) => ({
      id: "owner-1",
      email: "owner@example.com",
      firstName: "Alice",
    }));
    mockStorage.updateTenant.mockImplementation(async (id: number, updates: Partial<MockTenant>) => {
      const t = mockTenants.find((x) => x.id === id);
      if (t) Object.assign(t, updates);
    });
    mockSendTrialWarningEmail.mockResolvedValueOnce(undefined);

    // Second run — SendGrid succeeds
    await runTrialExpiryWarnings();

    expect(mockSendTrialWarningEmail).toHaveBeenCalledOnce();
    expect(mockStorage.updateTenant).toHaveBeenCalledWith(
      70,
      expect.objectContaining({ trialWarningEmailSentAt: expect.any(Date) }),
    );
    expect(mockTenants.find((t) => t.id === 70)?.trialWarningEmailSentAt).toBeInstanceOf(Date);
  });
});

describe("runTrialExpiryWarnings — edge cases", () => {
  it("skips a tenant with no ownerId", async () => {
    resetTenants({
      id: 40,
      name: "No Owner Store",
      ownerId: "", // falsy ownerId
      subscriptionStatus: "trial",
      trialEndsAt: daysFromNow(1),
      trialWarningEmailSentAt: null,
    });

    await runTrialExpiryWarnings();

    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });

  it("skips a tenant with no trialEndsAt", async () => {
    resetTenants({
      id: 50,
      name: "No Expiry Store",
      ownerId: "owner-1",
      subscriptionStatus: "trial",
      trialEndsAt: null,
      trialWarningEmailSentAt: null,
    });

    await runTrialExpiryWarnings();

    expect(mockSendTrialWarningEmail).not.toHaveBeenCalled();
  });

  it("processes multiple tenants independently — only qualifying ones get emails", async () => {
    resetTenants(
      {
        id: 60,
        name: "Qualifying Store",
        ownerId: "owner-1",
        subscriptionStatus: "trial",
        trialEndsAt: daysFromNow(2), // qualifies
        trialWarningEmailSentAt: null,
      },
      {
        id: 61,
        name: "Active Store",
        ownerId: "owner-1",
        subscriptionStatus: "active", // does not qualify — already subscribed
        trialEndsAt: daysFromNow(2),
        trialWarningEmailSentAt: null,
      },
      {
        id: 62,
        name: "Already Warned Store",
        ownerId: "owner-1",
        subscriptionStatus: "trial",
        trialEndsAt: daysFromNow(1),
        trialWarningEmailSentAt: new Date(), // already sent
      },
    );

    await runTrialExpiryWarnings();

    // Only tenant 60 should trigger an email
    expect(mockSendTrialWarningEmail).toHaveBeenCalledOnce();
  });
});
