import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  AlertTriangle,
  Clock,
  Zap,
  Star,
  ExternalLink,
  Loader2,
  Mail,
} from "lucide-react";

interface BillingStatus {
  subscriptionStatus: string;
  subscriptionTier: string;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
  description: string;
  features: string[];
}

interface PlansResponse {
  plans: Plan[];
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    trial: { label: "Trial", className: "bg-blue-100 text-blue-800" },
    active: { label: "Active", className: "bg-green-100 text-green-800" },
    past_due: { label: "Past Due", className: "bg-yellow-100 text-yellow-800" },
    cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
  };
  const c = config[status] ?? { label: status, className: "bg-gray-100 text-gray-800" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}

export default function BillingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const currentUser = user as any;
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: billing, isLoading: billingLoading } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    refetchOnWindowFocus: true,
  });

  const { data: plansData, isLoading: plansLoading } = useQuery<PlansResponse>({
    queryKey: ["/api/billing/plans"],
  });

  const checkoutMutation = useMutation({
    mutationFn: async (tier: string) => {
      const response = await apiRequest("POST", "/api/billing/create-checkout-session", {
        tier,
        successUrl: `${window.location.origin}/settings/billing?success=1`,
        cancelUrl: `${window.location.origin}/settings/billing?cancelled=1`,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to start checkout");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Checkout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendTrialReminderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/billing/send-trial-warning", {});
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to send trial reminder");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Trial reminder sent",
        description: `Email sent to ${data.sentTo}${data.daysLeft !== undefined ? ` (${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"} remaining)` : ""}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send reminder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/billing/portal-session", {
        returnUrl: `${window.location.origin}/settings/billing`,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to open portal");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to open billing portal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Invalidate billing cache and show a success toast when Stripe redirects back after checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      // Strip the query param immediately so a refresh doesn't re-trigger this
      window.history.replaceState({}, "", "/settings/billing");
      // Force-refetch billing status so the TrialStatusCard and TrialBanner disappear right away
      queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
      toast({
        title: "Subscription activated!",
        description: "Your account is now active. Thank you for subscribing.",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOwner = currentUser?.isAdmin;
  const isActive = billing?.subscriptionStatus === "active";
  const isTrial = billing?.subscriptionStatus === "trial";
  const isPastDue = billing?.subscriptionStatus === "past_due";
  const isCancelled = billing?.subscriptionStatus === "cancelled";
  const hasSubscription = !!billing?.stripeSubscriptionId;

  if (billingLoading) {
    return (
      <div className="max-w-2xl mx-auto p-4 flex items-center justify-center min-h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => setLocation("/settings")}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="text-sm text-gray-500">Manage your PilotHouse subscription</p>
        </div>
      </div>

      {/* Current Plan Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Current Plan</CardTitle>
            {billing && <StatusBadge status={billing.subscriptionStatus} />}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            {billing?.subscriptionTier === "pro" ? (
              <Star className="w-5 h-5 text-purple-600" />
            ) : (
              <Zap className="w-5 h-5 text-blue-600" />
            )}
            <span className="font-semibold capitalize text-lg">
              {billing?.subscriptionTier ?? "Starter"} Plan
            </span>
          </div>

          {isTrial && billing?.trialDaysLeft !== null && (
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-lg p-3">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>
                {billing.trialDaysLeft === 0
                  ? "Your trial ends today"
                  : `${billing.trialDaysLeft} day${billing.trialDaysLeft === 1 ? "" : "s"} remaining in your trial`}
              </span>
            </div>
          )}

          {isTrial && !billing?.trialEndsAt && (
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-lg p-3">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>You are on a free trial. Subscribe to keep access after the trial ends.</span>
            </div>
          )}

          {isPastDue && (
            <div className="flex items-center gap-2 text-sm text-yellow-800 bg-yellow-50 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Your last payment failed. Please update your payment method to restore access.</span>
            </div>
          )}

          {isCancelled && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Your subscription has been cancelled. Reactivate to regain access.</span>
            </div>
          )}

          {isActive && billing?.currentPeriodEnd && (
            <div className="text-sm text-gray-600">
              {billing.cancelAtPeriodEnd ? (
                <span className="text-orange-600">
                  Cancels on {new Date(billing.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
              ) : (
                <span>
                  Renews on{" "}
                  {new Date(billing.currentPeriodEnd).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          )}

          {/* Send trial reminder — visible to admins when on trial */}
          {isOwner && isTrial && (
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => {
                if (
                  window.confirm(
                    "Send a trial reminder email to the account owner? Only one reminder can be sent per day."
                  )
                ) {
                  sendTrialReminderMutation.mutate();
                }
              }}
              disabled={sendTrialReminderMutation.isPending}
            >
              {sendTrialReminderMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Send Trial Reminder Email
            </Button>
          )}

          {/* Customer Portal button for existing subscribers */}
          {isOwner && hasSubscription && (
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
            >
              {portalMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4 mr-2" />
              )}
              Manage Subscription
            </Button>
          )}

          {!isOwner && (
            <p className="text-xs text-gray-500">
              Contact your account owner to manage billing.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Plans — shown when not yet subscribed (trial, cancelled) or to upgrade */}
      {isOwner && (isTrial || isCancelled || isPastDue || (isActive && !hasSubscription)) && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-900">
            {isCancelled || isPastDue ? "Reactivate Your Subscription" : "Choose a Plan"}
          </h2>

          {plansLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid gap-3">
              {plansData?.plans.map((plan) => {
                const isCurrent =
                  isActive && billing?.subscriptionTier === plan.id;
                const isSelected = selectedTier === plan.id;

                return (
                  <Card
                    key={plan.id}
                    className={`cursor-pointer transition-all ${
                      isSelected
                        ? "ring-2 ring-blue-500"
                        : "hover:shadow-md"
                    } ${isCurrent ? "opacity-60" : ""}`}
                    onClick={() => !isCurrent && setSelectedTier(plan.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {plan.id === "pro" ? (
                              <Star className="w-4 h-4 text-purple-600" />
                            ) : (
                              <Zap className="w-4 h-4 text-blue-600" />
                            )}
                            <span className="font-semibold text-gray-900">{plan.name}</span>
                            {isCurrent && (
                              <Badge variant="secondary" className="text-xs">Current</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <span className="text-2xl font-bold text-gray-900">${plan.price}</span>
                          <span className="text-sm text-gray-500">/mo</span>
                        </div>
                      </div>

                      <ul className="space-y-1.5">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      {isSelected && !isCurrent && (
                        <Button
                          className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            checkoutMutation.mutate(plan.id);
                          }}
                          disabled={checkoutMutation.isPending}
                        >
                          {checkoutMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <CreditCard className="w-4 h-4 mr-2" />
                          )}
                          Subscribe to {plan.name} — ${plan.price}/mo
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Upgrade option for active subscribers */}
      {isOwner && isActive && hasSubscription && billing?.subscriptionTier === "starter" && (
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-purple-800">
                <Star className="w-4 h-4" />
                Upgrade to Pro
              </div>
              <p className="text-xs text-purple-700 mt-0.5">
                Unlock advanced analytics, AI features, and priority support
              </p>
            </div>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0 ml-4"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
            >
              Upgrade
            </Button>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-gray-400 text-center pb-4">
        Payments are processed securely by Stripe. Cancel anytime from the billing portal.
      </p>
    </div>
  );
}
