// Trial countdown banner shown to tenants in trial status
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { X, Clock, AlertTriangle } from "lucide-react";

interface BillingStatus {
  subscriptionStatus: string;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
}

const DISMISSED_KEY = "trial_banner_dismissed_until";

function shouldShowBanner(): boolean {
  try {
    const until = localStorage.getItem(DISMISSED_KEY);
    if (!until) return true;
    return Date.now() > parseInt(until, 10);
  } catch {
    return true;
  }
}

function dismissBanner(): void {
  try {
    // Dismiss for 24 hours
    localStorage.setItem(DISMISSED_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
  } catch {}
}

export default function TrialBanner() {
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(!shouldShowBanner());

  const { data: billing, refetch } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    staleTime: 30 * 1000,
  });

  // Local clock that ticks every minute when on the final day, so the
  // "Ends in ~X hours" label updates without waiting for a query refetch.
  const [now, setNow] = useState(() => Date.now());
  const isLastDay = billing?.trialDaysLeft === 0;

  useEffect(() => {
    if (!isLastDay) return;

    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);

      // When the trial has expired, refetch billing so the banner disappears.
      if (billing?.trialEndsAt) {
        const msLeft = new Date(billing.trialEndsAt).getTime() - current;
        if (msLeft <= 0) {
          refetch();
        }
      }
    }, 60_000);

    return () => clearInterval(id);
  }, [isLastDay, billing?.trialEndsAt, refetch]);

  if (dismissed) return null;
  if (!billing) return null;

  const { subscriptionStatus, trialDaysLeft, trialEndsAt } = billing;

  // Only show for trial status (past_due/cancelled handled by paywall)
  if (subscriptionStatus !== "trial") return null;

  const isUrgent = trialDaysLeft !== null && trialDaysLeft <= 3;

  // Compute hours remaining when on the last day using the live `now` timestamp
  // so the label ticks down every minute rather than freezing at mount time.
  let hoursLeft: number | null = null;
  if (trialDaysLeft === 0 && trialEndsAt) {
    const msLeft = new Date(trialEndsAt).getTime() - now;
    hoursLeft = msLeft > 0 ? Math.ceil(msLeft / (1000 * 60 * 60)) : 0;
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    dismissBanner();
    setDismissed(true);
  };

  const handleSubscribe = () => {
    setLocation("/settings/billing");
  };

  return (
    <div
      className={`w-full px-4 py-2.5 flex items-center gap-3 text-sm cursor-pointer ${
        isUrgent
          ? "bg-orange-500 text-white"
          : "bg-blue-600 text-white"
      }`}
      onClick={handleSubscribe}
    >
      <div className="flex-shrink-0">
        {isUrgent ? (
          <AlertTriangle className="w-4 h-4" />
        ) : (
          <Clock className="w-4 h-4" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {trialDaysLeft === null ? (
          <span>You're on a free trial. Subscribe to keep access.</span>
        ) : trialDaysLeft === 0 ? (
          <span className="font-medium">
            {hoursLeft !== null && hoursLeft > 0
              ? `Your trial ends in ~${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}!`
              : "Your trial ends today!"}{" "}
            Subscribe now to keep access.
          </span>
        ) : (
          <span>
            <span className="font-medium">{trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"}</span>
            {" "}left in your trial.{" "}
            <span className="underline">Subscribe now</span> to keep access.
          </span>
        )}
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
