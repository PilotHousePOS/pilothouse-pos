/**
 * Unit tests: Stripe key health check scheduler function
 *
 * Verifies that:
 * 1. `runStripeHealthCheck` sends an alert email to all super-admins when
 *    stripe.accounts.retrieve() throws (bad or rotated key).
 * 2. No alert is sent when the key is healthy.
 * 3. The idempotency guard ensures at most one alert email per UTC day, even
 *    across multiple consecutive failed health checks on the same day.
 * 4. The guard resets after a successful check so a future failure alerts again.
 * 5. A SendGrid delivery failure does not mark the guard as "sent", allowing a
 *    retry on the next run.
 *
 * These tests mock stripeClient and sendgrid — no real Stripe or email calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ────────────────────────────────────────────────────────
// vi.hoisted runs before vi.mock factories, making these available inside them.

const { mockStripeRetrieve, mockClearCredentialCache, mockSendStripeAlert } =
  vi.hoisted(() => {
    const mockStripeRetrieve = vi.fn();
    const mockClearCredentialCache = vi.fn();
    // Default: resolves with sentCount=1 (one super-admin notified successfully).
    // Tests that need a delivery failure override this with mockRejectedValueOnce.
    const mockSendStripeAlert = vi.fn(async () => 1);
    return { mockStripeRetrieve, mockClearCredentialCache, mockSendStripeAlert };
  });

// Mock the Stripe client module
vi.mock("../stripeClient", () => ({
  getUncachableStripeClient: vi.fn(async () => ({
    accounts: { retrieve: mockStripeRetrieve },
  })),
  clearCredentialCache: mockClearCredentialCache,
}));

// Mock only the function we care about in sendgrid; leave others as-is.
// The real implementation returns a sentCount (number) or throws when all
// deliveries fail — the mock follows the same contract.
vi.mock("../sendgrid", async (importOriginal) => {
  const original = await importOriginal<typeof import("../sendgrid")>();
  return {
    ...original,
    sendStripeKeyFailureAlertToSuperAdmins: mockSendStripeAlert,
  };
});

// ── Import SUT (after mocks are registered) ───────────────────────────────────

import {
  runStripeHealthCheck,
  _resetStripeAlertGuardForTesting,
} from "../scheduler";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Make mockStripeRetrieve succeed (healthy key). */
function simulateHealthyKey() {
  mockStripeRetrieve.mockResolvedValueOnce({ id: "acct_test123" });
}

/** Make mockStripeRetrieve fail with the given message (bad key). */
function simulateBadKey(message = "Invalid API Key provided") {
  mockStripeRetrieve.mockRejectedValueOnce(new Error(message));
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the in-process idempotency guard between every test
  _resetStripeAlertGuardForTesting();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runStripeHealthCheck — healthy key", () => {
  it("does NOT send an alert when the key is valid", async () => {
    simulateHealthyKey();

    await runStripeHealthCheck();

    expect(mockSendStripeAlert).not.toHaveBeenCalled();
  });

  it("clears the credential cache before checking (always uses fresh key)", async () => {
    simulateHealthyKey();

    await runStripeHealthCheck();

    expect(mockClearCredentialCache).toHaveBeenCalledOnce();
  });
});

describe("runStripeHealthCheck — bad key", () => {
  it("sends an alert to super-admins when stripe.accounts.retrieve() throws", async () => {
    simulateBadKey("Invalid API Key provided");

    await runStripeHealthCheck();

    expect(mockSendStripeAlert).toHaveBeenCalledOnce();
  });

  it("passes the Stripe error message to the alert function", async () => {
    const errMsg = "No such API key: sk_test_XXXX";
    simulateBadKey(errMsg);

    await runStripeHealthCheck();

    const [calledWithError] = mockSendStripeAlert.mock.calls[0];
    expect(calledWithError).toContain(errMsg);
  });

  it("clears the credential cache even when the check fails", async () => {
    simulateBadKey();

    await runStripeHealthCheck();

    expect(mockClearCredentialCache).toHaveBeenCalledOnce();
  });
});

describe("runStripeHealthCheck — idempotency guard (one alert per UTC day)", () => {
  it("sends exactly one alert across two consecutive failed checks on the same day", async () => {
    // First failure
    simulateBadKey();
    await runStripeHealthCheck();
    expect(mockSendStripeAlert).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // Second failure on the same day — guard should suppress
    simulateBadKey();
    await runStripeHealthCheck();
    expect(mockSendStripeAlert).not.toHaveBeenCalled();
  });

  it("sends a fresh alert after a successful check clears the guard", async () => {
    // First failure — alert fires
    simulateBadKey();
    await runStripeHealthCheck();
    expect(mockSendStripeAlert).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // Successful check — guard resets
    simulateHealthyKey();
    await runStripeHealthCheck();
    expect(mockSendStripeAlert).not.toHaveBeenCalled();

    vi.clearAllMocks();

    // Second failure — guard was cleared, so alert fires again
    simulateBadKey();
    await runStripeHealthCheck();
    expect(mockSendStripeAlert).toHaveBeenCalledTimes(1);
  });
});

describe("runStripeHealthCheck — SendGrid delivery failure", () => {
  it("does NOT mark the guard as sent when all alert deliveries fail, allowing a retry on next run", async () => {
    // First run — Stripe key fails; sendStripeKeyFailureAlertToSuperAdmins throws
    // (mirrors real implementation: throws when sentCount === 0)
    mockSendStripeAlert.mockRejectedValueOnce(
      new Error("All 1 super-admin alert(s) failed to deliver"),
    );
    simulateBadKey();
    await runStripeHealthCheck();

    // Alert was attempted but the guard must NOT have been set
    expect(mockSendStripeAlert).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // Second run — Stripe still bad, SendGrid succeeds (returns sentCount=1)
    mockSendStripeAlert.mockResolvedValueOnce(1);
    simulateBadKey();
    await runStripeHealthCheck();

    // Alert fires again because the guard was never set on the first run
    expect(mockSendStripeAlert).toHaveBeenCalledTimes(1);
  });
});
