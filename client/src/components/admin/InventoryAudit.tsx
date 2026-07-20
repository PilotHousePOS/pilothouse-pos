import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Barcode, Trash2, CheckCircle, DollarSign, EyeOff, X, RotateCcw, Zap, Image, AlertCircle, ScanLine, Camera } from "lucide-react";
import BarcodeScanner from "@/components/barcode-scanner";

type AuditAction =
  | "keep"
  | "delete"
  | "deactivate"
  | "set_price"
  | "raise_pct"
  | "lower_pct"
  | "raise_flat"
  | "lower_flat"
  | "clear_sku";

interface AuditItem {
  scanId: string;
  id: number | null;
  name: string;
  brand: string;
  sku: string;
  category: string;
  price: number;
  hasPhotos: boolean;
  thumbUrl: string | null;
  action: AuditAction;
  actionValue: string;
  notFound: boolean;
  scannedBarcode: string;
}

const ACTION_LABELS: Record<AuditAction, string> = {
  keep: "Keep — no change",
  delete: "Delete from inventory",
  deactivate: "Hide from store (keep data)",
  set_price: "Set price to $...",
  raise_pct: "Raise price by %",
  lower_pct: "Lower price by %",
  raise_flat: "Raise price by $",
  lower_flat: "Lower price by $",
  clear_sku: "Clear barcode/SKU",
};

const ACTIONS_NEEDING_VALUE: AuditAction[] = ["set_price", "raise_pct", "lower_pct", "raise_flat", "lower_flat"];

const ACTION_COLOR: Record<AuditAction, string> = {
  keep: "bg-zinc-800 border-zinc-700",
  delete: "bg-red-950 border-red-800",
  deactivate: "bg-zinc-900 border-zinc-600",
  set_price: "bg-yellow-950 border-yellow-800",
  raise_pct: "bg-green-950 border-green-800",
  lower_pct: "bg-orange-950 border-orange-800",
  raise_flat: "bg-green-950 border-green-800",
  lower_flat: "bg-orange-950 border-orange-800",
  clear_sku: "bg-purple-950 border-purple-800",
};

const STORAGE_KEY = "inv_audit_session_v1";

