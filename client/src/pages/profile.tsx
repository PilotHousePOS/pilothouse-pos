import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { 
  ShoppingBag, 
  Calendar, 
  Heart, 
  Settings, 
  Edit, 
  Plus,
  Shield,
  Gift,
  Star,
  Bell,
  BellOff,
  Loader2,
  Mail,
  MailX,
  Sparkles,
  Trophy,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  CheckCircle2,
  ArrowLeft,
  Clock,
  LogOut,
} from "lucide-react";
import type { User, CustomerPet, Order, Appointment } from "@shared/schema";

export default function Profile() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showAddPet, setShowAddPet] = useState(false);
  const [newPet, setNewPet] = useState({ name: '', species: 'dog', breed: '', age: '', notes: '' });
  const [showEditPet, setShowEditPet] = useState(false);
  const [editingPet, setEditingPet] = useState<{ id: number; name: string; species: string; breed: string; age: string; notes: string } | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);

  const [isLinkingAstro, setIsLinkingAstro] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedbackCategory, setFeedbackCategory] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const { data: currentUser, isLoading: userLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: customerPets = [] } = useQuery<CustomerPet[]>({
    queryKey: ["/api/customer-pets"],
    enabled: !!currentUser,
  });

  const { data: tenantInfo } = useQuery<{ enabledFeatures?: Record<string, any> }>({
    queryKey: ["/api/tenants/current"],
    enabled: !!currentUser,
  });
  // Show pets section unless the store has explicitly disabled it (default: visible for backward compat)
  const petsEnabled = tenantInfo?.enabledFeatures?.pets !== false;

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/feedback", {
        rating: feedbackRating,
        category: feedbackCategory || undefined,
        message: feedbackMessage || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      setFeedbackSubmitted(true);
      setShowFeedback(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Could not submit feedback. Please try again.", variant: "destructive" });
    },
  });

  const addPetMutation = useMutation({
    mutationFn: async (petData: typeof newPet) => {
      const res = await apiRequest("POST", "/api/customer-pets", petData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-pets"] });
      setShowAddPet(false);
      setNewPet({ name: '', species: 'dog', breed: '', age: '', notes: '' });
      toast({ title: "Pet added!", description: "Your pet has been added to your profile." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add pet. Please try again.", variant: "destructive" });
    },
  });

  const editPetMutation = useMutation({
    mutationFn: async (petData: typeof editingPet) => {
      if (!petData) throw new Error("No pet");
      const res = await apiRequest("PATCH", `/api/customer-pets/${petData.id}`, petData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-pets"] });
      setShowEditPet(false);
      setEditingPet(null);
      toast({ title: "Pet updated!", description: "Your pet's information has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update pet. Please try again.", variant: "destructive" });
    },
  });

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: !!currentUser,
  });

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/user/appointments"],
    enabled: !!currentUser,
  });

  const { data: loyaltyStatus } = useQuery<{
    totalSpent: string;
    loyaltyCredits: string;
    progressToNextReward: number;
    spendingThreshold: string;
    rewardAmount: string;
  }>({
    queryKey: ["/api/user/loyalty"],
    enabled: !!currentUser,
  });

  const { data: astroEnabled } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/astro/status"],
    enabled: !!currentUser,
  });

  const { data: astroStatus, refetch: refetchAstro } = useQuery<any>({
    queryKey: ["/api/astro/my-status"],
    enabled: !!currentUser && !!astroEnabled?.enabled,
  });

  const handleLinkAstro = async () => {
    setIsLinkingAstro(true);
    try {
      const res = await apiRequest("POST", "/api/astro/link-account", {});
      const result = await res.json();
      if (result.success) {
        toast({ title: "Account linked!", description: "Your loyalty account is now connected." });
        refetchAstro();
      } else {
        toast({ title: "Could not link", description: result.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to link loyalty account. Please try again.", variant: "destructive" });
    } finally {
      setIsLinkingAstro(false);
    }
  };


  // Handle authentication errors and redirects
  useEffect(() => {
    if (error && !userLoading) {
      console.error("Profile authentication error:", error);
      toast({
        title: "Session expired",
        description: "Please sign in again.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    }
  }, [error, userLoading, toast]);

  useEffect(() => {
    setNotifEnabled(!!currentUser?.notificationsEnabled);
  }, [currentUser?.notificationsEnabled]);

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function handleNotificationToggle(enable: boolean) {
    setNotifLoading(true);
    try {
      if (enable) {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          toast({ title: "Not supported", description: "Push notifications are not supported on this browser.", variant: "destructive" });
          setNotifLoading(false);
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast({ title: "Permission denied", description: "Please allow notifications in your browser settings.", variant: "destructive" });
          setNotifLoading(false);
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const vapidRes = await fetch('/api/push/vapid-key');
        const { publicKey } = await vapidRes.json();
        if (reg.active) {
          reg.active.postMessage({ type: 'STORE_VAPID_KEY', key: publicKey });
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const subJson = sub.toJSON();
        await apiRequest('POST', '/api/push/subscribe', {
          subscription: {
            endpoint: subJson.endpoint,
            keys: { p256dh: subJson.keys!.p256dh, auth: subJson.keys!.auth },
          },
        });
        setNotifEnabled(true);
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        toast({ title: "Notifications enabled", description: "You'll get alerts for order updates!" });
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await apiRequest('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint });
          await sub.unsubscribe();
        } else {
          await apiRequest('POST', '/api/push/unsubscribe', {});
        }
        setNotifEnabled(false);
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        toast({ title: "Notifications disabled", description: "You won't receive push notifications anymore." });
      }
    } catch (err: any) {
      console.error('Notification toggle error:', err);
      toast({ title: "Error", description: err.message || "Failed to update notification settings", variant: "destructive" });
    }
    setNotifLoading(false);
  }

  const marketingOptIn = currentUser?.marketingEmailsOptIn !== false;
  const appointmentEmailsOptIn = (currentUser as any)?.appointmentEmailsOptIn !== false;

  const handleMarketingToggle = async (enable: boolean) => {
    try {
      await apiRequest('PUT', '/api/user/marketing-emails', { optIn: enable });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: enable ? "Marketing emails enabled" : "Marketing emails disabled",
        description: enable
          ? "You'll receive promotions and updates from us."
          : "You won't receive marketing emails. Order and important updates will still be sent.",
      });
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to update preference", variant: "destructive" });
    }
  };

  const handleAppointmentEmailToggle = async (enable: boolean) => {
    try {
      await apiRequest('PUT', '/api/user/appointment-emails', { optIn: enable });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: enable ? "Appointment emails enabled" : "Appointment emails disabled",
        description: enable
          ? "You'll receive email alerts when new appointments are booked."
          : "You won't receive appointment booking emails. Push notifications are unaffected.",
      });
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to update preference", variant: "destructive" });
    }
  };

  if (userLoading || !currentUser) {
    return (
      <div className="px-6 py-4 pb-20">
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-gray-200 rounded-full w-20 mx-auto"></div>
          <div className="h-4 bg-gray-200 rounded w-32 mx-auto"></div>
          <div className="h-4 bg-gray-200 rounded w-48 mx-auto"></div>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
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
    window.location.href = '/';
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete') return;
    setIsDeletingAccount(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        localStorage.clear();
        queryClient.clear();
        window.location.href = '/';
      } else {
        const data = await res.json();
        toast({ title: "Could not delete account", description: data.message, variant: "destructive" });
        setIsDeletingAccount(false);
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
      setIsDeletingAccount(false);
    }
  };

  const userInitials = currentUser?.firstName && currentUser?.lastName 
    ? `${currentUser.firstName[0]}${currentUser.lastName[0]}`.toUpperCase()
    : currentUser?.email?.[0]?.toUpperCase() || 'U';

  const userName = currentUser?.firstName && currentUser?.lastName
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : currentUser?.email || 'User';

  // ── Owner / Admin view ───────────────────────────────────────────────────
  // Owners and admins are not customers — hide all customer-facing sections.
  if ((currentUser as any)?.isAdmin) {
    const handleOwnerSignOut = async () => {
      try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
      queryClient.clear();
      window.location.href = "/auth";
    };

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation("/admin")} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">My Account</h1>
        </div>

        <div className="px-4 py-6 space-y-4 max-w-lg mx-auto">
          {/* Avatar + Name */}
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm border">
            <div className="w-16 h-16 bg-brand-red rounded-full mx-auto mb-3 flex items-center justify-center">
              <span className="text-2xl text-white font-bold">{userInitials}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900">{userName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{currentUser?.email}</p>
            <span className="inline-block mt-2 text-xs bg-blue-100 text-blue-700 font-medium px-2.5 py-0.5 rounded-full">
              {(currentUser as any)?.isSuperAdmin ? "Super Admin" : "Store Owner"}
            </span>
          </div>

          {/* Go to Admin Dashboard */}
          <button
            onClick={() => setLocation("/admin")}
            className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-2xl shadow-sm border hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-gray-500" />
              <span className="font-medium text-gray-900">Admin Dashboard</span>
            </div>
            <span className="text-gray-400 text-lg">›</span>
          </button>

          {/* Sign out */}
          <button
            onClick={handleOwnerSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    );
  }
  // ── End owner view ────────────────────────────────────────────────────────

  // ── Employee-only view ────────────────────────────────────────────────────
  // Employees see only their schedule; all customer-facing sections are hidden.
  if ((currentUser as any)?.isEmployee && !(currentUser as any)?.isAdmin) {
    const emp = currentUser as any;
    const days: string[] = emp.defaultWorkDays ?? [];
    const daySlots: Record<string, string> = emp.defaultDaySlots ?? {};
    const fallbackSlot: string = emp.defaultTimeSlot ?? "";
    const DAY_ORDER = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const sortedDays = [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

    const handleEmpSignOut = async () => {
      const savedSlug = localStorage.getItem('active_tenant_slug');
      try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
      if (savedSlug) localStorage.setItem('active_tenant_slug', savedSlug);
      // Clear cached auth state so the router sees the user as logged out immediately
      queryClient.clear();
      window.location.href = "/auth?tab=employee";
    };

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation("/admin")} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">My Profile</h1>
        </div>

        <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
          {/* Avatar + Name */}
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm border">
            <div className="w-16 h-16 bg-brand-red rounded-full mx-auto mb-3 flex items-center justify-center">
              <span className="text-2xl text-white font-bold">{userInitials}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900">{userName}</h2>
          </div>

          {/* Work Schedule */}
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b">
              <Clock className="h-4 w-4 text-brand-red" />
              <h3 className="font-semibold text-gray-900">My Schedule</h3>
            </div>
            {sortedDays.length === 0 ? (
              <p className="text-sm text-gray-500 px-5 py-4">No schedule set — ask your manager.</p>
            ) : (
              <div className="divide-y">
                {sortedDays.map(day => {
                  const slot = daySlots[day] || fallbackSlot || "—";
                  return (
                    <div key={day} className="flex items-center justify-between px-5 py-3">
                      <span className="text-sm font-medium text-gray-700">{day}</span>
                      <span className="text-sm text-gray-500">{slot}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sign out */}
          <button
            onClick={handleEmpSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    );
  }
  // ── End employee view ─────────────────────────────────────────────────────

  return (
    <div className="px-6 py-4 pb-20">
      {/* Profile Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-brand-red rounded-full mx-auto mb-4 flex items-center justify-center">
          {currentUser?.profileImageUrl ? (
            <img 
              src={currentUser.profileImageUrl} 
              alt="Profile" 
              className="w-20 h-20 rounded-full object-cover"
            />
          ) : (
            <span className="text-2xl text-white font-bold">{userInitials}</span>
          )}
        </div>
        <h2 className="text-xl font-bold text-gray-900">{userName}</h2>
        <p className="text-sm text-gray-500">{currentUser?.email}</p>
        <div className="flex justify-center mt-2">
          <Badge variant="secondary" className="bg-green-100 text-green-700">
            Premium Member
          </Badge>
        </div>
      </div>

      {/* Loyalty Card Section */}
      {loyaltyStatus && (
        <div className="mb-8">
          <Card className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 text-white shadow-lg overflow-hidden">
            <CardContent className="p-5 relative">
              <div className="absolute top-2 right-2 opacity-20">
                <Star className="w-16 h-16" />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Gift className="w-5 h-5" />
                <h3 className="text-lg font-bold">Loyalty Rewards</h3>
              </div>
              
              {parseFloat(loyaltyStatus.loyaltyCredits) > 0 && (
                <div className="bg-white/20 backdrop-blur rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Available Credit</span>
                    <span className="text-2xl font-bold">${parseFloat(loyaltyStatus.loyaltyCredits).toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-white/80 mt-1">Apply at checkout!</p>
                </div>
              )}
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Progress to next ${loyaltyStatus.rewardAmount} reward</span>
                  <span className="font-semibold">{Math.round(loyaltyStatus.progressToNextReward)}%</span>
                </div>
                <Progress 
                  value={loyaltyStatus.progressToNextReward} 
                  className="h-3 bg-white/30"
                />
                <div className="flex items-center justify-between text-xs text-white/80">
                  <span>Spent: ${parseFloat(loyaltyStatus.totalSpent).toFixed(2)}</span>
                  <span>Goal: ${loyaltyStatus.spendingThreshold}</span>
                </div>
              </div>
              
              <p className="text-xs text-white/70 mt-3 text-center">
                Earn ${loyaltyStatus.rewardAmount} credit for every ${loyaltyStatus.spendingThreshold} spent!
              </p>
              <p className="text-xs text-white/60 mt-2 text-center border-t border-white/20 pt-2">
                Credits cannot be redeemed on dog food, cat food, cages, tanks, or enclosures. Items may be identified by UPC code, product name, description, or a combination of these.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Astro Loyalty Section — only shown when Astro credentials are configured */}
      {astroEnabled?.enabled && <div className="mb-8">
        <Card className="border-2 border-purple-200 dark:border-purple-800 shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-bold text-gray-900">Astro Loyalty Rewards</h3>
              </div>
              {astroStatus?.linked && (
                <Badge className="bg-purple-600">Linked</Badge>
              )}
            </div>

            {!astroStatus?.linked ? (
              <div className="text-center py-4">
                <Trophy className="w-12 h-12 mx-auto mb-3 text-purple-400" />
                <p className="text-gray-700 font-medium mb-2">Join Our Rewards Program</p>
                <p className="text-sm text-gray-500 mb-4">
                  Link your account to earn rewards on qualifying purchases, 
                  track frequent buyer progress, and redeem exclusive offers.
                </p>
                <Button
                  onClick={handleLinkAstro}
                  disabled={isLinkingAstro}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isLinkingAstro ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Linking...</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" />Link My Account</>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Frequent Buyer Cards */}
                {astroStatus.frequentBuyerCards?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">Frequent Buyer Programs</h4>
                    <div className="space-y-3">
                      {astroStatus.frequentBuyerCards.map((card: any) => {
                        const totalRequired = card.requiredPurchases || 12;
                        const purchaseCount = card.purchases?.length || 0;
                        return (
                          <div key={card.cardId} className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-800">
                            <div className="flex items-start gap-3">
                              {card.programImage && (
                                <img src={card.programImage} alt={card.manufacturer} className="w-10 h-10 rounded object-contain flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm leading-tight">{card.programTitle}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{card.manufacturer}</p>
                                <p className="text-xs text-gray-500">Buy {totalRequired}, Get {card.rewardCount || 1} Free</p>
                              </div>
                              <Badge variant="secondary" className="text-xs flex-shrink-0">
                                {card.status === 'open' ? 'Active' : card.status}
                              </Badge>
                            </div>
                            <div className="mt-3">
                              <div className="flex flex-wrap gap-1.5">
                                {Array.from({ length: totalRequired }).map((_, i) => (
                                  <div 
                                    key={i} 
                                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                                      i < purchaseCount
                                        ? 'bg-green-500 border-green-600 text-white'
                                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
                                    }`}
                                  >
                                    {i < purchaseCount ? '✓' : i + 1}
                                  </div>
                                ))}
                              </div>
                              <p className="text-xs text-gray-500 mt-2">
                                {purchaseCount} of {totalRequired} purchases
                                {purchaseCount >= totalRequired && ' — Reward earned!'}
                              </p>
                            </div>
                            {card.freeGoods?.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {card.freeGoods.filter((fg: any) => !fg.redeemedOn).map((fg: any) => (
                                  <div key={fg.rewardId} className="flex items-center justify-between bg-green-50 dark:bg-green-900/30 rounded p-2">
                                    <span className="text-xs text-green-700 dark:text-green-400 font-medium">
                                      Free: {fg.itemDescription}
                                    </span>
                                    <Badge className="bg-green-600 text-xs">Ready!</Badge>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Offer Rewards */}
                {astroStatus.offerRewards?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-2">Available Offers</h4>
                    <div className="space-y-2">
                      {astroStatus.offerRewards.map((offer: any) => (
                        <div key={offer.rewardId} className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{offer.title}</p>
                              {offer.rebateAmount && (
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                  ${offer.rebateAmount.toFixed(2)} rebate
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">
                              Exp: {new Date(offer.expires).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No data yet */}
                {!astroStatus.frequentBuyerCards?.length && !astroStatus.offerRewards?.length && (
                  <p className="text-sm text-gray-500 text-center py-2">
                    Your rewards will appear here as you make qualifying purchases!
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>}

      {/* My Pets Section — only shown when the store has the pets feature enabled */}
      {petsEnabled && <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">My Pets</h3>
          <Button variant="ghost" size="sm" className="text-brand-blue" onClick={() => setShowAddPet(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add Pet
          </Button>
        </div>
        <div className="space-y-3">
          {customerPets.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-gray-400 mb-2">🐾</div>
                <p className="text-gray-500 text-sm">No pets added yet</p>
              </CardContent>
            </Card>
          ) : (
            customerPets.map((pet: CustomerPet) => (
              <Card key={pet.id} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-brand-orange rounded-full flex items-center justify-center">
                      <span className="text-lg">
                        {pet.species === 'dog' ? '🐕' : 
                         pet.species === 'cat' ? '🐱' : 
                         pet.species === 'bird' ? '🦜' : '🐾'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{pet.name}</h4>
                      <p className="text-sm text-gray-500">
                        {pet.breed && `${pet.breed} • `}{pet.age}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditingPet({ id: pet.id, name: pet.name || '', species: (pet.species as string) || 'dog', breed: pet.breed || '', age: pet.age || '', notes: pet.notes || '' });
                      setShowEditPet(true);
                    }}>
                      <Edit className="w-4 h-4 text-gray-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Dialog open={showAddPet} onOpenChange={setShowAddPet}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add a Pet</DialogTitle>
              <DialogDescription>Add your pet's information to your profile.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="pet-name">Name *</Label>
                <Input
                  id="pet-name"
                  placeholder="Pet's name"
                  value={newPet.name}
                  onChange={(e) => setNewPet({ ...newPet, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="pet-species">Species *</Label>
                <Select value={newPet.species} onValueChange={(value) => setNewPet({ ...newPet, species: value })}>
                  <SelectTrigger id="pet-species">
                    <SelectValue placeholder="Select species" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dog">Dog</SelectItem>
                    <SelectItem value="cat">Cat</SelectItem>
                    <SelectItem value="bird">Bird</SelectItem>
                    <SelectItem value="reptile">Reptile</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pet-breed">Breed</Label>
                <Input
                  id="pet-breed"
                  placeholder="e.g., Chihuahua, Persian, Parakeet"
                  value={newPet.breed}
                  onChange={(e) => setNewPet({ ...newPet, breed: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="pet-age">Age</Label>
                <Input
                  id="pet-age"
                  placeholder="e.g., 3 years"
                  value={newPet.age}
                  onChange={(e) => setNewPet({ ...newPet, age: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="pet-notes">Notes</Label>
                <Textarea
                  id="pet-notes"
                  placeholder="Any special notes about your pet"
                  value={newPet.notes}
                  onChange={(e) => setNewPet({ ...newPet, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <Button
                className="w-full"
                disabled={!newPet.name.trim() || addPetMutation.isPending}
                onClick={() => addPetMutation.mutate(newPet)}
              >
                {addPetMutation.isPending ? "Adding..." : "Add Pet"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Pet Dialog */}
        <Dialog open={showEditPet} onOpenChange={setShowEditPet}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Pet</DialogTitle>
              <DialogDescription>Update your pet's information.</DialogDescription>
            </DialogHeader>
            {editingPet && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-pet-name">Name *</Label>
                  <Input
                    id="edit-pet-name"
                    placeholder="Pet's name"
                    value={editingPet.name}
                    onChange={(e) => setEditingPet({ ...editingPet, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-pet-species">Species *</Label>
                  <Select value={editingPet.species} onValueChange={(value) => setEditingPet({ ...editingPet, species: value })}>
                    <SelectTrigger id="edit-pet-species">
                      <SelectValue placeholder="Select species" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dog">Dog</SelectItem>
                      <SelectItem value="cat">Cat</SelectItem>
                      <SelectItem value="bird">Bird</SelectItem>
                      <SelectItem value="reptile">Reptile</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-pet-breed">Breed</Label>
                  <Input
                    id="edit-pet-breed"
                    placeholder="e.g., Chihuahua, Persian, Parakeet"
                    value={editingPet.breed}
                    onChange={(e) => setEditingPet({ ...editingPet, breed: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-pet-age">Age</Label>
                  <Input
                    id="edit-pet-age"
                    placeholder="e.g., 3 years"
                    value={editingPet.age}
                    onChange={(e) => setEditingPet({ ...editingPet, age: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-pet-notes">Notes</Label>
                  <Textarea
                    id="edit-pet-notes"
                    placeholder="Any special notes about your pet"
                    value={editingPet.notes}
                    onChange={(e) => setEditingPet({ ...editingPet, notes: e.target.value })}
                    rows={2}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!editingPet.name.trim() || editPetMutation.isPending}
                  onClick={() => editPetMutation.mutate(editingPet)}
                >
                  {editPetMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>}

      {/* Quick Actions */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
        <div className="space-y-3">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation('/orders')} data-testid="card-order-history">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <ShoppingBag className="w-5 h-5 text-brand-blue" />
                <span className="font-semibold text-gray-900 flex-1">Order History</span>
                <Badge variant="secondary">{orders.length}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation('/appointments')} data-testid="card-my-appointments">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-brand-blue" />
                <span className="font-semibold text-gray-900 flex-1">My Appointments</span>
                <Badge variant="secondary">{appointments.length}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation('/wishlist')} data-testid="card-wishlist">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Heart className="w-5 h-5 text-brand-red" />
                <span className="font-semibold text-gray-900 flex-1">Wishlist</span>
                <Badge variant="secondary">0</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation('/settings')}>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Settings className="w-5 h-5 text-gray-600" />
                <span className="font-semibold text-gray-900 flex-1">Settings</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Notifications */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Notifications</h3>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {notifEnabled ? (
                  <Bell className="w-5 h-5 text-brand-blue" />
                ) : (
                  <BellOff className="w-5 h-5 text-gray-400" />
                )}
                <div>
                  <span className="font-semibold text-gray-900">Push Notifications</span>
                  <p className="text-xs text-gray-500">
                    {currentUser?.isAdmin 
                      ? "Get notified when new orders come in" 
                      : "Get notified when your order is approved or ready"}
                  </p>
                </div>
              </div>
              {notifLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              ) : (
                <Switch
                  checked={notifEnabled}
                  onCheckedChange={handleNotificationToggle}
                />
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="mt-3">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {marketingOptIn ? (
                  <Mail className="w-5 h-5 text-brand-blue" />
                ) : (
                  <MailX className="w-5 h-5 text-gray-400" />
                )}
                <div>
                  <span className="font-semibold text-gray-900">Marketing Emails</span>
                  <p className="text-xs text-gray-500">
                    Receive promotions, deals, and updates. Order emails are always sent.
                  </p>
                </div>
              </div>
              <Switch
                checked={marketingOptIn}
                onCheckedChange={handleMarketingToggle}
              />
            </div>
          </CardContent>
        </Card>

        {currentUser?.isAdmin && (
          <Card className="mt-3">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {appointmentEmailsOptIn ? (
                    <Calendar className="w-5 h-5 text-brand-blue" />
                  ) : (
                    <Calendar className="w-5 h-5 text-gray-400" />
                  )}
                  <div>
                    <span className="font-semibold text-gray-900">Appointment Emails</span>
                    <p className="text-xs text-gray-500">
                      Receive email alerts when customers book appointments.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={appointmentEmailsOptIn}
                  onCheckedChange={handleAppointmentEmailToggle}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Admin Panel */}
      {currentUser?.isAdmin && (
        <div className="mb-8">
          <Card className="bg-gradient-to-r from-brand-blue to-brand-red text-white">
            <CardContent className="p-4">
              <h3 className="text-lg font-bold mb-3 flex items-center">
                <Shield className="w-5 h-5 mr-2" />
                Admin Panel
              </h3>
              <div className="space-y-2">
                <Button 
                  variant="ghost" 
                  className="w-full bg-black bg-opacity-40 hover:bg-opacity-60 text-white justify-start border border-white/20"
                  onClick={() => setLocation('/admin')}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full bg-black bg-opacity-40 hover:bg-opacity-60 text-white justify-start border border-white/20"
                  onClick={() => setLocation('/admin')}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Manage Inventory
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Feedback Section */}
      <div className="mb-6">
        {feedbackSubmitted ? (
          <Card className="border border-green-200 bg-green-50">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-green-700 mb-1">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">Thank you for your feedback!</span>
              </div>
              <p className="text-xs text-green-600">We really appreciate you taking the time.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-gray-200">
            <CardContent className="p-4">
              {!showFeedback ? (
                <button
                  onClick={() => setShowFeedback(true)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-700 text-sm">Share your feedback</p>
                      <p className="text-xs text-gray-400">Let us know how we're doing</p>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-800 text-sm">How are we doing?</h4>
                    <button onClick={() => setShowFeedback(false)}>
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-2">Your overall rating</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setFeedbackRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          className="p-0.5 focus:outline-none"
                        >
                          <Star
                            className={`w-8 h-8 transition-colors ${
                              star <= (hoverRating || feedbackRating)
                                ? "fill-amber-400 text-amber-400"
                                : "text-gray-200"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <Select value={feedbackCategory} onValueChange={setFeedbackCategory}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Category (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="app">App Experience</SelectItem>
                      <SelectItem value="products">Products</SelectItem>
                      <SelectItem value="grooming">Grooming</SelectItem>
                      <SelectItem value="ordering">Ordering</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>

                  <Textarea
                    placeholder="Any thoughts? (optional)"
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                  />

                  <Button
                    className="w-full"
                    disabled={feedbackRating === 0 || feedbackMutation.isPending}
                    onClick={() => feedbackMutation.mutate()}
                  >
                    {feedbackMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : "Send Feedback"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Logout Button */}
      <Button 
        variant="destructive" 
        className="w-full"
        onClick={handleLogout}
      >
        Sign Out
      </Button>

      {/* Delete Account */}
      <div className="mt-4 text-center">
        <button
          className="text-sm text-gray-400 underline underline-offset-2 hover:text-red-400 transition-colors"
          onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(""); }}
        >
          Delete my account
        </button>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-gray-900 border border-gray-700 text-white max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Account</DialogTitle>
            <DialogDescription className="text-gray-400">
              This will permanently delete your account, order history, appointments, and all personal data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-gray-300 text-sm">Type <span className="font-bold text-white">delete</span> to confirm</Label>
              <Input
                className="mt-2 bg-gray-800 border-gray-600 text-white"
                placeholder="delete"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                autoCapitalize="none"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeletingAccount}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText.toLowerCase() !== 'delete' || isDeletingAccount}
              >
                {isDeletingAccount ? "Deleting..." : "Delete Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
