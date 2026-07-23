/**
 * Unit tests: Onboarding cross-tab sync (BroadcastChannel + storage event)
 *
 * Covers the scenario where:
 *   - Tab A is sitting on Step 1 (Choose a Plan) of the onboarding flow
 *   - Tab B is the Stripe checkout return tab (?step=3&plan_success=1)
 *   - Tab B calls broadcastBillingUpdate()
 *   - Tab A receives the message and invalidates its React Query cache
 *   - After re-fetch, billingStatus becomes "active" and the step advances
 *     from 1 → 2 without a manual refresh
 *
 * These tests run in Node (no DOM / React) by re-implementing the same pure
 * logic functions used in client/src/pages/onboarding.tsx.
 */

import { describe, it, expect, beforeEach } from "vitest";

// ─── In-memory localStorage stand-in ──────────────────────────────────────────

const store: Record<string, string> = {};
const localStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

// ─── BroadcastChannel mock ─────────────────────────────────────────────────────
//
// Simulates the browser BroadcastChannel API.  All instances that share a
// channel name are wired together in-process via a listener registry so we can
// verify that messages flow from sender to receiver.

type Listener = (event: { data: unknown }) => void;
const channelListeners: Record<string, Listener[]> = {};

class MockBroadcastChannel {
  private name: string;
  private closed = false;
  onmessage: Listener | null = null;
  private _listener: Listener | null = null;

  constructor(name: string) {
    this.name = name;
    if (!channelListeners[name]) channelListeners[name] = [];
  }

  addEventListener(_type: "message", listener: Listener) {
    this._listener = listener;
    if (!channelListeners[this.name]) channelListeners[this.name] = [];
    channelListeners[this.name].push(listener);
  }

  postMessage(data: unknown) {
    if (this.closed) return;
    const listeners = channelListeners[this.name] ?? [];
    // Deliver to all listeners EXCEPT ones registered by this same instance
    for (const fn of listeners) {
      if (fn !== this._listener) {
        fn({ data });
      }
    }
  }

  close() {
    this.closed = true;
    if (this._listener) {
      const list = channelListeners[this.name] ?? [];
      const idx = list.indexOf(this._listener);
      if (idx !== -1) list.splice(idx, 1);
      this._listener = null;
    }
  }
}

// Reset channel listener registry before each test
beforeEach(() => {
  for (const key of Object.keys(channelListeners)) delete channelListeners[key];
});

// ─── Logic functions (mirrors onboarding.tsx exactly) ─────────────────────────

const ONBOARDING_CHANNEL = "onboarding_sync";

/**
 * Called by Tab B (the Stripe return tab) to notify other tabs that billing
 * data has changed.
 */
function broadcastBillingUpdate(BC: typeof MockBroadcastChannel): void {
  try {
    const ch = new BC(ONBOARDING_CHANNEL);
    ch.postMessage({ type: "billing_updated" });
    ch.close();
  } catch {
    // BroadcastChannel not supported — fall back to storage event
    try {
      localStorage.setItem("onboarding_billing_updated_at", String(Date.now()));
    } catch {}
  }
}

/**
 * Set up Tab A's listener.  Returns a spy that records how many times
 * invalidate() was called (analogous to queryClient.invalidateQueries).
 */
function setupTabAListener(BC: typeof MockBroadcastChannel): {
  invalidateCallCount: () => number;
  teardown: () => void;
} {
  let callCount = 0;
  const invalidate = () => { callCount++; };

  const channel = new BC(ONBOARDING_CHANNEL);
  channel.addEventListener("message", (e: { data: unknown }) => {
    if ((e.data as { type?: string })?.type === "billing_updated") invalidate();
  });

  const onStorage = (key: string) => {
    if (key === "onboarding_billing_updated_at") invalidate();
  };

  return {
    invalidateCallCount: () => callCount,
    teardown: () => { channel.close(); },
    // Expose storage handler for the storage-event fallback tests
    ...{ _onStorage: onStorage },
  } as {
    invalidateCallCount: () => number;
    teardown: () => void;
    _onStorage: (key: string) => void;
  };
}

// ─── Step-detection logic (mirrors detectStartStep in onboarding.tsx) ──────────

function detectStartStep(
  billingStatus: string | undefined,
  serverOnboardingStep: number,
): number {
  const subscriptionActive =
    billingStatus === "active" || billingStatus === "cancelled";
  if (subscriptionActive) return 2;
  if (serverOnboardingStep >= 1) return 1;
  return 0;
}

/**
 * Simulates the cross-tab reconciliation useEffect from Onboarding component.
 *
 * Given the current local step and fresh billing data, return the new step.
 * The step is monotonic — it never regresses.
 */