function loadSession(): AuditItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSession(items: AuditItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export default function InventoryAudit() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState("");
  const [items, setItems] = useState<AuditItem[]>(loadSession);
  const [isLooking, setIsLooking] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [applyResult, setApplyResult] = useState<{ applied: number; errors: string[] } | null>(null);

  useEffect(() => {
    saveSession(items);
  }, [items]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const updateItem = useCallback((scanId: string, patch: Partial<AuditItem>) => {
    setItems(prev => prev.map(i => i.scanId === scanId ? { ...i, ...patch } : i));
  }, []);

  const removeItem = useCallback((scanId: string) => {
    setItems(prev => prev.filter(i => i.scanId !== scanId));
  }, []);

  const handleScannerDetected = useCallback((upc: string) => {
    setScannerOpen(false);
    setBarcode(upc);
    // slight delay so state settles before lookup fires
    setTimeout(() => {
      setBarcode("");
      setIsLooking(true);
      const code = upc.trim();

      const alreadyScanned = items.find(i => i.scannedBarcode === code);
      if (alreadyScanned) {
        toast({ title: "Already in list", description: alreadyScanned.name });
        setIsLooking(false);
        return;
      }

      apiRequest("GET", `/api/supplies/by-upc/${encodeURIComponent(code)}`)
        .then(r => r.json())
        .then(data => {
          const thumbUrl = Array.isArray(data.imageUrls) && data.imageUrls.length > 0 ? data.imageUrls[0] : null;
          setItems(prev => [{
            scanId: `${Date.now()}-${code}`,
            id: data.id, name: data.name || "Unknown",
            brand: data.brand || "", sku: data.sku || code,
            category: data.category || "",
            price: parseFloat(data.price) || 0,
            hasPhotos: Array.isArray(data.imageUrls) && data.imageUrls.length > 0,
            thumbUrl, action: "keep", actionValue: "",
            notFound: false, scannedBarcode: code,
          }, ...prev]);
        })
        .catch(() => {
          setItems(prev => [{
            scanId: `${Date.now()}-${code}`,
            id: null, name: "Not found in inventory",
            brand: "", sku: code, category: "",
            price: 0, hasPhotos: false, thumbUrl: null,
            action: "keep", actionValue: "",
            notFound: true, scannedBarcode: code,
          }, ...prev]);
          toast({ title: "Barcode not in system", description: code, variant: "destructive" });
        })
        .finally(() => { setIsLooking(false); inputRef.current?.focus(); });
    }, 50);
  }, [items, toast]);

  const handleScan = async () => {
    const code = barcode.trim();
    if (!code) return;
    setBarcode("");
    setIsLooking(true);

    const alreadyScanned = items.find(i => i.scannedBarcode === code);
    if (alreadyScanned) {
      toast({ title: "Already in list", description: alreadyScanned.name, variant: "default" });
      setIsLooking(false);
      inputRef.current?.focus();
      return;
    }

    try {
      const supply = await apiRequest("GET", `/api/supplies/by-upc/${encodeURIComponent(code)}`);
      const data = await supply.json();

      const thumbUrl =
        Array.isArray(data.imageUrls) && data.imageUrls.length > 0
          ? data.imageUrls[0]
          : null;

      setItems(prev => [
        {
          scanId: `${Date.now()}-${code}`,
          id: data.id,
          name: data.name || "Unknown",
          brand: data.brand || "",
          sku: data.sku || code,
          category: data.category || "",
          price: parseFloat(data.price) || 0,
          hasPhotos: Array.isArray(data.imageUrls) && data.imageUrls.length > 0,
          thumbUrl,
          action: "keep",
          actionValue: "",
          notFound: false,
          scannedBarcode: code,
        },
        ...prev,
      ]);
    } catch {
      setItems(prev => [
        {
          scanId: `${Date.now()}-${code}`,
          id: null,
          name: "Not found in inventory",
          brand: "",
          sku: code,
          category: "",
          price: 0,
          hasPhotos: false,
          thumbUrl: null,
          action: "keep",
          actionValue: "",
          notFound: true,
          scannedBarcode: code,
        },
        ...prev,
      ]);
      toast({ title: "Barcode not in system", description: code, variant: "destructive" });
    } finally {
      setIsLooking(false);
      inputRef.current?.focus();
    }
  };

  const applyMutation = useMutation({
    mutationFn: async () => {
      const actions = items
        .filter(i => !i.notFound && i.id !== null && i.action !== "keep")
        .map(i => ({
          id: i.id!,
          action: i.action,
          value: ACTIONS_NEEDING_VALUE.includes(i.action) ? parseFloat(i.actionValue) : undefined,
        }))
        .filter(a => !ACTIONS_NEEDING_VALUE.includes(a.action as AuditAction) || (a.value !== undefined && !isNaN(a.value!)));

      if (actions.length === 0) throw new Error("No actions to apply (all items set to Keep)");

      const res = await apiRequest("POST", "/api/admin/inventory-audit/apply", { actions });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (result) => {
      setApplyResult(result);
      const applied = items.filter(i => !i.notFound && i.id !== null && i.action !== "keep");
      setItems(prev => prev.filter(i => !applied.find(a => a.scanId === i.scanId) || i.action === "keep"));
      toast({ title: `Applied ${result.applied} actions`, description: result.errors.length ? `${result.errors.length} errors` : "All succeeded" });
    },
    onError: (e: any) => {
      toast({ title: "Failed to apply", description: e.message, variant: "destructive" });
    },
  });

  const summary = items.reduce((acc, i) => {
    acc[i.action] = (acc[i.action] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pendingCount = items.filter(i => !i.notFound && i.action !== "keep").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-yellow-400" />
            Inventory Audit Scanner
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">Scan barcodes with your scanner or type manually. Choose an action for each item, then Apply.</p>
        </div>
        <div className="flex gap-2">
          {items.length > 0 && (
            <Button variant="outline" size="sm" className="text-xs border-zinc-700"
              onClick={() => { setItems([]); setApplyResult(null); localStorage.removeItem(STORAGE_KEY); }}>
              <RotateCcw className="w-3 h-3 mr-1" /> Clear All
            </Button>
          )}
          {pendingCount > 0 && (
            <Button size="sm" className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-bold"
              onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
              <Zap className="w-3 h-3 mr-1" />
              {applyMutation.isPending ? "Applying…" : `Apply ${pendingCount} Action${pendingCount !== 1 ? "s" : ""}`}
            </Button>
          )}
        </div>
      </div>

      {/* Scanner input */}
      <div className="flex gap-2 items-center bg-zinc-900 border border-zinc-700 rounded-lg p-3">
        <Barcode className="w-5 h-5 text-yellow-400 flex-shrink-0" />
        <Input
          ref={inputRef}
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleScan()}
          placeholder="Scan or type a barcode, then press Enter…"
          className="bg-transparent border-0 text-white placeholder:text-zinc-500 focus-visible:ring-0 text-sm flex-1 h-8 p-0"
          disabled={isLooking}
        />
        <Button size="sm" onClick={() => setScannerOpen(true)} disabled={isLooking}
          variant="outline"
          className="border-zinc-600 text-zinc-300 hover:text-white hover:border-zinc-400 h-7 px-2">
          <Camera className="w-4 h-4" />
        </Button>
        <Button size="sm" onClick={handleScan} disabled={isLooking || !barcode.trim()}
          className="bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold h-7 px-3">
          {isLooking ? "…" : "Enter"}
        </Button>
      </div>

      {/* Full-screen camera scanner overlay */}
      {scannerOpen && (
        <BarcodeScanner
          onClose={() => setScannerOpen(false)}
          onDetected={handleScannerDetected}
        />
      )}

      {/* Summary badges */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-zinc-400">{items.length} items in list —</span>
          {summary.keep && <Badge variant="outline" className="border-zinc-600 text-zinc-400">{summary.keep} keep</Badge>}
          {summary.delete && <Badge variant="outline" className="border-red-700 text-red-400">{summary.delete} delete</Badge>}
          {summary.deactivate && <Badge variant="outline" className="border-zinc-500 text-zinc-300">{summary.deactivate} hide</Badge>}
          {(summary.set_price || summary.raise_pct || summary.lower_pct || summary.raise_flat || summary.lower_flat) && (
            <Badge variant="outline" className="border-yellow-700 text-yellow-400">
              {(summary.set_price || 0) + (summary.raise_pct || 0) + (summary.lower_pct || 0) + (summary.raise_flat || 0) + (summary.lower_flat || 0)} price change{((summary.set_price || 0) + (summary.raise_pct || 0) + (summary.lower_pct || 0) + (summary.raise_flat || 0) + (summary.lower_flat || 0)) !== 1 ? "s" : ""}
            </Badge>
          )}
          {summary.clear_sku && <Badge variant="outline" className="border-purple-700 text-purple-400">{summary.clear_sku} clear SKU</Badge>}
          {items.filter(i => i.notFound).length > 0 && (
            <Badge variant="outline" className="border-orange-700 text-orange-400">{items.filter(i => i.notFound).length} not found</Badge>
          )}
          {items.filter(i => i.hasPhotos).length > 0 && (
            <Badge variant="outline" className="border-blue-700 text-blue-400">
              <Image className="w-3 h-3 mr-1" />{items.filter(i => i.hasPhotos).length} with photos
            </Badge>
          )}
        </div>
      )}

      {/* Apply result */}
      {applyResult && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm">
          <p className="text-green-400 font-semibold">✓ Applied {applyResult.applied} actions successfully</p>
          {applyResult.errors.length > 0 && (
            <ul className="mt-1 text-red-400 text-xs space-y-0.5">
              {applyResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
          <Button variant="ghost" size="sm" className="mt-2 text-xs text-zinc-400 h-6 px-2"
            onClick={() => setApplyResult(null)}>Dismiss</Button>
        </div>
      )}

      {/* Item list */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500 border border-dashed border-zinc-700 rounded-lg">
          <ScanLine className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">Nothing scanned yet</p>
          <p className="text-xs mt-1">Scan barcodes above to build your audit list</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.scanId}
              className={`border rounded-lg p-3 transition-colors ${item.notFound ? "bg-orange-950 border-orange-800" : ACTION_COLOR[item.action]}`}>
              <div className="flex gap-3 items-start">

                {/* Thumbnail */}
                <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                  {item.thumbUrl ? (
                    <img src={item.thumbUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : item.notFound ? (
                    <AlertCircle className="w-5 h-5 text-orange-400" />
                  ) : (
                    <Barcode className="w-5 h-5 text-zinc-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${item.notFound ? "text-orange-300" : "text-white"}`}>
                        {item.name}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {item.brand && <span className="text-xs text-zinc-400">{item.brand}</span>}
                        {item.category && <span className="text-xs text-zinc-500">{item.category}</span>}
                        <span className="text-xs text-zinc-500 font-mono">{item.scannedBarcode}</span>
                        {!item.notFound && <span className="text-xs text-zinc-300">${item.price.toFixed(2)}</span>}
                        {item.hasPhotos && (
                          <span className="text-xs text-blue-400 flex items-center gap-0.5">
                            <Image className="w-3 h-3" /> photos
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeItem(item.scanId)}
                      className="text-zinc-600 hover:text-zinc-300 flex-shrink-0 mt-0.5">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Action row */}
                  {!item.notFound && (
                    <div className="flex gap-2 mt-2 items-center flex-wrap">
                      <Select value={item.action} onValueChange={v => updateItem(item.scanId, { action: v as AuditAction, actionValue: "" })}>
                        <SelectTrigger className="h-7 text-xs w-52 bg-zinc-900 border-zinc-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {(Object.entries(ACTION_LABELS) as [AuditAction, string][]).map(([val, label]) => (
                            <SelectItem key={val} value={val} className="text-xs text-white hover:bg-zinc-800">{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {ACTIONS_NEEDING_VALUE.includes(item.action) && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-zinc-400">
                            {item.action === "set_price" ? "$" : item.action.includes("pct") ? "%" : "$"}
                          </span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.actionValue}
                            onChange={e => updateItem(item.scanId, { actionValue: e.target.value })}
                            placeholder={item.action === "set_price" ? "new price" : item.action.includes("pct") ? "0.00" : "0.00"}
                            className="h-7 w-24 text-xs bg-zinc-900 border-zinc-600 text-white"
                          />
                        </div>
                      )}

                      {item.action === "delete" && (
                        <span className="text-xs text-red-400 flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> Will be permanently removed
                          {item.hasPhotos && <span className="text-yellow-400 ml-1">⚠ has photos</span>}
                        </span>
                      )}
                      {item.action === "keep" && <span className="text-xs text-zinc-500">No change</span>}
                      {item.action === "deactivate" && <span className="text-xs text-zinc-400 flex items-center gap-1"><EyeOff className="w-3 h-3" /> Hidden from customers, data preserved</span>}
                      {item.action === "clear_sku" && <span className="text-xs text-purple-400">Barcode removed — item stays in inventory</span>}
                    </div>
                  )}
                  {item.notFound && (
                    <p className="text-xs text-orange-400 mt-1">This barcode doesn't match any item in your inventory</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom apply button (repeat for long lists) */}
      {items.length > 5 && pendingCount > 0 && (
        <div className="flex justify-end pt-2">
          <Button size="sm" className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-bold"
            onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
            <Zap className="w-3 h-3 mr-1" />
            {applyMutation.isPending ? "Applying…" : `Apply ${pendingCount} Action${pendingCount !== 1 ? "s" : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
}
