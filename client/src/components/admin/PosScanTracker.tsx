import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, ShieldCheck, ShieldOff, Trash2, AlertTriangle, Clock } from "lucide-react";

interface TrackerItem {
  supply_id: number;
  item_name: string;
  sku: string;
  zero_count: number;
  last_scan_at: string;
}

interface Stats {
  eligible: TrackerItem[];
  approaching: TrackerItem[];
  summary: { total: number; eligible_count: number };
}

function CountBar({ count }: { count: number }) {
  const pct = Math.min((count / 10) * 100, 100);
  const color = count >= 10 ? "bg-red-500" : count >= 7 ? "bg-orange-500" : "bg-yellow-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-300 w-8 text-right">{count}/10</span>
    </div>
  );
}

export default function PosScanTracker() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<{
    processed: number; incremented: number; reset: number; nowEligible: number; skipped: number;
  } | null>(null);

  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/admin/pos-scan/stats"],
    refetchOnWindowFocus: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/pos-scan/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (result) => {
      setUploadResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pos-scan/stats"] });
      toast({
        title: "POS file processed",
        description: `${result.incremented} items incremented · ${result.reset} counters reset · ${result.nowEligible} newly eligible`,
      });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const protectMutation = useMutation({
    mutationFn: async ({ supplyId, protect }: { supplyId: number; protect: boolean }) => {
      const res = await fetch("/api/admin/pos-scan/protect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
      const res = await fetch("/api/admin/pos-scan/delete-eligible", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pos-scan/stats"] });
      toast({ title: `Deleted ${result.deleted} items`, description: "Items with 10+ consecutive zero-stock scans removed" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const eligible = stats?.eligible ?? [];
  const approaching = stats?.approaching ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">POS Zero-Stock Tracker</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Upload the ExaTouch Items export. Items at 0 on the POS 10 times in a row become eligible for deletion.
            Stock in our app is ignored — only POS quantity counts.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) { uploadMutation.mutate(f); e.target.value = ""; }
            }} />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs"
            size="sm">
            <Upload className="w-3 h-3 mr-1" />
            {uploadMutation.isPending ? "Processing…" : "Upload POS XLS"}
          </Button>
          {eligible.length > 0 && (
            <Button
              onClick={() => {
                if (confirm(`Delete ${eligible.length} items that have been at 0 stock on the POS 10+ times? This cannot be undone.`)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              variant="destructive"
              size="sm"
              className="text-xs">
              <Trash2 className="w-3 h-3 mr-1" />
              {deleteMutation.isPending ? "Deleting…" : `Delete ${eligible.length} Eligible`}
            </Button>
          )}
        </div>
      </div>

      {/* Upload result summary */}
      {uploadResult && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          {[
            { label: "Processed", value: uploadResult.processed, color: "text-white" },
            { label: "Incremented", value: uploadResult.incremented, color: "text-yellow-400" },
            { label: "Reset to 0", value: uploadResult.reset, color: "text-green-400" },
            { label: "Now Eligible", value: uploadResult.nowEligible, color: "text-red-400" },
            { label: "No DB Match", value: uploadResult.skipped, color: "text-zinc-500" },
          ].map(s => (
            <div key={s.label}>
              <div className={`text-xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Summary pills */}
      {!isLoading && stats && (
        <div className="flex gap-3 flex-wrap">
          <span className="text-xs bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 text-zinc-300">
            {stats.summary.total?.toLocaleString() ?? 0} items tracked
          </span>
          <span className="text-xs bg-red-950 border border-red-800 rounded-full px-3 py-1 text-red-300">
            {eligible.length} ready to delete (10+)
          </span>
          <span className="text-xs bg-orange-950 border border-orange-800 rounded-full px-3 py-1 text-orange-300">
            {approaching.length} approaching (7–9)
          </span>
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
            {eligible.map(item => (
              <div key={item.supply_id} className="flex items-center gap-3 bg-zinc-900 border border-red-900/40 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{item.item_name}</div>
                  <div className="text-[11px] text-zinc-500">{item.sku}</div>
                  <CountBar count={item.zero_count} />
                </div>
                <Button
                  size="sm" variant="outline"
                  className="text-[10px] border-green-800 text-green-400 hover:bg-green-950 shrink-0 h-7 px-2"
                  onClick={() => protectMutation.mutate({ supplyId: item.supply_id, protect: true })}
                  disabled={protectMutation.isPending}>
                  <ShieldCheck className="w-3 h-3 mr-1" /> Protect
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approaching */}
      {approaching.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-orange-400">Approaching Deletion — 7–9 Scans ({approaching.length})</h3>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {approaching.map(item => (
              <div key={item.supply_id} className="flex items-center gap-3 bg-zinc-900 border border-orange-900/30 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{item.item_name}</div>
                  <div className="text-[11px] text-zinc-500">{item.sku}</div>
                  <CountBar count={item.zero_count} />
                </div>
                <Button
                  size="sm" variant="outline"
                  className="text-[10px] border-green-800 text-green-400 hover:bg-green-950 shrink-0 h-7 px-2"
                  onClick={() => protectMutation.mutate({ supplyId: item.supply_id, protect: true })}
                  disabled={protectMutation.isPending}>
                  <ShieldCheck className="w-3 h-3 mr-1" /> Protect
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && eligible.length === 0 && approaching.length === 0 && (
        <div className="text-center py-10 text-zinc-500 text-sm">
          {stats?.summary.total ? (
            <p>All tracked items are below the warning threshold. Upload another POS file to update counts.</p>
          ) : (
            <p>No scans recorded yet. Upload a POS XLS file to start tracking.</p>
          )}
        </div>
      )}
    </div>
  );
}
