import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, DollarSign, CreditCard, Search } from "lucide-react";

interface OrderItem {
  lineId: string;
  name: string;
  sku?: string;
  price: number;
  quantity: number;
  category: string;
}

interface ServiceItem {
  id: string;
  label: string;
  price: number | null;
  color: string;
}

interface PosCategory {
  id: string;
  label: string;
  bgColor: string;
  dbCategory?: string;
  isService?: boolean;
  services?: ServiceItem[];
  isSpecial?: boolean;
}

interface SupplyItem {
  id: number;
  name: string;
  sku: string;
  price: number;
  brand?: string;
  stockQuantity: number;
}

const POS_CATEGORIES: PosCategory[] = [
  {
    id: "grooming", label: "Grooming", bgColor: "bg-blue-700", isService: true,
    services: [
      { id: "bath-only",     label: "Bath Only",     price: null, color: "bg-sky-600" },
      { id: "full-grooming", label: "Full Grooming",  price: null, color: "bg-cyan-700" },
      { id: "nail-clip",     label: "Nail Clip",      price: 15,   color: "bg-blue-600" },
      { id: "nail-grind",    label: "Nail Grind",     price: 20,   color: "bg-blue-600" },
      { id: "tooth-brush",   label: "Tooth Brush",    price: 15,   color: "bg-blue-600" },
    ],
  },
  { id: "dogFood",            label: "Dog Food",            bgColor: "bg-orange-700",  dbCategory: "dogFood" },
  { id: "catFood",            label: "Cat Food",            bgColor: "bg-purple-700",  dbCategory: "catFood" },
  { id: "dogTreats",          label: "Dog Treats",          bgColor: "bg-amber-700",   dbCategory: "dogTreats" },
  { id: "catTreats",          label: "Cat Treats",          bgColor: "bg-pink-700",    dbCategory: "catTreats" },
  { id: "accessories",        label: "Accessories",         bgColor: "bg-green-800",   dbCategory: "accessories" },
  { id: "leashesAndCollars",  label: "Leashes & Collars",   bgColor: "bg-red-800",     dbCategory: "leashesAndCollars" },
  { id: "toys",               label: "Toys",                bgColor: "bg-yellow-600",  dbCategory: "toys" },
  { id: "beds",               label: "Beds",                bgColor: "bg-teal-700",    dbCategory: "beds" },
  { id: "healthcare",         label: "Healthcare",          bgColor: "bg-emerald-800", dbCategory: "healthcare" },
  { id: "aquatics",           label: "Aquatic Fish/Plant",  bgColor: "bg-sky-700",     dbCategory: "aquatics" },
  { id: "reptiles",           label: "Live Reptiles/Feeders", bgColor: "bg-lime-700",  dbCategory: "reptiles" },
  { id: "birdSupplies",       label: "Bird Supplies",       bgColor: "bg-violet-700",  dbCategory: "birdSupplies" },
  { id: "smallAnimalSupplies",label: "Live Small Animals",  bgColor: "bg-orange-600",  dbCategory: "smallAnimalSupplies" },
  { id: "tips",       label: "Tips",       bgColor: "bg-gray-600", isSpecial: true },
  { id: "misc",       label: "Misc.",      bgColor: "bg-gray-700", isSpecial: true },
  { id: "giftCards",  label: "Gift Cards", bgColor: "bg-rose-700", isSpecial: true },
];

function genId() { return Math.random().toString(36).substr(2, 9); }

