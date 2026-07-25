import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient as globalQueryClient, getActiveTenantSlug } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { Bell, ShoppingCart, Heart, Star, ArrowRight, Sparkles, Eye, Search, Tag, ChevronLeft, ChevronRight, Briefcase, Pencil, Check, X } from "lucide-react";
import StaffDashboard from "@/pages/StaffDashboard";
import { getRecentlyViewedIds } from "@/lib/recentlyViewed";
import animalHouseLogoPath from "@assets/Circle Mascot Logo_1750438195696.jpg";
import { pushNotificationManager } from "@/lib/pushNotifications";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import StoreFooter from "@/components/store-footer";
import OnboardingBanner from "@/components/onboarding-banner";
import TrialStatusCard from "@/components/trial-status-card";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CardConfig {
  title: string;
  actionLabel: string;
  description: string;
  emoji: string;
  theme: string;
}

interface HomepageConfig {
  welcomeText?: string;
  brandName?: string;
  subtitle?: string;
  sectionTitle?: string;
  brandGradient?: { from: string; via: string; to: string };
  cards?: CardConfig[];
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<HomepageConfig> = {
  welcomeText: "Welcome to",
  brandName: "PilotHouse",
  subtitle: "Your business, fully equipped",
  sectionTitle: "What We Offer",
  brandGradient: { from: "#3b82f6", via: "#ef4444", to: "#f97316" },
  cards: [
    { title: "Products",     actionLabel: "Shop Now",       description: "Browse our catalog",   emoji: "🛍️", theme: "blue"   },
    { title: "Book Service", actionLabel: "Schedule Now",   description: "Appointments",          emoji: "📅", theme: "green"  },
    { title: "Loyalty",      actionLabel: "Earn Points",    description: "Rewards & Discounts",   emoji: "⭐", theme: "purple" },
    { title: "Orders",       actionLabel: "View History",   description: "Track your orders",     emoji: "📦", theme: "orange" },
  ],
};

const CARD_THEMES: Record<string, { bg: string; icon: string; text: string }> = {
  blue:   { bg: "from-blue-50 to-blue-100 border-blue-200",         icon: "bg-blue-500",   text: "text-blue-700"   },
  green:  { bg: "from-green-50 to-emerald-100 border-green-200",    icon: "bg-green-500",  text: "text-green-700"  },
  purple: { bg: "from-purple-50 to-purple-100 border-purple-200",   icon: "bg-purple-500", text: "text-purple-700" },
  orange: { bg: "from-orange-50 to-orange-100 border-orange-200",   icon: "bg-orange-500", text: "text-orange-700" },
  red:    { bg: "from-red-50 to-red-100 border-red-200",            icon: "bg-red-500",    text: "text-red-700"    },
  teal:   { bg: "from-teal-50 to-teal-100 border-teal-200",         icon: "bg-teal-500",   text: "text-teal-700"   },
  pink:   { bg: "from-pink-50 to-pink-100 border-pink-200",         icon: "bg-pink-500",   text: "text-pink-700"   },
  yellow: { bg: "from-yellow-50 to-yellow-100 border-yellow-200",   icon: "bg-yellow-400", text: "text-yellow-700" },
};

const THEME_LABELS: Record<string, string> = {
  blue: "🔵", green: "🟢", purple: "🟣", orange: "🟠", red: "🔴", teal: "🩵", pink: "🩷", yellow: "🟡",
};

function mergeConfig(saved: HomepageConfig): Required<HomepageConfig> {
  return {
    welcomeText:   saved.welcomeText   ?? DEFAULT_CONFIG.welcomeText,
    brandName:     saved.brandName     ?? DEFAULT_CONFIG.brandName,
    subtitle:      saved.subtitle      ?? DEFAULT_CONFIG.subtitle,
    sectionTitle:  saved.sectionTitle  ?? DEFAULT_CONFIG.sectionTitle,
    brandGradient: saved.brandGradient ?? DEFAULT_CONFIG.brandGradient,
    cards: (saved.cards ?? DEFAULT_CONFIG.cards).map((c, i) => ({
      ...DEFAULT_CONFIG.cards[i],
      ...c,
    })),
  };
}

// ── Badge colours (for specials) ──────────────────────────────────────────────

const BADGE_COLORS: Record<string, string> = {
  red: "bg-red-500", orange: "bg-orange-500", green: "bg-green-500",
  blue: "bg-blue-500", purple: "bg-purple-500", yellow: "bg-yellow-400 text-gray-900",
};

// ── Special detail modal ──────────────────────────────────────────────────────

function SpecialDetailModal({ special, onClose }: { special: any; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const allImages = [special.imageUrl, ...(special.imageUrls || [])].filter(Boolean);
  const badgeClass = BADGE_COLORS[special.badgeColor || "red"] || "bg-red-500";
  const hasLink = special.linkType && special.linkType !== "none";

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
    if (special.linkType === "supplies") { setLocation("/supplies"); onClose(); }
    else if (special.linkType === "pets") { setLocation("/supplies"); onClose(); }
    else if (special.linkType === "external" && special.externalUrl) window.open(special.externalUrl, "_blank");
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="p-0 max-w-sm w-full overflow-hidden rounded-2xl border-0 [&>button]:z-10 [&>button]:text-white [&>button]:bg-black/50 [&>button]:rounded-full [&>button]:top-3 [&>button]:right-3">
        {allImages.length > 0 ? (
          <div className="relative bg-gray-100 dark:bg-gray-900 select-none" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <img src={allImages[currentIndex]} alt={special.title} className="w-full h-64 object-cover" />
            {special.badgeText && (
              <span className={`absolute top-3 left-3 text-xs font-bold px-2.5 py-1 rounded-full text-white ${badgeClass}`}>
                {special.badgeText}
              </span>
            )}
            {allImages.length > 1 && (
              <>
                <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5"><ChevronRight className="w-4 h-4" /></button>
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                  {allImages.map((_: any, i: number) => (
                    <button key={i} onClick={() => setCurrentIndex(i)} className={`w-2 h-2 rounded-full transition-all ${i === currentIndex ? "bg-white scale-110" : "bg-white/50"}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="h-20 bg-gradient-to-r from-brand-red to-brand-orange" />
        )}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-snug">{special.title}</h3>
            {special.badgeText && <span className={`flex-none text-xs font-bold px-2 py-0.5 rounded-full text-white ${badgeClass}`}>{special.badgeText}</span>}
          </div>
          {special.description && <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-4">{special.description}</p>}
          {hasLink && (
            <Button onClick={handleCTA} className="w-full bg-brand-red hover:bg-red-700 text-white font-semibold rounded-xl">
              {special.linkType === "external" ? "Learn More" : "Shop Now"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Specials strip ────────────────────────────────────────────────────────────

function SpecialsStrip() {
  const [selectedSpecial, setSelectedSpecial] = useState<any>(null);
  const slug = getActiveTenantSlug();
  const { data: specials = [] } = useQuery<any[]>({
    queryKey: ["/api/specials"],
    queryFn: async () => {
      const res = await fetch("/api/specials", { headers: slug ? { "X-Tenant-Slug": slug } : {} });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const active = (specials as any[]).filter((s: any) => s.isActive);
  if (!active.length) return null;

  return (
    <section className="px-4 pt-3">
      <div className="overflow-x-auto flex gap-3 pb-1 scrollbar-none">
        {active.map((s: any) => {
          const allImages = [s.imageUrl, ...(s.imageUrls || [])].filter(Boolean);
          const badgeClass = BADGE_COLORS[s.badgeColor || "red"] || "bg-red-500";
          return (
            <div
              key={s.id}
              onClick={() => setSelectedSpecial(s)}
              className="min-w-[160px] w-[160px] flex-shrink-0 cursor-pointer rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm active:scale-95 transition-transform"
            >
              {allImages.length > 0 ? (
                <div className="relative h-20 bg-gray-100 dark:bg-gray-900">
                  <img src={allImages[0]} alt={s.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  {s.badgeText && <span className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full text-white ${badgeClass}`}>{s.badgeText}</span>}
                  {allImages.length > 1 && <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded-full">1/{allImages.length}</span>}
                </div>
              ) : (
                <div className="relative h-12 bg-gradient-to-r from-brand-red to-brand-orange flex items-center px-3">
                  {s.badgeText && <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${badgeClass}`}>{s.badgeText}</span>}
                </div>
              )}
              <div className="p-3">
                <p className="font-semibold text-sm text-gray-900 dark:text-white leading-tight line-clamp-1">{s.title}</p>
                {s.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{s.description}</p>}
                <p className="text-xs text-brand-red font-medium mt-1.5 flex items-center gap-0.5">Tap to view <ArrowRight className="w-3 h-3" /></p>
              </div>
            </div>
          );
        })}
      </div>
      {selectedSpecial && <SpecialDetailModal special={selectedSpecial} onClose={() => setSelectedSpecial(null)} />}
    </section>
  );
}

// ── Homepage Editor dialog ────────────────────────────────────────────────────

function HomepageEditor({ config, onClose, onSaved }: {
  config: Required<HomepageConfig>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const slug = getActiveTenantSlug();
  const [draft, setDraft] = useState<Required<HomepageConfig>>(JSON.parse(JSON.stringify(config)));

  const saveMutation = useMutation({
    mutationFn: async (payload: Required<HomepageConfig>) => {
      const res = await fetch("/api/admin/homepage-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(slug ? { "X-Tenant-Slug": slug } : {}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Save failed");
    },
    onSuccess: () => {
      toast({ title: "Homepage updated!", description: "Customers will see your changes right away." });
      onSaved();
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  const setCard = (i: number, patch: Partial<CardConfig>) => {
    setDraft(d => {
      const cards = d.cards.map((c, idx) => idx === i ? { ...c, ...patch } : c);
      return { ...d, cards };
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" /> Edit Homepage
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* ── Hero ── */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Hero Section</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-500">Intro text (e.g. "Welcome to")</Label>
                <Input value={draft.welcomeText} onChange={e => setDraft(d => ({ ...d, welcomeText: e.target.value }))} placeholder="Welcome to" />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Business / brand name</Label>
                <Input value={draft.brandName} onChange={e => setDraft(d => ({ ...d, brandName: e.target.value }))} placeholder="PilotHouse" />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Tagline / subtitle</Label>
                <Input value={draft.subtitle} onChange={e => setDraft(d => ({ ...d, subtitle: e.target.value }))} placeholder="Your business, fully equipped" />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Brand name gradient colors</Label>
                <div className="flex items-center gap-2 mt-1">
                  {(["from", "via", "to"] as const).map(stop => (
                    <div key={stop} className="flex-1">
                      <p className="text-[10px] text-gray-400 mb-1 capitalize">{stop}</p>
                      <div className="flex items-center gap-1.5 border rounded-md px-2 py-1">
                        <input
                          type="color"
                          value={draft.brandGradient[stop]}
                          onChange={e => setDraft(d => ({ ...d, brandGradient: { ...d.brandGradient, [stop]: e.target.value } }))}
                          className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                        />
                        <span className="text-xs text-gray-500 font-mono">{draft.brandGradient[stop]}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Preview */}
                <p
                  className="text-center text-xl font-bold mt-2 bg-clip-text text-transparent"
                  style={{ backgroundImage: `linear-gradient(to right, ${draft.brandGradient.from}, ${draft.brandGradient.via}, ${draft.brandGradient.to})` }}
                >
                  {draft.brandName || "Preview"}
                </p>
              </div>
            </div>
          </div>

          {/* ── Section title ── */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Offer Section</h3>
            <div>
              <Label className="text-xs text-gray-500">Section heading</Label>
              <Input value={draft.sectionTitle} onChange={e => setDraft(d => ({ ...d, sectionTitle: e.target.value }))} placeholder="What We Offer" />
            </div>
          </div>

          {/* ── Cards ── */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Service Cards</h3>
            <div className="space-y-4">
              {draft.cards.map((card, i) => (
                <div key={i} className="border rounded-xl p-3 bg-gray-50 dark:bg-gray-800/50">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Card {i + 1}</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <Label className="text-xs text-gray-500">Emoji</Label>
                      <Input value={card.emoji} onChange={e => setCard(i, { emoji: e.target.value })} className="text-center text-lg" maxLength={2} />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Color theme</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.keys(THEME_LABELS).map(t => (
                          <button
                            key={t}
                            onClick={() => setCard(i, { theme: t })}
                            title={t}
                            className={`w-7 h-7 rounded-full text-sm flex items-center justify-center border-2 transition-all ${card.theme === t ? "border-gray-800 scale-110" : "border-transparent"}`}
                          >
                            {THEME_LABELS[t]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs text-gray-500">Title</Label>
                      <Input value={card.title} onChange={e => setCard(i, { title: e.target.value })} placeholder="Title" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Action label (link text)</Label>
                      <Input value={card.actionLabel} onChange={e => setCard(i, { actionLabel: e.target.value })} placeholder="Shop Now" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Description</Label>
                      <Input value={card.description} onChange={e => setCard(i, { description: e.target.value })} placeholder="Browse our catalog" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1">
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate(draft)}
            disabled={saveMutation.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saveMutation.isPending ? "Saving…" : <><Check className="w-4 h-4 mr-1" /> Save Changes</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const slug = getActiveTenantSlug();

  // ── Homepage config ──
  const { data: rawConfig = {} } = useQuery<HomepageConfig>({
    queryKey: ["/api/homepage-config"],
    queryFn: async () => {
      const res = await fetch("/api/homepage-config", { headers: slug ? { "X-Tenant-Slug": slug } : {} });
      if (!res.ok) return {};
      return res.json();
    },
  });
  const hc = mergeConfig(rawConfig as HomepageConfig);

  // ── Employee permissions (needed to check canEditHomepage for non-admins) ──
  const typedUser = user as any;
  const canEdit = typedUser?.isAdmin || typedUser?.isEmployee;

  // For employees we also need to verify canEditHomepage; fetch their perms
  const { data: empPerms } = useQuery<any>({
    queryKey: ["/api/auth/employee-permissions"],
    queryFn: async () => {
      const res = await fetch("/api/auth/employee-permissions", { headers: slug ? { "X-Tenant-Slug": slug } : {} });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!typedUser?.isEmployee && !typedUser?.isAdmin,
  });

  const canEditHomepage = typedUser?.isAdmin || (typedUser?.isEmployee && empPerms?.canEditHomepage);

  const handleNotificationClick = async () => {
    try {
      const enabled = await pushNotificationManager.enablePushNotifications();
      if (enabled) {
        setNotificationsEnabled(true);
        toast({ title: "Notifications Enabled!", description: "You'll receive updates when your orders are ready." });
      } else {
        toast({ title: "Notifications Blocked", description: "Please allow notifications in your browser settings.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Notification Error", description: "Failed to set up notifications. Please try again.", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    localStorage.removeItem("token");
    localStorage.clear();
    globalQueryClient.clear();
    window.location.href = "/";
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
      const res = await fetch(`/api/supplies?ids=${recentlyViewedIds.join(",")}`, { headers: slug ? { "X-Tenant-Slug": slug } : {} });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: recentlyViewedIds.length > 0,
  });

  const recentlyViewedSupplies = recentlyViewedIds
    .map(id => ((recentlyViewedData as any)?.items || []).find((s: any) => s.id === id))
    .filter(Boolean);

  const { data: suppliesData } = useQuery({ queryKey: ["/api/supplies", { limit: 3 }], retry: false });
  const { data: cartItems = [] } = useQuery({ queryKey: ["/api/cart"], retry: false });
  const { data: hiringData } = useQuery<{ open: boolean }>({ queryKey: ["/api/settings/hiring-open"] });

  const hiringOpen = hiringData?.open ?? false;
  const supplies = (suppliesData as any)?.items || [];
  const featuredSupplies = supplies.slice(0, 3);
  const cartCount = (cartItems as any[]).length;
  const totalSupplies = (suppliesData as any)?.total || 0;

  // Card destinations
  const CARD_ROUTES = ["/supplies", "/booking", "/profile", "/orders"];

  // Tenant feature flags (for gating sections on owner/customer view)
  const { data: tenantInfo } = useQuery<{ enabledFeatures?: Record<string, any> }>({
    queryKey: ["/api/tenants/current"],
  });
  const enabledFeatures = (tenantInfo as any)?.enabledFeatures ?? {};
  const featureOn = (k: string) => enabledFeatures[k] !== false;

  // ── Staff branch ── employees and admins (but not the owner) get a dedicated
  // streamlined dashboard instead of the customer-facing homepage.
  const isStaff = !!user && (typedUser?.isEmployee || typedUser?.isAdmin) && !typedUser?.isSuperiorManager;
  if (isStaff) return <StaffDashboard />;

  // ── Owner branch ── the owner's home is always /admin. Redirect immediately
  // without waiting for tenant data — avoids firing 30+ admin queries on a page
  // that will only be visible for one frame anyway.
  if (typedUser?.isSuperiorManager) {
    setLocation('/admin');
    return null;
  }

  // ── Online store off ── physical-only store with no public storefront.
  // Show a minimal landing card for unauthenticated visitors / customers.
  const storeOff = tenantInfo !== undefined && !featureOn('onlineStore');
  if (storeOff && !typedUser?.isSuperiorManager) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50 text-center gap-4">
        <img src={animalHouseLogoPath} alt="Logo" className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg" />
        <h1 className="text-2xl font-bold text-gray-900">{hc.brandName}</h1>
        <p className="text-gray-500 text-sm max-w-xs">
          This business operates in-store only. Visit us in person or call to book an appointment.
        </p>
        {featureOn('appointments') && (
          <button
            onClick={() => setLocation('/booking')}
            className="mt-2 px-6 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors"
          >
            Book an Appointment
          </button>
        )}
        {user ? (
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-500 mt-2">Sign out</button>
        ) : (
          <button onClick={() => setLocation('/auth')} className="text-sm text-gray-400 hover:text-gray-600 mt-2">Staff sign-in</button>
        )}
        <StoreFooter />
      </div>
    );
  }

  return (
    <div className="pb-20 bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <img src={animalHouseLogoPath} alt="Logo" className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-white shadow-md" />
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 dark:text-white text-base leading-tight truncate">{hc.brandName}</h1>
              {user && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  Welcome, {typedUser?.firstName || typedUser?.email || "Guest"}
                  {typedUser?.isSuperiorManager ? " (Owner)" : typedUser?.isAdmin ? " (Admin)" : typedUser?.isEmployee ? " (Staff)" : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={handleNotificationClick} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${notificationsEnabled ? "text-brand-orange bg-orange-50" : "text-gray-500 hover:bg-gray-100"}`}>
              <Bell className="w-5 h-5" />
            </button>
            {featureOn('onlineStore') && (
              <button onClick={() => setLocation("/cart")} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 relative">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-red text-white text-[10px] font-bold rounded-full flex items-center justify-center">{cartCount}</span>}
              </button>
            )}
            {user ? (
              <button onClick={handleLogout} className="px-3 py-1.5 bg-brand-red text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors">Logout</button>
            ) : (
              <button onClick={() => setLocation("/auth")} className="px-3 py-1.5 bg-brand-red text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors">Login</button>
            )}
          </div>
        </div>
      </header>

      <OnboardingBanner />
      <TrialStatusCard />

      {/* Search */}
      <div className="px-4 pt-4">
        <form onSubmit={e => { e.preventDefault(); if (searchQuery.trim()) setLocation(`/supplies?search=${encodeURIComponent(searchQuery.trim())}`); }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-3 w-full rounded-full border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>
        </form>
      </div>

      {featureOn('onlineStore') && <SpecialsStrip />}

      {/* Hero Section */}
      <section className="px-6 py-6 relative">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-brand-orange mr-2" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{hc.welcomeText}</h2>
          </div>
          <h3
            className="text-4xl font-bold bg-clip-text text-transparent mb-4"
            style={{ backgroundImage: `linear-gradient(to right, ${hc.brandGradient.from}, ${hc.brandGradient.via}, ${hc.brandGradient.to})` }}
          >
            {hc.brandName}
          </h3>
          <p className="text-gray-600 dark:text-gray-300 text-lg">{hc.subtitle}</p>
        </div>
        {/* Edit button — owner or canEditHomepage managers */}
        {canEditHomepage && (
          <button
            onClick={() => setShowEditor(true)}
            className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 shadow-sm rounded-full text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
            title="Edit homepage content"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit Page
          </button>
        )}
      </section>

      {/* Recently Viewed — only when online store is active */}
      {featureOn('onlineStore') && recentlyViewedSupplies.length > 0 && (
        <section className="px-6 pb-8">
          <div className="flex items-center mb-4">
            <Eye className="w-5 h-5 text-gray-500 mr-2" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recently Viewed</h3>
          </div>
          <div className="overflow-x-auto flex gap-3 pb-2">
            {recentlyViewedSupplies.map((supply: any) => {
              const imgUrl = supply.imageUrl || (supply.image_urls && supply.image_urls[0]) || "";
              return (
                <div key={supply.id} className="min-w-[140px] w-[140px] flex-shrink-0 cursor-pointer" onClick={() => setLocation(`/supplies/${supply.id}`)}>
                  <div className="w-full h-[140px] rounded-xl overflow-hidden bg-gray-100 mb-2">
                    <img src={imgUrl || "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=300"} alt={supply.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
        <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">{hc.sectionTitle}</h3>
        <div className="grid grid-cols-2 gap-4">
          {hc.cards.map((card, i) => {
            const theme = CARD_THEMES[card.theme] ?? CARD_THEMES.blue;
            return (
              <Card
                key={i}
                className={`bg-gradient-to-br ${theme.bg} border shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer`}
                onClick={() => setLocation(CARD_ROUTES[i] ?? "/")}
              >
                <CardContent className="p-6 text-center">
                  <div className={`w-12 h-12 ${theme.icon} rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg`}>
                    <span className="text-2xl">{card.emoji}</span>
                  </div>
                  <h4 className="font-bold text-gray-900 mb-1">{card.title}</h4>
                  <p className={`${theme.text} text-sm font-medium`}>{card.actionLabel}</p>
                  <p className="text-gray-600 text-xs mt-1">{card.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Now Hiring Banner */}
      {hiringOpen && (
        <section className="px-6 pb-6">
          <div
            className="bg-gradient-to-r from-gray-900 to-gray-800 border border-red-600 rounded-2xl p-5 flex items-center gap-4 cursor-pointer shadow-lg active:scale-95 transition-transform"
            onClick={() => setLocation("/apply")}
          >
            <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-white font-bold text-base">Now Hiring!</span>
                <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">Apply Now</span>
              </div>
              <p className="text-gray-400 text-sm">Join our team — positions available</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
          </div>
        </section>
      )}

      <StoreFooter />

      {/* Homepage editor dialog */}
      {showEditor && (
        <HomepageEditor
          config={hc}
          onClose={() => setShowEditor(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["/api/homepage-config"] })}
        />
      )}
    </div>
  );
}
