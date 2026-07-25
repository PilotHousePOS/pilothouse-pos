import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, ShoppingBag, Calendar, User, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

export default function BottomNav() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth() as { user: any };

  // Tenant feature flags — determines which nav items are visible
  const { data: tenantInfo } = useQuery<{ enabledFeatures?: Record<string, any> }>({
    queryKey: ["/api/tenants/current"],
    enabled: !!user,
  });
  const features = tenantInfo?.enabledFeatures ?? {};
  // onlineStore defaults ON (undefined !== false) for backwards compat
  const onlineStoreOn = tenantInfo === undefined || features["onlineStore"] !== false;
  const appointmentsOn = features["appointments"] !== false;

  // Cart query — only run when online store is active (avoids a 403 on Starter/physical-only)
  const { data: cartItems = [] } = useQuery({
    queryKey: ["/api/cart"],
    enabled: !!user && onlineStoreOn,
    retry: false,
  });
  const cartCount = (cartItems as any[]).length;

  const isAdminOrOwner = !!(user as any)?.isAdmin || !!(user as any)?.isSuperiorManager;
  const isStaff = !!(user as any)?.isEmployee || isAdminOrOwner;

  // Staff (employees, admins, owners) don't use the customer bottom-nav at all —
  // they either land on StaffDashboard (which has no bottom nav) or admin panel.
  // We still render for owner on the homepage so they can navigate.
  if (isStaff && !isAdminOrOwner) return null;

  const NAV_ITEMS = [
    // Home → /admin when online store is off and user is owner; otherwise "/"
    {
      path: !onlineStoreOn && isAdminOrOwner ? "/admin" : "/",
      icon: Home,
      label: "Home",
      show: true,
    },
    // Products — only when online store is on
    {
      path: "/supplies",
      icon: ShoppingBag,
      label: "Products",
      show: onlineStoreOn,
    },
    // Book — only when appointments are on
    {
      path: "/booking",
      icon: Calendar,
      label: "Book",
      show: appointmentsOn,
    },
    // Profile — always
    {
      path: "/profile",
      icon: User,
      label: "Profile",
      show: true,
    },
    // Admin — admins and groomers
    {
      path: "/admin",
      icon: Settings,
      label: "Admin",
      show: !!((user as any)?.isAdmin || (user as any)?.isGroomer),
    },
  ].filter(item => item.show);

  const handleNavClick = (path: string) => {
    setLocation(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-200 px-6 py-2">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.path || (item.path === "/" && location === "/");
          const Icon = item.icon;

          return (
            <Button
              key={item.label}
              variant="ghost"
              className={`flex flex-col items-center space-y-1 p-2 h-auto ${
                isActive ? "text-brand-blue" : "text-gray-400"
              }`}
              onClick={() => handleNavClick(item.path)}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.path === "/supplies" && cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
