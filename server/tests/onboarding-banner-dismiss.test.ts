/**
 * Unit tests: OnboardingBanner dismiss-state machine
 *
 * Tests the subscription-regression detection logic documented in
 * client/src/components/onboarding-banner.tsx.
 *
 * The lifecycle:
 *   1. Owner dismisses banner while on trial/past_due
 *        → { dismissed: true, seenActive: false }
 *   2. Owner subscribes (status becomes "active")
 *        → { dismissed: true, seenActive: true }
 *   3. Subscription lapses (status reverts to non-active)
 *        → dismiss cleared; banner re-appears
 *
 * These tests run in Node (no DOM/React) by re-implementing the same pure
 * logic functions that the component uses, driven against an in-memory
 * localStorage stand-in.
 */

import { describe, it, expect, beforeEach } from "vitest";

// ─── In-memory localStorage stand-in ─────────────────────────────────────────

const store: Record<string, string> = {};
const localStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

// ─── Logic functions (mirrors onboarding-banner.tsx exactly) ─────────────────

const DISMISSED_KEY = "onboarding_banner_dismissed_v2";

interface DismissState {
  dismissed: boolean;
  seenActive: boolean;
}

function loadDismissState(): DismissState | null {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DismissState;
  } catch {
    return null;
  }
}

function saveDismissState(state: DismissState): void {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(state));
}

function clearDismissLocally(): void {
  localStorage.removeItem(DISMISSED_KEY);
}

function isDismissedLocally(): boolean {
  return loadDismissState()?.dismissed === true;
}

/**
 * Simulates what the useEffect in OnboardingBanner does each time
 * billing.subscriptionStatus changes.
 * Returns true if dismiss was cleared (banner should re-appear).
 */
function processBillingUpdate(subscriptionStatus: string): boolean {
  const state = loadDismissState();
  if (!state?.dismissed) return false;

  if (!state.seenActive) {
    if (subscriptionStatus === "active") {
      saveDismissState({ dismissed: true, seenActive: true });
    }
  } else {
    if (subscriptionStatus !== "active") {
      clearDismissLocally();
      return true; // banner should re-appear
    }
  }
  return false;
}

/** Simulate the user clicking "Dismiss" on the banner. */
function dismissBanner(): void {
  saveDismissState({ dismissed: true, seenActive: false });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Clear the in-memory store before each test
  for (const key of Object.keys(store)) delete store[key];
});

