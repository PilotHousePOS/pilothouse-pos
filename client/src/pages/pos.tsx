import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getActiveTenantSlug } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronLeft, DollarSign, CreditCard, Search, Settings, X,
  ChevronUp, ChevronDown, Pencil, Trash2, Plus, Check, GripVertical,
  Lock, Unlock, Delete, LogOut, UserCircle, Eye, EyeOff,
} from "lucide-react";

interface PosOverrideConfig {
  requirePinForRefund?: boolean;
  requirePinForVoid?: boolean;
  requirePinForDiscount?: boolean;
  requirePinForDrawer?: boolean;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceItem {
  id: string;
  label: string;
  price: number | null;
  color: string; // hex
}

interface PosCategory {
  id: string;
  label: string;
  color: string; // hex
  dbCategory?: string;
  isService?: boolean;
  services?: ServiceItem[];
  isSpecial?: boolean;
}

interface PosConfig {
  categories: PosCategory[];
  tipAmounts: number[];
  giftCardAmounts: number[];
}

interface OrderItem {
  lineId: string;
  name: string;
  sku?: string;
  price: number;
  quantity: number;
  category: string;
}

interface SupplyItem {
  id: number;
  name: string;
  sku: string;
  price: number;
  brand?: string;
  stockQuantity: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  { hex: "#1d4ed8", name: "Blue" },
  { hex: "#2563eb", name: "Light Blue" },
  { hex: "#0369a1", name: "Sky" },
  { hex: "#0284c7", name: "Cyan Dark" },
  { hex: "#0e7490", name: "Cyan" },
  { hex: "#0f766e", name: "Teal" },
  { hex: "#065f46", name: "Emerald" },
  { hex: "#166534", name: "Green" },
  { hex: "#4d7c0f", name: "Lime" },
  { hex: "#ca8a04", name: "Yellow" },
  { hex: "#b45309", name: "Amber" },
  { hex: "#c2410c", name: "Orange Dark" },
  { hex: "#ea580c", name: "Orange" },
  { hex: "#dc2626", name: "Red" },
  { hex: "#991b1b", name: "Dark Red" },
  { hex: "#be123c", name: "Rose" },
  { hex: "#be185d", name: "Pink" },
  { hex: "#9d174d", name: "Deep Pink" },
  { hex: "#7e22ce", name: "Purple" },
  { hex: "#6d28d9", name: "Violet" },
  { hex: "#4338ca", name: "Indigo" },
  { hex: "#4b5563", name: "Gray" },
  { hex: "#374151", name: "Dark Gray" },
  { hex: "#111827", name: "Black" },
];

// DB_CATEGORIES is now loaded dynamically from the tenant's supply_categories.
// The fallback list below is only used if the fetch hasn't resolved yet.
const FALLBACK_DB_CATEGORIES: { value: string; label: string }[] = [];

// Minimal default — the server builds the real default from supply_categories
const DEFAULT_CONFIG: PosConfig = {
  categories: [
    { id: "tips",      label: "Tips",       color: "#4b5563", isSpecial: true },
    { id: "misc",      label: "Misc.",      color: "#374151", isSpecial: true },
    { id: "giftCards", label: "Gift Cards", color: "#be123c", isSpecial: true },
  ],
  tipAmounts: [1, 2, 3, 4, 5, 10, 15, 20],
  giftCardAmounts: [10, 15, 20, 25, 50, 75, 100],
};

function genId() { return Math.random().toString(36).substr(2, 9); }

function genOrderNumber() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `POS-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ─── Color picker sub-component ──────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [custom, setCustom] = useState(value);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-8 gap-1.5">
        {COLOR_PALETTE.map(c => (
          <button
            key={c.hex}
            title={c.name}
            onClick={() => onChange(c.hex)}
            style={{ backgroundColor: c.hex }}
            className={`w-7 h-7 rounded-full border-2 transition-all ${value === c.hex ? "border-white scale-110 shadow-lg" : "border-transparent hover:scale-105"}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
        />
        <span className="text-xs text-gray-400">Custom color</span>
        <button onClick={() => onChange(custom)} className="text-xs bg-gray-600 hover:bg-gray-500 px-2 py-0.5 rounded text-white">Apply</button>
      </div>
    </div>
  );
}

// ─── Category type badge ──────────────────────────────────────────────────────

function TypeBadge({ cat }: { cat: PosCategory }) {
  if (cat.isService) return <span className="text-[10px] bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">Services</span>;
  if (cat.isSpecial) return <span className="text-[10px] bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded">Special</span>;
  return <span className="text-[10px] bg-green-900 text-green-300 px-1.5 py-0.5 rounded">Products</span>;
}

// ─── Main POS Page ─────────────────────────────────────────────────────────────

