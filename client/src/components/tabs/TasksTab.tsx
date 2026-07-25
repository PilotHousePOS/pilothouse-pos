import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Props { typedUser: any }

const PRIORITY_COLORS: Record<string, string> = {
  low:    "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high:   "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const STATUS_COLS = [
  { id: "todo",        label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "done",        label: "Done" },
];

const emptyForm = { title: "", description: "", assignedTo: "", dueDate: "", priority: "medium", status: "todo" };

export default function TasksTab({ typedUser }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [form, setForm] = useState(emptyForm);

  const { data: tasks = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/tasks"],
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!typedUser?.isAdmin,
  });

  const openCreate = () => { setForm(emptyForm); setDialog({ open: true }); };
  const openEdit = (t: any) => { setForm({ title: t.title, description: t.description || "", assignedTo: t.assignedTo || "", dueDate: t.dueDate || "", priority: t.priority, status: t.status }); setDialog({ open: true, editing: t }); };

  const saveMutation = useMutation({
    mutationFn: (data: any) => dialog.editing
      ? apiRequest("PATCH", `/api/admin/tasks/${dialog.editing.id}`, data)
      : apiRequest("POST", "/api/admin/tasks", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/tasks"] }); setDialog({ open: false }); toast({ title: dialog.editing ? "Task updated" : "Task created" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/tasks/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/tasks"] }); toast({ title: "Task deleted" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const quickStatus = (id: number, status: string) => {
    apiRequest("PATCH", `/api/admin/tasks/${id}`, { status })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/admin/tasks"] }))
      .catch(() => toast({ title: "Error", variant: "destructive" }));
  };

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-4">
      {typedUser?.isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />New Task</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUS_COLS.map(col => {
          const colTasks = tasks.filter((t: any) => t.status === col.id);
          return (
            <div key={col.id} className="space-y-2">
              <div className="flex items-center gap-2 pb-1 border-b">
                <span className="font-semibold text-sm">{col.label}</span>
                <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2">{colTasks.length}</span>
              </div>
              {colTasks.length === 0 && (
                <p className="text-xs text-gray-400 italic py-2">No tasks</p>
              )}
              {colTasks.map((t: any) => {
                const assignee = allUsers.find((u: any) => u.id === t.assignedTo);
                return (
                  <Card key={t.id} className="shadow-sm">
                    <CardContent className="py-3 px-3">
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug">{t.title}</p>
                          {t.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.description}</p>}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[t.priority] || ""}`}>{t.priority}</Badge>
                            {assignee && (
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-800 text-[9px] flex items-center justify-center font-bold">
                                  {(assignee.firstName || assignee.email || "?")[0].toUpperCase()}
                                </span>
                                {assignee.firstName || assignee.email}
                              </span>
                            )}
                            {t.dueDate && <span className="text-[10px] text-gray-400">Due {t.dueDate}</span>}
                          </div>
                        </div>
                        {typedUser?.isAdmin && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button className="text-gray-400 hover:text-blue-600 p-0.5" onClick={() => openEdit(t)}><Pencil className="w-3 h-3" /></button>
                            <button className="text-gray-400 hover:text-red-600 p-0.5" onClick={() => { if (confirm("Delete task?")) deleteMutation.mutate(t.id); }}><Trash2 className="w-3 h-3" /></button>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 mt-2">
                        {STATUS_COLS.filter(c => c.id !== t.status).map(c => (
                          <button key={c.id} className="text-[10px] text-gray-400 hover:text-gray-700 underline" onClick={() => quickStatus(t.id, c.id)}>→ {c.label}</button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          );
        })}
      </div>

      <Dialog open={dialog.open} onOpenChange={o => setDialog({ open: o })}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dialog.editing ? "Edit Task" : "New Task"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="mt-1" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1 h-20" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["low","medium","high","urgent"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_COLS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Assign To</Label>
                <Select value={form.assignedTo || "unassigned"} onValueChange={v => setForm(f => ({ ...f, assignedTo: v === "unassigned" ? "" : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {allUsers.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.firstName || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="mt-1" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.title || saveMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
