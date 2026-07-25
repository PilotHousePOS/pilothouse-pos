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
import { Plus, Pencil, Trash2, Send, FileText } from "lucide-react";

interface Props { typedUser: any }

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  sent:      "bg-blue-100 text-blue-700",
  accepted:  "bg-green-100 text-green-700",
  declined:  "bg-red-100 text-red-700",
  converted: "bg-purple-100 text-purple-700",
};

interface LineItem { description: string; qty: number; unitPrice: number }
const emptyLine = (): LineItem => ({ description: "", qty: 1, unitPrice: 0 });
const emptyForm = () => ({ title: "", contactId: "", lineItems: [emptyLine()], notes: "", expiresAt: "" });

export default function EstimatesTab({ typedUser }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [form, setForm] = useState<any>(emptyForm());

  const { data: estimates = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/estimates"], enabled: !!typedUser?.isAdmin });
  const { data: contacts = [] } = useQuery<any[]>({ queryKey: ["/api/contacts"], enabled: !!typedUser?.isAdmin });

  const openCreate = () => { setForm(emptyForm()); setDialog({ open: true }); };
  const openEdit = (e: any) => {
    setForm({ title: e.title, contactId: e.contactId ? String(e.contactId) : "", lineItems: e.lineItems?.length ? e.lineItems : [emptyLine()], notes: e.notes || "", expiresAt: e.expiresAt ? new Date(e.expiresAt).toISOString().slice(0, 10) : "" });
    setDialog({ open: true, editing: e });
  };

  const saveMutation = useMutation({
    mutationFn: (data: any) => dialog.editing
      ? apiRequest("PATCH", `/api/admin/estimates/${dialog.editing.id}`, data)
      : apiRequest("POST", "/api/admin/estimates", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/estimates"] }); setDialog({ open: false }); toast({ title: "Saved" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/estimates/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/estimates"] }); toast({ title: "Deleted" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PATCH", `/api/admin/estimates/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/estimates"] }); toast({ title: "Updated" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const lineTotal = (li: LineItem) => li.qty * li.unitPrice;
  const formTotal = form.lineItems?.reduce((s: number, li: LineItem) => s + lineTotal(li), 0) ?? 0;

  const setLine = (i: number, field: keyof LineItem, value: any) => setForm((f: any) => {
    const items = [...f.lineItems];
    items[i] = { ...items[i], [field]: field === "description" ? value : parseFloat(value) || 0 };
    return { ...f, lineItems: items };
  });

  const addLine = () => setForm((f: any) => ({ ...f, lineItems: [...f.lineItems, emptyLine()] }));
  const removeLine = (i: number) => setForm((f: any) => ({ ...f, lineItems: f.lineItems.filter((_: any, j: number) => j !== i) }));

  const contactName = (id: number) => { const c = contacts.find((c: any) => c.id === id); return c ? (c.name || c.firstName || c.email) : "—"; };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />New Estimate</Button>
      </div>

      {isLoading ? <p className="text-sm text-gray-500">Loading…</p> :
       estimates.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-gray-400"><FileText className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No estimates yet</p></CardContent></Card>
       ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-gray-500 text-left">
              <th className="pb-2 font-medium">Title</th><th className="pb-2 font-medium">Contact</th>
              <th className="pb-2 font-medium">Total</th><th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Created</th><th className="pb-2 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {estimates.map((e: any) => (
                <tr key={e.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-2 pr-3 font-medium">{e.title}</td>
                  <td className="py-2 pr-3 text-gray-500">{contactName(e.contactId)}</td>
                  <td className="py-2 pr-3">${parseFloat(e.total || "0").toFixed(2)}</td>
                  <td className="py-2 pr-3"><Badge className={`text-xs ${STATUS_COLORS[e.status] || ""}`}>{e.status}</Badge></td>
                  <td className="py-2 pr-3 text-gray-400 text-xs">{new Date(e.createdAt).toLocaleDateString()}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <button className="text-gray-400 hover:text-blue-600 p-1" onClick={() => openEdit(e)}><Pencil className="w-3.5 h-3.5" /></button>
                      {e.status === "draft" && <button className="text-gray-400 hover:text-blue-600 p-1" title="Mark Sent" onClick={() => actionMutation.mutate({ id: e.id, status: "sent" })}><Send className="w-3.5 h-3.5" /></button>}
                      {e.status === "sent" && <button className="text-[10px] text-green-700 hover:underline px-1" onClick={() => actionMutation.mutate({ id: e.id, status: "accepted" })}>Accept</button>}
                      {e.status === "sent" && <button className="text-[10px] text-red-600 hover:underline px-1" onClick={() => actionMutation.mutate({ id: e.id, status: "declined" })}>Decline</button>}
                      {(e.status === "accepted" || e.status === "sent") && <button className="text-[10px] text-purple-700 hover:underline px-1" onClick={() => actionMutation.mutate({ id: e.id, status: "converted" })}>Convert</button>}
                      <button className="text-gray-400 hover:text-red-600 p-1" onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(e.id); }}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={o => setDialog({ open: o })}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog.editing ? "Edit Estimate" : "New Estimate"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label>Contact</Label>
              <Select value={form.contactId || "none"} onValueChange={v => setForm((f: any) => ({ ...f, contactId: v === "none" ? "" : v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select contact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {contacts.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name || c.firstName || c.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Line Items</Label>
              <div className="mt-1 space-y-2">
                {form.lineItems?.map((li: LineItem, i: number) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_80px_24px] gap-1 items-center">
                    <Input placeholder="Description" value={li.description} onChange={e => setLine(i, "description", e.target.value)} className="text-sm h-8" />
                    <Input type="number" min="1" placeholder="Qty" value={li.qty} onChange={e => setLine(i, "qty", e.target.value)} className="text-sm h-8" />
                    <Input type="number" min="0" placeholder="Price" value={li.unitPrice} onChange={e => setLine(i, "unitPrice", e.target.value)} className="text-sm h-8" />
                    <button onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addLine}><Plus className="w-3 h-3 mr-1" />Add Line</Button>
                  <span className="text-sm font-semibold">Total: ${formTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} className="mt-1 h-16" /></div>
            <div><Label>Expires On</Label><Input type="date" value={form.expiresAt} onChange={e => setForm((f: any) => ({ ...f, expiresAt: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate({ ...form, contactId: form.contactId ? parseInt(form.contactId) : null })} disabled={!form.title || saveMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
