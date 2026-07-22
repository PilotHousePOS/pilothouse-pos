import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, ShoppingBag, Calendar, User, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

export default function BottomNav() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth() as { user: any };

  const { data: cartItems = [] } = useQuery({ queryKey: ["/api/cart"] });
  const cartCount = (cartItems as any[]).length;

  const NAV_ITEMS = [
    { path: "/", icon: Home, label: "Home" },
    { path: "/supplies", icon: ShoppingBag, label: "Products" },
    { path: "/booking", icon: Calendar, label: "Book" },
    { path: "/profile", icon: User, label: "Profile" },
    ...((user as any)?.isAdmin || (user as any)?.isGroomer ? [{ path: "/admin", icon: Settings, label: "Admin" }] : []),
  ];

  const handleNavClick = (path: string) => {
    setLocation(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-200 px-6 py-2">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;
          
          return (
            <Button
              key={item.path}
              variant="ghost"
              className={`flex flex-col items-center space-y-1 p-2 h-auto ${
                isActive ? 'text-brand-blue' : 'text-gray-400'
              }`}
              onClick={() => handleNavClick(item.path)}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.path === "/supplies" && cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {cartCount > 9 ? '9+' : cartCount}
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