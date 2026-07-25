import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Clock, LogIn, LogOut, Pencil, Trash2 } from "lucide-react";

interface Props { typedUser: any }

function fmtDuration(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function TimeClockTab({ typedUser }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [elapsed, setElapsed] = useState("");
  const [editDialog, setEditDialog] = useState<{ open: boolean; entry?: any }>({ open: false });
  const [editForm, setEditForm] = useState({ clockIn: "", clockOut: "", breakMinutes: "0", notes: "" });
  const [dateFilter, setDateFilter] = useState("");

  const { data: status, isLoading: loadingStatus } = useQuery<any>({
    queryKey: ["/api/admin/time-clock/status"],
    refetchInterval: 60000,
  });

  const { data: entries = [], isLoading: loadingEntries } = useQuery<any[]>({
    queryKey: ["/api/admin/time-clock"],
    enabled: !!typedUser?.isAdmin,
  });

  // Elapsed timer for clocked-in state
  useEffect(() => {
    if (!status?.isClockedIn || !status?.entry?.clockIn) { setElapsed(""); return; }
    const tick = () => {
      const ms = Date.now() - new Date(status.entry.clockIn).getTime();
      setElapsed(fmtDuration(ms));
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [status]);

  const clockInMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/time-clock/clock-in", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/time-clock/status"] }); qc.invalidateQueries({ queryKey: ["/api/admin/time-clock"] }); toast({ title: "Clocked in" }); },
    onError: (e: any) => toast({ title: e?.message || "Error", variant: "destructive" }),
  });

  const clockOutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/time-clock/clock-out", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/time-clock/status"] }); qc.invalidateQueries({ queryKey: ["/api/admin/time-clock"] }); toast({ title: "Clocked out" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/admin/time-clock/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/time-clock"] }); setEditDialog({ open: false }); toast({ title: "Updated" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/time-clock/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/time-clock"] }); toast({ title: "Deleted" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const openEdit = (e: any) => {
    setEditForm({
      clockIn: e.clockIn ? new Date(e.clockIn).toISOString().slice(0, 16) : "",
      clockOut: e.clockOut ? new Date(e.clockOut).toISOString().slice(0, 16) : "",
      breakMinutes: String(e.breakMinutes || 0),
      notes: e.notes || "",
    });
    setEditDialog({ open: true, entry: e });
  };

  const filtered = dateFilter
    ? entries.filter((e: any) => e.clockIn && new Date(e.clockIn).toISOString().slice(0, 10) === dateFilter)
    : entries;

  // Per-user totals
  const userTotals: Record<string, number> = {};
  filtered.forEach((e: any) => {
    if (e.clockIn && e.clockOut) {
      const ms = new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime() - (e.breakMinutes || 0) * 60000;
      userTotals[e.userId] = (userTotals[e.userId] || 0) + ms;
    }
  });

  return (
    <div className="space-y-6">
      {/* Clock In / Out Card */}
      <Card className={`border-2 ${status?.isClockedIn ? "border-green-400" : "border-gray-200"}`}>
        <CardContent className="py-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <Clock className={`w-6 h-6 ${status?.isClockedIn ? "text-green-600" : "text-gray-400"}`} />
            <span className="text-lg font-semibold">
              {loadingStatus ? "…" : status?.isClockedIn ? `Clocked In` : "Not Clocked In"}
            </span>
          </div>
          {status?.isClockedIn && elapsed && (
            <span className="text-3xl font-mono font-bold text-green-600">{elapsed}</span>
          )}
          {status?.isClockedIn && status?.entry?.clockIn && (
            <span className="text-xs text-gray-500">Since {new Date(status.entry.clockIn).toLocaleTimeString()}</span>
          )}
          {status?.isClockedIn ? (
            <Button className="bg-red-600 hover:bg-red-700 text-white mt-1" onClick={() => clockOutMutation.mutate()} disabled={clockOutMutation.isPending}>
              <LogOut className="w-4 h-4 mr-2" />Clock Out
            </Button>
          ) : (
            <Button className="bg-green-600 hover:bg-green-700 text-white mt-1" onClick={() => clockInMutation.mutate()} disabled={clockInMutation.isPending}>
              <LogIn className="w-4 h-4 mr-2" />Clock In
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Timesheet (admin only) */}
      {typedUser?.isAdmin && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Timesheet</CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="h-7 text-xs w-36" />
              {dateFilter && <button className="text-xs text-gray-400 hover:text-gray-600 underline" onClick={() => setDateFilter("")}>Clear</button>}
            </div>
          </div>

          {Object.keys(userTotals).length > 0 && (
            <Card><CardContent className="py-3 px-4 flex flex-wrap gap-4">
              {Object.entries(userTotals).map(([uid, ms]) => (
                <span key={uid} className="text-sm"><span className="font-medium text-xs text-gray-500">{uid.slice(0, 8)}…</span> {fmtDuration(ms)}</span>
              ))}
            </CardContent></Card>
          )}

          {loadingEntries ? <p className="text-sm text-gray-500">Loading…</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-xs text-gray-500 text-left">
                  <th className="pb-2 font-medium">User</th><th className="pb-2 font-medium">Clock In</th>
                  <th className="pb-2 font-medium">Clock Out</th><th className="pb-2 font-medium">Duration</th>
                  <th className="pb-2 font-medium">Break</th><th className="pb-2 font-medium">Notes</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr></thead>
                <tbody>
                  {filtered.map((e: any) => {
                    const dur = e.clockIn && e.clockOut
                      ? fmtDuration(new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime() - (e.breakMinutes || 0) * 60000)
                      : e.clockIn ? "In progress" : "—";
                    return (
                      <tr key={e.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-2 pr-3 text-xs text-gray-500">{e.userId?.slice(0, 8)}…</td>
                        <td className="py-2 pr-3 text-xs">{e.clockIn ? new Date(e.clockIn).toLocaleString() : "—"}</td>
                        <td className="py-2 pr-3 text-xs">{e.clockOut ? new Date(e.clockOut).toLocaleString() : <span className="text-green-600 font-medium">Active</span>}</td>
                        <td className="py-2 pr-3 text-xs font-medium">{dur}</td>
                        <td className="py-2 pr-3 text-xs text-gray-400">{e.breakMinutes ? `${e.breakMinutes}m` : "—"}</td>
                        <td className="py-2 pr-3 text-xs text-gray-400 max-w-[100px] truncate">{e.notes || "—"}</td>
                        <td className="py-2">
                          <div className="flex gap-1">
                            <button className="text-gray-400 hover:text-blue-600 p-1" onClick={() => openEdit(e)}><Pencil className="w-3.5 h-3.5" /></button>
                            <button className="text-gray-400 hover:text-red-600 p-1" onClick={() => { if (confirm("Delete entry?")) deleteMutation.mutate(e.id); }}><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No entries{dateFilter ? " for this date" : ""}</p>}
            </div>
          )}
        </div>
      )}

      <Dialog open={editDialog.open} onOpenChange={o => setEditDialog({ open: o })}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Time Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Clock In</Label><Input type="datetime-local" value={editForm.clockIn} onChange={e => setEditForm(f => ({ ...f, clockIn: e.target.value }))} className="mt-1" /></div>
            <div><Label>Clock Out</Label><Input type="datetime-local" value={editForm.clockOut} onChange={e => setEditForm(f => ({ ...f, clockOut: e.target.value }))} className="mt-1" /></div>
            <div><Label>Break (minutes)</Label><Input type="number" min="0" value={editForm.breakMinutes} onChange={e => setEditForm(f => ({ ...f, breakMinutes: e.target.value }))} className="mt-1" /></div>
            <div><Label>Notes</Label><Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false })}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate({ id: editDialog.entry?.id, ...editForm, breakMinutes: parseInt(editForm.breakMinutes) || 0 })} disabled={updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
