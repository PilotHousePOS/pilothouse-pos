import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, ArrowRight, Building2, CreditCard, Users, Sparkles, Star, Package, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

/** BroadcastChannel name used to sync onboarding state across tabs. */
const ONBOARDING_CHANNEL = "onboarding_sync";

/** Broadcast that billing/tenant data changed so other tabs re-fetch. */
function broadcastBillingUpdate() {
  try {
    const ch = new BroadcastChannel(ONBOARDING_CHANNEL);
    ch.postMessage({ type: "billing_updated" });
    ch.close();
  } catch {
    // BroadcastChannel not supported — fall back to storage event
    try {
      localStorage.setItem("onboarding_billing_updated_at", String(Date.now()));
    } catch {}
  }
}

const STEPS = ['Business Details', 'Choose a Plan', 'Invite Staff'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-bold transition-all ${
            i < current
              ? 'bg-green-500 border-green-500 text-white'
              : i === current
              ? 'bg-brand-blue border-brand-blue text-white'
              : 'bg-transparent border-white/30 text-white/40'
          }`}>
            {i < current ? <CheckCircle className="w-4 h-4" /> : i + 1}
          </div>
          <span className={`text-xs font-semibold hidden sm:block ${i === current ? 'text-white' : 'text-white/40'}`}>
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-0.5 mx-1 ${i < current ? 'bg-green-500' : 'bg-white/20'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// --- LocalStorage helpers for tracking completed onboarding steps ---

/** Mark that the owner has explicitly completed Step 1 (Business Details) for this tenant. */
function markStep1Done(tenantId: number) {
  try {
    localStorage.setItem(`onboarding_step1_done_${tenantId}`, 'true');
  } catch {}
}

/**
 * Returns true if localStorage says Step 1 was completed.
 * This is a fast-path cache only — server state always takes precedence.
 */
function isStep1Done(tenantId: number): boolean {
  try {
    return localStorage.getItem(`onboarding_step1_done_${tenantId}`) === 'true';
  } catch {
    return false;
  }
}

/**
 * Returns true when the tenant's server-side name/slug look like real business
 * details (i.e. something other than the generic fallback values produced at
 * account-creation time).  Used as a secondary server-side heuristic: if the
 * owner provided meaningful details at signup but never explicitly clicked
 * "Save & Continue" on the onboarding form, we still treat Step 1 as done so
 * they don't have to re-confirm details they already supplied.
 *
 * "Default" values that do NOT indicate completion:
 *   – empty/whitespace name
 *   – slug === 'business' (the code-level fallback when no name is available)
 */
function hasNonDefaultBusinessDetails(name: string, slug: string): boolean {
  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();
  if (!trimmedName) return false;
  if (!trimmedSlug || trimmedSlug === 'business') return false;
  return true;
}

// Step 1: Business Details
function Step1({ tenantId, onNext }: { tenantId: number; onNext: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Fetch current tenant data
  const { data: tenantData } = useQuery<{ name: string; slug: string; id: number }>({
    queryKey: ['/api/tenants/current'],
  });

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  // Populate from tenant data once loaded
  const displayName = name || tenantData?.name || '';
  const displaySlug = slug || tenantData?.slug || '';

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug) {
      // Auto-generate slug from name
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast({ title: "Business name is required", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await apiRequest('PATCH', '/api/tenants/current', { name: displayName.trim(), slug: displaySlug.trim(), onboardingStep: 1 });
      // Also write the localStorage flag as a best-effort fallback for same-browser sessions
      markStep1Done(tenantId);
      onNext();
    } catch (err) {
      // apiRequest throws `${status}: ${message}` — extract just the message part
      const raw = err instanceof Error ? err.message : "Failed to update business details";
      const msg = raw.replace(/^\d+:\s*/, '') || "Failed to update business details";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-gradient-to-br from-brand-blue to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
          <Building2 className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-black text-white">Confirm your business details</h2>
        <p className="text-gray-400 mt-1 text-sm">You can change these at any time from Settings.</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-white font-semibold">Business Name</Label>
        <Input
          value={displayName}
          onChange={e => handleNameChange(e.target.value)}
          placeholder="e.g. Main Street Coffee Shop"
          className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-white font-semibold">Business Slug</Label>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-sm whitespace-nowrap">pilothouse.app/</span>
          <Input
            value={displaySlug}
            onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="animal-house"
            className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
          />
        </div>
        <p className="text-xs text-gray-500">Used in your shareable links. Letters, numbers, and hyphens only.</p>
      </div>

      <Button
        onClick={handleSave}
        disabled={isLoading}
        className="w-full bg-gradient-to-r from-brand-blue to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-3 rounded-xl"
      >
        {isLoading ? "Saving..." : (
          <>Save & Continue <ArrowRight className="w-4 h-4 ml-2" /></>
        )}
      </Button>
    </div>
  );
}

// Step 2: Choose Plan
function Step2({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { data: tenantData } = useQuery<{
    id: number;
    name: string;
    slug: string;
    subscriptionStatus: string | null;
    subscriptionTier: string | null;
    trialEndsAt: string | null;
  }>({ queryKey: ['/api/tenants/current'] });

  const trialDaysLeft = (() => {
    if (!tenantData?.trialEndsAt) return null;
    const diff = new Date(tenantData.trialEndsAt).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  })();

  const plans = [
    {
      id: 'starter' as const,
      name: 'Starter',
      price: '$49/mo',
      icon: Package,
      color: 'from-brand-blue to-blue-700',
      features: ['POS & Inventory', 'Loyalty Program', 'Online Store', 'Appointments', 'Basic Reports'],
    },
    {
      id: 'pro' as const,
      name: 'Pro',
      price: '$99/mo',
      icon: Star,
      color: 'from-brand-red to-red-700',
      badge: 'Most Popular',
      features: ['Everything in Starter', 'Advanced Analytics', 'AI Invoice Scanning', 'Priority Support', 'Multi-user Management'],
    },
  ];

  const handleChoosePlan = async () => {
    if (!selectedPlan) {
      toast({ title: "Please select a plan to continue.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiRequest('POST', '/api/billing/create-checkout-session', {
        tier: selectedPlan,
        successUrl: `${window.location.origin}/onboarding?step=3&plan_success=1`,
        cancelUrl: `${window.location.origin}/onboarding?step=2`,
      });
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to start checkout";
      const msg = raw.replace(/^\d+:\s*/, '') || "Failed to start checkout";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-gradient-to-br from-brand-orange to-brand-red rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
          <CreditCard className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-black text-white">Choose your plan</h2>
        <p className="text-gray-400 mt-1 text-sm">Your trial continues free for 14 days. Cancel anytime.</p>
      </div>

      {trialDaysLeft !== null && (
        trialDaysLeft > 0 ? (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-300 font-medium">
            <Sparkles className="w-4 h-4 text-green-400 flex-shrink-0" />
            {trialDaysLeft === 1
              ? '1 day left in your free trial'
              : `${trialDaysLeft} days left in your free trial`}
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300 font-medium">
            <CreditCard className="w-4 h-4 text-red-400 flex-shrink-0" />
            Your trial has ended — choose a plan to continue
          </div>
        )
      )}

      <div className="grid grid-cols-1 gap-4">
        {plans.map(plan => {
          const Icon = plan.icon;
          const isSelected = selectedPlan === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlan(plan.id)}
              className={`text-left rounded-2xl border-2 p-4 transition-all duration-200 ${
                isSelected
                  ? 'border-brand-blue bg-brand-blue/20'
                  : 'border-white/20 bg-white/5 hover:border-white/40'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 bg-gradient-to-br ${plan.color} rounded-xl flex items-center justify-center shadow-md flex-shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-white">{plan.name}</span>
                    {plan.badge && (
                      <span className="bg-brand-red text-white text-xs font-bold px-2 py-0.5 rounded-full">{plan.badge}</span>
                    )}
                    <span className="ml-auto text-white font-bold">{plan.price}</span>
                  </div>
                  <ul className="space-y-1 mt-2">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-gray-300">
                        <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Button
        onClick={handleChoosePlan}
        disabled={isLoading || !selectedPlan}
        className="w-full bg-gradient-to-r from-brand-red to-brand-blue hover:from-red-600 hover:to-blue-600 text-white font-bold py-3 rounded-xl"
      >
        {isLoading ? "Redirecting to checkout..." : (
          <>Start with {selectedPlan ? plans.find(p => p.id === selectedPlan)?.name : 'selected plan'} <ArrowRight className="w-4 h-4 ml-2" /></>
        )}
      </Button>

      <button
        type="button"
        onClick={onNext}
        className="w-full text-center text-sm text-gray-400 hover:text-white transition-colors py-2"
      >
        Skip for now — I'll choose a plan later
      </button>
    </div>
  );
}

