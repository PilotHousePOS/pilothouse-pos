import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle, ArrowRight, Building2, CreditCard, Users, Sparkles, Star,
  Package, Loader2, Calendar, Gift, Home, Briefcase, Mail,
} from "lucide-react";
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
    try {
      localStorage.setItem("onboarding_billing_updated_at", String(Date.now()));
    } catch {}
  }
}

const STEPS = ['Business Details', 'Choose a Plan', 'Your Features', 'Invite Staff'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full border-2 text-xs font-bold transition-all ${
            i < current
              ? 'bg-green-500 border-green-500 text-white'
              : i === current
              ? 'bg-brand-blue border-brand-blue text-white'
              : 'bg-transparent border-white/30 text-white/40'
          }`}>
            {i < current ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
          </div>
          <span className={`text-xs font-semibold hidden sm:block ${i === current ? 'text-white' : 'text-white/40'}`}>
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <div className={`w-6 h-0.5 mx-1 ${i < current ? 'bg-green-500' : 'bg-white/20'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// --- LocalStorage helpers ---

function markStep1Done(tenantId: number) {
  try { localStorage.setItem(`onboarding_step1_done_${tenantId}`, 'true'); } catch {}
}

function isStep1Done(tenantId: number): boolean {
  try { return localStorage.getItem(`onboarding_step1_done_${tenantId}`) === 'true'; } catch { return false; }
}

const DEFAULT_SLUGS = ['', 'business', 'my-business-skip', 'animal-house'];

function hasNonDefaultBusinessDetails(name: string, slug: string): boolean {
  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();
  if (!trimmedName || ['My Business', 'Animal House'].includes(trimmedName)) return false;
  if (DEFAULT_SLUGS.includes(trimmedSlug)) return false;
  return true;
}

// ─── Step 1: Business Details ────────────────────────────────────────────────
function Step1({ tenantId, onNext }: { tenantId: number; onNext: () => void }) {
  const { toast } = useToast();
  const { data: tenantData } = useQuery<{ id: number; name: string; slug: string }>({
    queryKey: ['/api/tenants/current'],
  });
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (tenantData) {
      const defaultNames = ['', 'My Business', 'Animal House'];
      const defaultSlugs = ['', 'business', 'animal-house', 'my-business-skip'];
      if (!defaultNames.includes(tenantData.name)) setName(tenantData.name);
      if (!defaultSlugs.includes(tenantData.slug)) setSlug(tenantData.slug);
    }
  }, [tenantData]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Please enter your business name.", variant: "destructive" });
      return;
    }
    const autoSlug = slug.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setIsLoading(true);
    try {
      await apiRequest('PATCH', '/api/tenants/current', { name: name.trim(), slug: autoSlug, onboardingStep: 1 });
      markStep1Done(tenantId);
      onNext();
    } catch (err: any) {
      const raw = err instanceof Error ? err.message : String(err);
      const msg = raw.replace(/^\d+:\s*/, '') || "Failed to save business details";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-gradient-to-br from-brand-blue to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
          <Building2 className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-black text-white">Your business details</h2>
        <p className="text-gray-400 mt-1 text-sm">This is how customers will find you.</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-white font-semibold">Business Name</Label>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Main Street Coffee Shop"
          className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-white font-semibold">Your URL Slug <span className="text-gray-400 font-normal">(optional)</span></Label>
        <div className="flex items-center gap-2 bg-white/10 border border-white/30 rounded-md px-3">
          <span className="text-gray-400 text-sm whitespace-nowrap">pilothouse.app/</span>
          <input
            value={slug}
            onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="my-shop"
            className="bg-transparent flex-1 py-2 text-white placeholder:text-gray-500 outline-none text-sm"
          />
        </div>
        <p className="text-xs text-gray-500">Leave blank to auto-generate from your business name.</p>
      </div>

      <Button
        onClick={handleSave}
        disabled={isLoading}
        className="w-full bg-gradient-to-r from-brand-blue to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-bold py-3 rounded-xl"
      >
        {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <>Save & Continue <ArrowRight className="w-4 h-4 ml-2" /></>}
      </Button>

      <button type="button" onClick={onNext} className="w-full text-center text-sm text-gray-400 hover:text-white transition-colors py-2">
        Skip for now
      </button>
    </div>
  );
}

