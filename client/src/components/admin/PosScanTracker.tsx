import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, ShieldCheck, Trash2, AlertTriangle, Clock, PackagePlus, X, CheckCheck, RefreshCw, Monitor, Package, Printer } from "lucide-react";
import { useLocation } from "wouter";
import BarcodeDisplay from "@/components/BarcodeDisplay";

interface TrackerItem {
  supply_id: number;
  item_name: string;
  sku: string;
  zero_count: number;
  last_scan_at: string;
  threshold: number;
  protected: boolean;
}

interface PendingNewItem {
  sku: string;
  item_name: string;
  brand: string;
  price: number;
  mapped_category: string;
  pos_stock: number;
}

interface Stats {
  eligible: TrackerItem[];
  approaching: TrackerItem[];
  summary: { total: number; eligible_count: number; protected_count: number };
}

interface UploadResult {
  processed: number;
  incremented: number;
  reset: number;
  nowEligible: number;
  skipped: number;
  newItemCount: number;
}

interface LowStockItem {
  id: number;
  name: string;
  sku: string;
  brand?: string;
  category: string;
  price: number;
  stockQuantity: number;
  reorderPoint: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  accessories: "Accessories", aquatics: "Aquatics", beds: "Beds",
  birdSupplies: "Bird Supplies", catFood: "Cat Food", catTreats: "Cat Treats",
  dogCages: "Dog Cages", dogFood: "Dog Food", dogTreats: "Dog Treats",
  healthcare: "Healthcare", leashesAndCollars: "Leashes & Collars",
  reptiles: "Reptiles", smallAnimalSupplies: "Small Animal", toys: "Toys",
};

function CountBar({ count, threshold }: { count: number; threshold: number }) {
  const pct = Math.min((count / threshold) * 100, 100);
  const ratio = count / threshold;
  const color = ratio >= 1 ? "bg-red-500" : ratio >= 0.75 ? "bg-orange-500" : "bg-yellow-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-300 w-14 text-right">
        {count}/{threshold}{threshold === 50 ? " 🐍" : ""}
      </span>
    </div>
  );
}