// Step 3: Invite Staff
function Step3({ onFinish }: { onFinish: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
          <Users className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-black text-white">Invite a staff member</h2>
        <p className="text-gray-400 mt-1 text-sm">Optional — you can add staff anytime from Settings.</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-white font-semibold">Staff Member Name</Label>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Alex Johnson"
          className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-white font-semibold">Staff Member Email</Label>
        <Input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="alex@yourbusiness.com"
          className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
        />
      </div>

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-sm text-blue-200">
        <strong>Coming soon:</strong> Invitation emails will be delivered automatically. For now, share your business URL and have them sign up directly.
      </div>

      <Button
        onClick={onFinish}
        className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 rounded-xl"
      >
        <CheckCircle className="w-4 h-4 mr-2" />
        Finish Setup & Go to Dashboard
      </Button>

      <button
        type="button"
        onClick={onFinish}
        className="w-full text-center text-sm text-gray-400 hover:text-white transition-colors py-2"
      >
        Skip for now
      </button>
    </div>
  );
}

const ONBOARDING_VISITED_KEY = "onboarding_visited";

function markOnboardingVisited() {
  try { localStorage.setItem(ONBOARDING_VISITED_KEY, "true"); } catch {}
}

function hasVisitedOnboardingBefore(): boolean {
  try { return localStorage.getItem(ONBOARDING_VISITED_KEY) === "true"; } catch { return false; }
}