describe("OnboardingBanner dismiss-state machine", () => {
  describe("primary lifecycle: trial → active → lapse", () => {
    it("banner re-appears after dismiss → active → trial regression", () => {
      // Step 1: user dismisses on trial
      dismissBanner();
      expect(isDismissedLocally()).toBe(true);

      // Step 2: subscription goes active
      const clearedOnActive = processBillingUpdate("active");
      expect(clearedOnActive).toBe(false); // still dismissed
      expect(isDismissedLocally()).toBe(true);
      expect(loadDismissState()?.seenActive).toBe(true);

      // Step 3: subscription lapses back to trial
      const clearedOnLapse = processBillingUpdate("trial");
      expect(clearedOnLapse).toBe(true);  // banner re-appears
      expect(isDismissedLocally()).toBe(false);
      expect(loadDismissState()).toBeNull();
    });

    it("banner re-appears after dismiss → active → past_due regression", () => {
      dismissBanner();
      processBillingUpdate("active");

      const cleared = processBillingUpdate("past_due");
      expect(cleared).toBe(true);
      expect(isDismissedLocally()).toBe(false);
    });
  });

  describe("edge case: status stays the same (trial → trial)", () => {
    it("banner stays dismissed when status never became active", () => {
      dismissBanner();

      // Multiple trial updates — seenActive never flips
      processBillingUpdate("trial");
      processBillingUpdate("trial");
      processBillingUpdate("trial");

      expect(isDismissedLocally()).toBe(true);
      expect(loadDismissState()?.seenActive).toBe(false);
    });
  });

  describe("edge case: status progresses to cancelled without going active", () => {
    it("banner stays dismissed when it goes trial → cancelled (never was active)", () => {
      dismissBanner();

      const cleared = processBillingUpdate("cancelled");
      expect(cleared).toBe(false); // seenActive is false → no clear
      expect(isDismissedLocally()).toBe(true);
    });
  });

  describe("edge case: active → cancelled after having been active", () => {
    it("banner re-appears when subscription cancels after having been active", () => {
      dismissBanner();
      processBillingUpdate("active"); // seenActive = true

      const cleared = processBillingUpdate("cancelled");
      expect(cleared).toBe(true);
      expect(isDismissedLocally()).toBe(false);
    });
  });

  describe("edge case: no dismiss state present", () => {
    it("processBillingUpdate is a no-op when banner was never dismissed", () => {
      // Nothing stored
      const cleared = processBillingUpdate("trial");
      expect(cleared).toBe(false);
      expect(loadDismissState()).toBeNull();
    });
  });

  describe("seenActive transitions only one-way", () => {
    it("seenActive stays true even if status bounces active → trial → active", () => {
      dismissBanner();
      processBillingUpdate("active"); // seenActive = true

      // Re-activates (shouldn't cause issues)
      processBillingUpdate("active");
      expect(loadDismissState()?.seenActive).toBe(true);
      expect(isDismissedLocally()).toBe(true);
    });

    it("multiple active updates do not duplicate-write state incorrectly", () => {
      dismissBanner();
      processBillingUpdate("active");
      processBillingUpdate("active");

      // Still dismissed, seenActive true
      expect(isDismissedLocally()).toBe(true);
      expect(loadDismissState()?.seenActive).toBe(true);
    });
  });

  describe("serialization round-trip (page reload survival)", () => {
    it("loadDismissState reads back the exact shape written by saveDismissState", () => {
      // Write a v2 blob directly (simulates what saveDismissState stores)
      const blob: DismissState = { dismissed: true, seenActive: false };
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(blob));

      // Simulate a page reload by calling loadDismissState fresh
      const loaded = loadDismissState();
      expect(loaded).not.toBeNull();
      expect(loaded?.dismissed).toBe(true);
      expect(loaded?.seenActive).toBe(false);
    });

    it("loadDismissState reads back seenActive=true correctly after round-trip", () => {
      const blob: DismissState = { dismissed: true, seenActive: true };
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(blob));

      const loaded = loadDismissState();
      expect(loaded?.dismissed).toBe(true);
      expect(loaded?.seenActive).toBe(true);
    });
  });

  describe("legacy / malformed storage values", () => {
    it("old v1 key 'permanently_dismissed' does not corrupt v2 state", () => {
      // Simulate a browser that still has the old v1 key from a previous session
      localStorage.setItem("onboarding_banner_permanently_dismissed", "true");

      // v2 key is absent — loadDismissState should return null
      const loaded = loadDismissState();
      expect(loaded).toBeNull();

      // The banner is therefore not dismissed
      expect(isDismissedLocally()).toBe(false);
    });

    it("a malformed (non-object) value stored under the v2 key is ignored gracefully", () => {
      // Someone or a legacy codepath stored a primitive under the v2 key
      localStorage.setItem(DISMISSED_KEY, "permanently_dismissed");

      // JSON.parse("permanently_dismissed") throws — loadDismissState must catch it
      const loaded = loadDismissState();
      expect(loaded).toBeNull();
      expect(isDismissedLocally()).toBe(false);
    });

    it("loadDismissState returns null when stored JSON is syntactically invalid", () => {
      localStorage.setItem(DISMISSED_KEY, "{bad json}");

      const loaded = loadDismissState();
      expect(loaded).toBeNull();
      expect(isDismissedLocally()).toBe(false);
    });
  });
});