export default function PosScanTracker() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult]   = useState<UploadResult | null>(null);
  const [showBarcodes, setShowBarcodes]     = useState(false);
  const [labelFilter, setLabelFilter]       = useState("");
  const [localThresholds, setLocalThresholds]         = useState<Record<number, number>>({});
  const [localTrackerThresholds, setLocalTrackerThresholds] = useState<Record<number, number>>({});

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/admin/pos-scan/stats"],
    refetchOnWindowFocus: false,
  });

  const { data: pendingNew = [], isLoading: pendingLoading } = useQuery<PendingNewItem[]>({
    queryKey: ["/api/admin/pos-scan/pending-new"],
    refetchOnWindowFocus: false,
  });

  const { data: lowStockItems = [], isLoading: lowStockLoading, refetch: refetchLowStock } = useQuery<LowStockItem[]>({
    queryKey: ["/api/pos/low-stock"],
    refetchOnWindowFocus: false,
    enabled: showBarcodes,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/pos-scan/upload", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<UploadResult>;
    },
    onSuccess: (result) => {
      setUploadResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pos-scan/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pos-scan/pending-new"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/low-stock"] });
      toast({
        title: "POS file processed",
        description: `${result.incremented} incremented · ${result.reset} reset · ${result.nowEligible} newly eligible · ${result.newItemCount} new items found`,
      });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const protectMutation = useMutation({
    mutationFn: async ({ supplyId, protect }: { supplyId: number; protect: boolean }) => {
      const res = await fetch("/api/admin/pos-scan/protect", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ supplyId, protect }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/pos-scan/stats"] }),
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/pos-scan/delete-eligible", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pos-scan/stats"] });
      const msg = result.skipped > 0 ? `${result.deleted} deleted · ${result.skipped} skipped (in active carts)` : `${result.deleted} items deleted`;
      toast({ title: msg });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const addItemMutation = useMutation({
    mutationFn: async (item: PendingNewItem) => {
      const res = await fetch("/api/admin/pos-scan/add-new-item", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ sku: item.sku, item_name: item.item_name, brand: item.brand, price: item.price, mapped_category: item.mapped_category }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/pos-scan/pending-new"] }),
    onError: (e: any) => toast({ title: "Failed to add item", description: e.message, variant: "destructive" }),
  });

  const dismissItemMutation = useMutation({
    mutationFn: async (sku: string) => {
      const res = await fetch("/api/admin/pos-scan/dismiss-new-item", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ sku }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/pos-scan/pending-new"] }),
  });

  const addAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/pos-scan/add-all-new", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pos-scan/pending-new"] });
      toast({ title: `Added ${result.added} new items to inventory` });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pos/seed-inventory", {}),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/pos/low-stock"] });
      toast({ title: "Inventory seeded from tracker", description: `${data.zeroStockUpdated} set to 0 · ${data.inStockUpdated} set to in-stock` });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const reorderPointMutation = useMutation({
    mutationFn: ({ id, reorderPoint }: { id: number; reorderPoint: number }) =>
      apiRequest("PATCH", `/api/pos/reorder-point/${id}`, { reorderPoint }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/pos/low-stock"] }),
    onError: (e: any) => toast({ title: "Failed to update threshold", description: e.message, variant: "destructive" }),
  });

  const adjustThreshold = (item: LowStockItem, delta: number) => {
    const current = localThresholds[item.id] ?? item.reorderPoint ?? 1;
    const next = Math.max(0, current + delta);
    setLocalThresholds(prev => ({ ...prev, [item.id]: next }));
    reorderPointMutation.mutate({ id: item.id, reorderPoint: next });
  };

  const trackerThresholdMutation = useMutation({
    mutationFn: ({ supplyId, threshold }: { supplyId: number; threshold: number }) =>
      apiRequest("PATCH", `/api/admin/pos-scan/threshold/${supplyId}`, { threshold }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/pos-scan/stats"] }),
    onError: (e: any) => toast({ title: "Failed to update deletion threshold", description: e.message, variant: "destructive" }),
  });

  const adjustTrackerThreshold = (item: TrackerItem, delta: number) => {
    const current = localTrackerThresholds[item.supply_id] ?? item.threshold ?? 16;
    const next = Math.max(1, current + delta);
    setLocalTrackerThresholds(prev => ({ ...prev, [item.supply_id]: next }));
    trackerThresholdMutation.mutate({ supplyId: item.supply_id, threshold: next });
  };

  const eligible   = stats?.eligible ?? [];
  const approaching = stats?.approaching ?? [];

  const filteredLowStock = (lowStockItems as LowStockItem[]).filter(item =>
    !labelFilter || item.name.toLowerCase().includes(labelFilter.toLowerCase()) || item.sku.includes(labelFilter)
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">POS Zero-Stock Tracker</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Upload the ExaTouch Items export. Regular items flagged after <strong className="text-zinc-300">16 consecutive zero-stock scans</strong> (~2 months at 2/week).
            Coastal items require <strong className="text-zinc-300">50 scans</strong> (~6 months).
            Only POS quantity counts — app stock is ignored. Deletion is always manual.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setLocation("/pos")}
            className="bg-green-700 hover:bg-green-600 text-white text-xs" size="sm">
            <Monitor className="w-3 h-3 mr-1" /> Open POS
          </Button>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { uploadMutation.mutate(f); e.target.value = ""; } }} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploadMutation.isPending}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs" size="sm">
            <Upload className="w-3 h-3 mr-1" />
            {uploadMutation.isPending ? "Processing…" : "Upload POS XLS"}
          </Button>
          <Button onClick={() => { if (confirm("Seed inventory levels from the tracker data? This will mark zero-stock items as qty=0 and items last seen in stock as qty≥1. Respects manual overrides.")) seedMutation.mutate(); }}
            disabled={seedMutation.isPending} variant="outline" size="sm"
            className="text-xs border-zinc-600 text-zinc-300 hover:bg-zinc-800">
            <RefreshCw className="w-3 h-3 mr-1" />
            {seedMutation.isPending ? "Seeding…" : "Seed Inventory"}
          </Button>
          {eligible.length > 0 && (
            <Button onClick={() => { if (confirm(`Permanently delete ${eligible.length} items with 10+ zero-stock scans?`)) deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending} variant="destructive" size="sm" className="text-xs">
              <Trash2 className="w-3 h-3 mr-1" />
              {deleteMutation.isPending ? "Deleting…" : `Delete ${eligible.length} Eligible`}
            </Button>
          )}
        </div>
      </div>

      {/* Upload result */}
      {uploadResult && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
          {[
            { label: "Processed",   value: uploadResult.processed,    color: "text-white" },
            { label: "Incremented", value: uploadResult.incremented,  color: "text-yellow-400" },
            { label: "Reset to 0",  value: uploadResult.reset,        color: "text-green-400" },
            { label: "Now Eligible",value: uploadResult.nowEligible,  color: "text-red-400" },
            { label: "New Items",   value: uploadResult.newItemCount, color: "text-blue-400" },
            { label: "Skipped",     value: uploadResult.skipped,      color: "text-zinc-500" },
          ].map(s => (
            <div key={s.label}>
              <div className={`text-xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Summary pills */}
      {!statsLoading && stats && (
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 text-zinc-300">{stats.summary.total?.toLocaleString() ?? 0} tracked</span>
          <span className="text-xs bg-red-950 border border-red-800 rounded-full px-3 py-1 text-red-300">{eligible.length} ready to delete</span>
          <span className="text-xs bg-orange-950 border border-orange-800 rounded-full px-3 py-1 text-orange-300">{approaching.length} approaching</span>
          {(stats.summary.protected_count ?? 0) > 0 && (
            <span className="text-xs bg-green-950 border border-green-800 rounded-full px-3 py-1 text-green-300">{stats.summary.protected_count} protected</span>
          )}
          {pendingNew.length > 0 && (
            <span className="text-xs bg-blue-950 border border-blue-800 rounded-full px-3 py-1 text-blue-300">{pendingNew.length} new from POS</span>
          )}
        </div>
      )}

      {/* New items from POS */}
      {pendingNew.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <PackagePlus className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-blue-400">New from POS — Not Yet in App ({pendingNew.length})</h3>
            </div>
            <Button size="sm" className="text-xs bg-blue-700 hover:bg-blue-600 text-white h-7"
              onClick={() => { if (confirm(`Add all ${pendingNew.length} new items to your inventory? Each will use the auto-mapped category and POS price.`)) addAllMutation.mutate(); }}
              disabled={addAllMutation.isPending}>
              <CheckCheck className="w-3 h-3 mr-1" />
              {addAllMutation.isPending ? "Adding…" : `Add All ${pendingNew.length}`}
            </Button>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {pendingNew.map(item => (
              <div key={item.sku} className="flex items-center gap-2 bg-zinc-900 border border-blue-900/30 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{item.item_name}</div>
                  <div className="flex gap-2 text-[11px] text-zinc-500 flex-wrap">
                    <span>{item.brand || "—"}</span>
                    <span>{item.sku}</span>
                    <span className="text-green-400">${Number(item.price || 0).toFixed(2)}</span>
                    <span className="text-blue-400">{CATEGORY_LABELS[item.mapped_category] ?? item.mapped_category}</span>
                    {item.pos_stock <= 0 && <span className="text-yellow-500">POS stock: {item.pos_stock}</span>}
                  </div>
                </div>
                <Button size="sm" className="text-[10px] bg-blue-800 hover:bg-blue-700 text-white shrink-0 h-7 px-2"
                  onClick={() => addItemMutation.mutate(item)} disabled={addItemMutation.isPending}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" className="text-zinc-500 hover:text-red-400 shrink-0 h-7 w-7 p-0"
                  onClick={() => dismissItemMutation.mutate(item.sku)} disabled={dismissItemMutation.isPending}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Eligible for deletion */}
      {eligible.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-semibold text-red-400">Ready for Deletion ({eligible.length})</h3>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {eligible.map(item => {
              const t = localTrackerThresholds[item.supply_id] ?? item.threshold ?? 16;
              return (
                <div key={item.supply_id} className="flex items-center gap-2 bg-zinc-900 border border-red-900/40 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{item.item_name}</div>
                    <div className="text-[11px] text-zinc-500">{item.sku}</div>
                    <CountBar count={item.zero_count} threshold={t} />
                  </div>
                  <div className="flex items-center gap-1 shrink-0" title="Scans needed before deletion eligibility">
                    <button onClick={() => adjustTrackerThreshold(item, -5)}
                      className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] font-bold flex items-center justify-center">−5</button>
                    <button onClick={() => adjustTrackerThreshold(item, -1)}
                      className="w-5 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-bold flex items-center justify-center">−</button>
                    <span className="text-xs font-mono text-white w-6 text-center">{t}</span>
                    <button onClick={() => adjustTrackerThreshold(item, 1)}
                      className="w-5 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-bold flex items-center justify-center">+</button>
                    <button onClick={() => adjustTrackerThreshold(item, 5)}
                      className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] font-bold flex items-center justify-center">+5</button>
                  </div>
                  <Button size="sm" variant="outline"
                    className="text-[10px] border-green-800 text-green-400 hover:bg-green-950 shrink-0 h-7 px-2"
                    onClick={() => protectMutation.mutate({ supplyId: item.supply_id, protect: true })}
                    disabled={protectMutation.isPending}>
                    <ShieldCheck className="w-3 h-3 mr-1" /> Protect
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Approaching */}
      {approaching.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-orange-400">Approaching Threshold ({approaching.length})</h3>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {approaching.map(item => {
              const t = localTrackerThresholds[item.supply_id] ?? item.threshold ?? 16;
              return (
                <div key={item.supply_id} className="flex items-center gap-2 bg-zinc-900 border border-orange-900/30 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{item.item_name}</div>
                    <div className="text-[11px] text-zinc-500">{item.sku}</div>
                    <CountBar count={item.zero_count} threshold={t} />
                  </div>
                  <div className="flex items-center gap-1 shrink-0" title="Scans needed before deletion eligibility">
                    <button onClick={() => adjustTrackerThreshold(item, -5)}
                      className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] font-bold flex items-center justify-center">−5</button>
                    <button onClick={() => adjustTrackerThreshold(item, -1)}
                      className="w-5 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-bold flex items-center justify-center">−</button>
                    <span className="text-xs font-mono text-white w-6 text-center">{t}</span>
                    <button onClick={() => adjustTrackerThreshold(item, 1)}
                      className="w-5 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-bold flex items-center justify-center">+</button>
                    <button onClick={() => adjustTrackerThreshold(item, 5)}
                      className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] font-bold flex items-center justify-center">+5</button>
                  </div>
                  <Button size="sm" variant="outline"
                    className="text-[10px] border-green-800 text-green-400 hover:bg-green-950 shrink-0 h-7 px-2"
                    onClick={() => protectMutation.mutate({ supplyId: item.supply_id, protect: true })}
                    disabled={protectMutation.isPending}>
                    <ShieldCheck className="w-3 h-3 mr-1" /> Protect
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!statsLoading && !pendingLoading && eligible.length === 0 && approaching.length === 0 && pendingNew.length === 0 && (
        <div className="text-center py-6 text-zinc-500 text-sm">
          {stats?.summary.total ? (
            <p>All tracked items are below the warning threshold. Upload another POS file to update counts.</p>
          ) : (
            <p>No scans recorded yet. Upload a POS XLS file to start tracking.</p>
          )}
        </div>
      )}

      {/* ── Low Stock / Reorder List + Barcodes ────────────────────────── */}
      <div className="border-t border-zinc-700 pt-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-semibold text-yellow-400">
              Low Stock / Reorder List
              {showBarcodes && !lowStockLoading && ` (${filteredLowStock.length} items)`}
            </h3>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {showBarcodes && (
              <>
                <input
                  type="text"
                  value={labelFilter}
                  onChange={e => setLabelFilter(e.target.value)}
                  placeholder="Filter items…"
                  className="h-7 text-xs px-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-500 w-36"
                />
                <Button size="sm" variant="outline" onClick={handlePrint}
                  className="text-xs border-zinc-600 text-zinc-300 hover:bg-zinc-800 h-7">
                  <Printer className="w-3 h-3 mr-1" /> Print Labels
                </Button>
                <Button size="sm" variant="outline" onClick={() => refetchLowStock()}
                  className="text-xs border-zinc-600 text-zinc-300 hover:bg-zinc-800 h-7">
                  <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => setShowBarcodes(!showBarcodes)}
              className={`text-xs h-7 ${showBarcodes ? "bg-zinc-700 hover:bg-zinc-600 text-white" : "bg-yellow-700 hover:bg-yellow-600 text-white"}`}>
              {showBarcodes ? "Hide" : "Show Reorder List"}
            </Button>
          </div>
        </div>

        {showBarcodes && (
          <>
            {lowStockLoading && (
              <div className="text-center py-6 text-zinc-500 text-sm">Loading low-stock items…</div>
            )}

            {!lowStockLoading && filteredLowStock.length === 0 && (
              <div className="text-center py-6 text-zinc-500 text-sm">
                {(lowStockItems as LowStockItem[]).length === 0
                  ? "No items with stock ≤ 1. Upload a POS file or use Seed Inventory first."
                  : "No items match your filter."
                }
              </div>
            )}

            {!lowStockLoading && filteredLowStock.length > 0 && (
              <>
                <p className="text-xs text-zinc-500 mb-3">
                  Items at or below their reorder threshold. Use <strong>−</strong> / <strong>+</strong> on each card to set how many you need in stock before it shows here. Barcodes are scannable from screen or print as shelf labels.
                </p>

                {/* Print-only styles */}
                <style>{`
                  @media print {
                    body > * { display: none !important; }
                    .print-label-grid { display: grid !important; }
                    .print-label-grid * { display: block !important; color: black !important; background: white !important; }
                    .no-print { display: none !important; }
                    @page { size: letter; margin: 0.5in; }
                  }
                `}</style>

                <div className="print-label-grid grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredLowStock.map(item => {
                    const threshold = localThresholds[item.id] ?? item.reorderPoint ?? 1;
                    return (
                      <div key={item.id}
                        className="bg-white rounded-lg border border-zinc-300 p-2 flex flex-col items-center gap-1 text-center">
                        <div className="text-xs font-bold text-black leading-tight line-clamp-2 w-full">{item.name}</div>
                        {item.brand && <div className="text-[10px] text-gray-500">{item.brand}</div>}
                        <BarcodeDisplay
                          value={item.sku}
                          width={1.5}
                          height={50}
                          displayValue={true}
                          className="max-w-full"
                        />
                        <div className="flex justify-between w-full text-[10px] text-gray-700 px-1">
                          <span>{CATEGORY_LABELS[item.category] ?? item.category}</span>
                          <span className="font-semibold">${Number(item.price).toFixed(2)}</span>
                        </div>
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded w-full ${item.stockQuantity === 0 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {item.stockQuantity === 0 ? "OUT OF STOCK" : `LOW — QTY: ${item.stockQuantity}`}
                        </div>
                        {/* Reorder threshold control — hidden on print */}
                        <div className="no-print flex items-center justify-between w-full px-1 mt-0.5">
                          <span className="text-[10px] text-gray-400">Reorder at ≤</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => adjustThreshold(item, -1)}
                              disabled={threshold <= 0}
                              className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-gray-700 text-xs font-bold leading-none flex items-center justify-center"
                            >−</button>
                            <span className="text-xs font-bold text-gray-800 w-5 text-center">{threshold}</span>
                            <button
                              onClick={() => adjustThreshold(item, 1)}
                              className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold leading-none flex items-center justify-center"
                            >+</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
