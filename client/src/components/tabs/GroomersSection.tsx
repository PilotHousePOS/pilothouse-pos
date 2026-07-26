/**
 * GroomersSection — multi-group service member management panel.
 * Groups ("Service Members", "Technicians", etc.) are stored in
 * enabledFeatures.serviceGroups and rendered as collapsible sections.
 * Groomers carry a groupId column linking them to a group.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  UserPlus, Pencil, Trash2, Eye, EyeOff, CalendarX2, Plus, Mail,
  Phone, Users, MoveRight, Check, X,
} from "lucide-react";
import type { User } from "@shared/schema";

interface ServiceGroup { id: string; name: string }

const DEFAULT_GROUP: ServiceGroup = { id: "default", name: "Service Members" };

interface Props {
  typedUser: User | null;
}

// ── GroomerForm ───────────────────────────────────────────────────────────────

function GroomerForm({
  groomer, groups, onSubmit, isPending,
}: { groomer?: any; groups: ServiceGroup[]; onSubmit: (data: any) => void; isPending: boolean }) {
  const [formData, setFormData] = useState({
    name: groomer?.name || "",
    email: groomer?.email || "",
    phone: groomer?.phone || "",
    specialties: groomer?.specialties || "",
    isActive: groomer?.isActive !== undefined ? groomer.isActive : true,
    groupId: groomer?.groupId || groups[0]?.id || "default",
  });

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(formData); }} className="space-y-4">
      <div>
        <Label>Name *</Label>
        <Input value={formData.name} required onChange={e => setFormData({ ...formData, name: e.target.value })} />
      </div>
      <div>
        <Label>Email</Label>
        <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
      </div>
      <div>
        <Label>Phone</Label>
        <Input type="tel" value={formData.phone} placeholder="(555) 123-4567" onChange={e => setFormData({ ...formData, phone: e.target.value })} />
      </div>
      <div>
        <Label>Specialties</Label>
        <Textarea rows={2} value={formData.specialties} placeholder="e.g., Full Grooming, Bath Only"
          onChange={e => setFormData({ ...formData, specialties: e.target.value })} />
      </div>
      {groups.length > 1 && (
        <div>
          <Label>Group</Label>
          <Select value={formData.groupId} onValueChange={v => setFormData({ ...formData, groupId: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Switch checked={formData.isActive} onCheckedChange={v => setFormData({ ...formData, isActive: v })} />
        <Label>Active</Label>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving…" : groomer ? "Update" : "Add"}
      </Button>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GroomersSection({ typedUser }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addToGroupId, setAddToGroupId] = useState<string>("default");
  const [editingGroomer, setEditingGroomer] = useState<any>(null);
  const [groomerToDelete, setGroomerToDelete] = useState<any>(null);
  const [isAddBlockedOpen, setIsAddBlockedOpen] = useState(false);
  const [blockedForm, setBlockedForm] = useState<{
    groomerId: string; dates: Date[]; reason: string; notes: string;
  }>({ groomerId: "", dates: [], reason: "sick", notes: "" });

  // Group editing
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: tenantInfo } = useQuery<{ enabledFeatures?: any }>({
    queryKey: ["/api/tenants/current"],
    enabled: !!typedUser?.isAdmin,
  });

  const groomersQ = useQuery<any[]>({
    queryKey: ["/api/admin/groomers"],
    enabled: !!(typedUser?.isAdmin || typedUser?.isGroomer),
  });

  const { data: blockedDays = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/groomer-blocked-days"],
    enabled: !!typedUser?.isAdmin,
  });

  // Derive groups from enabledFeatures
  const rawGroups: ServiceGroup[] = (tenantInfo?.enabledFeatures as any)?.serviceGroups;
  const groups: ServiceGroup[] = Array.isArray(rawGroups) && rawGroups.length > 0
    ? rawGroups : [DEFAULT_GROUP];

  const isOwner = !!(typedUser as any)?.isSuperiorManager;
  const isAdmin = !!typedUser?.isAdmin;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const saveGroups = async (newGroups: ServiceGroup[]) => {
    await apiRequest("PUT", "/api/admin/service-groups", newGroups);
    qc.invalidateQueries({ queryKey: ["/api/tenants/current"] });
  };

  const invalidateGroomers = () => qc.invalidateQueries({ queryKey: ["/api/admin/groomers"] });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/groomers", data),
    onSuccess: (_, vars) => {
      const gName = groups.find(g => g.id === vars.groupId)?.name ?? "group";
      toast({ title: `Added to ${gName}` });
      setIsAddOpen(false);
      invalidateGroomers();
    },
    onError: () => toast({ title: "Error", description: "Failed to add member.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/admin/groomers/${id}`, data),
    onSuccess: () => { toast({ title: "Member updated" }); setEditingGroomer(null); invalidateGroomers(); },
    onError: () => toast({ title: "Error", description: "Failed to update.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/groomers/${id}`),
    onSuccess: () => { toast({ title: "Member removed" }); setGroomerToDelete(null); invalidateGroomers(); },
    onError: () => toast({ title: "Error", description: "Failed to remove.", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PUT", `/api/admin/groomers/${id}`, { isActive }),
    onSuccess: () => { toast({ title: "Status updated" }); invalidateGroomers(); },
  });

  const updateOffDaysMutation = useMutation({
    mutationFn: ({ id, offDays }: { id: number; offDays: number[] }) =>
      apiRequest("PUT", `/api/admin/groomers/${id}`, { offDays }),
    onSuccess: () => { toast({ title: "Off days updated" }); invalidateGroomers(); },
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, groupId }: { id: number; groupId: string }) =>
      apiRequest("PUT", `/api/admin/groomers/${id}`, { groupId }),
    onSuccess: () => { toast({ title: "Moved" }); invalidateGroomers(); },
    onError: () => toast({ title: "Error", description: "Failed to move member.", variant: "destructive" }),
  });

  const createBlockedMutation = useMutation({
    mutationFn: async (d: { groomerId: number; dates: string[]; reason: string; notes?: string }) => {
      for (const date of d.dates)
        await apiRequest("POST", "/api/admin/groomer-blocked-days", { groomerId: d.groomerId, date, reason: d.reason, notes: d.notes });
    },
    onSuccess: () => {
      toast({ title: "Blocked days added", description: `${blockedForm.dates.length} day(s) added.` });
      setIsAddBlockedOpen(false);
      setBlockedForm({ groomerId: "", dates: [], reason: "sick", notes: "" });
      qc.invalidateQueries({ queryKey: ["/api/admin/groomer-blocked-days"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to add blocked days.", variant: "destructive" }),
  });

  const deleteBlockedMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/groomer-blocked-days/${id}`),
    onSuccess: () => { toast({ title: "Blocked day removed" }); qc.invalidateQueries({ queryKey: ["/api/admin/groomer-blocked-days"] }); },
  });

  // ── Group management ──────────────────────────────────────────────────────
  const addGroup = () => {
    const newId = `sg_${Date.now()}`;
    const newName = `New Group`;
    const newGroups = [...groups, { id: newId, name: newName }];
    saveGroups(newGroups).then(() => {
      setEditingGroupId(newId);
      setEditingGroupName(newName);
    });
  };

  const renameGroup = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await saveGroups(groups.map(g => g.id === id ? { ...g, name: trimmed } : g));
    setEditingGroupId(null);
  };

  const removeGroup = async (id: string) => {
    // Move all groomers in this group to default before removing
    const members = (groomersQ.data || []).filter((g: any) => (g.groupId || "default") === id);
    await Promise.all(members.map((m: any) => apiRequest("PUT", `/api/admin/groomers/${m.id}`, { groupId: "default" })));
    await saveGroups(groups.filter(g => g.id !== id));
    invalidateGroomers();
    setDeleteGroupId(null);
    toast({ title: "Group removed", description: members.length > 0 ? `${members.length} member(s) moved to ${groups[0]?.name || "default group"}.` : undefined });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const allGroomers: any[] = groomersQ.data || [];

  return (
    <>
      {/* ── Groups ── */}
      <div className="mt-6 space-y-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Service roster — members appear as assignable providers in the booking flow.
          </p>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={addGroup}>
              <Plus className="w-3 h-3 mr-1" /> Add Group
            </Button>
          )}
        </div>

        {groups.map(group => {
          const members = allGroomers.filter(g => (g.groupId || "default") === group.id);
          const otherGroups = groups.filter(g => g.id !== group.id);
          const isEditingName = editingGroupId === group.id;

          return (
            <Card key={group.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                    {isEditingName ? (
                      <div className="flex items-center gap-1 flex-1">
                        <Input
                          autoFocus
                          value={editingGroupName}
                          onChange={e => setEditingGroupName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") renameGroup(group.id, editingGroupName);
                            if (e.key === "Escape") setEditingGroupId(null);
                          }}
                          className="h-7 text-sm font-semibold max-w-[200px]"
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600"
                          onClick={() => renameGroup(group.id, editingGroupName)}>
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setEditingGroupId(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <CardTitle className="text-base">{group.name}</CardTitle>
                        <Badge variant="secondary" className="text-xs">{members.length}</Badge>
                        {isOwner && (
                          <button
                            onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name); }}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Rename group"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <Button size="sm" variant="outline"
                        onClick={() => { setAddToGroupId(group.id); setIsAddOpen(true); }}>
                        <UserPlus className="w-3 h-3 mr-1" /> Add Member
                      </Button>
                    )}
                    {isOwner && groups.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteGroupId(group.id)} title="Remove group">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {groomersQ.isLoading ? (
                  <div className="text-center py-6">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                  </div>
                ) : members.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No members yet — add one or assign an employee here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {members.map((groomer: any) => (
                      <Card key={groomer.id} className="border shadow-sm">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-semibold text-sm">{groomer.name}</p>
                              <Badge variant={groomer.isActive ? "default" : "secondary"} className="text-xs mt-0.5">
                                {groomer.isActive ? "Active" : "Inactive"}
                              </Badge>
                              {groomer.specialties && (
                                <p className="text-xs text-muted-foreground mt-1">{groomer.specialties}</p>
                              )}
                            </div>
                            {isAdmin && otherGroups.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Move to another group">
                                    <MoveRight className="w-3 h-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {otherGroups.map(og => (
                                    <DropdownMenuItem key={og.id}
                                      onClick={() => moveMutation.mutate({ id: groomer.id, groupId: og.id })}>
                                      Move to {og.name}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-2">
                          {groomer.email && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Mail className="w-3 h-3" />{groomer.email}
                            </div>
                          )}
                          {groomer.phone && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Phone className="w-3 h-3" />{groomer.phone}
                            </div>
                          )}

                          {isAdmin && (
                            <div className="pt-2 border-t">
                              <p className="text-xs text-muted-foreground mb-1.5">Weekly Off-Days</p>
                              <div className="flex flex-wrap gap-1">
                                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day, idx) => {
                                  const isOff = groomer.offDays?.includes(idx) ?? false;
                                  return (
                                    <Button key={day} variant={isOff ? "destructive" : "outline"} size="sm"
                                      className="text-xs px-2 py-0.5 h-6"
                                      disabled={updateOffDaysMutation.isPending}
                                      onClick={() => {
                                        const cur = groomer.offDays || [];
                                        const next = isOff ? cur.filter((d: number) => d !== idx) : [...cur, idx];
                                        updateOffDaysMutation.mutate({ id: groomer.id, offDays: next });
                                      }}>{day}</Button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {isAdmin && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <Button variant="outline" size="sm" className="flex-1 text-xs"
                                onClick={() => setEditingGroomer(groomer)}>
                                <Pencil className="w-3 h-3 mr-1" />Edit
                              </Button>
                              <Button variant="outline" size="sm" className="flex-1 text-xs"
                                disabled={toggleActiveMutation.isPending}
                                onClick={() => toggleActiveMutation.mutate({ id: groomer.id, isActive: !groomer.isActive })}>
                                {groomer.isActive ? <><EyeOff className="w-3 h-3 mr-1" />Deactivate</> : <><Eye className="w-3 h-3 mr-1" />Activate</>}
                              </Button>
                              <Button variant="destructive" size="sm"
                                onClick={() => setGroomerToDelete(groomer)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Blocked days panel ── */}
      {isAdmin && allGroomers.filter(g => g.isActive).length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarX2 className="w-4 h-4" /> Off-Day Blocking (Sick / Vacation)
              </CardTitle>
              <Button size="sm" variant="outline"
                onClick={() => setIsAddBlockedOpen(true)}>
                <Plus className="w-3 h-3 mr-1" /> Add Blocked Days
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="space-y-2">
              {allGroomers.filter(g => g.isActive).map((groomer: any) => {
                const gBlocked = blockedDays.filter((bd: any) => bd.groomerId === groomer.id);
                const blockedDates = gBlocked.map((bd: any) => new Date(bd.date + "T00:00:00"));
                const groupName = groups.find(g => g.id === (groomer.groupId || "default"))?.name ?? "";
                return (
                  <AccordionItem key={groomer.id} value={`g-${groomer.id}`} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-orange-600" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-sm">{groomer.name}</p>
                          <p className="text-xs text-muted-foreground">{groupName} · {gBlocked.length} blocked day{gBlocked.length !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pt-3 pb-2">
                        <div className="flex justify-center mb-3">
                          <Calendar mode="multiple" selected={blockedDates} disabled
                            className="rounded-md border"
                            modifiers={{ blocked: blockedDates }}
                            modifiersStyles={{ blocked: { backgroundColor: "#ef4444", color: "white", borderRadius: "50%" } }}
                          />
                        </div>
                        {gBlocked.length > 0 && (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {gBlocked.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((bd: any) => (
                              <div key={bd.id} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                                <div className="flex items-center gap-2">
                                  <span>{new Date(bd.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                                  <Badge variant={bd.reason === "sick" ? "destructive" : bd.reason === "vacation" ? "default" : "secondary"} className="text-xs">
                                    {bd.reason}
                                  </Badge>
                                  {bd.notes && <span className="text-xs text-muted-foreground">({bd.notes})</span>}
                                </div>
                                <Button variant="ghost" size="sm" disabled={deleteBlockedMutation.isPending}
                                  onClick={() => deleteBlockedMutation.mutate(bd.id)}>
                                  <Trash2 className="w-3 h-3 text-red-500" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <Button size="sm" className="mt-3 bg-orange-600 hover:bg-orange-700"
                          onClick={() => { setBlockedForm({ ...blockedForm, groomerId: groomer.id.toString() }); setIsAddBlockedOpen(true); }}>
                          <Plus className="w-3 h-3 mr-1" /> Add Blocked Days
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* ── Dialogs ── */}

      {/* Add member */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Service Member</DialogTitle>
            <DialogDescription>Add a new member to {groups.find(g => g.id === addToGroupId)?.name ?? "this group"}.</DialogDescription>
          </DialogHeader>
          <GroomerForm groups={groups} onSubmit={d => createMutation.mutate({ ...d, groupId: addToGroupId })} isPending={createMutation.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit member */}
      {editingGroomer && (
        <Dialog open={!!editingGroomer} onOpenChange={() => setEditingGroomer(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Member</DialogTitle>
            </DialogHeader>
            <GroomerForm groomer={editingGroomer} groups={groups} isPending={updateMutation.isPending}
              onSubmit={d => updateMutation.mutate({ id: editingGroomer.id, data: d })} />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete member confirm */}
      {groomerToDelete && (
        <Dialog open={!!groomerToDelete} onOpenChange={() => setGroomerToDelete(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Remove Member</DialogTitle>
              <DialogDescription>This cannot be undone.</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove <strong>{groomerToDelete.name}</strong> from the service roster?
            </p>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" onClick={() => setGroomerToDelete(null)}>Cancel</Button>
              <Button variant="destructive" disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(groomerToDelete.id)}>
                {deleteMutation.isPending ? "Removing…" : "Remove"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete group confirm */}
      {deleteGroupId && (
        <Dialog open={!!deleteGroupId} onOpenChange={() => setDeleteGroupId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Remove Group</DialogTitle>
              <DialogDescription>Members in this group will be moved to {groups[0]?.name ?? "the first group"}.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" onClick={() => setDeleteGroupId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => removeGroup(deleteGroupId)}>Remove Group</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add blocked day */}
      <Dialog open={isAddBlockedOpen} onOpenChange={setIsAddBlockedOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarX2 className="w-5 h-5" /> Add Blocked Days
            </DialogTitle>
            <DialogDescription>Block a member from being assigned on specific dates.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Member *</Label>
              <Select value={blockedForm.groomerId} onValueChange={v => setBlockedForm({ ...blockedForm, groomerId: v })}>
                <SelectTrigger><SelectValue placeholder="Select a member" /></SelectTrigger>
                <SelectContent>
                  {allGroomers.filter(g => g.isActive).map(g => (
                    <SelectItem key={g.id} value={g.id.toString()}>
                      {g.name} — {groups.find(gr => gr.id === (g.groupId || "default"))?.name ?? ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dates * <span className="text-sm text-muted-foreground">({blockedForm.dates.length} selected)</span></Label>
              <div className="border rounded-md p-2">
                <Calendar mode="multiple" selected={blockedForm.dates}
                  onSelect={dates => setBlockedForm({ ...blockedForm, dates: dates || [] })}
                  disabled={date => date < new Date(new Date().setHours(0,0,0,0))}
                  className="rounded-md" />
              </div>
              {blockedForm.dates.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {blockedForm.dates.sort((a,b) => a.getTime()-b.getTime()).map((date, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded">
                      {date.toLocaleDateString()}
                      <button type="button" onClick={() => setBlockedForm({ ...blockedForm, dates: blockedForm.dates.filter(d => d.getTime() !== date.getTime()) })}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Reason *</Label>
              <Select value={blockedForm.reason} onValueChange={v => setBlockedForm({ ...blockedForm, reason: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="vacation">Vacation</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea placeholder="Additional notes…" value={blockedForm.notes}
                onChange={e => setBlockedForm({ ...blockedForm, notes: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => { setIsAddBlockedOpen(false); setBlockedForm({ groomerId:"", dates:[], reason:"sick", notes:"" }); }}>
                Cancel
              </Button>
              <Button className="bg-orange-600 hover:bg-orange-700" disabled={createBlockedMutation.isPending}
                onClick={() => {
                  if (!blockedForm.groomerId || blockedForm.dates.length === 0) return;
                  createBlockedMutation.mutate({
                    groomerId: parseInt(blockedForm.groomerId),
                    dates: blockedForm.dates.map(d => {
                      const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
                      return `${y}-${m}-${day}`;
                    }),
                    reason: blockedForm.reason,
                    notes: blockedForm.notes || undefined,
                  });
                }}>
                {createBlockedMutation.isPending ? "Adding…" : `Add ${blockedForm.dates.length || ""} Blocked Day${blockedForm.dates.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
