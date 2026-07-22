import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { Bell, ShoppingCart, Heart, Star, ArrowRight, Sparkles, Eye, Search, Tag, ChevronLeft, ChevronRight, Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getRecentlyViewedIds } from "@/lib/recentlyViewed";
import animalHouseLogoPath from "@assets/Circle Mascot Logo_1750438195696.jpg";
import { pushNotificationManager } from "@/lib/pushNotifications";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import StoreFooter from "@/components/store-footer";
import OnboardingBanner from "@/components/onboarding-banner";
import TrialStatusCard from "@/components/trial-status-card";

const BADGE_COLORS: Record<string, string> = {
  red: 'bg-red-500', orange: 'bg-orange-500', green: 'bg-green-500',
  blue: 'bg-blue-500', purple: 'bg-purple-500', yellow: 'bg-yellow-400 text-gray-900',
};

function SpecialDetailModal({ special, onClose }: { special: any; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const allImages = [special.imageUrl, ...(special.imageUrls || [])].filter(Boolean);
  const badgeClass = BADGE_COLORS[special.badgeColor || 'red'] || 'bg-red-500';
  const hasLink = special.linkType && special.linkType !== 'none';

  const prev = () => setCurrentIndex(i => (i - 1 + allImages.length) % allImages.length);
  const next = () => setCurrentIndex(i => (i + 1) % allImages.length);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) next(); else prev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleCTA = () => {
    if (special.linkType === 'supplies') { setLocation('/supplies'); onClose(); }
    else if (special.linkType === 'pets') { setLocation('/supplies'); onClose(); }
    else if (special.linkType === 'external' && special.externalUrl) window.open(special.externalUrl, '_blank');
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="p-0 max-w-sm w-full overflow-hidden rounded-2xl border-0 [&>button]:z-10 [&>button]:text-white [&>button]:bg-black/50 [&>button]:rounded-full [&>button]:top-3 [&>button]:right-3">
        {/* Image carousel */}
        {allImages.length > 0 ? (
          <div
            className="relative bg-gray-100 dark:bg-gray-900 select-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={allImages[currentIndex]}
              alt={special.title}
              className="w-full h-64 object-cover"
            />
            {special.badgeText && (
              <span className={`absolute top-3 left-3 text-xs font-bold px-2.5 py-1 rounded-full text-white ${badgeClass}`}>
                {special.badgeText}
              </span>
            )}
            {allImages.length > 1 && (
              <>
                <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                  {allImages.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentIndex(i)}
                      className={`w-2 h-2 rounded-full transition-all ${i === currentIndex ? 'bg-white scale-110' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="h-24 bg-gradient-to-r from-brand-red to-brand-orange flex items-center px-4">
            {special.badgeText && (
              <span className={`text-sm font-bold px-3 py-1 rounded-full text-white ${badgeClass}`}>{special.badgeText}</span>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-5 space-y-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{special.title}</h2>
          {special.description && (
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{special.description}</p>
          )}
          {hasLink && (
            <Button className="w-full bg-brand-red hover:bg-red-600 text-white mt-2" onClick={handleCTA}>
              Shop Now <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SpecialsStrip() {
  const [, setLocation] = useLocation();
  const [selectedSpecial, setSelectedSpecial] = useState<any | null>(null);
  const { data: specials = [] } = useQuery<any[]>({
    queryKey: ["/api/specials"],
    staleTime: 5 * 60 * 1000,
  });

  if (!specials || specials.length === 0) return null;

  return (
    <section className="px-4 pt-4 pb-2">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-4 h-4 text-brand-red" />
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">Specials & Deals</h3>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {specials.map((s: any) => {
          const badgeClass = BADGE_COLORS[s.badgeColor || 'red'] || 'bg-red-500';
          const allImages = [s.imageUrl, ...(s.imageUrls || [])].filter(Boolean);
          return (
            <div
              key={s.id}
              onClick={() => setSelectedSpecial(s)}
              className="flex-shrink-0 w-52 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:border-brand-red transition-all active:scale-95"
            >
              {allImages.length > 0 ? (
                <div className="relative h-28 bg-gray-100">
                  <img src={allImages[0]} alt={s.title} className="w-full h-full object-cover" />
                  {s.badgeText && (
                    <span className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full text-white ${badgeClass}`}>
                      {s.badgeText}
                    </span>
                  )}
                  {allImages.length > 1 && (
                    <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded-full">
                      1/{allImages.length}
                    </span>
                  )}
                </div>
              ) : (
                <div className="relative h-12 bg-gradient-to-r from-brand-red to-brand-orange flex items-center px-3">
                  {s.badgeText && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${badgeClass}`}>
                      {s.badgeText}
                    </span>
                  )}
                </div>
              )}
              <div className="p-3">
                <p className="font-semibold text-sm text-gray-900 dark:text-white leading-tight line-clamp-1">{s.title}</p>
                {s.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{s.description}</p>}
                <p className="text-xs text-brand-red font-medium mt-1.5 flex items-center gap-0.5">
                  Tap to view <ArrowRight className="w-3 h-3" />
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {selectedSpecial && (
        <SpecialDetailModal special={selectedSpecial} onClose={() => setSelectedSpecial(null)} />
      )}
    </section>
  );
}

export default function Home() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleNotificationClick = async () => {
    try {
      const enabled = await pushNotificationManager.enablePushNotifications();
      if (enabled) {
        setNotificationsEnabled(true);
        toast({
          title: "Notifications Enabled!",
          description: "You'll receive updates when your orders are ready.",
        });
      } else {
        toast({
          title: "Notifications Blocked",
          description: "Please allow notifications in your browser settings.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Notification setup error:', error);
      toast({
        title: "Notification Error",
        description: "Failed to set up notifications. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handleLogout = async () => {
    console.log('Logging out...');
    
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    localStorage.removeItem('token');
    localStorage.clear();
    queryClient.clear();
    
    // Redirect to landing page
    window.location.href = '/';
  };
  const [, setLocation] = useLocation();

  const [recentlyViewedIds, setRecentlyViewedIds] = useState<number[]>([]);

  useEffect(() => {
    const items = getRecentlyViewedIds();
    setRecentlyViewedIds(items.map(item => item.id));
  }, []);

  const { data: recentlyViewedData } = useQuery({
    queryKey: ["/api/supplies", { ids: recentlyViewedIds.join(",") }],
    queryFn: async () => {
      const res = await fetch(`/api/supplies?ids=${recentlyViewedIds.join(",")}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: recentlyViewedIds.length > 0,
  });

  const recentlyViewedSupplies = recentlyViewedIds
    .map(id => ((recentlyViewedData as any)?.items || []).find((s: any) => s.id === id))
    .filter(Boolean);

  const { data: suppliesData } = useQuery({
    queryKey: ["/api/supplies", { limit: 3 }],
    retry: false,
  });

  const { data: cartItems = [] } = useQuery({
    queryKey: ["/api/cart"],
    retry: false,
  });

  const { data: hiringData } = useQuery<{ open: boolean }>({
    queryKey: ['/api/settings/hiring-open'],
  });
  const hiringOpen = hiringData?.open ?? true;

  const supplies = (suppliesData as any)?.items || [];
  const featuredSupplies = supplies.slice(0, 3);
  const cartCount = (cartItems as any[]).length;

  // Calculate stats
  const totalSupplies = (suppliesData as any)?.total || 0;

  return (
    <div className="pb-20 bg-gradient-to-b from-gray-50 to-white">
      {/* Modern Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 bg-gradient-to-br from-brand-red to-brand-orange rounded-2xl flex items-center justify-center shadow-lg">
                <img 
                  src={animalHouseLogoPath} 
                  alt="PilotHouse" 
                  className="w-8 h-8 rounded-xl object-cover" 
                />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white"></div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-brand-red whitespace-nowrap">
                PilotHouse
              </h1>
              <p className="text-xs text-gray-500 font-medium truncate">
                {isLoading ? 'Loading...' : 
                 user && (user as any).firstName ? `Welcome, ${(user as any).firstName}${(user as any).isAdmin ? ' (Admin)' : ''}` : 
                 'Your business, fully equipped'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button 
              className={`relative p-3 rounded-full transition-colors ${
                notificationsEnabled 
                  ? 'bg-green-100 hover:bg-green-200' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              onClick={handleNotificationClick}
              title="Enable notifications for order updates"
            >
              <Bell className={`w-5 h-5 ${notificationsEnabled ? 'text-green-600' : 'text-gray-600'}`} />
              {notificationsEnabled && (
                <span className="absolute top-1 right-1 bg-green-500 text-white text-xs rounded-full w-3 h-3 flex items-center justify-center text-[10px]">✓</span>
              )}
            </button>
            <button 
              className="relative p-3 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors" 
              onClick={() => setLocation('/supplies')}
            >
              <ShoppingCart className="w-5 h-5 text-gray-600" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 bg-brand-red text-white text-xs rounded-full w-3 h-3 flex items-center justify-center text-[10px]">
                  {cartCount}
                </span>
              )}
            </button>
            <button 
              className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              onClick={handleLogout}
            >
              <span className="text-xs font-medium">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Onboarding completion banner — visible to tenant owners without an active subscription */}
      <OnboardingBanner />

      {/* Trial countdown card — persistent reminder for owners still on a free trial */}
      <TrialStatusCard />

      {/* Search Bar */}
      <div className="px-4 pt-4">
        <form onSubmit={(e) => {
          e.preventDefault();
          if (searchQuery.trim()) {
            setLocation(`/supplies?search=${encodeURIComponent(searchQuery.trim())}`);
          }
        }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-3 w-full rounded-full border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>
        </form>
      </div>

      {/* Specials & Deals Strip */}
      <SpecialsStrip />

      {/* Hero Section */}
      <section className="px-6 py-6">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-brand-orange mr-2" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome to</h2>
          </div>
          <h3 className="text-4xl font-bold bg-gradient-to-r from-blue-500 via-red-500 to-orange-500 bg-clip-text text-transparent mb-4">
            PilotHouse
          </h3>
          <p className="text-gray-600 dark:text-gray-300 text-lg">Your business, fully equipped</p>
        </div>
      </section>

      {/* Recently Viewed */}
      {recentlyViewedSupplies.length > 0 && (
        <section className="px-6 pb-8">
          <div className="flex items-center mb-4">
            <Eye className="w-5 h-5 text-gray-500 mr-2" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recently Viewed</h3>
          </div>
          <div className="overflow-x-auto flex gap-3 pb-2">
            {recentlyViewedSupplies.map((supply: any) => {
              const imgUrl = supply.imageUrl || (supply.image_urls && supply.image_urls[0]) || '';
              return (
                <div
                  key={supply.id}
                  className="min-w-[140px] w-[140px] flex-shrink-0 cursor-pointer"
                  onClick={() => setLocation(`/supplies/${supply.id}`)}
                >
                  <div className="w-full h-[140px] rounded-xl overflow-hidden bg-gray-100 mb-2">
                    <img
                      src={imgUrl || 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=300'}
                      alt={supply.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{supply.name}</p>
                  <p className="text-sm font-bold text-brand-red">${Number(supply.price).toFixed(2)}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Services Grid */}
      <section className="px-6 pb-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          What We Offer
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Card 
            className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer"
            onClick={() => setLocation('/supplies')}
          >
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">🛍️</span>
              </div>
              <h4 className="font-bold text-gray-900 mb-1">Products</h4>
              <p className="text-blue-700 text-sm font-medium">Shop Now</p>
              <p className="text-gray-600 text-xs mt-1">Browse our catalog</p>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer"
            onClick={() => setLocation('/booking')}
          >
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-green-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">📅</span>
              </div>
              <h4 className="font-bold text-gray-900 mb-1">Book Service</h4>
              <p className="text-green-700 text-sm font-medium">Schedule Now</p>
              <p className="text-gray-600 text-xs mt-1">Appointments</p>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer"
            onClick={() => setLocation('/profile')}
          >
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">⭐</span>
              </div>
              <h4 className="font-bold text-gray-900 mb-1">Loyalty</h4>
              <p className="text-purple-700 text-sm font-medium">Earn Points</p>
              <p className="text-gray-600 text-xs mt-1">Rewards & Discounts</p>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer"
            onClick={() => setLocation('/orders')}
          >
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">📦</span>
              </div>
              <h4 className="font-bold text-gray-900 mb-1">Orders</h4>
              <p className="text-orange-700 text-sm font-medium">View History</p>
              <p className="text-gray-600 text-xs mt-1">Track your orders</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Now Hiring Banner — only shown when hiring is open */}
      {hiringOpen && (
        <section className="px-6 pb-6">
          <div
            className="bg-gradient-to-r from-gray-900 to-gray-800 border border-red-600 rounded-2xl p-5 flex items-center gap-4 cursor-pointer shadow-lg active:scale-95 transition-transform"
            onClick={() => setLocation('/apply')}
          >
            <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-white font-bold text-base">Now Hiring!</span>
                <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">Apply Now</span>
              </div>
              <p className="text-gray-400 text-sm leading-snug">Join the PilotHouse team — tap to fill out an application.</p>
            </div>
            <ArrowRight className="w-5 h-5 text-red-500 flex-shrink-0" />
          </div>
        </section>
      )}

      <StoreFooter />
    </div>
  );
}