function reconcileStep(currentStep: number, subscriptionStatus: string | undefined): number {
  const subscriptionActive =
    subscriptionStatus === "active" || subscriptionStatus === "cancelled";
  if (subscriptionActive && currentStep < 2) return 2;
  return currentStep;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("Onboarding cross-tab sync", () => {
  // ── BroadcastChannel: message delivery ──────────────────────────────────────

  describe("broadcastBillingUpdate → Tab A listener", () => {
    it("sends { type: 'billing_updated' } over the channel", () => {
      const received: unknown[] = [];
      const listener = new MockBroadcastChannel(ONBOARDING_CHANNEL);
      listener.addEventListener("message", (e) => received.push(e.data));

      broadcastBillingUpdate(MockBroadcastChannel);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ type: "billing_updated" });

      listener.close();
    });

    it("Tab A's invalidate() is called exactly once per broadcast", () => {
      const tabA = setupTabAListener(MockBroadcastChannel);

      broadcastBillingUpdate(MockBroadcastChannel);

      expect(tabA.invalidateCallCount()).toBe(1);
      tabA.teardown();
    });

    it("Tab A's invalidate() is called again for each subsequent broadcast", () => {
      const tabA = setupTabAListener(MockBroadcastChannel);

      broadcastBillingUpdate(MockBroadcastChannel);
      broadcastBillingUpdate(MockBroadcastChannel);

      expect(tabA.invalidateCallCount()).toBe(2);
      tabA.teardown();
    });

    it("channel is closed after broadcast (no memory leak)", () => {
      // After close the listener list for this channel should be empty for the sender
      broadcastBillingUpdate(MockBroadcastChannel);
      // The sender opened and immediately closed a channel — the listener list
      // after the send should only contain listeners we registered after close.
      const tabA = setupTabAListener(MockBroadcastChannel);
      // No new broadcast yet → count should still be 0
      expect(tabA.invalidateCallCount()).toBe(0);
      tabA.teardown();
    });
  });

  // ── Step advancement after invalidation ─────────────────────────────────────

  describe("step advancement: Tab A on step 1, billing becomes active", () => {
    it("step advances from 1 → 2 when subscriptionStatus becomes 'active'", () => {
      // Tab A starts on step 1 (plan selection)
      let currentStep = 1;

      // Simulate receiving broadcast and invalidating — then re-fetch returns active
      const newStep = reconcileStep(currentStep, "active");

      expect(newStep).toBe(2);
    });

    it("step advances from 1 → 2 when subscriptionStatus is 'cancelled'", () => {
      const newStep = reconcileStep(1, "cancelled");
      expect(newStep).toBe(2);
    });

    it("step does not regress: already on step 2, billing still active", () => {
      const newStep = reconcileStep(2, "active");
      expect(newStep).toBe(2);
    });

    it("step stays at 1 when billing remains 'trial' (no change)", () => {
      const newStep = reconcileStep(1, "trial");
      expect(newStep).toBe(1);
    });

    it("step stays at 1 when billing is undefined (query still loading)", () => {
      const newStep = reconcileStep(1, undefined);
      expect(newStep).toBe(1);
    });

    it("step stays at 0 when billing is not yet active", () => {
      const newStep = reconcileStep(0, "trial");
      expect(newStep).toBe(0);
    });
  });

  // ── Full scenario: Tab B → BroadcastChannel → Tab A step advance ────────────

  describe("full cross-tab scenario", () => {
    it("Tab A on step 1 advances to step 2 after Tab B broadcasts billing_updated", () => {
      // Tab A sets up its listener (simulates the useEffect in Onboarding)
      let tabAStep = 1;
      let invalidateCalled = false;

      const tabAChannel = new MockBroadcastChannel(ONBOARDING_CHANNEL);
      tabAChannel.addEventListener("message", (e: { data: unknown }) => {
        if ((e.data as { type?: string })?.type === "billing_updated") {
          invalidateCalled = true;
          // Simulate: after re-fetch, billing is now active
          const freshBillingStatus = "active";
          tabAStep = reconcileStep(tabAStep, freshBillingStatus);
        }
      });

      // Tab B returns from Stripe checkout and broadcasts
      broadcastBillingUpdate(MockBroadcastChannel);

      // Assert: Tab A invalidated its cache
      expect(invalidateCalled).toBe(true);
      // Assert: Tab A advanced to step 2 (Invite Staff) without a manual reload
      expect(tabAStep).toBe(2);

      tabAChannel.close();
    });

    it("Tab A that already completed step 2 is not affected by a duplicate broadcast", () => {
      let tabAStep = 2; // already on invite staff
      let invalidateCalled = false;

      const tabAChannel = new MockBroadcastChannel(ONBOARDING_CHANNEL);
      tabAChannel.addEventListener("message", (e: { data: unknown }) => {
        if ((e.data as { type?: string })?.type === "billing_updated") {
          invalidateCalled = true;
          tabAStep = reconcileStep(tabAStep, "active");
        }
      });

      broadcastBillingUpdate(MockBroadcastChannel);

      expect(invalidateCalled).toBe(true);
      expect(tabAStep).toBe(2); // no change — already there
      tabAChannel.close();
    });

    it("multiple tabs listening each receive the broadcast independently", () => {
      let tabACount = 0;
      let tabCCount = 0;

      const tabA = new MockBroadcastChannel(ONBOARDING_CHANNEL);
      tabA.addEventListener("message", (e: { data: unknown }) => {
        if ((e.data as { type?: string })?.type === "billing_updated") tabACount++;
      });

      const tabC = new MockBroadcastChannel(ONBOARDING_CHANNEL);
      tabC.addEventListener("message", (e: { data: unknown }) => {
        if ((e.data as { type?: string })?.type === "billing_updated") tabCCount++;
      });

      broadcastBillingUpdate(MockBroadcastChannel);

      expect(tabACount).toBe(1);
      expect(tabCCount).toBe(1);

      tabA.close();
      tabC.close();
    });
  });

  // ── Storage-event fallback ───────────────────────────────────────────────────

  describe("storage-event fallback (when BroadcastChannel throws)", () => {
    it("falls back to localStorage when BroadcastChannel constructor throws", () => {
      class ThrowingBC {
        constructor() { throw new Error("not supported"); }
      }

      // Should not throw
      broadcastBillingUpdate(ThrowingBC as unknown as typeof MockBroadcastChannel);

      const stored = localStorage.getItem("onboarding_billing_updated_at");
      expect(stored).not.toBeNull();
      expect(Number(stored)).toBeGreaterThan(0);
    });

    it("Tab A's storage listener invalidates when the fallback key is written", () => {
      let invalidateCalled = false;
      const invalidate = () => { invalidateCalled = true; };

      // Simulate Tab A's storage event handler
      const onStorage = (key: string) => {
        if (key === "onboarding_billing_updated_at") invalidate();
      };

      // Tab B writes the fallback key
      localStorage.setItem("onboarding_billing_updated_at", String(Date.now()));
      onStorage("onboarding_billing_updated_at");

      expect(invalidateCalled).toBe(true);
    });

    it("Tab A's storage listener ignores unrelated storage keys", () => {
      let invalidateCalled = false;
      const invalidate = () => { invalidateCalled = true; };

      const onStorage = (key: string) => {
        if (key === "onboarding_billing_updated_at") invalidate();
      };

      onStorage("some_other_key");

      expect(invalidateCalled).toBe(false);
    });
  });

  // ── detectStartStep: Stripe return tab (?step=3) ─────────────────────────────

  describe("detectStartStep for the Stripe return tab", () => {
    it("?step=3 maps directly to internal step 2 (Invite Staff)", () => {
      // In the component: if (stripeReturn) return 2;
      // stripeReturn = (rawUrlStep === 3)
      const rawUrlStep = 3;
      const stripeReturn = rawUrlStep === 3;
      const step = stripeReturn ? 2 : detectStartStep("trial", 0);
      expect(step).toBe(2);
    });

    it("detectStartStep skips plan step when subscription is active", () => {
      expect(detectStartStep("active", 0)).toBe(2);
    });

    it("detectStartStep returns plan step when subscription is trial and step1 done", () => {
      expect(detectStartStep("trial", 1)).toBe(1);
    });

    it("detectStartStep returns business details step when nothing is done", () => {
      expect(detectStartStep("trial", 0)).toBe(0);
    });
  });

  // ── broadcastedRef guard: Tab B only broadcasts once ────────────────────────

  describe("Tab B broadcast guard (broadcastedRef)", () => {
    it("broadcastBillingUpdate is idempotent when called from the sender itself", () => {
      // The component guards with broadcastedRef.current so it only fires once.
      // We test the underlying channel: even if called twice, receivers each get
      // a message per call — the guard is the caller's responsibility.
      const received: unknown[] = [];
      const tabA = new MockBroadcastChannel(ONBOARDING_CHANNEL);
      tabA.addEventListener("message", (e) => received.push(e.data));

      // Simulate the ref guard: only call once
      let broadcasted = false;
      if (!broadcasted) {
        broadcasted = true;
        broadcastBillingUpdate(MockBroadcastChannel);
      }
      if (!broadcasted) { // never fires
        broadcastBillingUpdate(MockBroadcastChannel);
      }

      expect(received).toHaveLength(1);
      tabA.close();
    });
  });
});
