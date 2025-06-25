import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Auth from "@/pages/auth";
import Home from "@/pages/home";
import Pets from "@/pages/pets";
import Supplies from "@/pages/supplies";
import Booking from "@/pages/booking";
import Profile from "@/pages/profile";
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";
import BottomNav from "@/components/bottom-nav";

function Router() {
  // Simple approach - just check localStorage directly
  const hasToken = !!localStorage.getItem('auth_token');
  
  return (
    <div className="max-w-md mx-auto bg-white min-h-screen relative overflow-hidden">
      <Switch>
        {!hasToken ? (
          <>
            <Route path="/" component={Landing} />
            <Route path="/auth" component={Auth} />
          </>
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
      {hasToken && <BottomNav />}
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