// ─── Step 2: Choose Plan ─────────────────────────────────────────────────────
function Step2({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { data: tenantData } = useQuery<{
    id: number; name: string; slug: string;
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
      if (url) window.location.href = url;
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to start checkout";
      toast({ title: raw.replace(/^\d+:\s*/, '') || "Failed to start checkout", variant: "destructive" });
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
            {trialDaysLeft === 1 ? '1 day left in your free trial' : `${trialDaysLeft} days left in your free trial`}
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
                isSelected ? 'border-brand-blue bg-brand-blue/20' : 'border-white/20 bg-white/5 hover:border-white/40'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 bg-gradient-to-br ${plan.color} rounded-xl flex items-center justify-center shadow-md flex-shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-white">{plan.name}</span>
                    {(plan as any).badge && (
                      <span className="bg-brand-red text-white text-xs font-bold px-2 py-0.5 rounded-full">{(plan as any).badge}</span>
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
        {isLoading ? "Redirecting to checkout…" : <>Start with {selectedPlan ? plans.find(p => p.id === selectedPlan)?.name : 'selected plan'} <ArrowRight className="w-4 h-4 ml-2" /></>}
      </Button>

      <button type="button" onClick={onSkip} className="w-full text-center text-sm text-gray-400 hover:text-white transition-colors py-2">
        Skip for now — I'll choose a plan later
      </button>
    </div>
  );
}

// ─── Step 3: Choose Your Features ───────────────────────────────────────────
interface Feature {
  id: string;
  name: string;
  description: string;
  Icon: React.ElementType;
  color: string;
  defaultOn: boolean;
}

const ALL_FEATURES: Feature[] = [
  {
    id: 'appointments',
    name: 'Service Booking & Appointments',
    description: 'Let customers book appointments online. Manage staff schedules and service slots.',
    Icon: Calendar,
    color: 'text-blue-400',
    defaultOn: true,
  },
  {
    id: 'loyalty',
    name: 'Loyalty & Rewards Program',
    description: 'Built-in points system, purchase tracking, and customer rewards.',
    Icon: Gift,
    color: 'text-purple-400',
    defaultOn: true,
  },
  {
    id: 'boarding',
    name: 'Boarding & Check-In Management',
    description: 'Track overnight boarders, check-in/check-out, and occupancy records.',
    Icon: Home,
    color: 'text-orange-400',
    defaultOn: false,
  },
  {
    id: 'hiring',
    name: 'Job Application Portal',
    description: 'Accept and manage staff applications directly through your store page.',
    Icon: Briefcase,
    color: 'text-green-400',
    defaultOn: false,
  },
  {
    id: 'emailMarketing',
    name: 'Email Marketing',
    description: 'Send campaigns, automated reminders, and promotional emails to customers.',
    Icon: Mail,
    color: 'text-cyan-400',
    defaultOn: true,
  },
];

function Step3Features({ onNext }: { onNext: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_FEATURES.map(f => [f.id, f.defaultOn]))
  );
  const [isSaving, setIsSaving] = useState(false);

  const toggle = (id: string) => setEnabled(prev => ({ ...prev, [id]: !prev[id] }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiRequest('PATCH', '/api/tenants/features', { ...enabled, onboardingStep: 2 });
      queryClient.invalidateQueries({ queryKey: ['/api/tenants/current'] });
      onNext();
    } catch (err: any) {
      toast({ title: "Failed to save — continuing anyway.", variant: "destructive" });
      onNext(); // don't block the user
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-5">
        <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-black text-white">Choose your features</h2>
        <p className="text-gray-400 mt-1 text-sm">Toggle on the tools your business needs. You can change these anytime in Settings.</p>
      </div>

      <div className="space-y-2.5">
        {ALL_FEATURES.map(feat => {
          const { Icon } = feat;
          const isOn = enabled[feat.id];
          return (
            <button
              key={feat.id}
              type="button"
              onClick={() => toggle(feat.id)}
              className={`w-full text-left rounded-xl border-2 p-3.5 transition-all duration-200 flex items-start gap-3 ${
                isOn
                  ? 'border-white/40 bg-white/10'
                  : 'border-white/10 bg-white/5 hover:bg-white/8'
              }`}
            >
              <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isOn ? feat.color : 'text-white/40'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold ${isOn ? 'text-white' : 'text-white/70'}`}>{feat.name}</span>
                  <div className={`w-10 h-5 rounded-full flex-shrink-0 relative transition-colors duration-200 ${isOn ? 'bg-green-500' : 'bg-white/20'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${isOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
                <p className={`text-xs mt-0.5 ${isOn ? 'text-gray-300' : 'text-white/50'}`}>{feat.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 text-xs text-blue-200">
        <strong>Pro tip:</strong> Start with what you need now — you can enable or disable features anytime from your admin settings.
      </div>

      <Button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-bold py-3 rounded-xl"
      >
        {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <>Save Features & Continue <ArrowRight className="w-4 h-4 ml-2" /></>}
      </Button>

      <button type="button" onClick={onNext} className="w-full text-center text-sm text-gray-400 hover:text-white transition-colors py-2">
        Skip — use default settings
      </button>
    </div>
  );
}

// ─── Step 4: Invite Staff ────────────────────────────────────────────────────
function Step4({ onFinish }: { onFinish: () => void }) {
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

      <button type="button" onClick={onFinish} className="w-full text-center text-sm text-gray-400 hover:text-white transition-colors py-2">
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
  enabledFeatures?: Record<string, boolean>;
}

interface BillingStatus {
  subscriptionStatus: string;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
}

/**
 * Detect the first incomplete onboarding step.
 *
 * Step 0 — Business Details: skip when onboardingStep >= 1 or details look non-default.
 * Step 1 — Choose a Plan:    skip when billing is active/cancelled.
 * Step 2 — Choose Features:  skip when onboardingStep >= 2 (features already saved).
 * Step 3 — Invite Staff:     always last, never auto-skipped.
 */
function detectStartStep(
  tenantId: number,
  billingStatus: string | undefined,
  serverOnboardingStep: number,
  tenantName: string,
  tenantSlug: string,
): number {
  const subscriptionActive = billingStatus === 'active' || billingStatus === 'cancelled';

  // If business details are done, skip step 0
  const step0Done =
    serverOnboardingStep >= 1 ||
    hasNonDefaultBusinessDetails(tenantName, tenantSlug) ||
    isStep1Done(tenantId);

  if (!step0Done) return 0;

  // Business details done — check plan
  if (!subscriptionActive) return 1;

  // Plan done — check if features were chosen
  if (serverOnboardingStep >= 2) return 3; // features already chosen → invite staff
  return 2; // need to choose features
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ?step=3 is the Stripe checkout success redirect → go to step 2 (Choose Features)
  const urlParams = new URLSearchParams(window.location.search);
  const rawUrlStep = parseInt(urlParams.get('step') || '-1', 10);
  const stripeReturn = rawUrlStep === 3;

  const isResuming = hasVisitedOnboardingBefore();
  markOnboardingVisited();

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

  const detectedStep = (() => {
    if (tenantLoading || billingLoading || !tenantData) return null;
    if (stripeReturn) return 2; // After Stripe checkout → Choose Features
    return detectStartStep(
      tenantData.id,
      billingData?.subscriptionStatus,
      tenantData.onboardingStep ?? 0,
      tenantData.name,
      tenantData.slug,
    );
  })();

  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (step === null && detectedStep !== null) setStep(detectedStep);
  }, [detectedStep, step]);

  // Cross-tab sync: when subscription becomes active while on plan step, advance to features
  const subscriptionStatus = billingData?.subscriptionStatus;
  useEffect(() => {
    if (step === null || !tenantData) return;
    const subscriptionActive = subscriptionStatus === "active" || subscriptionStatus === "cancelled";
    if (subscriptionActive && step === 1) setStep(2);
  }, [subscriptionStatus, step, tenantData]);

  // Broadcast on Stripe return so other tabs refresh
  const broadcastedRef = useRef(false);
  useEffect(() => {
    if (stripeReturn && !broadcastedRef.current) {
      broadcastedRef.current = true;
      broadcastBillingUpdate();
    }
  }, [stripeReturn]);

  // Listen for billing-updated broadcasts
  useEffect(() => {
    if (!user) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenants/current'] });
    };

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(ONBOARDING_CHANNEL);
      channel.addEventListener("message", (e) => {
        if (e.data?.type === "billing_updated") invalidate();
      });
    } catch { channel = null; }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "onboarding_billing_updated_at") invalidate();
    };
    window.addEventListener("storage", onStorage);

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

  if (step === null) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  const handleFinish = () => {
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
              <Step3Features onNext={() => setStep(3)} />
            )}
            {step === 3 && (
              <Step4 onFinish={handleFinish} />
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
