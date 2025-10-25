import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Auth from "@/pages/auth";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Home from "@/pages/home";
import Pets from "@/pages/pets";
import Supplies from "@/pages/supplies";
import Aquatics from "@/pages/aquatics";
import Reptiles from "@/pages/reptiles";
import Booking from "@/pages/booking";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import Admin from "@/pages/admin";
import OrderHistory from "@/pages/order-history";
import MyAppointments from "@/pages/my-appointments";
import Wishlist from "@/pages/wishlist";
import NotFound from "@/pages/not-found";
import BottomNav from "@/components/bottom-nav";

function Router() {
  // Simple approach - just check localStorage directly
  const hasToken = !!localStorage.getItem('token');
  
  return (
    <div className="max-w-md mx-auto bg-white min-h-screen relative overflow-hidden">
      <Switch>
        {/* Public routes accessible to everyone */}
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        
        {!hasToken ? (
          <>
            <Route path="/" component={Landing} />
            <Route path="/auth" component={Auth} />
            <Route path="*" component={() => <Landing />} />
          </>
        ) : (
          <>
            <Route path="/" component={Home} />
            <Route path="/pets" component={Pets} />
            <Route path="/supplies" component={Supplies} />
            <Route path="/aquatics" component={Aquatics} />
            <Route path="/reptiles" component={Reptiles} />
            <Route path="/booking" component={Booking} />
            <Route path="/profile" component={Profile} />
            <Route path="/settings" component={Settings} />
            <Route path="/admin" component={Admin} />
            <Route path="/orders" component={OrderHistory} />
            <Route path="/appointments" component={MyAppointments} />
            <Route path="/wishlist" component={Wishlist} />
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
