import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserPlus, Bell, X, Clock } from "lucide-react";

interface Props { typedUser: any }

const STATUS_COLORS: Record<string, string> = {
  waiting:  "bg-yellow-100 text-yellow-800",
  notified: "bg-blue-100 text-blue-800",
  served:   "bg-green-100 text-green-800",
  cancelled:"bg-gray-100 text-gray-600",
};

export default function WaitlistTab({ typedUser }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState("waiting");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", serviceType: "", notes: "" });

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/waitlist"],
    enabled: !!typedUser?.isAdmin,
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/waitlist", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/waitlist"] }); setShowAdd(false); setForm({ name: "", phone: "", email: "", serviceType: "", notes: "" }); toast({ title: "Added to waitlist" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/admin/waitlist/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/waitlist"] }); toast({ title: "Updated" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/waitlist/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/waitlist"] }); toast({ title: "Removed" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const visible = filter === "all" ? entries : entries.filter(e => e.status === filter);

  const waitTime = (createdAt: string) => {
    const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="notified">Notified</SelectItem>
              <SelectItem value="served">Served</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-gray-500">{visible.length} entries</span>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}><UserPlus className="w-4 h-4 mr-1" />Add to Waitlist</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-gray-400 text-sm">No entries with status "{filter}"</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {visible.map((e: any) => (
            <Card key={e.id}>
              <CardContent className="py-3 px-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{e.name}</span>
                    <Badge className={`text-xs px-2 py-0 ${STATUS_COLORS[e.status] || "bg-gray-100"}`}>{e.status}</Badge>
                    {e.serviceType && <span className="text-xs text-gray-500">{e.serviceType}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {e.phone && <span>{e.phone}</span>}
                    {e.email && <span>{e.email}</span>}
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{waitTime(e.createdAt)}</span>
                  </div>
                  {e.notes && <p className="text-xs text-gray-600 mt-1">{e.notes}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {e.status === "waiting" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => updateMutation.mutate({ id: e.id, status: "notified" })}>
                      <Bell className="w-3 h-3 mr-1" />Notify
                    </Button>
                  )}
                  {e.status !== "served" && e.status !== "cancelled" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-green-700 border-green-300 hover:bg-green-50" onClick={() => updateMutation.mutate({ id: e.id, status: "served" })}>
                      Served
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600" onClick={() => { if (confirm("Remove from waitlist?")) deleteMutation.mutate(e.id); }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add to Waitlist</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="mt-1" /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" /></div>
            </div>
            <div><Label>Service Type</Label><Input placeholder="e.g. Grooming, Boarding" value={form.serviceType} onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))} className="mt-1" /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 h-20" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate(form)} disabled={!form.name || addMutation.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