interface TenantData {
  id: number;
  name: string;
  slug: string;
  subscriptionStatus: string | null;
  onboardingStep: number;
}

interface BillingStatus {
  subscriptionStatus: string;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
}

/**
 * Detect the first incomplete onboarding step from server state.
 *
 * Step 0 — Business Details: skipped when any of the following hold:
 *   1. server-side onboardingStep >= 1 (explicit completion flag)
 *   2. tenant name/slug are non-default, indicating details were saved at signup
 *   3. localStorage fast-path cache says step 1 is done (same-browser optimisation)
 * Step 1 — Choose a Plan:    skipped when billing shows an active subscription.
 * Step 2 — Invite Staff:     always shown last; never auto-skipped.
 *
 * Server-side signals (1 & 2) are authoritative and survive storage clears,
 * browser switches, and incognito sessions.  localStorage (3) is a cache only.
 */
function detectStartStep(
  tenantId: number,
  billingStatus: string | undefined,
  serverOnboardingStep: number,
  tenantName: string,
  tenantSlug: string,
): number {
  const subscriptionActive =
    billingStatus === 'active' || billingStatus === 'cancelled';
  if (subscriptionActive) return 2;

  // Server is the source of truth — check both explicit flag and name/slug heuristic
  if (
    serverOnboardingStep >= 1 ||
    hasNonDefaultBusinessDetails(tenantName, tenantSlug) ||
    isStep1Done(tenantId)   // localStorage fast-path cache (same-browser only)
  ) return 1;

  return 0;
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ?step=3 is the Stripe checkout success redirect — map to internal step 2 (Invite Staff).
  // No other URL step values are trusted as an override; page-level detection takes precedence.
  const urlParams = new URLSearchParams(window.location.search);
  const rawUrlStep = parseInt(urlParams.get('step') || '-1', 10);
  const stripeReturn = rawUrlStep === 3;

  // Detect "returning" user — someone who's been here before but didn't finish
  const isResuming = hasVisitedOnboardingBefore();

  // Mark as visited so next time we show "Resume" state
  markOnboardingVisited();

  // Always fetch tenant + billing to get the tenant ID and subscription state.
  // For Stripe returns we still fetch (to get the tenant ID for localStorage), but we
  // skip the step calculation and go straight to step 2.
  const { data: tenantData, isLoading: tenantLoading } = useQuery<TenantData>({
    queryKey: ['/api/tenants/current'],
    enabled: !!user,
    staleTime: 0,
  });

  const { data: billingData, isLoading: billingLoading } = useQuery<BillingStatus>({
    queryKey: ['/api/billing/status'],
    enabled: !!user,
    staleTime: 0,
  });

  // Compute the starting step once data has loaded.
  const detectedStep = (() => {
    if (tenantLoading || billingLoading || !tenantData) return null;
    if (stripeReturn) return 2;
    return detectStartStep(
      tenantData.id,
      billingData?.subscriptionStatus,
      tenantData.onboardingStep ?? 0,
      tenantData.name,
      tenantData.slug,
    );
  })();

  const [step, setStep] = useState<number | null>(null);

  // Set the step exactly once when detection completes.
  useEffect(() => {
    if (step === null && detectedStep !== null) {
      setStep(detectedStep);
    }
  }, [detectedStep, step]);

  // ── Cross-tab reconciliation ─────────────────────────────────────────────
  // After queries are invalidated (e.g. via BroadcastChannel from the Stripe
  // return tab), re-derive the target step from fresh billing data and advance
  // step forward if the server state has progressed.  Never regress step — we
  // only move forward (monotonically) so in-progress user edits are preserved.
  const subscriptionStatus = billingData?.subscriptionStatus;
  useEffect(() => {
    if (step === null || !tenantData) return;

    // Subscription became active/cancelled — skip the plan step if we're still on it
    const subscriptionActive =
      subscriptionStatus === "active" || subscriptionStatus === "cancelled";
    if (subscriptionActive && step < 2) {
      setStep(2);
    }
  }, [subscriptionStatus, step, tenantData]);

  // ── Cross-tab sync ──────────────────────────────────────────────────────────
  // When the Stripe checkout tab returns here with ?step=3, broadcast so that
  // the original tab (still showing the plan step) can refresh immediately.
  const broadcastedRef = useRef(false);
  useEffect(() => {
    if (stripeReturn && !broadcastedRef.current) {
      broadcastedRef.current = true;
      broadcastBillingUpdate();
    }
  }, [stripeReturn]);

  // Listen for billing-updated broadcasts from other tabs (e.g. the Stripe
  // return tab) and invalidate the local React Query cache so this tab
  // re-fetches without waiting for focus.
  useEffect(() => {
    if (!user) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenants/current'] });
    };

    // Primary: BroadcastChannel (Chrome / Firefox / Safari 15.4+)
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(ONBOARDING_CHANNEL);
      channel.addEventListener("message", (e) => {
        if (e.data?.type === "billing_updated") invalidate();
      });
    } catch {
      channel = null;
    }

    // Fallback: storage event (works even when BroadcastChannel is unavailable)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "onboarding_billing_updated_at") invalidate();
    };
    window.addEventListener("storage", onStorage);

    // Secondary fallback: re-fetch when this tab regains visibility
    const onVisibility = () => {
      if (document.visibilityState === "visible") invalidate();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      channel?.close();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, queryClient]);

  if (!user) {
    setLocation('/signup');
    return null;
  }

  // Spinner while we determine which step to start on
  if (step === null) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  const handleFinish = () => {
    // Clear the visited flag so the banner and resume state reset
    try { localStorage.removeItem(ONBOARDING_VISITED_KEY); } catch {}
    window.location.replace('/');
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white flex items-start md:items-center justify-center p-6 py-10">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-brand-red/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-brand-blue/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-9 h-9 bg-gradient-to-br from-brand-blue to-brand-red rounded-xl flex items-center justify-center border border-white/20">
              <span className="text-sm font-black text-white">PH</span>
            </div>
            <span className="font-black text-white text-lg">PILOTHOUSE</span>
          </div>
          {isResuming ? (
            <div className="inline-flex items-center gap-2 bg-yellow-500/20 border border-yellow-400/40 rounded-full px-4 py-1 text-xs font-semibold text-yellow-300 mb-2">
              <Sparkles className="w-3 h-3 text-yellow-400" />
              Resume your setup — you're almost there!
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1 text-xs font-semibold text-white/70 mb-2">
              <Sparkles className="w-3 h-3 text-brand-orange" />
              Let's get you set up
            </div>
          )}
        </div>

        <StepIndicator current={step} />

        <Card className="bg-white/10 backdrop-blur-md border border-white/20">
          <CardContent className="pt-6 pb-6">
            {step === 0 && tenantData && (
              <Step1 tenantId={tenantData.id} onNext={() => setStep(1)} />
            )}
            {step === 1 && (
              <Step2
                onNext={() => setStep(2)}
                onSkip={() => setStep(2)}
              />
            )}
            {step === 2 && (
              <Step3 onFinish={handleFinish} />
            )}
          </CardContent>
        </Card>

        {/* Skip all */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={handleFinish}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
          >
            Skip setup — take me to the dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
