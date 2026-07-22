// Banner shown to tenant owners who haven't completed onboarding (no active subscription)
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { X, Sparkles, ArrowRight } from "lucide-react";

interface BillingStatus {
  subscriptionStatus: string;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
}

// v2 key stores JSON:
//   { dismissed: true, seenActive: boolean }
//
// The lifecycle tracked here:
//   1. Owner dismisses banner while on trial/past_due → { dismissed: true, seenActive: false }
//   2. Owner subscribes (status becomes "active") → we update to { dismissed: true, seenActive: true }
//   3. Subscription lapses (status reverts to non-active) → we clear dismiss; banner re-appears
//
// The old "permanently_dismissed" v1 key is intentionally ignored — it had no status awareness.
const DISMISSED_KEY = "onboarding_banner_dismissed_v2";

interface DismissState {
  dismissed: boolean;
  /** true once we have observed subscriptionStatus === "active" since the banner was dismissed */
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
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(state));
  } catch {}
}

function clearDismissLocally(): void {
  try {
    localStorage.removeItem(DISMISSED_KEY);
  } catch {}
}

function isDismissedLocally(): boolean {
  return loadDismissState()?.dismissed === true;
}

export default function OnboardingBanner() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(isDismissedLocally);

  const { data: billing } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    staleTime: 5 * 60 * 1000,
    // Always fetch for admins so we can detect subscription regressions
    enabled: !!(user as any)?.isAdmin,
  });

  // Subscription lifecycle tracker:
  // - While dismissed and seenActive is false: watch for an "active" status and record it.
  // - Once seenActive is true: if status is no longer "active", the subscription has lapsed →
  //   clear the dismiss so the banner re-appears.
  useEffect(() => {
    if (!billing) return;
    const state = loadDismissState();
    if (!state?.dismissed) return;

    const { subscriptionStatus } = billing;

    if (!state.seenActive) {
      // Step 2: subscription became active after the dismiss — record that
      if (subscriptionStatus === "active") {
        saveDismissState({ dismissed: true, seenActive: true });
      }
    } else {
      // Step 3: subscription has lapsed after being active — clear dismiss
      if (subscriptionStatus !== "active") {
        clearDismissLocally();
        setDismissed(false);
      }
    }
  }, [billing?.subscriptionStatus]);

  // Only show to admin users (tenant owners)
  if (!(user as any)?.isAdmin) return null;
  if (dismissed) return null;
  if (!billing) return null;

  // Only show when there is no active paid subscription
  const { subscriptionStatus } = billing;
  if (subscriptionStatus === "active" || subscriptionStatus === "cancelled") return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    // seenActive starts false; it will be flipped to true if/when billing becomes active
    saveDismissState({ dismissed: true, seenActive: false });
    setDismissed(true);
  };

  // Navigate to /onboarding without a step param — the page detects the right step itself
  const handleClick = () => {
    setLocation("/onboarding");
  };

  return (
    <div
      className="w-full px-4 py-3 flex items-center gap-3 text-sm cursor-pointer bg-gradient-to-r from-brand-blue to-purple-700 text-white"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
    >
      <div className="flex-shrink-0">
        <Sparkles className="w-4 h-4 text-yellow-300" />
      </div>

      <div className="flex-1 min-w-0">
        <span className="font-semibold">Complete your setup</span>
        <span className="text-white/80">
          {" — "}Choose a plan and finish onboarding to unlock all features.{" "}
          <span className="underline font-medium inline-flex items-center gap-1">
            Continue <ArrowRight className="w-3 h-3 inline" />
          </span>
        </span>
      </div>

      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
