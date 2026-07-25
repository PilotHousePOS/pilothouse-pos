import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pin, Plus, Pencil, Trash2, Megaphone } from "lucide-react";

interface Props { typedUser: any }

const emptyForm = { title: "", body: "", expiresAt: "", isPinned: false };

export default function AnnouncementsTab({ typedUser }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [form, setForm] = useState(emptyForm);

  const { data: announcements = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/announcements"],
    enabled: !!typedUser?.isAdmin,
  });

  const openCreate = () => { setForm(emptyForm); setDialog({ open: true }); };
  const openEdit = (a: any) => {
    setForm({ title: a.title, body: a.body, expiresAt: a.expiresAt ? new Date(a.expiresAt).toISOString().slice(0, 10) : "", isPinned: !!a.isPinned });
    setDialog({ open: true, editing: a });
  };

  const saveMutation = useMutation({
    mutationFn: (data: any) => dialog.editing
      ? apiRequest("PATCH", `/api/admin/announcements/${dialog.editing.id}`, data)
      : apiRequest("POST", "/api/admin/announcements", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/announcements"] }); setDialog({ open: false }); toast({ title: dialog.editing ? "Updated" : "Posted" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/announcements/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/announcements"] }); toast({ title: "Deleted" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const now = new Date();
  const pinned = announcements.filter((a: any) => a.isPinned);
  const unpinned = announcements.filter((a: any) => !a.isPinned);

  const isExpired = (a: any) => a.expiresAt && new Date(a.expiresAt) <= now;

  const AnnouncementRow = ({ a }: { a: any }) => (
    <Card className={`${isExpired(a) ? "opacity-50" : ""} ${a.isPinned ? "border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10" : ""}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {a.isPinned && <Pin className="w-3 h-3 text-yellow-600 flex-shrink-0" />}
              <span className="font-semibold text-sm">{a.title}</span>
              {isExpired(a) && <span className="text-xs text-gray-400 italic">(expired)</span>}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{a.body}</p>
            <div className="text-xs text-gray-400 mt-1 flex gap-3">
              <span>{new Date(a.createdAt).toLocaleDateString()}</span>
              {a.expiresAt && <span>Expires {new Date(a.expiresAt).toLocaleDateString()}</span>}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button className="text-gray-400 hover:text-blue-600 p-1" onClick={() => openEdit(a)}><Pencil className="w-3.5 h-3.5" /></button>
            <button className="text-gray-400 hover:text-red-600 p-1" onClick={() => { if (confirm("Delete announcement?")) deleteMutation.mutate(a.id); }}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Post Announcement</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : announcements.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-gray-400">
          <Megaphone className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No announcements yet</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {pinned.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide flex items-center gap-1"><Pin className="w-3 h-3" />Pinned</p>
              {pinned.map((a: any) => <AnnouncementRow key={a.id} a={a} />)}
            </div>
          )}
          {unpinned.length > 0 && (
            <div className="space-y-2">
              {pinned.length > 0 && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent</p>}
              {unpinned.map((a: any) => <AnnouncementRow key={a.id} a={a} />)}
            </div>
          )}
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={o => setDialog({ open: o })}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dialog.editing ? "Edit Announcement" : "Post Announcement"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="mt-1" /></div>
            <div><Label>Body *</Label><Textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} className="mt-1 h-28" /></div>
            <div><Label>Expires On (optional)</Label><Input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} className="mt-1" /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isPinned} onCheckedChange={v => setForm(f => ({ ...f, isPinned: v }))} id="pin-toggle" />
              <Label htmlFor="pin-toggle">Pin at top</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.title || !form.body || saveMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
