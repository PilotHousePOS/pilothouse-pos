import { lazy, Suspense, Component, ReactNode, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient, setActiveTenantSlug, seedSlugFromUrl } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import BottomNav from "@/components/bottom-nav";
import BackToTop from "@/components/back-to-top";
import TrialBanner from "@/components/trial-banner";
import Paywall from "@/components/paywall";
import { ServerUnreachableBanner } from "@/components/server-unreachable-banner";
import { OfflineBanner } from "@/components/offline-banner";

// Seed the tenant slug from ?tenant= as early as possible so that public-page
// API calls (store front, apply, product pages) always include X-Tenant-Slug
// even before the authenticated TenantSlugSync component has run.
seedSlugFromUrl();

function safeLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkKey: string
) {
  return lazy(() =>
    factory().catch(() => {
      // Use a per-chunk key so multiple chunks don't block each other's one retry
      const storageKey = `_chunk_reload_${chunkKey}`;
      let reloaded = false;
      try { reloaded = !!sessionStorage.getItem(storageKey); } catch {}
      if (!reloaded) {
        try { sessionStorage.setItem(storageKey, '1'); } catch {}
        // Hard reload bypasses service worker cache so new chunk filenames are fetched
        window.location.href = window.location.href;
        return new Promise<{ default: T }>(() => {});
      }
      // Second failure — clear flag and show a visible reload prompt instead of blank
      try { sessionStorage.removeItem(storageKey); } catch {}
      const Fallback = () => (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:16, padding:32, textAlign:"center" }}>
          <p style={{ color:"#555", fontSize:15 }}>This page failed to load. This usually happens right after a new version is deployed.</p>
          <button
            style={{ padding:"10px 24px", background:"#1a56db", color:"#fff", border:"none", borderRadius:8, fontSize:14, cursor:"pointer" }}
            onClick={() => { try { sessionStorage.clear(); } catch {} window.location.reload(); }}
          >
            Reload Page
          </button>
        </div>
      );
      return Promise.resolve({ default: Fallback as unknown as T });
    })
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full bg-white min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-gray-600">Something went wrong. Please refresh the page.</p>
          <button
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm"
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Landing = safeLazy(() => import("@/pages/landing"), "landing");
const Auth = safeLazy(() => import("@/pages/auth"), "auth");
const ForgotPassword = safeLazy(() => import("@/pages/forgot-password"), "forgot-password");
const ResetPassword = safeLazy(() => import("@/pages/reset-password"), "reset-password");
const Home = safeLazy(() => import("@/pages/home"), "home");
const Supplies = safeLazy(() => import("@/pages/supplies"), "supplies");
const SupplyDetail = safeLazy(() => import("@/pages/supply-detail"), "supply-detail");
const Booking = safeLazy(() => import("@/pages/booking"), "booking");
const Profile = safeLazy(() => import("@/pages/profile"), "profile");
const Settings = safeLazy(() => import("@/pages/settings"), "settings");
const Admin = safeLazy(() => import("@/pages/admin"), "admin");
// /employee-login redirects to the Employee tab on the main auth page
function EmployeeLoginRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation('/auth?tab=employee'); }, [setLocation]);
  return null;
}
const PosPage = safeLazy(() => import("@/pages/pos"), "pos");
const OrderHistory = safeLazy(() => import("@/pages/order-history"), "order-history");
const OrderConfirmation = safeLazy(() => import("@/pages/order-confirmation"), "order-confirmation");
const MyAppointments = safeLazy(() => import("@/pages/my-appointments"), "my-appointments");
const Wishlist = safeLazy(() => import("@/pages/wishlist"), "wishlist");
const PrivacyPolicy = safeLazy(() => import("@/pages/privacy-policy"), "privacy-policy");
const TermsOfService = safeLazy(() => import("@/pages/terms-of-service"), "terms-of-service");
const Support = safeLazy(() => import("@/pages/support"), "support");
const VerifyEmail = safeLazy(() => import("@/pages/verify-email"), "verify-email");
const DeleteAccount = safeLazy(() => import("@/pages/delete-account"), "delete-account");
const NotFound = safeLazy(() => import("@/pages/not-found"), "not-found");
const Apply = safeLazy(() => import("@/pages/apply"), "apply");
const About = safeLazy(() => import("@/pages/about"), "about");
const SmsConsent = safeLazy(() => import("@/pages/sms-consent"), "sms-consent");
const BillingPage   = safeLazy(() => import("@/pages/billing"),  "billing");
const DownloadPage  = safeLazy(() => import("@/pages/download"), "download");
const Signup = safeLazy(() => import("@/pages/signup"), "signup");
const Onboarding = safeLazy(() => import("@/pages/onboarding"), "onboarding");

