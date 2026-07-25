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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Users, Star } from "lucide-react";

interface Props { typedUser: any }

const emptyPlan = { name: "", description: "", price: "", billingInterval: "monthly", visitCredits: "0", isActive: true };

export default function MembershipsTab({ typedUser }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [planDialog, setPlanDialog] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({ userId: "", planId: "" });

  const { data: plans = [], isLoading: loadingPlans } = useQuery<any[]>({ queryKey: ["/api/admin/membership-plans"], enabled: !!typedUser?.isAdmin });
  const { data: subs = [], isLoading: loadingSubs } = useQuery<any[]>({ queryKey: ["/api/admin/member-subscriptions"], enabled: !!typedUser?.isAdmin });
  const { data: allUsers = [] } = useQuery<any[]>({ queryKey: ["/api/admin/users"], enabled: !!typedUser?.isAdmin });

  const openCreatePlan = () => { setPlanForm(emptyPlan); setPlanDialog({ open: true }); };
  const openEditPlan = (p: any) => {
    setPlanForm({ name: p.name, description: p.description || "", price: String(p.price), billingInterval: p.billingInterval, visitCredits: String(p.visitCredits || 0), isActive: p.isActive });
    setPlanDialog({ open: true, editing: p });
  };

  const savePlanMutation = useMutation({
    mutationFn: (data: any) => planDialog.editing
      ? apiRequest("PATCH", `/api/admin/membership-plans/${planDialog.editing.id}`, data)
      : apiRequest("POST", "/api/admin/membership-plans", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/membership-plans"] }); setPlanDialog({ open: false }); toast({ title: "Plan saved" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deletePlanMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/membership-plans/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/membership-plans"] }); toast({ title: "Plan deleted" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const togglePlanMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => apiRequest("PATCH", `/api/admin/membership-plans/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/membership-plans"] }),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/member-subscriptions", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/member-subscriptions"] }); setAssignDialog(false); setAssignForm({ userId: "", planId: "" }); toast({ title: "Plan assigned" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const cancelSubMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/admin/member-subscriptions/${id}`, { status: "cancelled" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/member-subscriptions"] }); toast({ title: "Subscription cancelled" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const planName = (id: number) => plans.find((p: any) => p.id === id)?.name || "—";
  const userName = (id: string) => { const u = allUsers.find((u: any) => u.id === id); return u ? (u.firstName || u.email || u.id) : id; };

  const STATUS_COLORS: Record<string, string> = { active: "bg-green-100 text-green-700", paused: "bg-yellow-100 text-yellow-700", cancelled: "bg-gray-100 text-gray-500" };

  return (
    <div className="space-y-6">
      {/* Plans Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Star className="w-4 h-4 text-yellow-500" />Membership Plans</h3>
          <Button size="sm" onClick={openCreatePlan}><Plus className="w-4 h-4 mr-1" />New Plan</Button>
        </div>

        {loadingPlans ? <p className="text-sm text-gray-500">Loading…</p> :
         plans.length === 0 ? <p className="text-sm text-gray-400 italic">No plans created yet.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plans.map((p: any) => (
              <Card key={p.id} className={`${!p.isActive ? "opacity-60" : ""}`}>
                <CardContent className="py-4 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{p.name}</p>
                      {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button className="text-gray-400 hover:text-blue-600 p-0.5" onClick={() => openEditPlan(p)}><Pencil className="w-3.5 h-3.5" /></button>
                      <button className="text-gray-400 hover:text-red-600 p-0.5" onClick={() => { if (confirm("Delete plan?")) deletePlanMutation.mutate(p.id); }}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <span className="text-lg font-bold">${p.price}</span>
                      <span className="text-xs text-gray-500">/{p.billingInterval}</span>
                      {p.visitCredits > 0 && <p className="text-xs text-blue-600 mt-0.5">{p.visitCredits} visit credits</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{p.isActive ? "Active" : "Inactive"}</span>
                      <Switch checked={p.isActive} onCheckedChange={v => togglePlanMutation.mutate({ id: p.id, isActive: v })} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
         )}
      </div>

      {/* Members Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" />Members</h3>
          <Button size="sm" variant="outline" onClick={() => setAssignDialog(true)}><Plus className="w-4 h-4 mr-1" />Assign Plan</Button>
        </div>

        {loadingSubs ? <p className="text-sm text-gray-500">Loading…</p> :
         subs.length === 0 ? <p className="text-sm text-gray-400 italic">No active memberships.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-xs text-gray-500 text-left">
                <th className="pb-2 font-medium">User</th><th className="pb-2 font-medium">Plan</th>
                <th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium">Started</th>
                <th className="pb-2 font-medium">Ends</th><th className="pb-2 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {subs.map((s: any) => (
                  <tr key={s.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2 pr-3">{userName(s.userId)}</td>
                    <td className="py-2 pr-3">{planName(s.planId)}</td>
                    <td className="py-2 pr-3"><Badge className={`text-xs ${STATUS_COLORS[s.status] || "bg-gray-100 text-gray-500"}`}>{s.status}</Badge></td>
                    <td className="py-2 pr-3 text-xs text-gray-400">{s.startedAt ? new Date(s.startedAt).toLocaleDateString() : "—"}</td>
                    <td className="py-2 pr-3 text-xs text-gray-400">{s.endsAt ? new Date(s.endsAt).toLocaleDateString() : "—"}</td>
                    <td className="py-2">
                      {s.status === "active" && (
                        <button className="text-xs text-red-600 hover:underline" onClick={() => { if (confirm("Cancel this subscription?")) cancelSubMutation.mutate(s.id); }}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
         )}
      </div>

      {/* Plan Dialog */}
      <Dialog open={planDialog.open} onOpenChange={o => setPlanDialog({ open: o })}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{planDialog.editing ? "Edit Plan" : "New Plan"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div><Label>Description</Label><Textarea value={planForm.description} onChange={e => setPlanForm(f => ({ ...f, description: e.target.value }))} className="mt-1 h-16" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Price ($) *</Label><Input type="number" min="0" step="0.01" value={planForm.price} onChange={e => setPlanForm(f => ({ ...f, price: e.target.value }))} className="mt-1" /></div>
              <div>
                <Label>Billing Interval</Label>
                <Select value={planForm.billingInterval} onValueChange={v => setPlanForm(f => ({ ...f, billingInterval: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Visit Credits</Label><Input type="number" min="0" value={planForm.visitCredits} onChange={e => setPlanForm(f => ({ ...f, visitCredits: e.target.value }))} className="mt-1" /></div>
            <div className="flex items-center gap-3">
              <Switch checked={planForm.isActive} onCheckedChange={v => setPlanForm(f => ({ ...f, isActive: v }))} id="plan-active" />
              <Label htmlFor="plan-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog({ open: false })}>Cancel</Button>
            <Button onClick={() => savePlanMutation.mutate({ ...planForm, price: planForm.price, visitCredits: parseInt(planForm.visitCredits) || 0 })} disabled={!planForm.name || !planForm.price || savePlanMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Plan Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign Membership Plan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>User *</Label>
              <Select value={assignForm.userId || "none"} onValueChange={v => setAssignForm(f => ({ ...f, userId: v === "none" ? "" : v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select user…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select user…</SelectItem>
                  {allUsers.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.firstName || u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plan *</Label>
              <Select value={assignForm.planId || "none"} onValueChange={v => setAssignForm(f => ({ ...f, planId: v === "none" ? "" : v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select plan…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select plan…</SelectItem>
                  {plans.filter((p: any) => p.isActive).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name} — ${p.price}/{p.billingInterval}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button>
            <Button onClick={() => assignMutation.mutate(assignForm)} disabled={!assignForm.userId || !assignForm.planId || assignMutation.isPending}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
