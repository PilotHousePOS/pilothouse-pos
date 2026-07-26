import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { queryClient as globalQueryClient, getActiveTenantSlug } from "@/lib/queryClient";
import animalHouseLogoPath from "@assets/Circle Mascot Logo_1750438195696.jpg";
import {
  ShoppingCart, Calendar, BookOpen, LogOut, User,
  ChevronRight, Zap, ClipboardList, Settings,
} from "lucide-react";

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const typedUser = user as any;
  const isAdmin = !!(typedUser?.isAdmin || typedUser?.isSuperiorManager);

  const { data: tenantInfo } = useQuery<{
    name?: string;
    enabledFeatures?: Record<string, any>;
  }>({ queryKey: ["/api/tenants/current"] });

  const features = tenantInfo?.enabledFeatures ?? {};
  const isOn = (key: string) => features[key] !== false;

  const handleLogout = () => {
    // On a shared POS device we don't destroy the session or clear storage —
    // we just return to the employee roster so the next person can pick their name.
    // The store slug stays in localStorage so no re-entry of the store code is needed.
    globalQueryClient.clear();
    window.location.href = "/auth?tab=employee";
  };

  // Feature cards shown to staff when the store has that feature enabled
  const featureCards: Array<{
    key: string;
    label: string;
    sub: string;
    icon: React.ReactNode;
    color: string;
    path: string;
  }> = [
    isOn("appointments") && {
      key: "appointments",
      label: "Appointments",
      sub: "Today's schedule",
      icon: <Calendar className="w-6 h-6 text-blue-500" />,
      color: "hover:border-blue-300",
      path: "/admin?tab=appointments",
    },
    isOn("appointments") && {
      key: "book",
      label: "Book Customer",
      sub: "Schedule a visit",
      icon: <BookOpen className="w-6 h-6 text-green-500" />,
      color: "hover:border-green-300",
      path: "/booking",
    },
    isOn("boarding") && {
      key: "boarding",
      label: "Boarding",
      sub: "Check-ins & outs",
      icon: <ClipboardList className="w-6 h-6 text-purple-500" />,
      color: "hover:border-purple-300",
      path: "/admin?tab=boarding",
    },
    {
      key: "profile",
      label: "My Profile",
      sub: "Account & PIN",
      icon: <User className="w-6 h-6 text-gray-400" />,
      color: "hover:border-gray-300",
      path: "/profile",
    },
  ].filter(Boolean) as any[];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <img
            src={animalHouseLogoPath}
            alt="Logo"
            className="w-9 h-9 rounded-full object-cover border border-gray-200 shadow-sm"
          />
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight truncate max-w-[180px]">
              {tenantInfo?.name ?? "Loading…"}
            </p>
            <p className="text-xs text-gray-500">
              {typedUser?.firstName ?? "Staff"}
              {isAdmin ? " · Admin" : " · Staff"}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 px-4 pt-6 pb-12 max-w-md mx-auto w-full space-y-4">
        {/* Greeting */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Good {getTimeOfDay()}, {typedUser?.firstName ?? "there"} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin ? "Your tools are ready below." : "Here's what's available for you today."}
          </p>
        </div>

        {/* POS — always the primary action */}
        <button
          onClick={() => setLocation("/pos")}
          className="w-full bg-gray-900 hover:bg-gray-800 active:scale-[0.98] text-white rounded-2xl p-5 flex items-center justify-between shadow-lg transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="font-bold text-lg leading-tight">Point of Sale</p>
              <p className="text-white/60 text-sm">Ring up customers</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/40 shrink-0" />
        </button>

        {/* Admin Panel — admins only */}
        {isAdmin && (
          <button
            onClick={() => setLocation("/admin")}
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-2xl p-5 flex items-center justify-between shadow transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="font-bold text-lg leading-tight">Admin Panel</p>
                <p className="text-white/60 text-sm">Manage your store</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-white/40 shrink-0" />
          </button>
        )}

        {/* Feature cards grid */}
        {featureCards.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {featureCards.map(card => (
              <button
                key={card.key}
                onClick={() => setLocation(card.path)}
                className={`bg-white border border-gray-200 ${card.color} rounded-xl p-4 text-left hover:shadow-sm transition-all active:scale-[0.98]`}
              >
                <div className="mb-2">{card.icon}</div>
                <p className="font-semibold text-gray-900 text-sm">{card.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{card.sub}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
