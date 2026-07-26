import { useState, useEffect } from "react";
import { getActiveTenantSlug, setActiveTenantSlug, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Heart, AlertCircle, LogIn, ChevronLeft, Delete } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface RosterEmployee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  employeeCode: string | null;
}

export default function Auth() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const { toast } = useToast();

  // Employee sign-in tab state
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') === 'employee' ? 'employee' : 'signin';
  });
  const [empSelected, setEmpSelected] = useState<RosterEmployee | null>(null);
  const [empPin, setEmpPin] = useState("");
  const [empError, setEmpError] = useState("");
  const [empLoading, setEmpLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState("");

  // Store code — needed on a fresh device where no slug is saved in localStorage yet.
  // Once entered it's persisted so subsequent visits don't need it again.
  const [knownSlug, setKnownSlug] = useState<string | null>(() => getActiveTenantSlug());
  const [storeCodeInput, setStoreCodeInput] = useState("");
  const [storeCodeError, setStoreCodeError] = useState("");
  const [storeCodeLoading, setStoreCodeLoading] = useState(false);

  const handleStoreCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = storeCodeInput.trim().toLowerCase();
    if (!code) return;
    setStoreCodeLoading(true);
    setStoreCodeError("");
    try {
      const res = await fetch(`/api/tenants/slug-check?slug=${encodeURIComponent(code)}`);
      const data = await res.json();
      // slug-check returns { available: true } when the slug is NOT taken (i.e. no store found)
      if (!res.ok || data.available) {
        setStoreCodeError("Store not found. Check the code with your manager.");
      } else {
        setActiveTenantSlug(code);
        setKnownSlug(code);
      }
    } catch {
      setStoreCodeError("Could not reach the server. Check your connection.");
    } finally {
      setStoreCodeLoading(false);
    }
  };

  const { data: empRoster = [], isLoading: rosterLoading } = useQuery<RosterEmployee[]>({
    queryKey: ["/api/employee/roster", knownSlug],
    enabled: activeTab === "employee" && !!knownSlug,
    staleTime: 30_000,
  });

  const handleEmpDigit = async (d: string) => {
    if (empPin.length >= 4 || empLoading) return;
    const next = empPin + d;
    setEmpPin(next);
    setEmpError("");
    if (next.length === 4 && empSelected?.employeeCode) {
      setEmpLoading(true);
      try {
        const slug = getActiveTenantSlug();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (slug) headers['X-Tenant-Slug'] = slug;
        const res = await fetch('/api/auth/employee-pin-login', {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ employeeCode: empSelected.employeeCode, pin: next }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.token) localStorage.setItem('token', data.token);
          queryClient.setQueryData(["/api/auth/user"], data);
          window.location.replace('/admin');
        } else {
          setEmpError("Incorrect PIN. Try again.");
          setEmpPin("");
        }
      } catch {
        setEmpError("Sign-in failed. Please try again.");
        setEmpPin("");
      } finally {
        setEmpLoading(false);
      }
    }
  };

  const handleEmpBack = () => { setEmpPin(prev => prev.slice(0, -1)); setEmpError(""); };
  const empDigits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  // Detect missing tenant slug — sign-up requires it, sign-in does not.
  const tenantSlugFromUrl = new URLSearchParams(window.location.search).get('tenant');
  const missingTenantForSignup = !tenantSlugFromUrl;

  // Validate the tenant slug (if present) against the server.
  // "checking" — request in flight; "valid" — slug exists; "invalid" — slug not found.
  type SlugState = "checking" | "valid" | "invalid" | "idle";
  const [slugState, setSlugState] = useState<SlugState>(tenantSlugFromUrl ? "checking" : "idle");

  useEffect(() => {
    if (!tenantSlugFromUrl) {
      setSlugState("idle");
      return;
    }
    let cancelled = false;
    setSlugState("checking");
    // Enforce a minimum spinner display time so it never flickers.
    const MIN_DISPLAY_MS = 400;
    const startedAt = Date.now();
    fetch(`/api/tenants/slug-check?slug=${encodeURIComponent(tenantSlugFromUrl)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        // available: true means the slug is NOT taken (i.e. no matching store)
        const next = data.available === false ? "valid" : "invalid";
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
        if (remaining === 0) {
          setSlugState(next);
        } else {
          const t = setTimeout(() => { if (!cancelled) setSlugState(next); }, remaining);
          // Store the timer id so the cleanup below can clear it.
          (cleanup as { timerId?: ReturnType<typeof setTimeout> }).timerId = t;
        }
      })
      .catch(() => {
        if (cancelled) return;
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
        if (remaining === 0) {
          setSlugState("valid"); // fail-open: let the form show on network error
        } else {
          const t = setTimeout(() => { if (!cancelled) setSlugState("valid"); }, remaining);
          (cleanup as { timerId?: ReturnType<typeof setTimeout> }).timerId = t;
        }
      });
    function cleanup() {}
    return () => {
      cancelled = true;
      const tid = (cleanup as { timerId?: ReturnType<typeof setTimeout> }).timerId;
      if (tid !== undefined) clearTimeout(tid);
    };
  }, [tenantSlugFromUrl]);

  const handleResendVerification = async (email: string) => {
    setResendingVerification(true);
    try {
      const slug = getActiveTenantSlug();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (slug) headers['X-Tenant-Slug'] = slug;
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      toast({ title: data.message });
    } catch {
      toast({ title: "Failed to resend. Please try again.", variant: "destructive" });
    } finally {
      setResendingVerification(false);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Forward the tenant slug from the URL (?tenant=<slug>) so the server
      // knows which store this login originated from.  The login route resolves
      // the user's tenant from their stored record (set at signup), so the header
      // does not override that — but sending it keeps the request consistent with
      // the signup form and allows the server to log or validate the originating
      // store context if needed in the future.
      const tenantSlug = new URLSearchParams(window.location.search).get('tenant') || '';
      const loginHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantSlug) {
        loginHeaders['X-Tenant-Slug'] = tenantSlug;
      }
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: loginHeaders,
        body: JSON.stringify({ email, password }),
      });
      
      if (response.ok) {
        const userData = await response.json();
        
        // Store token in localStorage as backup to cookies
        if (userData.token) {
          localStorage.setItem('token', userData.token);
        }

        // Seed the React Query auth cache with the login response so that
        // App.tsx's Router can evaluate the tenantId guard in the same
        // navigation without waiting for a separate /api/auth/user round-trip.
        // This is especially important for stranded users (tenantId=null): the
        // NoTenantScreen guard in Router fires immediately, so there is no
        // blank/broken intermediate state and no full page reload is needed.
        queryClient.setQueryData(["/api/auth/user"], userData);

        if (!userData.tenantId && !userData.isSuperAdmin) {
          // Stranded user — navigate in-app so NoTenantScreen appears instantly
          // without a hard page reload.  The Router guard detects tenantId=null
          // and renders NoTenantScreen before any tenant-scoped route is shown.
          setLocation('/');
        } else {
          // Normal user — force a complete page reload so the tenant slug, session
          // cookie, and any per-tenant config are all picked up cleanly.
          //
          // Safety: `window.location.replace` is called synchronously in the same
          // call stack as `setQueryData` above — there is no `await` between them.
          // React batches state updates and only flushes renders after the current
          // synchronous execution completes, but `window.location.replace` initiates
          // page unload *before* that render opportunity arrives.  The browser never
          // gives React a chance to paint the seeded cache, so NoTenantScreen cannot
          // flash for a normal user (whose tenantId is truthy and therefore bypasses
          // the `!userData.tenantId` guard in the first place).
          window.location.replace('/');
        }
      } else {
        const error = await response.json();
        console.error('Login failed:', error.message);
        if (error.requiresVerification) {
          setPendingEmail(email);
          setVerificationPending(true);
        } else if (error.verificationExpired) {
          setPendingEmail(email);
          setVerificationPending(true);
        } else {
          toast({
            title: "Login Failed",
            description: "Your email or password is incorrect. Please check your information and try again.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Error",
        description: "An error occurred during login. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (email: string, password: string, firstName: string, lastName: string, phoneNumber: string) => {
    setSignupError(null);
    setIsLoading(true);
    try {
      // Read the tenant slug from the URL (?tenant=<slug>) so new accounts are
      // scoped to the correct store. Without this header the server returns 400
      // and the user would silently end up in the wrong (or no) store.
      const tenantSlug = new URLSearchParams(window.location.search).get('tenant') || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantSlug) {
        headers['X-Tenant-Slug'] = tenantSlug;
      }
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ email, password, firstName, lastName, phoneNumber }),
      });
      
      if (response.ok) {
        const userData = await response.json();
        if (userData.requiresVerification) {
          // Show verification pending screen
          setPendingEmail(email);
          setVerificationPending(true);
        } else if (!userData.tenantId && !userData.isSuperAdmin) {
          // Stranded user (no tenant assigned) — seed the React Query auth cache
          // and navigate in-app so NoTenantScreen appears immediately without a
          // full page reload.  Mirrors the same pattern used in handleLogin.
          if (userData.token) {
            localStorage.setItem('token', userData.token);
          }
          queryClient.setQueryData(["/api/auth/user"], userData);
          setLocation('/');
        } else {
          // Normal signup — force a full reload so the tenant slug, session
          // cookie, and any per-tenant config are all picked up cleanly.
          if (userData.token) {
            localStorage.setItem('token', userData.token);
          }
          window.location.replace('/');
        }
      } else {
        const error = await response.json();
        console.error('Signup failed:', error.code ?? response.status, error.message);
        // Surface the machine-readable code so the widget can show a targeted
        // message for known failure modes without relying on string matching.
        let msg: string;
        if (error.code === "MISSING_TENANT") {
          msg = "This store link is not valid or has not been set up yet. Please contact the store owner for a correct sign-up link.";
        } else {
          msg = error.message || "Unable to create account. Please try again.";
        }
        setSignupError(msg);
        toast({
          title: "Sign Up Failed",
          description: msg,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Signup error:', error);
      const msg = "An error occurred during sign up. Please try again.";
      setSignupError(msg);
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const phoneNumber = formData.get('phoneNumber') as string;
    
    await handleSignUp(email, password, firstName, lastName, phoneNumber);
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    await handleLogin(email, password);
  };

  // Slug is being validated — show a neutral loading screen
  if (slugState === "checking") {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
          <p className="text-gray-300">Loading store…</p>
        </div>
      </div>
    );
  }

  // Slug is present but no matching store was found
  if (slugState === "invalid") {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Card className="bg-white/10 backdrop-blur-md border border-white/20 text-center">
            <CardContent className="pt-8 pb-8 space-y-4">
              <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center text-3xl mx-auto">🔍</div>
              <h2 className="text-2xl font-bold text-white">Store Not Found</h2>
              <p className="text-gray-300 leading-relaxed">
                We couldn't find a store matching <strong className="text-white">{tenantSlugFromUrl}</strong>.
                The link may be incorrect or the store may no longer be active.
              </p>
              <p className="text-gray-400 text-sm">
                Please double-check the link or contact the store that sent it to you.
              </p>
              <Button
                variant="ghost"
                className="text-gray-400 hover:text-white mt-2"
                onClick={() => setLocation('/')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (verificationPending) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Card className="bg-white/10 backdrop-blur-md border border-white/20 text-center">
            <CardContent className="pt-8 pb-8 space-y-4">
              <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-3xl mx-auto">✉</div>
              <h2 className="text-2xl font-bold text-white">Check Your Email</h2>
              <p className="text-gray-300">
                We sent a verification link to <strong className="text-white">{pendingEmail}</strong>.
                Click the link in that email to activate your account.
              </p>
              <p className="text-gray-400 text-sm">The link expires in 24 hours.</p>
              <div className="pt-2 space-y-3">
                <Button
                  className="w-full bg-red-600 hover:bg-red-700"
                  onClick={() => handleResendVerification(pendingEmail)}
                  disabled={resendingVerification}
                >
                  {resendingVerification ? "Sending..." : "Resend Verification Email"}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-gray-400 hover:text-white"
                  onClick={() => { setVerificationPending(false); setPendingEmail(""); }}
                >
                  Back to Sign In
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white flex items-start md:items-center justify-center p-6 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="text-white hover:bg-white/10 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>

        <Card className="bg-white/10 backdrop-blur-md border border-white/20">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-white mb-2">
              Welcome to PilotHouse
            </CardTitle>
            <p className="text-gray-300">Sign in to manage your account</p>
          </CardHeader>
          <CardContent>
            {/*
              * Tab-switch handler (onValueChange)
              * ──────────────────────────────────
              * Fires synchronously whenever the user switches between the
              * Sign In and Sign Up tabs.
              *
              * We intentionally do NOT reset isLoading here.  If a login (or
              * sign-up) request is in flight when the user switches tabs, the
              * button on the originating tab must remain disabled until the
              * request actually completes.  Resetting here would re-enable the
              * button prematurely and allow a duplicate submission.
              *
              * The `finally` block in handleLogin / handleSignUp is the single
              * authoritative place that resets isLoading — it always runs,
              * regardless of whether the request succeeds, errors, or is
              * abandoned while the user is on a different tab.
              */}
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSignupError(null); setEmpSelected(null); setEmpPin(""); setEmpError(""); }} className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-white/10">
                <TabsTrigger value="signin" className="text-white data-[state=active]:bg-brand-blue data-[state=active]:text-white text-xs">
                  Sign In
                </TabsTrigger>
                <TabsTrigger value="signup" className="text-white data-[state=active]:bg-brand-red data-[state=active]:text-white text-xs">
                  Sign Up
                </TabsTrigger>
                <TabsTrigger value="employee" className="text-white data-[state=active]:bg-slate-600 data-[state=active]:text-white text-xs">
                  Staff Sign-In
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin" className="space-y-4 mt-6">
                <form onSubmit={handleSignInSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-white">Email</Label>
                    <Input
                      name="email"
                      type="email"
                      placeholder="Enter your email"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-white">Password</Label>
                    <PasswordInput
                      name="password"
                      placeholder="Enter your password"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-brand-blue to-blue-600 hover:from-blue-600 hover:to-brand-blue text-white font-bold py-3"
                    data-testid="button-signin"
                  >
                    {isLoading ? "Signing In..." : "Sign In"}
                  </Button>
                  <div className="text-center mt-4 mb-2">
                    <button
                      type="button"
                      onClick={() => setLocation('/forgot-password')}
                      className="text-sm text-blue-400 hover:text-blue-300 underline transition-colors"
                      data-testid="link-forgot-password"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </form>
              </TabsContent>
              
              {/* ── Employee Sign-In Tab ── */}
              <TabsContent value="employee" className="mt-6">
                {/* Step 0 — fresh device: ask for store code before showing roster */}
                {!knownSlug ? (
                  <div className="space-y-4">
                    <div className="text-center mb-2">
                      <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-2">
                        <LogIn className="h-6 w-6 text-white" />
                      </div>
                      <p className="text-white font-medium">Enter your store's sign-in code</p>
                      <p className="text-gray-400 text-xs mt-1">Ask your manager — it looks like a short name (e.g. <span className="font-mono text-gray-300">paw-palace</span>), <em>not</em> your personal employee code like E01.</p>
                    </div>
                    <form onSubmit={handleStoreCodeSubmit} className="space-y-3">
                      <Input
                        value={storeCodeInput}
                        onChange={e => { setStoreCodeInput(e.target.value); setStoreCodeError(""); }}
                        placeholder="store name, not your E01 code"
                        className="bg-white/10 border-white/30 text-white placeholder:text-gray-400 text-center tracking-widest"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      {storeCodeError && <p className="text-red-400 text-xs text-center">{storeCodeError}</p>}
                      <Button
                        type="submit"
                        disabled={!storeCodeInput.trim() || storeCodeLoading}
                        className="w-full bg-slate-600 hover:bg-slate-500 text-white"
                      >
                        {storeCodeLoading ? "Checking…" : "Continue"}
                      </Button>
                    </form>
                  </div>
                ) : !empSelected ? (
                  <div className="space-y-2">
                    <div className="text-center mb-4">
                      <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-2">
                        <LogIn className="h-6 w-6 text-white" />
                      </div>
                      <p className="text-gray-300 text-sm">Select your name, then enter your PIN</p>
                      <button
                        className="text-xs text-gray-500 hover:text-gray-300 underline mt-1"
                        onClick={() => { setActiveTenantSlug(null); setKnownSlug(null); setStoreCodeInput(""); }}
                      >
                        Wrong store? Change store code
                      </button>
                    </div>
                    {rosterLoading ? (
                      <p className="text-center text-gray-400 text-sm py-6">Loading staff…</p>
                    ) : empRoster.length === 0 ? (
                      <div className="text-center text-gray-400 py-6 space-y-2">
                        <p className="text-sm">No employee accounts found.</p>
                        <p className="text-xs text-gray-500">Ask your manager to create your account, or make sure you're using the store's sign-in link.</p>
                      </div>
                    ) : (
                      <>
                        {empRoster.length > 5 && (
                          <Input
                            value={empSearch}
                            onChange={e => setEmpSearch(e.target.value)}
                            placeholder="Search your name…"
                            className="bg-white/10 border-white/20 text-white placeholder:text-gray-400 mb-2"
                            autoComplete="off"
                          />
                        )}
                        {empRoster
                          .filter(emp => {
                            if (!empSearch.trim()) return true;
                            const q = empSearch.toLowerCase();
                            return (
                              emp.firstName?.toLowerCase().includes(q) ||
                              emp.lastName?.toLowerCase().includes(q) ||
                              emp.employeeCode?.toLowerCase().includes(q)
                            );
                          })
                          .map(emp => (
                            <button
                              key={emp.id}
                              onClick={() => { setEmpSelected(emp); setEmpPin(""); setEmpError(""); setEmpSearch(""); }}
                              className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl px-4 py-3 text-left transition-all"
                            >
                              <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                                <span className="text-blue-300 font-semibold text-sm">{(emp.firstName?.[0] ?? "?").toUpperCase()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-medium truncate">{emp.firstName} {emp.lastName}</p>
                                <p className="text-gray-400 text-xs">{emp.employeeCode}</p>
                              </div>
                            </button>
                          ))}
                      </>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-5">
                      <button onClick={() => { setEmpSelected(null); setEmpPin(""); setEmpError(""); }} className="text-gray-400 hover:text-white transition-colors">
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                          <span className="text-blue-300 font-semibold text-xs">{(empSelected.firstName?.[0] ?? "?").toUpperCase()}</span>
                        </div>
                        <p className="text-white font-medium">{empSelected.firstName} {empSelected.lastName}</p>
                        <Badge variant="outline" className="text-gray-400 border-gray-600 text-xs">{empSelected.employeeCode}</Badge>
                      </div>
                    </div>
                    {/* PIN dots */}
                    <div className="flex justify-center gap-4 mb-5">
                      {[0,1,2,3].map(i => (
                        <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < empPin.length ? "bg-blue-400 border-blue-400 scale-110" : "bg-transparent border-gray-500"}`} />
                      ))}
                    </div>
                    {empError && <p className="text-center text-red-400 text-sm mb-3 animate-pulse">{empError}</p>}
                    {/* Keypad */}
                    <div className="grid grid-cols-3 gap-3">
                      {empDigits.map((d, i) => {
                        if (d === "") return <div key={i} />;
                        return (
                          <button key={i} onClick={() => d === "⌫" ? handleEmpBack() : handleEmpDigit(d)}
                            disabled={empLoading}
                            className={`h-14 rounded-2xl text-xl font-semibold transition-all active:scale-95 ${d === "⌫" ? "bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white" : "bg-white/10 hover:bg-white/20 text-white"} border border-white/10 hover:border-white/20 disabled:opacity-50`}>
                            {d === "⌫" ? <Delete className="h-5 w-5 mx-auto" /> : d}
                          </button>
                        );
                      })}
                    </div>
                    {empLoading && <p className="text-center text-gray-400 text-sm mt-3 animate-pulse">Verifying…</p>}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="signup" className="space-y-4 mt-6">
                {missingTenantForSignup ? (
                  <div className="text-center space-y-4 py-4">
                    <div className="w-14 h-14 bg-amber-500/20 rounded-full flex items-center justify-center text-2xl mx-auto">🔗</div>
                    <p className="text-white font-medium">Store link required</p>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      To create an account, please open the sign-up link you received from your store. Direct sign-up isn't available without a store link.
                    </p>
                    <p className="text-gray-400 text-xs">
                      If you need help, contact the store that sent you the link.
                    </p>
                  </div>
                ) : (
                <form onSubmit={handleSignUpSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-white">First Name</Label>
                      <Input
                        name="firstName"
                        placeholder="First name"
                        className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-white">Last Name</Label>
                      <Input
                        name="lastName"
                        placeholder="Last name"
                        className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signupEmail" className="text-white">Email</Label>
                    <Input
                      name="email"
                      type="email"
                      placeholder="Enter your email"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber" className="text-white">Phone Number</Label>
                    <Input
                      name="phoneNumber"
                      type="tel"
                      placeholder="(555) 123-4567"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                      required
                      data-testid="input-phone-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signupPassword" className="text-white">Password</Label>
                    <PasswordInput
                      name="password"
                      placeholder="Create a password"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                      required
                    />
                  </div>
                  {signupError && (
                    <div
                      className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
                      role="alert"
                      data-testid="signup-error-banner"
                    >
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                      <span>{signupError}</span>
                    </div>
                  )}
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-brand-red to-red-600 hover:from-red-600 hover:to-brand-red text-white font-bold py-3"
                    data-testid="button-signup"
                  >
                    <Heart className="w-4 h-4 mr-2" />
                    {isLoading ? "Creating Account..." : "Create Account"}
                  </Button>
                </form>
                )}
              </TabsContent>
            </Tabs>


          </CardContent>
        </Card>
      </div>
    </div>
  );
}