export default function PosPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const slug = getActiveTenantSlug();

  // ── Order state ──
  const [orderItems, setOrderItems]           = useState<OrderItem[]>([]);
  const [selectedCatId, setSelectedCatId]     = useState<string | null>(null);
  const [showPayment, setShowPayment]         = useState(false);
  const [cashTendered, setCashTendered]       = useState("");
  const [showSearch, setShowSearch]           = useState(false);
  const [searchQuery, setSearchQuery]         = useState("");
  const [customPriceItem, setCustomPriceItem] = useState<{ name: string; category: string } | null>(null);
  const [customPrice, setCustomPrice]         = useState("");
  const [orderNumber]                         = useState(genOrderNumber);
  const [clock, setClock]                     = useState(new Date());

  // ── Auth + override PIN state ──
  const { user } = useAuth();
  const typedUser = user as any;
  const isEmployee = !!typedUser?.isEmployee;

  // ── POS operator lock (shift-based sign-in) ──
  // posLocked = true when no employee is actively signed in at the register.
  // posOperatorName tracks who is currently on the register so their sales
  // stay attributed to them. Starts unlocked because whoever navigated here
  // is already authenticated.
  const [posLocked, setPosLocked]               = useState(false);
  const [posOperatorName, setPosOperatorName]   = useState<string>(() => {
    const u = typedUser;
    if (!u) return "";
    return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Operator";
  });
  const [lockStep, setLockStep]                 = useState<"roster" | "pin" | "adminLogin">("roster");
  const [lockSelected, setLockSelected]         = useState<{ id: number; firstName: string; lastName: string; employeeCode: string } | null>(null);
  const [lockPinEntry, setLockPinEntry]         = useState("");
  const [lockPinError, setLockPinError]         = useState("");
  const [lockPinLoading, setLockPinLoading]     = useState(false);
  const [lockAdminSubTab, setLockAdminSubTab]   = useState<"pin" | "password">("pin");
  const [lockAdminPinEntry, setLockAdminPinEntry] = useState("");
  const [lockAdminPinVisible, setLockAdminPinVisible] = useState(false);
  const [lockAdminShowPassword, setLockAdminShowPassword] = useState(false);
  const [lockAdminEmail, setLockAdminEmail]     = useState("");
  const [lockAdminPassword, setLockAdminPassword] = useState("");
  const [lockAdminError, setLockAdminError]     = useState("");
  const [lockAdminLoading, setLockAdminLoading] = useState(false);

  // Per-action override tracking: each key is a PosOverrideConfig flag unlocked for this session slot
  const [unlockedActions, setUnlockedActions] = useState<Set<keyof PosOverrideConfig>>(new Set());

  const [showOverridePinModal, setShowOverridePinModal] = useState(false);
  const [overrideTarget, setOverrideTarget]             = useState<'settings' | 'pos'>("pos");
  // Which specific action this override is for (null = settings access)
  const [overridePurpose, setOverridePurpose]           = useState<keyof PosOverrideConfig | null>(null);
  const [overridePinEntry, setOverridePinEntry]         = useState("");
  const [overridePinError, setOverridePinError]         = useState("");
  const [overridePinLoading, setOverridePinLoading]     = useState(false);

  // Human-readable labels for each override purpose (shown in the PIN modal and audit log)
  const PURPOSE_LABELS: Record<keyof PosOverrideConfig, string> = {
    requirePinForRefund:   "Refund override",
    requirePinForVoid:     "Void override",
    requirePinForDiscount: "Discount override",
    requirePinForDrawer:   "Open Drawer override",
  };

  const openOverride = (target: 'settings' | 'pos', purpose?: keyof PosOverrideConfig) => {
    setOverrideTarget(target);
    setOverridePurpose(purpose ?? null);
    setOverridePinEntry("");
    setOverridePinError("");
    setShowOverridePinModal(true);
  };

  const handleOverrideDigit = async (d: string) => {
    if (overridePinEntry.length >= 4 || overridePinLoading) return;
    const next = overridePinEntry + d;
    setOverridePinEntry(next);
    setOverridePinError("");
    if (next.length === 4) {
      setOverridePinLoading(true);
      try {
        // Build an action string that names the specific purpose so the audit log is accurate
        const auditAction = overrideTarget === 'settings'
          ? 'pos_settings_access'
          : overridePurpose
            ? `pos_action_override_${overridePurpose}`
            : 'pos_action_override';
        const res = await apiRequest("POST", "/api/auth/admin-override", {
          pin: next,
          action: auditAction,
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setShowOverridePinModal(false);
          if (overrideTarget === 'settings') {
            setShowSettings(true);
          } else if (overridePurpose) {
            // Unlock only the specific action that was requested
            setUnlockedActions(prev => { const next = new Set(Array.from(prev)); next.add(overridePurpose!); return next; });
          }
        } else {
          setOverridePinError(data.message || "Incorrect PIN");
          setOverridePinEntry("");
        }
      } catch {
        setOverridePinError("Override check failed");
        setOverridePinEntry("");
      } finally {
        setOverridePinLoading(false);
      }
    }
  };
  const handleOverrideBack = () => { setOverridePinEntry(prev => prev.slice(0, -1)); setOverridePinError(""); };
  const overrideDigits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  // POS override configuration (which actions require PIN) — readable by all authenticated users
  const { data: posOverrideConfig = {} } = useQuery<PosOverrideConfig>({
    queryKey: ["/api/admin/pos-override-config"],
    staleTime: 5 * 60_000,
  });

  // Helper: does this employee still need an override for a given action?
  // Returns false if the action has already been unlocked this session.
  const needsOverride = (flag: keyof PosOverrideConfig) =>
    isEmployee && !!posOverrideConfig[flag] && !unlockedActions.has(flag);

  // Consume (clear) a per-action unlock after the action is performed
  const consumeOverride = (flag: keyof PosOverrideConfig) => {
    setUnlockedActions(prev => { const next = new Set(prev); next.delete(flag); return next; });
  };

  // ── Settings state ──
  const [showSettings, setShowSettings]         = useState(false);
  const [settingsTab, setSettingsTab]           = useState<"categories" | "amounts">("categories");
  const [editingCatId, setEditingCatId]         = useState<string | null>(null); // cat id being edited, or "new"
  const [editDraft, setEditDraft]               = useState<PosCategory | null>(null);
  const [editSvcIdx, setEditSvcIdx]             = useState<number | null>(null); // sub-button being edited
  const [svcDraft, setSvcDraft]                 = useState<ServiceItem | null>(null);
  const [newTipAmt, setNewTipAmt]               = useState("");
  const [newGcAmt, setNewGcAmt]                 = useState("");

  // ── Active POS config (loaded from API, falls back to defaults) ──
  const [posConfig, setPosConfig] = useState<PosConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Block back-navigation while the POS is locked — the terminal must not be
  // abandoned mid-shift without a signed-in operator.
  useEffect(() => {
    if (!posLocked) return;
    window.history.pushState(null, "", window.location.pathname);
    const handlePop = () => window.history.pushState(null, "", window.location.pathname);
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [posLocked]);

  // ── Roster (for POS lock screen sign-in) ──
  const { data: empRoster = [] } = useQuery<{ id: number; firstName: string; lastName: string; employeeCode: string }[]>({
    queryKey: ["/api/employee/roster"],
    queryFn: async () => {
      const res = await fetch("/api/employee/roster", { headers: slug ? { "X-Tenant-Slug": slug } : {} });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  // Sign the current operator out and lock the terminal
  const handlePosSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    queryClient.clear();
    setPosLocked(true);
    setPosOperatorName("");
    setLockStep("roster");
    setLockSelected(null);
    setLockPinEntry("");
    setLockPinError("");
  };

  // Handle a digit press on the lock-screen PIN pad
  const handleLockPinDigit = async (d: string) => {
    if (lockPinEntry.length >= 4 || lockPinLoading) return;
    const next = lockPinEntry + d;
    setLockPinEntry(next);
    setLockPinError("");
    if (next.length === 4 && lockSelected) {
      setLockPinLoading(true);
      try {
        const res = await fetch("/api/auth/employee-pin-login", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(slug ? { "X-Tenant-Slug": slug } : {}) },
          body: JSON.stringify({ employeeCode: lockSelected.employeeCode, pin: next }),
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok) {
          queryClient.invalidateQueries();
          const name = [lockSelected.firstName, lockSelected.lastName].filter(Boolean).join(" ") || lockSelected.employeeCode;
          setPosOperatorName(name);
          setPosLocked(false);
          setLockStep("roster");
          setLockSelected(null);
          setLockPinEntry("");
        } else {
          setLockPinError(data.message || "Incorrect PIN");
          setLockPinEntry("");
        }
      } catch {
        setLockPinError("Sign-in failed. Try again.");
        setLockPinEntry("");
      } finally {
        setLockPinLoading(false);
      }
    }
  };
  const handleLockPinBack = () => { setLockPinEntry(p => p.slice(0, -1)); setLockPinError(""); };
  const lockPadDigits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  // Admin PIN sign-in on the lock screen (no employee code needed)
  const handleLockAdminPinDigit = async (d: string) => {
    if (lockAdminPinEntry.length >= 4 || lockAdminLoading) return;
    const next = lockAdminPinEntry + d;
    setLockAdminPinEntry(next);
    setLockAdminError("");
    if (next.length === 4) {
      setLockAdminLoading(true);
      try {
        const res = await fetch("/api/auth/pos-admin-pin-login", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(slug ? { "X-Tenant-Slug": slug } : {}) },
          body: JSON.stringify({ pin: next }),
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok) {
          queryClient.invalidateQueries();
          const name = [data.firstName, data.lastName].filter(Boolean).join(" ") || data.email || "Admin";
          setPosOperatorName(name);
          setPosLocked(false);
          setLockStep("roster");
          setLockAdminPinEntry("");
        } else {
          setLockAdminError(data.message || "Incorrect PIN");
          setLockAdminPinEntry("");
        }
      } catch {
        setLockAdminError("Sign-in failed. Try again.");
        setLockAdminPinEntry("");
      } finally {
        setLockAdminLoading(false);
      }
    }
  };
  const handleLockAdminPinBack = () => { setLockAdminPinEntry(p => p.slice(0, -1)); setLockAdminError(""); };

  // Full email + password sign-in for admins / owners on the lock screen
  const handleLockAdminLogin = async () => {
    if (!lockAdminEmail || !lockAdminPassword) { setLockAdminError("Email and password are required."); return; }
    setLockAdminLoading(true);
    setLockAdminError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(slug ? { "X-Tenant-Slug": slug } : {}) },
        body: JSON.stringify({ email: lockAdminEmail, password: lockAdminPassword }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        queryClient.invalidateQueries();
        const name = [data.firstName, data.lastName].filter(Boolean).join(" ") || data.email || "Admin";
        setPosOperatorName(name);
        setPosLocked(false);
        setLockStep("roster");
        setLockAdminEmail("");
        setLockAdminPassword("");
      } else {
        setLockAdminError(data.message || "Invalid credentials.");
      }
    } catch {
      setLockAdminError("Login failed. Check your connection.");
    } finally {
      setLockAdminLoading(false);
    }
  };

  // ── Data queries ──
  const { data: layoutData } = useQuery<PosConfig | null>({
    queryKey: ["/api/pos/layout"],
    staleTime: Infinity,
  });

  useEffect(() => {
    if (layoutData) setPosConfig(layoutData);
  }, [layoutData]);

  const selectedCat = posConfig.categories.find(c => c.id === selectedCatId) ?? null;

  const { data: categoryItems = [] } = useQuery<SupplyItem[]>({
    queryKey: [`/api/pos/items?category=${selectedCatId}`],
    enabled: !!selectedCatId && !!selectedCat?.dbCategory,
  });

  const { data: searchResults = [] } = useQuery<SupplyItem[]>({
    queryKey: [`/api/pos/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.length >= 2,
  });

  const { data: taxSettings } = useQuery<{ taxRate: number }>({
    queryKey: ["/api/settings/tax-rate"],
    staleTime: 5 * 60 * 1000,
  });

  // ── Mutations ──
  const saveOrderMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/pos/order", data),
    onSuccess: () => {
      toast({ title: "Sale complete", description: `Order ${orderNumber} saved` });
      setOrderItems([]);
      setShowPayment(false);
      setCashTendered("");
    },
    onError: () => toast({ title: "Error", description: "Failed to save order", variant: "destructive" }),
  });

  const saveLayoutMutation = useMutation({
    mutationFn: (config: PosConfig) => apiRequest("PUT", "/api/admin/pos/layout", config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos/layout"] });
      toast({ title: "Layout saved", description: "POS settings updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save layout", variant: "destructive" }),
  });

  // ── Tenant supply categories (for the "Inventory Category" picker in settings) ──
  const { data: tenantCategories = [] } = useQuery<{ key: string; label: string }[]>({
    queryKey: ["/api/admin/categories"],
    staleTime: 5 * 60 * 1000,
  });
  const dbCategories = tenantCategories.length > 0
    ? tenantCategories.map(c => ({ value: c.key, label: c.label }))
    : FALLBACK_DB_CATEGORIES;

  // ── Totals ──
  const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const taxRate  = (taxSettings?.taxRate ?? 10.99) / 100;
  const tax      = subtotal * taxRate;
  const total    = subtotal + tax;
  const tendered = parseFloat(cashTendered) || 0;
  const change   = tendered - total;

  // ── Order handlers ──
  const addItem = useCallback((name: string, price: number, category: string, sku?: string) => {
    setOrderItems(prev => {
      const existing = prev.find(i => i.name === name && i.sku === sku);
      if (existing) return prev.map(i => i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { lineId: genId(), name, price, quantity: 1, category, sku }];
    });
  }, []);

  const addService = (svc: ServiceItem, catLabel: string) => {
    if (svc.price === null) {
      setCustomPriceItem({ name: svc.label, category: catLabel });
      setCustomPrice("");
    } else {
      addItem(svc.label, svc.price, "grooming");
    }
  };

  const confirmCustomPrice = () => {
    const p = parseFloat(customPrice);
    if (!p || p <= 0) return;
    addItem(customPriceItem!.name, p, customPriceItem!.category);
    setCustomPriceItem(null);
    setCustomPrice("");
  };

  const changeQty = (lineId: string, delta: number) =>
    setOrderItems(prev => prev.map(i => i.lineId === lineId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  const removeLine    = (lineId: string) => setOrderItems(prev => prev.filter(i => i.lineId !== lineId));
  const removeLastLine = () => setOrderItems(prev => prev.slice(0, -1));
  const clearAll       = () => { setOrderItems([]); setSelectedCatId(null); };

  const pay = (method: "cash" | "credit") => {
    if (!orderItems.length) return;
    if (method === "cash") { setShowPayment(true); }
    else { saveOrderMutation.mutate({ orderNumber, items: orderItems, subtotal, tax, total, paymentMethod: "credit" }); }
  };

  const completeCash = () => {
    if (tendered < total) {
      toast({ title: "Insufficient payment", description: `Need $${total.toFixed(2)}, received $${tendered.toFixed(2)}`, variant: "destructive" });
      return;
    }
    saveOrderMutation.mutate({ orderNumber, items: orderItems, subtotal, tax, total, paymentMethod: "cash", amountTendered: tendered, changeDue: change });
  };

  // ── Settings: category CRUD ──
  const startEditCat = (cat: PosCategory) => {
    setEditDraft({ ...cat, services: cat.services ? [...cat.services.map(s => ({ ...s }))] : [] });
    setEditingCatId(cat.id);
    setEditSvcIdx(null);
    setSvcDraft(null);
  };

  const startNewCat = () => {
    const draft: PosCategory = { id: genId(), label: "New Category", color: "#1d4ed8", dbCategory: "other" };
    setEditDraft(draft);
    setEditingCatId("new");
    setEditSvcIdx(null);
    setSvcDraft(null);
  };

  const cancelEdit = () => { setEditingCatId(null); setEditDraft(null); setEditSvcIdx(null); setSvcDraft(null); };

  const saveCatEdit = () => {
    if (!editDraft) return;
    const updated = { ...posConfig };
    if (editingCatId === "new") {
      updated.categories = [...updated.categories, editDraft];
    } else {
      updated.categories = updated.categories.map(c => c.id === editDraft.id ? editDraft : c);
    }
    setPosConfig(updated);
    saveLayoutMutation.mutate(updated);
    cancelEdit();
  };

  const deleteCat = (id: string) => {
    const updated = { ...posConfig, categories: posConfig.categories.filter(c => c.id !== id) };
    setPosConfig(updated);
    saveLayoutMutation.mutate(updated);
    if (selectedCatId === id) setSelectedCatId(null);
  };

  const moveCat = (id: string, dir: -1 | 1) => {
    const cats = [...posConfig.categories];
    const idx = cats.findIndex(c => c.id === id);
    const target = idx + dir;
    if (target < 0 || target >= cats.length) return;
    [cats[idx], cats[target]] = [cats[target], cats[idx]];
    const updated = { ...posConfig, categories: cats };
    setPosConfig(updated);
    saveLayoutMutation.mutate(updated);
  };

  // ── Settings: sub-button CRUD ──
  const startNewSvc = () => {
    setSvcDraft({ id: genId(), label: "New Service", price: null, color: "#2563eb" });
    setEditSvcIdx(-1); // -1 = new
  };

  const startEditSvc = (idx: number) => {
    if (!editDraft?.services) return;
    setSvcDraft({ ...editDraft.services[idx] });
    setEditSvcIdx(idx);
  };

  const saveSvc = () => {
    if (!svcDraft || !editDraft) return;
    const svcs = editDraft.services ? [...editDraft.services] : [];
    if (editSvcIdx === -1) {
      svcs.push(svcDraft);
    } else if (editSvcIdx !== null) {
      svcs[editSvcIdx] = svcDraft;
    }
    setEditDraft({ ...editDraft, services: svcs });
    setEditSvcIdx(null);
    setSvcDraft(null);
  };

  const deleteSvc = (idx: number) => {
    if (!editDraft?.services) return;
    const svcs = editDraft.services.filter((_, i) => i !== idx);
    setEditDraft({ ...editDraft, services: svcs });
  };

  // ── Settings: quick amounts ──
  const saveAmounts = (updated: PosConfig) => {
    setPosConfig(updated);
    saveLayoutMutation.mutate(updated);
  };

  const addTipAmt = () => {
    const n = parseFloat(newTipAmt);
    if (!n || n <= 0) return;
    const amounts = [...posConfig.tipAmounts, n].sort((a, b) => a - b);
    saveAmounts({ ...posConfig, tipAmounts: amounts });
    setNewTipAmt("");
  };

  const removeTipAmt = (amt: number) => {
    saveAmounts({ ...posConfig, tipAmounts: posConfig.tipAmounts.filter(a => a !== amt) });
  };

  const addGcAmt = () => {
    const n = parseFloat(newGcAmt);
    if (!n || n <= 0) return;
    const amounts = [...posConfig.giftCardAmounts, n].sort((a, b) => a - b);
    saveAmounts({ ...posConfig, giftCardAmounts: amounts });
    setNewGcAmt("");
  };

  const removeGcAmt = (amt: number) => {
    saveAmounts({ ...posConfig, giftCardAmounts: posConfig.giftCardAmounts.filter(a => a !== amt) });
  };

  const timeStr = clock.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  const dateStr = clock.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden select-none">

      {/* ── Top bar ── */}
      <div className="bg-gray-800 border-b border-gray-700 px-3 py-1.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          {!posLocked && (
            <button onClick={() => setLocation(isEmployee ? "/" : "/admin")} className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-300">
              <ChevronLeft className="h-3 w-3" /> Back
            </button>
          )}
          <span className="text-sm font-bold">PilotHouse</span>
          <span className="text-xs bg-blue-700 px-2 py-0.5 rounded font-semibold">IN STORE</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Current operator chip + sign-out */}
          {!posLocked && posOperatorName && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs bg-gray-700 px-2.5 py-1.5 rounded border border-gray-600">
                <UserCircle className="h-3.5 w-3.5 text-green-400" />
                <span className="text-gray-200 font-medium">{posOperatorName}</span>
              </div>
              <button
                onClick={handlePosSignOut}
                className="flex items-center gap-1.5 text-xs bg-red-900/70 hover:bg-red-700 px-2.5 py-1.5 rounded text-red-300 hover:text-white border border-red-800 hover:border-red-600 transition-colors"
                title="Sign out of this register session"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign Out
              </button>
            </div>
          )}
          <div className="text-right">
            <div className="text-sm font-mono font-bold">{timeStr}</div>
            <div className="text-xs text-gray-400">{dateStr}</div>
          </div>
          {!posLocked && (
            <button
              onClick={() => isEmployee ? openOverride('settings') : setShowSettings(true)}
              className="flex items-center gap-1.5 text-xs bg-gray-700 hover:bg-gray-600 px-2.5 py-1.5 rounded text-gray-300 border border-gray-600"
            >
              {isEmployee ? <Lock className="h-3.5 w-3.5" /> : <Settings className="h-3.5 w-3.5" />} Settings
            </button>
          )}
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Order cart */}
        <div className="w-72 flex flex-col border-r border-gray-700 flex-shrink-0" style={{ background: "#1a1f2e" }}>
          <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
            <div className="text-xs text-gray-400">Order #</div>
            <div className="text-xs font-mono text-yellow-400">{orderNumber}</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {orderItems.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-gray-600 text-xs">No items added</div>
            ) : (
              <div className="divide-y divide-gray-700/50">
                {orderItems.map(item => (
                  <div key={item.lineId} className="px-3 py-2 hover:bg-white/5">
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium leading-tight truncate">{item.name}</div>
                        <div className="text-xs text-gray-500">${item.price.toFixed(2)} ea</div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => changeQty(item.lineId, -1)} className="w-5 h-5 bg-gray-600 hover:bg-gray-500 rounded text-xs flex items-center justify-center leading-none">−</button>
                        <span className="text-xs w-4 text-center font-semibold">{item.quantity}</span>
                        <button onClick={() => changeQty(item.lineId, 1)}  className="w-5 h-5 bg-gray-600 hover:bg-gray-500 rounded text-xs flex items-center justify-center leading-none">+</button>
                        <button onClick={() => removeLine(item.lineId)} className="w-5 h-5 bg-red-900/70 hover:bg-red-700 rounded text-xs flex items-center justify-center ml-0.5">×</button>
                      </div>
                    </div>
                    <div className="text-right text-xs text-green-400 font-semibold">${(item.price * item.quantity).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-gray-700 px-3 py-2 space-y-0.5 flex-shrink-0">
            <div className="flex justify-between text-xs text-gray-400"><span>Item Count</span><span>{orderItems.reduce((s, i) => s + i.quantity, 0)}</span></div>
            <div className="flex justify-between text-xs text-gray-400"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs text-gray-400"><span>Discount</span><span>0.00</span></div>
            <div className="flex justify-between text-xs text-gray-400"><span>Tax</span><span>${tax.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs text-gray-400"><span>Tip</span><span>0.00</span></div>
            <div className="flex justify-between text-sm font-bold text-white border-t border-gray-600 pt-1 mt-1"><span>Total</span><span>${total.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs text-gray-400"><span>Paid</span><span>0.00</span></div>
            <div className="flex justify-between text-xs font-semibold text-yellow-400"><span>Balance Due</span><span>${total.toFixed(2)}</span></div>
          </div>
        </div>

        {/* CENTER: Categories + Item grid */}
        <div className="flex-1 flex overflow-hidden">
          {/* Category column */}
          <div className="w-44 border-r border-gray-700 overflow-y-auto flex-shrink-0 bg-gray-800/80">
            <div className="p-1.5 space-y-1">
              {posConfig.categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCatId(selectedCatId === cat.id ? null : cat.id)}
                  style={{ backgroundColor: cat.color }}
                  className={`w-full text-left px-3 py-2.5 rounded text-xs font-semibold text-white transition-all ${selectedCatId === cat.id ? "ring-2 ring-white ring-offset-1 ring-offset-gray-800 brightness-110" : "opacity-90 hover:opacity-100 hover:brightness-110"}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Item grid */}
          <div className="flex-1 overflow-y-auto bg-gray-900 p-2">
            {!selectedCatId && (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                <div className="text-4xl">🐾</div>
                <div className="text-sm">Select a category or scan an item</div>
              </div>
            )}

            {/* Services */}
            {selectedCat?.isService && selectedCat.services && (
              <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {selectedCat.services.map(svc => (
                  <button key={svc.id} onClick={() => addService(svc, selectedCat.label)}
                    style={{ backgroundColor: svc.color }}
                    className="text-white rounded p-3 text-center hover:brightness-110 active:scale-95 transition-all min-h-[70px] flex flex-col items-center justify-center">
                    <div className="text-sm font-semibold">{svc.label}</div>
                    {svc.price !== null
                      ? <div className="text-xs mt-1 text-white/80">${svc.price.toFixed(2)}</div>
                      : <div className="text-xs mt-1 text-blue-200">Tap for price</div>
                    }
                  </button>
                ))}
              </div>
            )}

            {/* DB category products */}
            {selectedCat?.dbCategory && (
              <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                {(categoryItems as SupplyItem[]).map(item => (
                  <button key={item.id} onClick={() => addItem(item.name, Number(item.price), selectedCatId!, item.sku)}
                    className="bg-gray-700 hover:bg-gray-600 active:scale-95 text-white rounded p-2 text-center transition-all min-h-[70px] flex flex-col items-center justify-center border border-gray-600 hover:border-gray-400">
                    <div className="text-xs font-medium leading-tight line-clamp-3">{item.name}</div>
                    <div className="text-xs text-green-400 font-semibold mt-1">${Number(item.price).toFixed(2)}</div>
                  </button>
                ))}
                {(categoryItems as SupplyItem[]).length === 0 && (
                  <div className="col-span-3 text-center text-gray-500 text-sm py-8">No items in this category</div>
                )}
              </div>
            )}

            {/* Tips */}
            {selectedCatId === "tips" && (
              <div className="grid grid-cols-4 gap-2">
                {posConfig.tipAmounts.map(amt => (
                  <button key={amt} onClick={() => addItem("Tip", amt, "tips")}
                    className="bg-gray-600 hover:bg-gray-500 text-white rounded p-3 text-center active:scale-95 min-h-[60px] font-bold text-sm">${amt}.00</button>
                ))}
                <button onClick={() => { setCustomPriceItem({ name: "Tip", category: "tips" }); setCustomPrice(""); }}
                  className="bg-gray-500 hover:bg-gray-400 text-white rounded p-3 text-center active:scale-95 min-h-[60px] col-span-2 font-semibold text-sm">Custom Tip</button>
              </div>
            )}

            {/* Misc */}
            {selectedCatId === "misc" && (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <div className="text-gray-400 text-sm">Enter a custom misc item</div>
                <button onClick={() => { setCustomPriceItem({ name: "Misc Item", category: "misc" }); setCustomPrice(""); }}
                  className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-3 rounded font-semibold">Add Misc Item</button>
              </div>
            )}

            {/* Gift Cards */}
            {selectedCatId === "giftCards" && (
              <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {posConfig.giftCardAmounts.map(amt => (
                  <button key={amt} onClick={() => addItem(`Gift Card - $${amt}`, amt, "giftCards")}
                    className="bg-rose-700 hover:bg-rose-600 text-white rounded p-3 text-center active:scale-95 min-h-[60px]">
                    <div className="text-sm font-bold">${amt}.00</div>
                    <div className="text-xs opacity-80">Gift Card</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Action buttons */}
        <div className="w-28 bg-gray-800 border-l border-gray-700 flex flex-col gap-1 p-1.5 flex-shrink-0">
          <button onClick={() => setLocation("/admin")} className="bg-green-700 hover:bg-green-600 text-white rounded py-3 text-xs font-bold text-center">Register</button>
          <button disabled className="bg-gray-700 text-gray-500 rounded py-3 text-xs text-center cursor-not-allowed">Order Details</button>
          <button onClick={() => pay("credit")} disabled={!orderItems.length} className="bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded py-3 text-xs font-bold text-center">Pay</button>
          <button disabled className="bg-gray-700 text-gray-500 rounded py-3 text-xs text-center cursor-not-allowed">Save Order</button>
          <button disabled className="bg-gray-700 text-gray-500 rounded py-3 text-xs text-center cursor-not-allowed">Get Order</button>
          <button disabled className="bg-gray-700 text-gray-500 rounded py-3 text-xs text-center cursor-not-allowed">Print Order</button>
          <button disabled className="bg-gray-700 text-gray-500 rounded py-3 text-xs text-center cursor-not-allowed">Print Sale</button>
          <button onClick={() => setShowSearch(true)} className="bg-indigo-700 hover:bg-indigo-600 text-white rounded py-3 text-xs font-bold text-center">Find Items</button>

          {/* Refund — gated per posOverrideConfig.requirePinForRefund for employees */}
          <button
            onClick={() => {
              if (needsOverride('requirePinForRefund')) {
                openOverride('pos', 'requirePinForRefund');
                return;
              }
              consumeOverride('requirePinForRefund');
              // TODO: open refund flow
            }}
            disabled={!orderItems.length}
            className={`${needsOverride('requirePinForRefund') ? "bg-gray-700 text-gray-400" : unlockedActions.has('requirePinForRefund') ? "bg-amber-600 hover:bg-amber-500 text-white ring-1 ring-amber-400" : "bg-orange-700 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white"} rounded py-3 text-xs font-bold text-center flex items-center justify-center gap-1 transition-all`}
            title={needsOverride('requirePinForRefund') ? "Manager override required" : unlockedActions.has('requirePinForRefund') ? "Override active — tap to proceed" : "Issue refund"}
          >
            {needsOverride('requirePinForRefund') ? <Lock className="h-3 w-3" /> : unlockedActions.has('requirePinForRefund') ? <Unlock className="h-3 w-3" /> : null} Refund
          </button>

          {/* Void — gated per posOverrideConfig.requirePinForVoid for employees */}
          <button
            onClick={() => {
              if (needsOverride('requirePinForVoid')) {
                openOverride('pos', 'requirePinForVoid');
                return;
              }
              consumeOverride('requirePinForVoid');
              // TODO: open void flow
            }}
            disabled={!orderItems.length}
            className={`${needsOverride('requirePinForVoid') ? "bg-gray-700 text-gray-400" : unlockedActions.has('requirePinForVoid') ? "bg-amber-600 hover:bg-amber-500 text-white ring-1 ring-amber-400" : "bg-red-800 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white"} rounded py-3 text-xs font-bold text-center flex items-center justify-center gap-1 transition-all`}
            title={needsOverride('requirePinForVoid') ? "Manager override required" : unlockedActions.has('requirePinForVoid') ? "Override active — tap to proceed" : "Void transaction"}
          >
            {needsOverride('requirePinForVoid') ? <Lock className="h-3 w-3" /> : unlockedActions.has('requirePinForVoid') ? <Unlock className="h-3 w-3" /> : null} Void
          </button>

          {/* Discount — gated per posOverrideConfig.requirePinForDiscount for employees */}
          <button
            onClick={() => {
              if (needsOverride('requirePinForDiscount')) {
                openOverride('pos', 'requirePinForDiscount');
                return;
              }
              consumeOverride('requirePinForDiscount');
              // TODO: open discount flow
            }}
            disabled={!orderItems.length}
            className={`${needsOverride('requirePinForDiscount') ? "bg-gray-700 text-gray-400" : unlockedActions.has('requirePinForDiscount') ? "bg-amber-600 hover:bg-amber-500 text-white ring-1 ring-amber-400" : "bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white"} rounded py-3 text-xs font-bold text-center flex items-center justify-center gap-1 transition-all`}
            title={needsOverride('requirePinForDiscount') ? "Manager override required" : unlockedActions.has('requirePinForDiscount') ? "Override active — tap to proceed" : "Apply discount"}
          >
            {needsOverride('requirePinForDiscount') ? <Lock className="h-3 w-3" /> : unlockedActions.has('requirePinForDiscount') ? <Unlock className="h-3 w-3" /> : null} Discount
          </button>

          {/* Open Drawer — gated per posOverrideConfig.requirePinForDrawer for employees */}
          <button
            onClick={() => {
              if (needsOverride('requirePinForDrawer')) {
                openOverride('pos', 'requirePinForDrawer');
                return;
              }
              consumeOverride('requirePinForDrawer');
              // TODO: open cash drawer
            }}
            className={`${needsOverride('requirePinForDrawer') ? "bg-gray-700 text-gray-400" : unlockedActions.has('requirePinForDrawer') ? "bg-amber-600 hover:bg-amber-500 text-white ring-1 ring-amber-400" : "bg-teal-700 hover:bg-teal-600 text-white"} rounded py-3 text-xs font-bold text-center flex items-center justify-center gap-1 transition-all`}
            title={needsOverride('requirePinForDrawer') ? "Manager override required" : unlockedActions.has('requirePinForDrawer') ? "Override active — tap to open" : "Open cash drawer"}
          >
            {needsOverride('requirePinForDrawer') ? <Lock className="h-3 w-3" /> : unlockedActions.has('requirePinForDrawer') ? <Unlock className="h-3 w-3" /> : null} Drawer
          </button>

          <div className="flex-1" />
          <button onClick={removeLastLine} disabled={!orderItems.length} className="bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded py-3 text-xs font-bold text-center">Remove Line</button>
          <button onClick={clearAll} disabled={!orderItems.length} className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded py-3 text-xs font-bold text-center">Clear All</button>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="bg-gray-800 border-t border-gray-700 p-2 flex gap-2 flex-shrink-0">
        <button onClick={() => pay("cash")} disabled={!orderItems.length}
          className="flex-1 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded py-3 font-bold text-sm flex items-center justify-center gap-2">
          <DollarSign className="h-4 w-4" /> Cash
        </button>
        <button onClick={() => pay("credit")} disabled={!orderItems.length}
          className="flex-1 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded py-3 font-bold text-sm flex items-center justify-center gap-2">
          <CreditCard className="h-4 w-4" /> Credit
        </button>
        <button onClick={() => setShowSearch(true)}
          className="px-8 bg-gray-600 hover:bg-gray-500 text-white rounded py-3 font-semibold text-sm flex items-center justify-center gap-2">
          <Search className="h-4 w-4" /> Scan / Search
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          POS LOCK SCREEN — shown when no operator is signed in
          The POS UI underneath remains visible but is non-interactive.
      ═══════════════════════════════════════════════════════════════════════ */}
      {posLocked && (
        <div className="fixed inset-0 z-[55] flex flex-col" style={{ background: "rgba(5, 8, 18, 0.93)" }}>

          {/* ── Locked top bar ── */}
          <div className="bg-gray-800 border-b border-gray-700 px-3 py-1.5 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-white">PilotHouse</span>
              <span className="text-xs bg-blue-700 px-2 py-0.5 rounded font-semibold">IN STORE</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-mono font-bold text-white">{timeStr}</div>
                <div className="text-xs text-gray-400">{dateStr}</div>
              </div>
              {/* Highlighted sign-in prompt */}
              <div className="flex items-center gap-1.5 text-xs bg-green-600 px-3 py-1.5 rounded text-white font-bold ring-2 ring-green-400 ring-offset-1 ring-offset-gray-800 animate-pulse">
                <Lock className="h-3.5 w-3.5" /> Sign In to Continue
              </div>
            </div>
          </div>

          {/* ── Sign-in card ── */}
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm">

              {/* Card header */}
              <div className="px-6 pt-6 pb-4 border-b border-gray-800 text-center">
                <div className="w-12 h-12 rounded-full bg-green-700 flex items-center justify-center mx-auto mb-3">
                  <UserCircle className="h-7 w-7 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">
                  {lockStep === "roster" ? "Who's at the register?"
                    : lockStep === "pin" ? `Welcome, ${lockSelected?.firstName}`
                    : "Admin Sign In"}
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  {lockStep === "roster" ? "Select your name to sign in"
                    : lockStep === "pin" ? "Enter your PIN to continue"
                    : "Use your PIN or email & password"}
                </p>
              </div>

              {/* ── STEP 1: Employee roster ── */}
              {lockStep === "roster" && (
                <div className="p-4">
                  {empRoster.length === 0 ? (
                    <p className="text-center text-gray-500 text-sm py-6">No employees found for this store.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                      {empRoster.map(emp => {
                        const initials = [emp.firstName?.[0], emp.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
                        return (
                          <button
                            key={emp.id}
                            onClick={() => { setLockSelected(emp); setLockStep("pin"); setLockPinEntry(""); setLockPinError(""); }}
                            className="flex flex-col items-center gap-2 p-3 bg-gray-800 hover:bg-gray-700 rounded-xl border border-gray-700 hover:border-green-500 transition-all active:scale-95"
                          >
                            <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center text-white font-bold text-sm">
                              {initials}
                            </div>
                            <span className="text-xs text-gray-300 text-center leading-tight">
                              {emp.firstName} {emp.lastName}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── STEP 2: PIN entry ── */}
              {lockStep === "pin" && lockSelected && (
                <div className="p-5 space-y-4">
                  {/* PIN dots */}
                  <div className="flex justify-center gap-4">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < lockPinEntry.length ? "bg-green-400 border-green-400 scale-110" : "bg-transparent border-gray-500"}`} />
                    ))}
                  </div>
                  {lockPinError && <p className="text-center text-red-400 text-xs animate-pulse">{lockPinError}</p>}

                  {/* Keypad */}
                  <div className="grid grid-cols-3 gap-2">
                    {lockPadDigits.map((d, i) => {
                      if (d === "") return <div key={i} />;
                      return (
                        <button
                          key={i}
                          onClick={() => d === "⌫" ? handleLockPinBack() : handleLockPinDigit(d)}
                          disabled={lockPinLoading}
                          className={`h-12 rounded-xl text-base font-semibold transition-all active:scale-95 disabled:opacity-50 border border-white/10 ${d === "⌫" ? "bg-white/5 hover:bg-white/10 text-gray-400" : "bg-white/10 hover:bg-white/20 text-white"}`}
                        >
                          {d === "⌫" ? <Delete className="h-4 w-4 mx-auto" /> : d}
                        </button>
                      );
                    })}
                  </div>
                  {lockPinLoading && <p className="text-center text-gray-400 text-xs animate-pulse">Signing in…</p>}

                  {/* Back to roster */}
                  <button
                    onClick={() => { setLockStep("roster"); setLockSelected(null); setLockPinEntry(""); setLockPinError(""); }}
                    className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
                  >
                    ← Different person?
                  </button>
                </div>
              )}

              {/* ── STEP 3: Admin / owner login — PIN or password ── */}
              {lockStep === "adminLogin" && (
                <div>
                  {/* Sub-tabs */}
                  <div className="flex border-b border-gray-800">
                    {(["pin", "password"] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => { setLockAdminSubTab(tab); setLockAdminError(""); setLockAdminPinEntry(""); }}
                        className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors border-b-2 ${lockAdminSubTab === tab ? "border-green-500 text-green-400" : "border-transparent text-gray-500 hover:text-gray-300"}`}
                      >
                        {tab === "pin" ? "PIN" : "Email & Password"}
                      </button>
                    ))}
                  </div>

                  {/* PIN tab */}
                  {lockAdminSubTab === "pin" && (
                    <div className="p-5 space-y-4">
                      <p className="text-xs text-gray-500 text-center">Enter your admin or owner PIN</p>

                      {/* Digit display with eye toggle */}
                      <div className="flex items-center justify-center gap-3">
                        <div className="flex gap-4">
                          {[0,1,2,3].map(i => {
                            const filled = i < lockAdminPinEntry.length;
                            return (
                              <div key={i} className={`w-8 h-10 rounded-lg border-2 flex items-center justify-center text-lg font-bold transition-all ${filled ? "border-green-500 bg-green-500/10 text-green-300" : "border-gray-600 bg-transparent text-transparent"}`}>
                                {filled ? (lockAdminPinVisible ? lockAdminPinEntry[i] : "●") : ""}
                              </div>
                            );
                          })}
                        </div>
                        <button type="button" onClick={() => setLockAdminPinVisible(v => !v)} className="text-gray-500 hover:text-gray-300 transition-colors ml-1" tabIndex={-1}>
                          {lockAdminPinVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>

                      {lockAdminError && <p className="text-center text-red-400 text-xs animate-pulse">{lockAdminError}</p>}
                      <div className="grid grid-cols-3 gap-2">
                        {lockPadDigits.map((d, i) => {
                          if (d === "") return <div key={i} />;
                          return (
                            <button key={i}
                              onClick={() => d === "⌫" ? handleLockAdminPinBack() : handleLockAdminPinDigit(d)}
                              disabled={lockAdminLoading}
                              className={`h-12 rounded-xl text-base font-semibold transition-all active:scale-95 disabled:opacity-50 border border-white/10 ${d === "⌫" ? "bg-white/5 hover:bg-white/10 text-gray-400" : "bg-white/10 hover:bg-white/20 text-white"}`}
                            >
                              {d === "⌫" ? <Delete className="h-4 w-4 mx-auto" /> : d}
                            </button>
                          );
                        })}
                      </div>
                      {lockAdminLoading && <p className="text-center text-gray-400 text-xs animate-pulse">Signing in…</p>}
                    </div>
                  )}

                  {/* Password tab */}
                  {lockAdminSubTab === "password" && (
                    <div className="p-5 space-y-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Email</label>
                        <input type="email" value={lockAdminEmail}
                          onChange={e => { setLockAdminEmail(e.target.value); setLockAdminError(""); }}
                          onKeyDown={e => e.key === "Enter" && handleLockAdminLogin()}
                          placeholder="admin@example.com"
                          className="w-full bg-gray-800 border border-gray-600 focus:border-green-500 rounded-lg px-3 py-2 text-sm text-white outline-none"
                          autoFocus />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Password</label>
                        <div className="relative">
                          <input
                            type={lockAdminShowPassword ? "text" : "password"}
                            value={lockAdminPassword}
                            onChange={e => { setLockAdminPassword(e.target.value); setLockAdminError(""); }}
                            onKeyDown={e => e.key === "Enter" && handleLockAdminLogin()}
                            placeholder="••••••••"
                            className="w-full bg-gray-800 border border-gray-600 focus:border-green-500 rounded-lg px-3 py-2 pr-10 text-sm text-white outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setLockAdminShowPassword(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                            tabIndex={-1}
                          >
                            {lockAdminShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      {lockAdminError && <p className="text-red-400 text-xs text-center animate-pulse">{lockAdminError}</p>}
                      <button onClick={handleLockAdminLogin} disabled={lockAdminLoading}
                        className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg py-2.5 text-sm font-bold transition-colors">
                        {lockAdminLoading ? "Signing in…" : "Sign In"}
                      </button>
                    </div>
                  )}

                  <div className="px-5 pb-4">
                    <button
                      onClick={() => { setLockStep("roster"); setLockAdminEmail(""); setLockAdminPassword(""); setLockAdminPinEntry(""); setLockAdminError(""); }}
                      className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
                    >
                      ← Back to employee list
                    </button>
                  </div>
                </div>
              )}

              {/* Admin login escape hatch — always visible on roster + pin steps */}
              {lockStep !== "adminLogin" && (
                <div className="border-t border-gray-800 px-5 py-3">
                  <button
                    onClick={() => { setLockStep("adminLogin"); setLockAdminEmail(""); setLockAdminPassword(""); setLockAdminError(""); }}
                    className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Lock className="h-3 w-3" /> Admin / owner login
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ADMIN OVERRIDE PIN MODAL
      ═══════════════════════════════════════════════════════════════════════ */}
      {showOverridePinModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-xs shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-amber-400" />
                <span className="font-bold text-lg">
                  {overrideTarget === 'settings'
                    ? "Manager Override"
                    : overridePurpose
                      ? PURPOSE_LABELS[overridePurpose]
                      : "Manager Override"}
                </span>
              </div>
              <button onClick={() => setShowOverridePinModal(false)} className="text-gray-400 hover:text-white p-1"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-gray-400 text-sm mb-4 text-center">
              {overrideTarget === 'settings'
                ? "Enter the store PIN to access POS Settings."
                : overridePurpose
                  ? `Enter the store PIN to allow: ${PURPOSE_LABELS[overridePurpose]}.`
                  : "Enter the store PIN to unlock restricted actions."}
            </p>
            {/* PIN dots */}
            <div className="flex justify-center gap-4 mb-4">
              {[0,1,2,3].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < overridePinEntry.length ? "bg-amber-400 border-amber-400 scale-110" : "bg-transparent border-gray-500"}`} />
              ))}
            </div>
            {overridePinError && <p className="text-center text-red-400 text-sm mb-3 animate-pulse">{overridePinError}</p>}
            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {overrideDigits.map((d, i) => {
                if (d === "") return <div key={i} />;
                return (
                  <button key={i} onClick={() => d === "⌫" ? handleOverrideBack() : handleOverrideDigit(d)}
                    disabled={overridePinLoading}
                    className={`h-13 py-3 rounded-xl text-lg font-semibold transition-all active:scale-95 ${d === "⌫" ? "bg-white/5 hover:bg-white/10 text-gray-400" : "bg-white/10 hover:bg-white/20 text-white"} border border-white/10 disabled:opacity-50`}>
                    {d === "⌫" ? <Delete className="h-4 w-4 mx-auto" /> : d}
                  </button>
                );
              })}
            </div>
            {overridePinLoading && <p className="text-center text-gray-400 text-xs mt-3 animate-pulse">Verifying…</p>}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          POS SETTINGS OVERLAY
      ═══════════════════════════════════════════════════════════════════════ */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
          {/* Header */}
          <div className="bg-gray-800 border-b border-gray-700 px-5 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-blue-400" />
              <span className="text-lg font-bold">POS Layout Settings</span>
              {saveLayoutMutation.isPending && <span className="text-xs text-yellow-400 animate-pulse">Saving…</span>}
            </div>
            <button onClick={() => { setShowSettings(false); cancelEdit(); }} className="p-2 hover:bg-gray-700 rounded">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tab bar */}
          <div className="bg-gray-800 border-b border-gray-700 px-5 flex gap-0 flex-shrink-0">
            {(["categories", "amounts"] as const).map(tab => (
              <button key={tab} onClick={() => { setSettingsTab(tab); cancelEdit(); }}
                className={`px-5 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${settingsTab === tab ? "border-blue-500 text-blue-400" : "border-transparent text-gray-400 hover:text-white"}`}>
                {tab === "categories" ? "Category Buttons" : "Quick Amounts"}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex">

            {/* ── CATEGORIES TAB ── */}
            {settingsTab === "categories" && (
              <div className="flex-1 flex overflow-hidden">

                {/* Category list */}
                <div className="w-80 border-r border-gray-700 flex flex-col overflow-hidden flex-shrink-0">
                  <div className="px-4 py-2 border-b border-gray-700 text-xs text-gray-400 uppercase tracking-wider">
                    {posConfig.categories.length} buttons — drag to reorder
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {posConfig.categories.map((cat, idx) => (
                      <div key={cat.id}
                        className={`flex items-center gap-2 px-3 py-2 border-b border-gray-800 hover:bg-gray-800/50 ${editingCatId === cat.id ? "bg-gray-800 ring-1 ring-inset ring-blue-600" : ""}`}>
                        {/* Color swatch */}
                        <div className="w-4 h-8 rounded flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{cat.label}</div>
                          <TypeBadge cat={cat} />
                        </div>
                        {/* Reorder */}
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button onClick={() => moveCat(cat.id, -1)} disabled={idx === 0} className="p-0.5 hover:bg-gray-600 rounded disabled:opacity-30">
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button onClick={() => moveCat(cat.id, 1)} disabled={idx === posConfig.categories.length - 1} className="p-0.5 hover:bg-gray-600 rounded disabled:opacity-30">
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                        {/* Edit */}
                        <button onClick={() => startEditCat(cat)} className="p-1.5 hover:bg-blue-700 rounded text-blue-400 hover:text-white transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {/* Delete */}
                        <button onClick={() => deleteCat(cat.id)} className="p-1.5 hover:bg-red-700 rounded text-red-400 hover:text-white transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-gray-700">
                    <button onClick={startNewCat}
                      className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 text-white rounded py-2.5 text-sm font-semibold">
                      <Plus className="h-4 w-4" /> Add Category Button
                    </button>
                  </div>
                </div>

                {/* Edit panel */}
                {editDraft ? (
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <h2 className="text-base font-bold text-white">
                      {editingCatId === "new" ? "New Category" : `Edit: ${editDraft.label}`}
                    </h2>

                    {/* Label */}
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Button Label</label>
                      <input
                        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                        value={editDraft.label}
                        onChange={e => setEditDraft({ ...editDraft, label: e.target.value })}
                      />
                    </div>

                    {/* Button color */}
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Button Color</label>
                      <div className="mb-2 flex items-center gap-2">
                        <div className="w-8 h-8 rounded" style={{ backgroundColor: editDraft.color }} />
                        <span className="text-sm text-gray-300">{editDraft.color}</span>
                      </div>
                      <ColorPicker value={editDraft.color} onChange={hex => setEditDraft({ ...editDraft, color: hex })} />
                    </div>

                    {/* Type */}
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider block mb-2">Button Type</label>
                      <div className="flex gap-3">
                        {[
                          { key: "products", label: "Products", desc: "Loads items from inventory" },
                          { key: "services", label: "Services", desc: "Custom sub-buttons (e.g. grooming)" },
                          { key: "special",  label: "Special",  desc: "Tips, Misc, Gift Cards" },
                        ].map(({ key, label, desc }) => {
                          const active = key === "services" ? !!editDraft.isService : key === "special" ? !!editDraft.isSpecial : (!editDraft.isService && !editDraft.isSpecial);
                          return (
                            <button key={key}
                              onClick={() => {
                                const base = { ...editDraft, isService: false, isSpecial: false };
                                if (key === "services") setEditDraft({ ...base, isService: true, dbCategory: undefined });
                                else if (key === "special") setEditDraft({ ...base, isSpecial: true, dbCategory: undefined });
                                else setEditDraft({ ...base, dbCategory: editDraft.dbCategory || "other" });
                              }}
                              className={`flex-1 rounded p-3 text-left border transition-colors ${active ? "bg-blue-700 border-blue-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400"}`}>
                              <div className="text-sm font-semibold">{label}</div>
                              <div className="text-xs opacity-70 mt-0.5">{desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Products: dbCategory picker */}
                    {!editDraft.isService && !editDraft.isSpecial && (
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Inventory Category</label>
                        <select
                          value={editDraft.dbCategory || "other"}
                          onChange={e => setEditDraft({ ...editDraft, dbCategory: e.target.value })}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                        >
                          {dbCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          <option value="other">Other / Custom</option>
                        </select>
                        <div className="text-xs text-gray-500 mt-1">Items are loaded from the matching inventory category.</div>
                      </div>
                    )}

                    {/* Services: sub-button list */}
                    {editDraft.isService && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs text-gray-400 uppercase tracking-wider">Sub-Buttons</label>
                          <button onClick={startNewSvc} className="flex items-center gap-1 text-xs bg-blue-700 hover:bg-blue-600 text-white px-2.5 py-1 rounded">
                            <Plus className="h-3 w-3" /> Add
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {(editDraft.services || []).map((svc, idx) => (
                            <div key={svc.id} className={`flex items-center gap-2 bg-gray-800 rounded px-3 py-2 border ${editSvcIdx === idx ? "border-blue-500" : "border-gray-700"}`}>
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: svc.color }} />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm">{svc.label}</span>
                                <span className="text-xs text-gray-400 ml-2">{svc.price !== null ? `$${svc.price.toFixed(2)}` : "Enter price"}</span>
                              </div>
                              <button onClick={() => startEditSvc(idx)} className="p-1 hover:bg-blue-700 rounded text-blue-400">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={() => deleteSvc(idx)} className="p-1 hover:bg-red-700 rounded text-red-400">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          {(editDraft.services || []).length === 0 && (
                            <div className="text-xs text-gray-500 py-2 text-center">No sub-buttons yet — click Add</div>
                          )}
                        </div>

                        {/* Sub-button edit inline */}
                        {svcDraft && (
                          <div className="mt-3 bg-gray-900 border border-blue-700 rounded p-4 space-y-3">
                            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                              {editSvcIdx === -1 ? "New Sub-Button" : "Edit Sub-Button"}
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 block mb-1">Label</label>
                              <input className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                                value={svcDraft.label} onChange={e => setSvcDraft({ ...svcDraft, label: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 block mb-1">Price (leave blank = enter at sale)</label>
                              <input type="number" className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                                placeholder="e.g. 15.00"
                                value={svcDraft.price ?? ""}
                                onChange={e => setSvcDraft({ ...svcDraft, price: e.target.value === "" ? null : parseFloat(e.target.value) })} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 block mb-1.5">Button Color</label>
                              <ColorPicker value={svcDraft.color} onChange={hex => setSvcDraft({ ...svcDraft, color: hex })} />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button onClick={saveSvc} className="flex-1 bg-blue-700 hover:bg-blue-600 text-white rounded py-1.5 text-sm font-semibold flex items-center justify-center gap-1">
                                <Check className="h-3.5 w-3.5" /> Save
                              </button>
                              <button onClick={() => { setEditSvcIdx(null); setSvcDraft(null); }} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded py-1.5 text-sm">Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Save / Cancel */}
                    <div className="flex gap-3 pt-2 border-t border-gray-700">
                      <button onClick={saveCatEdit} disabled={saveLayoutMutation.isPending}
                        className="flex-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded py-2.5 font-bold text-sm flex items-center justify-center gap-2">
                        <Check className="h-4 w-4" /> {editingCatId === "new" ? "Add Button" : "Save Changes"}
                      </button>
                      <button onClick={cancelEdit} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded py-2.5 font-semibold text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-600 flex-col gap-3">
                    <Pencil className="h-10 w-10 opacity-30" />
                    <div className="text-sm">Select a button to edit, or add a new one</div>
                  </div>
                )}
              </div>
            )}

            {/* ── QUICK AMOUNTS TAB ── */}
            {settingsTab === "amounts" && (
              <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-xl">

                {/* Tips */}
                <div>
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Tip Quick-Amounts
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {posConfig.tipAmounts.map(amt => (
                      <div key={amt} className="flex items-center gap-1 bg-gray-700 rounded px-3 py-1.5">
                        <span className="text-sm font-semibold">${amt}</span>
                        <button onClick={() => removeTipAmt(amt)} className="text-red-400 hover:text-red-300 ml-1">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="number" placeholder="Add amount (e.g. 25)"
                      value={newTipAmt} onChange={e => setNewTipAmt(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      onKeyDown={e => e.key === "Enter" && addTipAmt()} />
                    <button onClick={addTipAmt} className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                </div>

                {/* Gift Cards */}
                <div>
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> Gift Card Denominations
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {posConfig.giftCardAmounts.map(amt => (
                      <div key={amt} className="flex items-center gap-1 bg-gray-700 rounded px-3 py-1.5">
                        <span className="text-sm font-semibold">${amt}</span>
                        <button onClick={() => removeGcAmt(amt)} className="text-red-400 hover:text-red-300 ml-1">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="number" placeholder="Add amount (e.g. 200)"
                      value={newGcAmt} onChange={e => setNewGcAmt(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      onKeyDown={e => e.key === "Enter" && addGcAmt()} />
                    <button onClick={addGcAmt} className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                </div>

                <div className="text-xs text-gray-600 pt-2 border-t border-gray-800">
                  Changes save automatically. Removing a preset doesn't affect completed orders.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Cash Payment Dialog ── */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="bg-gray-800 text-white border-gray-600 max-w-sm">
          <DialogHeader><DialogTitle className="text-white">Cash Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {/* Total + change row */}
            <div className="flex justify-between text-xl font-bold">
              <span>Total Due</span>
              <span className="text-green-400">${total.toFixed(2)}</span>
            </div>

            {/* Amount tendered display */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Amount Tendered</label>
              <div className="bg-gray-700 border border-gray-600 rounded flex items-center justify-end px-3 h-14">
                <span className="text-white text-2xl font-mono tracking-wide">
                  {cashTendered === "" ? <span className="text-gray-500">0.00</span> : `$${cashTendered}`}
                </span>
              </div>
            </div>

            {/* Quick amounts */}
            <div className="grid grid-cols-6 gap-1">
              {[1, 5, 10, 20, 50, 100].map(amt => (
                <button key={amt} onClick={() => setCashTendered(String(amt))}
                  className="bg-gray-600 active:bg-gray-500 rounded py-1.5 text-xs font-bold">${amt}</button>
              ))}
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2">
              {[7,8,9,4,5,6,1,2,3].map(n => (
                <button key={n}
                  onClick={() => setCashTendered(prev => {
                    const parts = prev.split(".");
                    if (parts.length === 2 && parts[1].length >= 2) return prev;
                    if (prev === "" && n === 0) return prev;
                    return prev + String(n);
                  })}
                  className="bg-gray-600 active:bg-gray-500 rounded-lg h-14 text-2xl font-bold select-none touch-manipulation">
                  {n}
                </button>
              ))}
              {/* Decimal */}
              <button
                onClick={() => setCashTendered(prev => prev.includes(".") ? prev : prev === "" ? "0." : prev + ".")}
                className="bg-gray-600 active:bg-gray-500 rounded-lg h-14 text-2xl font-bold select-none touch-manipulation">
                .
              </button>
              {/* 0 */}
              <button
                onClick={() => setCashTendered(prev => {
                  const parts = prev.split(".");
                  if (parts.length === 2 && parts[1].length >= 2) return prev;
                  if (prev === "") return prev;
                  return prev + "0";
                })}
                className="bg-gray-600 active:bg-gray-500 rounded-lg h-14 text-2xl font-bold select-none touch-manipulation">
                0
              </button>
              {/* Backspace */}
              <button
                onClick={() => setCashTendered(prev => prev.slice(0, -1))}
                className="bg-gray-600 active:bg-gray-500 rounded-lg h-14 text-2xl font-bold select-none touch-manipulation flex items-center justify-center">
                ⌫
              </button>
            </div>

            {/* Change due */}
            {tendered > 0 && (
              <div className="flex justify-between text-lg font-bold border-t border-gray-600 pt-2">
                <span>Change Due</span>
                <span className={change >= 0 ? "text-yellow-400" : "text-red-400"}>${Math.max(0, change).toFixed(2)}</span>
              </div>
            )}

            <button onClick={completeCash} disabled={tendered < total || saveOrderMutation.isPending}
              className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded py-3 font-bold text-lg">
              {saveOrderMutation.isPending ? "Processing…" : "Complete Sale"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Search / Scan Dialog ── */}
      <Dialog open={showSearch} onOpenChange={v => { setShowSearch(v); if (!v) setSearchQuery(""); }}>
        <DialogContent className="bg-gray-800 text-white border-gray-600 max-w-lg">
          <DialogHeader><DialogTitle className="text-white">Find Item — Type or Scan Barcode</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Name, brand, or UPC…" className="bg-gray-700 border-gray-600 text-white" autoFocus />
            <div className="max-h-72 overflow-y-auto space-y-1">
              {(searchResults as SupplyItem[]).map(item => (
                <button key={item.id} onClick={() => {
                  addItem(item.name, Number(item.price), "misc", item.sku);
                  setShowSearch(false);
                  setSearchQuery("");
                }} className="w-full text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded flex justify-between items-center">
                  <div>
                    <div className="text-sm font-medium">{item.name}</div>
                    <div className="text-xs text-gray-400">{item.sku}</div>
                  </div>
                  <div className="text-green-400 font-semibold text-sm">${Number(item.price).toFixed(2)}</div>
                </button>
              ))}
              {searchQuery.length >= 2 && (searchResults as SupplyItem[]).length === 0 && (
                <div className="text-center py-6 space-y-3">
                  <div className="text-gray-500 text-sm">No item found in system</div>
                  <button onClick={() => {
                    setCustomPriceItem({ name: searchQuery.trim(), category: "misc" });
                    setCustomPrice("");
                    setShowSearch(false);
                    setSearchQuery("");
                  }} className="bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2 rounded text-sm font-semibold">
                    + Add "{searchQuery.trim()}" to Order
                  </button>
                </div>
              )}
              {searchQuery.length < 2 && (
                <div className="text-gray-600 text-xs text-center py-6">Type at least 2 characters or hold your scanner to this screen</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Custom Price Dialog ── */}
      <Dialog open={!!customPriceItem} onOpenChange={() => setCustomPriceItem(null)}>
        <DialogContent className="bg-gray-800 text-white border-gray-600 max-w-sm">
          <DialogHeader><DialogTitle className="text-white">{customPriceItem?.name} — Enter Price</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input type="number" value={customPrice} onChange={e => setCustomPrice(e.target.value)}
              placeholder="0.00" className="bg-gray-700 border-gray-600 text-white text-xl text-right h-12"
              autoFocus onKeyDown={e => e.key === "Enter" && confirmCustomPrice()} />
            <button onClick={confirmCustomPrice} className="w-full bg-blue-700 hover:bg-blue-600 text-white rounded py-3 font-bold text-lg">
              Add to Order
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
