// Persistent trial status card shown on the main dashboard to tenant owners.
// Unlike the global TrialBanner (which is dismissible), this card always appears
// while the tenant is on a trial, giving owners a clear countdown they can't miss.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Clock, AlertTriangle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BillingStatus {
  subscriptionStatus: string;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
}

export default function TrialStatusCard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: billing, refetch } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    staleTime: 30 * 1000,
    enabled: !!(user as any)?.isAdmin,
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

      // When the trial has expired, refetch billing so the card disappears.
      if (billing?.trialEndsAt) {
        const msLeft = new Date(billing.trialEndsAt).getTime() - current;
        if (msLeft <= 0) {
          refetch();
        }
      }
    }, 60_000);

    return () => clearInterval(id);
  }, [isLastDay, billing?.trialEndsAt, refetch]);

  // Only show to admin users (tenant owners)
  if (!(user as any)?.isAdmin) return null;
  if (!billing) return null;

  const { subscriptionStatus, trialDaysLeft, trialEndsAt } = billing;

  // Only show during trial — active subscriptions and paywalled states are handled elsewhere
  if (subscriptionStatus !== "trial") return null;

  const isUrgent = trialDaysLeft !== null && trialDaysLeft <= 3;
  const isExpiring = trialDaysLeft !== null && trialDaysLeft <= 7;

  // Compute hours remaining when on the last day using the live `now` timestamp
  // so the label ticks down every minute rather than freezing at mount time.
  let hoursLeft: number | null = null;
  if (trialDaysLeft === 0 && trialEndsAt) {
    const msLeft = new Date(trialEndsAt).getTime() - now;
    hoursLeft = msLeft > 0 ? Math.ceil(msLeft / (1000 * 60 * 60)) : 0;
  }

  let daysLabel: string;
  if (trialDaysLeft === null) {
    daysLabel = "Trial active";
  } else if (trialDaysLeft === 0) {
    daysLabel = hoursLeft !== null && hoursLeft > 0 ? `Ends in ~${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}` : "Ends today";
  } else if (trialDaysLeft === 1) {
    daysLabel = "1 day left";
  } else {
    daysLabel = `${trialDaysLeft} days left`;
  }

  return (
    <div
      className={`mx-4 mt-3 rounded-xl px-4 py-3 flex items-center gap-3 ${
        isUrgent
          ? "bg-orange-50 border border-orange-200"
          : isExpiring
          ? "bg-amber-50 border border-amber-200"
          : "bg-blue-50 border border-blue-200"
      }`}
    >
      {/* Icon */}
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
          isUrgent
            ? "bg-orange-100"
            : isExpiring
            ? "bg-amber-100"
            : "bg-blue-100"
        }`}
      >
        {isUrgent ? (
          <AlertTriangle
            className={`w-5 h-5 ${isUrgent ? "text-orange-600" : "text-amber-600"}`}
          />
        ) : (
          <Clock className="w-5 h-5 text-blue-600" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-semibold ${
            isUrgent
              ? "text-orange-800"
              : isExpiring
              ? "text-amber-800"
              : "text-blue-800"
          }`}
        >
          {isUrgent ? "⚠\uFE0F Trial expiring soon" : "Free trial"}
        </p>
        <p
          className={`text-xs mt-0.5 ${
            isUrgent
              ? "text-orange-600"
              : isExpiring
              ? "text-amber-600"
              : "text-blue-600"
          }`}
        >
          {trialDaysLeft === 0
            ? hoursLeft !== null && hoursLeft > 0
              ? `Your trial ends in ~${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}. Subscribe now to keep access.`
              : "Your trial ends today. Subscribe now to keep access."
            : `${daysLabel} in your trial.`}
        </p>
      </div>

      {/* CTA */}
      <Button
        size="sm"
        onClick={() => setLocation("/settings/billing")}
        className={`flex-shrink-0 text-xs gap-1 ${
          isUrgent
            ? "bg-orange-600 hover:bg-orange-700 text-white"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        <Zap className="w-3 h-3" />
        Subscribe
      </Button>
    </div>
  );
}
