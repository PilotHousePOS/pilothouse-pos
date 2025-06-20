import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Pets from "@/pages/pets";
import Supplies from "@/pages/supplies";
import Booking from "@/pages/booking";
import Profile from "@/pages/profile";
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";
import BottomNav from "@/components/bottom-nav";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const isDemoMode = new URLSearchParams(window.location.search).get('demo') === 'true';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-blue to-brand-red">
        <div className="text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 mx-auto">
            <div className="animate-spin w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full"></div>
          </div>
          <p className="text-white font-semibold">Loading Animal House...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen relative overflow-hidden">
      <Switch>
        {!isAuthenticated && !isDemoMode ? (
          <Route path="/" component={Landing} />
        ) : (
          <>
            <Route path="/" component={Home} />
            <Route path="/pets" component={Pets} />
            <Route path="/supplies" component={Supplies} />
            <Route path="/booking" component={Booking} />
            <Route path="/profile" component={Profile} />
            <Route path="/admin" component={Admin} />
          </>
        )}
        <Route component={NotFound} />
      </Switch>
      {(isAuthenticated || isDemoMode) && <BottomNav />}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
