// Banner shown to tenant owners who haven't completed onboarding (no active subscription)
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { X, Sparkles, ArrowRight } from "lucide-react";

interface BillingStatus {
  subscriptionStatus: string;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
}

const DISMISSED_KEY = "onboarding_banner_permanently_dismissed";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function persistDismiss(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "true");
  } catch {}
}

export default function OnboardingBanner() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(isDismissed);

  const { data: billing } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    staleTime: 5 * 60 * 1000,
    // Only fetch if user is an admin (tenant owner) and not already dismissed
    enabled: !dismissed && !!(user as any)?.isAdmin,
  });

  // Only show to admin users (tenant owners)
  if (!(user as any)?.isAdmin) return null;
  if (dismissed) return null;
  if (!billing) return null;

  // Only show when there is no active paid subscription
  const { subscriptionStatus } = billing;
  if (subscriptionStatus === "active" || subscriptionStatus === "cancelled") return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    persistDismiss();
    setDismissed(true);
  };

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
