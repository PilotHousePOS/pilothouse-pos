import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Eye, GripVertical, ClipboardList } from "lucide-react";

interface Props { typedUser: any }

interface FormField { id: string; type: "text" | "textarea" | "checkbox" | "select"; label: string; required: boolean; options?: string }

const newField = (): FormField => ({ id: crypto.randomUUID(), type: "text", label: "", required: false });

export default function IntakeFormsTab({ typedUser }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [formDialog, setFormDialog] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [formName, setFormName] = useState("");
  const [fields, setFields] = useState<FormField[]>([newField()]);
  const [isActive, setIsActive] = useState(true);
  const [selectedForm, setSelectedForm] = useState<number | null>(null);
  const [submissionsOpen, setSubmissionsOpen] = useState(false);

  const { data: forms = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/intake-forms"], enabled: !!typedUser?.isAdmin });

  const { data: responses = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/intake-forms", selectedForm, "responses"],
    queryFn: () => apiRequest("GET", `/api/admin/intake-forms/${selectedForm}/responses`).then(r => r.json()),
    enabled: !!selectedForm && submissionsOpen,
  });

  const openCreate = () => { setFormName(""); setFields([newField()]); setIsActive(true); setFormDialog({ open: true }); };
  const openEdit = (f: any) => {
    setFormName(f.title);
    setFields(f.fields?.length ? f.fields : [newField()]);
    setIsActive(f.isActive);
    setFormDialog({ open: true, editing: f });
  };

  const saveMutation = useMutation({
    mutationFn: (data: any) => formDialog.editing
      ? apiRequest("PATCH", `/api/admin/intake-forms/${formDialog.editing.id}`, data)
      : apiRequest("POST", "/api/admin/intake-forms", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/intake-forms"] }); setFormDialog({ open: false }); toast({ title: "Saved" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/intake-forms/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/intake-forms"] }); toast({ title: "Deleted" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => apiRequest("PATCH", `/api/admin/intake-forms/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/intake-forms"] }),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const updateField = (id: string, patch: Partial<FormField>) =>
    setFields(fs => fs.map(f => f.id === id ? { ...f, ...patch } : f));

  const moveField = (i: number, dir: -1 | 1) => setFields(fs => {
    const next = [...fs];
    const j = i + dir;
    if (j < 0 || j >= next.length) return fs;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const viewSubmissions = (id: number) => { setSelectedForm(id); setSubmissionsOpen(true); };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="forms">
        <TabsList className="h-8">
          <TabsTrigger value="forms" className="text-xs">Form Builder</TabsTrigger>
          <TabsTrigger value="responses" className="text-xs">Submissions</TabsTrigger>
        </TabsList>

        <TabsContent value="forms" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />New Form</Button>
          </div>
          {isLoading ? <p className="text-sm text-gray-500">Loading…</p> :
           forms.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-gray-400"><ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No forms yet</p></CardContent></Card>
           ) : (
            <div className="space-y-2">
              {forms.map((f: any) => (
                <Card key={f.id}>
                  <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{f.title}</p>
                      <p className="text-xs text-gray-500">{f.fields?.length || 0} fields · {new Date(f.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={f.isActive ? "bg-green-100 text-green-700 text-xs" : "bg-gray-100 text-gray-500 text-xs"}>{f.isActive ? "Active" : "Inactive"}</Badge>
                      <Switch checked={f.isActive} onCheckedChange={v => toggleActiveMutation.mutate({ id: f.id, isActive: v })} />
                      <button className="text-gray-400 hover:text-blue-600 p-1" onClick={() => openEdit(f)}><Pencil className="w-3.5 h-3.5" /></button>
                      <button className="text-gray-400 hover:text-purple-600 p-1" title="View submissions" onClick={() => viewSubmissions(f.id)}><Eye className="w-3.5 h-3.5" /></button>
                      <button className="text-gray-400 hover:text-red-600 p-1" onClick={() => { if (confirm("Delete form?")) deleteMutation.mutate(f.id); }}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
           )}
        </TabsContent>

        <TabsContent value="responses" className="space-y-3 mt-3">
          <div className="flex items-center gap-3">
            <Label className="text-xs flex-shrink-0">Form</Label>
            <Select value={selectedForm ? String(selectedForm) : "none"} onValueChange={v => { if (v !== "none") { setSelectedForm(parseInt(v)); setSubmissionsOpen(true); } }}>
              <SelectTrigger className="h-8 text-xs w-60"><SelectValue placeholder="Select a form…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a form…</SelectItem>
                {forms.map((f: any) => <SelectItem key={f.id} value={String(f.id)}>{f.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedForm && responses.length === 0 && <p className="text-sm text-gray-400">No submissions yet for this form.</p>}
          {responses.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">{r.userId || "Anonymous"} · {new Date(r.submittedAt).toLocaleString()}</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(r.responses || {}).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[140px_1fr] gap-2 text-sm">
                      <span className="font-medium text-gray-600 truncate">{k}</span>
                      <span className="text-gray-800">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Form Builder Dialog */}
      <Dialog open={formDialog.open} onOpenChange={o => setFormDialog({ open: o })}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{formDialog.editing ? "Edit Form" : "New Form"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Form Title *</Label><Input value={formName} onChange={e => setFormName(e.target.value)} className="mt-1" /></div>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="form-active" />
              <Label htmlFor="form-active" className="text-sm">Active (visible to customers)</Label>
            </div>

            <div>
              <Label className="mb-2 block">Fields</Label>
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.id} className="border rounded-lg p-2 bg-gray-50 dark:bg-gray-800/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-0.5">
                        <button disabled={i === 0} onClick={() => moveField(i, -1)} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none"><GripVertical className="w-3 h-3" /></button>
                        <button disabled={i === fields.length - 1} onClick={() => moveField(i, 1)} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none"><GripVertical className="w-3 h-3 rotate-180" /></button>
                      </div>
                      <Input placeholder="Field label" value={f.label} onChange={e => updateField(f.id, { label: e.target.value })} className="flex-1 h-8 text-sm" />
                      <Select value={f.type} onValueChange={v => updateField(f.id, { type: v as any })}>
                        <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="textarea">Textarea</SelectItem>
                          <SelectItem value="checkbox">Checkbox</SelectItem>
                          <SelectItem value="select">Dropdown</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Switch checked={f.required} onCheckedChange={v => updateField(f.id, { required: v })} className="scale-75" />
                        <span className="text-[10px] text-gray-500">Req</span>
                      </div>
                      <button className="text-gray-400 hover:text-red-600" onClick={() => setFields(fs => fs.filter(x => x.id !== f.id))}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    {f.type === "select" && (
                      <Input placeholder="Option 1, Option 2, Option 3" value={f.options || ""} onChange={e => updateField(f.id, { options: e.target.value })} className="text-xs h-7" />
                    )}
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => setFields(fs => [...fs, newField()])}>
                  <Plus className="w-3 h-3 mr-1" />Add Field
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialog({ open: false })}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate({ title: formName, fields, isActive })} disabled={!formName || saveMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
