import { lazy, Suspense, Component, ReactNode } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import BottomNav from "@/components/bottom-nav";
import BackToTop from "@/components/back-to-top";

function safeLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory().catch(() => {
      let reloaded = false;
      try { reloaded = !!sessionStorage.getItem('_chunk_reload'); } catch {}
      if (!reloaded) {
        try { sessionStorage.setItem('_chunk_reload', '1'); } catch {}
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      try { sessionStorage.removeItem('_chunk_reload'); } catch {}
      return Promise.resolve({ default: (() => null) as unknown as T });
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

const Landing = safeLazy(() => import("@/pages/landing"));
const Auth = safeLazy(() => import("@/pages/auth"));
const ForgotPassword = safeLazy(() => import("@/pages/forgot-password"));
const ResetPassword = safeLazy(() => import("@/pages/reset-password"));
const Home = safeLazy(() => import("@/pages/home"));
const Pets = safeLazy(() => import("@/pages/pets"));
const Supplies = safeLazy(() => import("@/pages/supplies"));
const SupplyDetail = safeLazy(() => import("@/pages/supply-detail"));
const Aquatics = safeLazy(() => import("@/pages/aquatics"));
const Reptiles = safeLazy(() => import("@/pages/reptiles"));
const Booking = safeLazy(() => import("@/pages/booking"));
const Profile = safeLazy(() => import("@/pages/profile"));
const Settings = safeLazy(() => import("@/pages/settings"));
const Admin = safeLazy(() => import("@/pages/admin"));
const OrderHistory = safeLazy(() => import("@/pages/order-history"));
const OrderConfirmation = safeLazy(() => import("@/pages/order-confirmation"));
const MyAppointments = safeLazy(() => import("@/pages/my-appointments"));
const Wishlist = safeLazy(() => import("@/pages/wishlist"));
const PrivacyPolicy = safeLazy(() => import("@/pages/privacy-policy"));
const TermsOfService = safeLazy(() => import("@/pages/terms-of-service"));
const Support = safeLazy(() => import("@/pages/support"));
const VerifyEmail = safeLazy(() => import("@/pages/verify-email"));
const DeleteAccount = safeLazy(() => import("@/pages/delete-account"));
const NotFound = safeLazy(() => import("@/pages/not-found"));
const Apply = safeLazy(() => import("@/pages/apply"));

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
  
  if (isLoading) {
    return <PageLoader />;
  }
  
  return (
    <div className="max-w-md mx-auto bg-white min-h-screen relative overflow-hidden">
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
          
          {!isAuthenticated ? (
            <>
              <Route path="/" component={Landing} />
              <Route path="/auth" component={Auth} />
              <Route component={NotFound} />
            </>
          ) : (
            <>
              <Route path="/" component={Home} />
              <Route path="/pets" component={Pets} />
              <Route path="/supplies" component={Supplies} />
              <Route path="/supplies/:id" component={SupplyDetail} />
              <Route path="/aquatics" component={Aquatics} />
              <Route path="/reptiles" component={Reptiles} />
              <Route path="/booking" component={Booking} />
              <Route path="/profile" component={Profile} />
              <Route path="/settings" component={Settings} />
              <Route path="/admin" component={Admin} />
              <Route path="/orders" component={OrderHistory} />
              <Route path="/order-confirmation/:orderId" component={OrderConfirmation} />
              <Route path="/appointments" component={MyAppointments} />
              <Route path="/wishlist" component={Wishlist} />
            </>
          )}
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      {isAuthenticated && <BottomNav />}
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
