import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, PawPrint, ShoppingBag, Calendar, User, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function BottomNav() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  const NAV_ITEMS = [
    { path: "/", icon: Home, label: "Home" },
    { path: "/pets", icon: PawPrint, label: "Pets" },
    { path: "/supplies", icon: ShoppingBag, label: "Supplies" },
    { path: "/booking", icon: Calendar, label: "Book" },
    { path: "/profile", icon: User, label: "Profile" },
    ...(user?.isAdmin ? [{ path: "/admin", icon: Settings, label: "Admin" }] : []),
  ];

export default function BottomNav() {
  const [location, setLocation] = useLocation();

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
              onClick={() => setLocation(item.path)}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