function PageLoader() {
  return (
    <div className="w-full bg-white min-h-screen flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

// Routes that are always accessible even when subscription is lapsed
const BILLING_SAFE_PATHS = new Set([
  "/settings/billing",
  "/settings",
  "/profile",
  "/privacy-policy",
  "/terms-of-service",
  "/support",
  "/about",
]);

function isBillingSafe(location: string): boolean {
  if (BILLING_SAFE_PATHS.has(location)) return true;
  if (location.startsWith("/settings")) return true;
  return false;
}

// Paywall guard: blocks access to POS/admin for past_due or cancelled tenants
function PaywallGuard({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();

  const { data: billing } = useQuery<{ subscriptionStatus: string }>({
    queryKey: ["/api/billing/status"],
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const status = billing?.subscriptionStatus;
  const isBlocked = status === "past_due" || status === "cancelled";

  if (isBlocked && !isBillingSafe(location)) {
    return <Paywall status={status as "past_due" | "cancelled"} />;
  }

  return <>{children}</>;
}

// Shown when an authenticated user has no tenant assigned to their account
function NoTenantScreen() {
  const { refetch, isFetching } = useAuth();

  return (
    <div className="w-full bg-white min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Account Not Configured</h1>
        <p className="text-gray-600 text-sm leading-relaxed">
          Your account isn't linked to a store yet. This usually happens when an account is created before store setup is complete.
        </p>
        <p className="text-gray-600 text-sm leading-relaxed mt-3">
          Please contact support and we'll get you set up right away.
        </p>
      </div>
      <a
        href="/support"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
      >
        Contact Support
      </a>
      <button
        className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        onClick={() => refetch()}
        disabled={isFetching}
      >
        {isFetching ? (
          <>
            <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Checking…
          </>
        ) : (
          "Check again"
        )}
      </button>
      <button
        className="text-sm text-gray-400 hover:text-gray-600 underline"
        onClick={() => {
          localStorage.removeItem('token');
          window.location.href = '/';
        }}
      >
        Sign out
      </button>
    </div>
  );
}

/**
 * Keeps the active tenant slug in localStorage in sync with the authenticated
 * user's tenant.  This lets apiRequest() and getQueryFn() automatically inject
 * the X-Tenant-Slug header on every request — including unauthenticated ones
 * that happen after the slug is first known — without any per-call wiring.
 */
function TenantSlugSync() {
  const { user, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const { data: tenant } = useQuery<{ id: number; name: string; slug: string; onboardingStep?: number }>({
    queryKey: ["/api/tenants/current"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (tenant?.slug) {
      setActiveTenantSlug(tenant.slug);
    } else if (!isAuthenticated) {
      // Clear stored slug on logout so a subsequent unauthenticated session
      // doesn't accidentally send a stale slug.
      setActiveTenantSlug(null);
    }
  }, [tenant?.slug, isAuthenticated]);

  // Automatically redirect to onboarding when the tenant hasn't completed setup.
  // onboardingStep === 0 means the owner has never filled in their business details.
  useEffect(() => {
    if (
      isAuthenticated &&
      tenant?.onboardingStep === 0 &&
      location !== '/onboarding'
    ) {
      setLocation('/onboarding');
    }
  }, [isAuthenticated, tenant?.onboardingStep, location]);

  // Rendering nothing — this is a side-effect-only component.
  return null;
}

function Router() {
  const { user, isLoading } = useAuth();
  const isAuthenticated = !!user;
  const [location] = useLocation();
  const isLandingRoute = location === "/";

  if (isLoading) {
    return <PageLoader />;
  }

  // Authenticated user with no tenant assigned and not a super-admin:
  // show a clear explanation instead of a blank/broken app.
  const typedUser = user as any;
  if (isAuthenticated && !typedUser?.tenantId && !typedUser?.isSuperAdmin) {
    return <NoTenantScreen />;
  }

  return (
    <div className={`w-full ${isLandingRoute ? "bg-transparent" : "bg-white"} min-h-screen relative`}>
      {/* Keeps X-Tenant-Slug header in sync with the active store slug */}
      <TenantSlugSync />
      {/* Trial countdown banner — only shown when authenticated and in trial */}
      {isAuthenticated && <TrialBanner />}
      {/* Offline banner — shown on every page when the device loses internet */}
      <OfflineBanner />
      {/* Server-unreachable banner — only shown in the Electron desktop app */}
      <ServerUnreachableBanner />

      <PaywallGuard>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/employee-login" component={EmployeeLoginRedirect} />
            <Route path="/forgot-password" component={ForgotPassword} />
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/verify-email" component={VerifyEmail} />
            <Route path="/delete-account" component={DeleteAccount} />
            <Route path="/privacy-policy" component={PrivacyPolicy} />
            <Route path="/terms-of-service" component={TermsOfService} />
            <Route path="/support" component={Support} />
            <Route path="/apply" component={Apply} />
            <Route path="/about" component={About} />
            <Route path="/sms-consent" component={SmsConsent} />
            <Route path="/store" component={Home} />
            <Route path="/supplies" component={Supplies} />
            <Route path="/supplies/:id" component={SupplyDetail} />
            
            {/* /auth is always accessible so employee sign-out always lands on the roster */}
            <Route path="/auth" component={Auth} />
            <Route path="/signup" component={Signup} />
            {!isAuthenticated ? (
              <>
                <Route path="/" component={Landing} />
                <Route component={NotFound} />
              </>
            ) : (
              <>
                <Route path="/" component={Home} />
                <Route path="/onboarding" component={Onboarding} />
                <Route path="/supplies" component={Supplies} />
                <Route path="/supplies/:id" component={SupplyDetail} />
                <Route path="/booking" component={Booking} />
                <Route path="/profile" component={Profile} />
                <Route path="/settings/billing" component={BillingPage} />
                <Route path="/download" component={DownloadPage} />
                <Route path="/settings" component={Settings} />
                <Route path="/admin" component={Admin} />
                <Route path="/pos" component={PosPage} />
                <Route path="/orders" component={OrderHistory} />
                <Route path="/order-confirmation/:orderId" component={OrderConfirmation} />
                <Route path="/appointments" component={MyAppointments} />
                <Route path="/wishlist" component={Wishlist} />
              </>
            )}
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </PaywallGuard>

      {isAuthenticated && location !== "/pos" && <BottomNav />}
      {isAuthenticated && <BackToTop />}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