function genOrderNumber() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `POS-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export default function PosPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const selectedCat = POS_CATEGORIES.find(c => c.id === selectedCatId) ?? null;

  const { data: categoryItems = [] } = useQuery<SupplyItem[]>({
    queryKey: [`/api/pos/items?category=${selectedCatId}`],
    enabled: !!selectedCatId && !!selectedCat?.dbCategory,
  });

  const { data: searchResults = [] } = useQuery<SupplyItem[]>({
    queryKey: [`/api/pos/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.length >= 2,
  });

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

  const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax      = 0;
  const total    = subtotal + tax;
  const tendered = parseFloat(cashTendered) || 0;
  const change   = tendered - total;

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

  const removeLine = (lineId: string) =>
    setOrderItems(prev => prev.filter(i => i.lineId !== lineId));

  const removeLastLine = () => setOrderItems(prev => prev.slice(0, -1));
  const clearAll       = () => { setOrderItems([]); setSelectedCatId(null); };

  const pay = (method: "cash" | "credit") => {
    if (!orderItems.length) return;
    if (method === "cash") { setShowPayment(true); }
    else {
      saveOrderMutation.mutate({ orderNumber, items: orderItems, subtotal, tax, total, paymentMethod: "credit" });
    }
  };

  const completeCash = () => {
    if (tendered < total) {
      toast({ title: "Insufficient payment", description: `Need $${total.toFixed(2)}, received $${tendered.toFixed(2)}`, variant: "destructive" });
      return;
    }
    saveOrderMutation.mutate({ orderNumber, items: orderItems, subtotal, tax, total, paymentMethod: "cash", amountTendered: tendered, changeDue: change });
  };

  const timeStr = clock.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  const dateStr = clock.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden select-none">
      {/* Top bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-3 py-1.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/admin")} className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-300">
            <ChevronLeft className="h-3 w-3" /> Admin
          </button>
          <span className="text-sm font-bold">Animal House Pet Store</span>
          <span className="text-xs bg-blue-700 px-2 py-0.5 rounded font-semibold">IN STORE</span>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono font-bold">{timeStr}</div>
          <div className="text-xs text-gray-400">{dateStr}</div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Order cart */}
        <div className="w-72 flex flex-col border-r border-gray-700 flex-shrink-0" style={{ background: "#1a1f2e" }}>
          <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
            <div className="text-xs text-gray-400">Order #</div>
            <div className="text-xs font-mono text-yellow-400">{orderNumber}</div>
          </div>

          {/* Items list */}
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

          {/* Totals */}
          <div className="border-t border-gray-700 px-3 py-2 space-y-0.5 flex-shrink-0">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Item Count</span><span>{orderItems.reduce((s, i) => s + i.quantity, 0)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>Discount</span><span>0.00</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>Tax</span><span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>Tip</span><span>0.00</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-white border-t border-gray-600 pt-1 mt-1">
              <span>Total</span><span>${total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>Paid</span><span>0.00</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-yellow-400">
              <span>Balance Due</span><span>${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* CENTER: Categories column + Item grid */}
        <div className="flex-1 flex overflow-hidden">

          {/* Category column */}
          <div className="w-44 border-r border-gray-700 overflow-y-auto flex-shrink-0 bg-gray-800/80">
            <div className="p-1.5 space-y-1">
              {POS_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCatId(selectedCatId === cat.id ? null : cat.id)}
                  className={`w-full text-left px-3 py-2.5 rounded text-xs font-semibold text-white transition-all ${cat.bgColor} ${selectedCatId === cat.id ? "ring-2 ring-white ring-offset-1 ring-offset-gray-800 brightness-110" : "opacity-90 hover:opacity-100 hover:brightness-110"}`}
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

            {/* Grooming services */}
            {selectedCat?.isService && selectedCat.services && (
              <div className="grid grid-cols-3 gap-2">
                {selectedCat.services.map(svc => (
                  <button
                    key={svc.id}
                    onClick={() => addService(svc, selectedCat.label)}
                    className={`${svc.color} text-white rounded p-3 text-center hover:brightness-110 active:scale-95 transition-all min-h-[70px] flex flex-col items-center justify-center`}
                  >
                    <div className="text-sm font-semibold">{svc.label}</div>
                    {svc.price !== null
                      ? <div className="text-xs mt-1 text-white/80">${svc.price.toFixed(2)}</div>
                      : <div className="text-xs mt-1 text-blue-200">Tap for price</div>
                    }
                  </button>
                ))}
              </div>
            )}

            {/* DB category items */}
            {selectedCat?.dbCategory && (
              <div className="grid grid-cols-3 gap-2">
                {(categoryItems as SupplyItem[]).map(item => (
                  <button
                    key={item.id}
                    onClick={() => addItem(item.name, Number(item.price), selectedCatId!, item.sku)}
                    className="bg-gray-700 hover:bg-gray-600 active:scale-95 text-white rounded p-2 text-center transition-all min-h-[70px] flex flex-col items-center justify-center border border-gray-600 hover:border-gray-400"
                  >
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
                {[1, 2, 3, 4, 5, 10, 15, 20].map(amt => (
                  <button key={amt} onClick={() => addItem("Tip", amt, "tips")}
                    className="bg-gray-600 hover:bg-gray-500 text-white rounded p-3 text-center active:scale-95 min-h-[60px] font-bold text-sm">
                    ${amt}.00
                  </button>
                ))}
                <button onClick={() => { setCustomPriceItem({ name: "Tip", category: "tips" }); setCustomPrice(""); }}
                  className="bg-gray-500 hover:bg-gray-400 text-white rounded p-3 text-center active:scale-95 min-h-[60px] col-span-2 font-semibold text-sm">
                  Custom Tip
                </button>
              </div>
            )}

            {/* Misc */}
            {selectedCatId === "misc" && (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <div className="text-gray-400 text-sm">Enter a custom misc item</div>
                <button onClick={() => { setCustomPriceItem({ name: "Misc Item", category: "misc" }); setCustomPrice(""); }}
                  className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-3 rounded font-semibold">
                  Add Misc Item
                </button>
              </div>
            )}

            {/* Gift Cards */}
            {selectedCatId === "giftCards" && (
              <div className="grid grid-cols-3 gap-2">
                {[10, 15, 20, 25, 50, 75, 100].map(amt => (
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
          <div className="flex-1" />
          <button onClick={removeLastLine} disabled={!orderItems.length} className="bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded py-3 text-xs font-bold text-center">Remove Line</button>
          <button onClick={clearAll} disabled={!orderItems.length} className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded py-3 text-xs font-bold text-center">Clear All</button>
        </div>
      </div>

      {/* BOTTOM: Payment + scan */}
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

      {/* ── Cash Payment Dialog ── */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="bg-gray-800 text-white border-gray-600 max-w-sm">
          <DialogHeader><DialogTitle className="text-white">Cash Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between text-xl font-bold">
              <span>Total Due</span>
              <span className="text-green-400">${total.toFixed(2)}</span>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Amount Tendered</label>
              <Input type="number" value={cashTendered} onChange={e => setCashTendered(e.target.value)}
                className="bg-gray-700 border-gray-600 text-white text-xl text-right h-12"
                placeholder="0.00" autoFocus onKeyDown={e => e.key === "Enter" && completeCash()} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 5, 10, 20, 50, 100].map(amt => (
                <button key={amt} onClick={() => setCashTendered(String(amt))}
                  className="bg-gray-600 hover:bg-gray-500 rounded py-2 text-sm font-bold">${amt}</button>
              ))}
            </div>
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
                <div className="text-gray-500 text-sm text-center py-6">No items found</div>
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
