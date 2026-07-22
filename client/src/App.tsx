import { lazy, Suspense, Component, ReactNode } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import BottomNav from "@/components/bottom-nav";
import BackToTop from "@/components/back-to-top";

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
        <div className="max-w-md mx-auto bg-white min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
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

function PageLoader() {
  return (
    <div className="max-w-md mx-auto bg-white min-h-screen flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function Router() {
  const { user, isLoading } = useAuth();
  const isAuthenticated = !!user;
  const [location] = useLocation();
  const isWideRoute = location === "/admin" || location.startsWith("/admin?") || location === "/pos";
  
  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className={`${isWideRoute ? "w-full" : "max-w-md mx-auto lg:max-w-full"} bg-white min-h-screen relative`}>
      <Suspense fallback={<PageLoader />}>
        <Switch>
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
          
          {!isAuthenticated ? (
            <>
              <Route path="/" component={Landing} />
              <Route path="/auth" component={Auth} />
              <Route component={NotFound} />
            </>
          ) : (
            <>
              <Route path="/" component={Home} />
              <Route path="/supplies" component={Supplies} />
              <Route path="/supplies/:id" component={SupplyDetail} />
              <Route path="/booking" component={Booking} />
              <Route path="/profile" component={Profile} />
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
