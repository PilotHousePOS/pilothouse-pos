/**
 * GroomersSection — self-contained groomer management panel.
 * Previously lived as a stand-alone sub-tab inside admin.tsx;
 * now embedded directly inside StaffTab so there is only one
 * "Staff Accounts" sub-tab in the Staff section.
 */
import { useState } from "react";
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
  UserPlus, Pencil, Trash2, Eye, EyeOff, CalendarX2, Plus, Mail, Phone, Users,
} from "lucide-react";
import type { User } from "@shared/schema";

interface Props {
  typedUser: User | null;
  /** Customisable label for "groomer" (defaults to "Staff"). */
  staffLabel?: string;
}

// ── GroomerForm ───────────────────────────────────────────────────────────────

function GroomerForm({
  groomer, onSubmit, isPending,
}: { groomer?: any; onSubmit: (data: any) => void; isPending: boolean }) {
  const [formData, setFormData] = useState({
    name: groomer?.name || "",
    email: groomer?.email || "",
    phone: groomer?.phone || "",
    specialties: groomer?.specialties || "",
    isActive: groomer?.isActive !== undefined ? groomer.isActive : true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="g-name">Name *</Label>
        <Input id="g-name" value={formData.name} required
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          data-testid="input-groomer-name" />
      </div>
      <div>
        <Label htmlFor="g-email">Email</Label>
        <Input id="g-email" type="email" value={formData.email}
          onChange={e => setFormData({ ...formData, email: e.target.value })}
          data-testid="input-groomer-email" />
      </div>
      <div>
        <Label htmlFor="g-phone">Phone</Label>
        <Input id="g-phone" type="tel" value={formData.phone} placeholder="(555) 123-4567"
          onChange={e => setFormData({ ...formData, phone: e.target.value })}
          data-testid="input-groomer-phone" />
      </div>
      <div>
        <Label htmlFor="g-specialties">Specialties</Label>
        <Textarea id="g-specialties" rows={3} value={formData.specialties}
          placeholder="e.g., Full Grooming, Bath Only, Large Breeds"
          onChange={e => setFormData({ ...formData, specialties: e.target.value })}
          data-testid="input-groomer-specialties" />
      </div>
      <div className="flex items-center space-x-2">
        <Switch checked={formData.isActive}
          onCheckedChange={checked => setFormData({ ...formData, isActive: checked })}
          data-testid="switch-groomer-active" />
        <Label>Active</Label>
      </div>
      <Button type="submit" className="w-full" disabled={isPending} data-testid="button-submit-groomer">
        {isPending ? "Saving…" : groomer ? "Update" : "Add"}
      </Button>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GroomersSection({ typedUser, staffLabel = "Staff" }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Dialog / form state ─────────────────────────────────────────────────────
  const [isAddOpen, setIsAddOpen]             = useState(false);
  const [editingGroomer, setEditingGroomer]   = useState<any>(null);
  const [groomerToDelete, setGroomerToDelete] = useState<any>(null);
  const [isAddBlockedOpen, setIsAddBlockedOpen] = useState(false);
  const [blockedForm, setBlockedForm] = useState<{
    groomerId: string; dates: Date[]; reason: string; notes: string;
  }>({ groomerId: "", dates: [], reason: "sick", notes: "" });

  // ── Queries ─────────────────────────────────────────────────────────────────
  const groomersQ = useQuery<any[]>({
    queryKey: ["/api/admin/groomers"],
    enabled: !!(typedUser?.isAdmin || typedUser?.isGroomer),
  });

  const { data: blockedDays = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/groomer-blocked-days"],
    enabled: !!typedUser?.isAdmin,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/groomers"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/groomers", data),
    onSuccess: () => { toast({ title: `${staffLabel} added` }); setIsAddOpen(false); invalidate(); },
    onError: () => toast({ title: "Error", description: `Failed to add ${staffLabel.toLowerCase()}.`, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/admin/groomers/${id}`, data),
    onSuccess: () => { toast({ title: `${staffLabel} updated` }); setEditingGroomer(null); invalidate(); },
    onError: () => toast({ title: "Error", description: "Failed to update.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/groomers/${id}`),
    onSuccess: () => { toast({ title: `${staffLabel} deleted` }); setGroomerToDelete(null); invalidate(); },
    onError: () => toast({ title: "Error", description: "Failed to delete.", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => apiRequest("PUT", `/api/admin/groomers/${id}`, { isActive }),
    onSuccess: () => { toast({ title: "Status updated" }); invalidate(); },
    onError: () => toast({ title: "Error", description: "Failed to update status.", variant: "destructive" }),
  });

  const updateOffDaysMutation = useMutation({
    mutationFn: ({ id, offDays }: { id: number; offDays: number[] }) => apiRequest("PUT", `/api/admin/groomers/${id}`, { offDays }),
    onSuccess: () => { toast({ title: "Off days updated" }); invalidate(); },
    onError: () => toast({ title: "Error", description: "Failed to update off-days.", variant: "destructive" }),
  });

  const createBlockedMutation = useMutation({
    mutationFn: async (d: { groomerId: number; dates: string[]; reason: string; notes?: string }) => {
      for (const date of d.dates) {
        await apiRequest("POST", "/api/admin/groomer-blocked-days", { groomerId: d.groomerId, date, reason: d.reason, notes: d.notes });
      }
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
    onError: () => toast({ title: "Error", description: "Failed to remove blocked day.", variant: "destructive" }),
  });

  const isAdmin = typedUser?.isAdmin;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Groomer cards ── */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {staffLabel}s ({groomersQ.data?.length ?? 0})
            </CardTitle>
            {isAdmin && (
              <Button onClick={() => setIsAddOpen(true)} data-testid="button-add-groomer">
                <UserPlus className="w-4 h-4 mr-2" /> Add New {staffLabel}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {groomersQ.isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">Loading {staffLabel.toLowerCase()}s…</p>
            </div>
          ) : groomersQ.data?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No {staffLabel.toLowerCase()}s found</p>
              <p className="text-sm mt-1">Click "Add New {staffLabel}" to create one</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groomersQ.data?.map((groomer: any) => (
                <Card key={groomer.id} className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {groomer.name}
                          <Badge variant={groomer.isActive ? "default" : "secondary"}>
                            {groomer.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </CardTitle>
                        {groomer.specialties && <p className="text-sm text-muted-foreground mt-1">{groomer.specialties}</p>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1 text-sm">
                      {groomer.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="w-4 h-4" />{groomer.email}</div>}
                      {groomer.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="w-4 h-4" />{groomer.phone}</div>}
                    </div>

                    {isAdmin && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Weekly Off-Days (click to toggle)</p>
                        <div className="flex flex-wrap gap-1">
                          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day, idx) => {
                            const isOff = groomer.offDays?.includes(idx) ?? false;
                            return (
                              <Button key={day} variant={isOff ? "destructive" : "outline"} size="sm"
                                className="text-xs px-2 py-1 h-7"
                                disabled={updateOffDaysMutation.isPending}
                                onClick={() => {
                                  const cur = groomer.offDays || [];
                                  const next = isOff ? cur.filter((d: number) => d !== idx) : [...cur, idx];
                                  updateOffDaysMutation.mutate({ id: groomer.id, offDays: next });
                                }}
                              >{day}</Button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {isAdmin && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        <Button variant="outline" size="sm" className="flex-1 min-w-[80px]"
                          onClick={() => setEditingGroomer(groomer)} data-testid={`button-edit-groomer-${groomer.id}`}>
                          <Pencil className="w-3 h-3 mr-1" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 min-w-[100px]"
                          disabled={toggleActiveMutation.isPending}
                          onClick={() => toggleActiveMutation.mutate({ id: groomer.id, isActive: !groomer.isActive })}
                          data-testid={`button-toggle-groomer-${groomer.id}`}>
                          {groomer.isActive ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                          {groomer.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        <Button variant="destructive" size="sm" className="min-w-[40px]"
                          onClick={() => setGroomerToDelete(groomer)} data-testid={`button-delete-groomer-${groomer.id}`}>
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

      {/* ── Blocked days ── */}
      {isAdmin && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarX2 className="w-5 h-5" />
              {staffLabel} Blocked Days (Sick/Vacation)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {groomersQ.data?.filter((g: any) => g.isActive).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarX2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No active {staffLabel.toLowerCase()}s found</p>
              </div>
            ) : (
              <Accordion type="single" collapsible className="space-y-2">
                {groomersQ.data?.filter((g: any) => g.isActive).map((groomer: any) => {
                  const gBlocked = blockedDays.filter((bd: any) => bd.groomerId === groomer.id);
                  const blockedDates = gBlocked.map((bd: any) => new Date(bd.date + "T00:00:00"));
                  return (
                    <AccordionItem key={groomer.id} value={`g-${groomer.id}`} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                            <Users className="w-5 h-5 text-orange-600" />
                          </div>
                          <div className="text-left">
                            <p className="font-medium">{groomer.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {gBlocked.length} blocked day{gBlocked.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pt-4 pb-2">
                          <div className="flex justify-center mb-4">
                            <Calendar mode="multiple" selected={blockedDates} disabled
                              className="rounded-md border"
                              modifiers={{ blocked: blockedDates }}
                              modifiersStyles={{ blocked: { backgroundColor: "#ef4444", color: "white", borderRadius: "50%" } }}
                            />
                          </div>
                          {gBlocked.length > 0 && (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {gBlocked.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((bd: any) => (
                                <div key={bd.id} className="flex items-center justify-between p-2 bg-muted rounded">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">
                                      {new Date(bd.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                                    </span>
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
                          <div className="mt-4 text-center">
                            <Button size="sm" className="bg-orange-600 hover:bg-orange-700"
                              onClick={() => { setBlockedForm({ ...blockedForm, groomerId: groomer.id.toString() }); setIsAddBlockedOpen(true); }}>
                              <Plus className="w-4 h-4 mr-2" /> Add Blocked Days
                            </Button>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Dialogs ── */}

      {/* Add */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New {staffLabel}</DialogTitle>
            <DialogDescription>Add a new {staffLabel.toLowerCase()} to your team.</DialogDescription>
          </DialogHeader>
          <GroomerForm onSubmit={d => createMutation.mutate(d)} isPending={createMutation.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit */}
      {editingGroomer && (
        <Dialog open={!!editingGroomer} onOpenChange={() => setEditingGroomer(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit {staffLabel}</DialogTitle>
              <DialogDescription>Update {staffLabel.toLowerCase()} information.</DialogDescription>
            </DialogHeader>
            <GroomerForm groomer={editingGroomer} isPending={updateMutation.isPending}
              onSubmit={d => updateMutation.mutate({ id: editingGroomer.id, data: d })} />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm */}
      {groomerToDelete && (
        <Dialog open={!!groomerToDelete} onOpenChange={() => setGroomerToDelete(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete {staffLabel}</DialogTitle>
              <DialogDescription>Confirm deletion from your team.</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong>{groomerToDelete.name}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" onClick={() => setGroomerToDelete(null)} data-testid="button-cancel-delete-groomer">Cancel</Button>
              <Button variant="destructive" disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(groomerToDelete.id)} data-testid="button-confirm-delete-groomer">
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
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
            <DialogDescription>
              Block a {staffLabel.toLowerCase()} from being assigned on specific dates. Click multiple dates to select them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Groomer *</Label>
              <Select value={blockedForm.groomerId} onValueChange={v => setBlockedForm({ ...blockedForm, groomerId: v })}>
                <SelectTrigger data-testid="select-blocked-groomer"><SelectValue placeholder="Select a groomer" /></SelectTrigger>
                <SelectContent>
                  {groomersQ.data?.filter((g: any) => g.isActive).map((g: any) => (
                    <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>
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
                  className="rounded-md" data-testid="calendar-blocked-dates" />
              </div>
              {blockedForm.dates.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {blockedForm.dates.sort((a,b) => a.getTime()-b.getTime()).map((date, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded">
                      {date.toLocaleDateString()}
                      <button type="button" className="hover:text-orange-600"
                        onClick={() => setBlockedForm({ ...blockedForm, dates: blockedForm.dates.filter(d => d.getTime() !== date.getTime()) })}>
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Reason *</Label>
              <Select value={blockedForm.reason} onValueChange={v => setBlockedForm({ ...blockedForm, reason: v })}>
                <SelectTrigger data-testid="select-blocked-reason"><SelectValue /></SelectTrigger>
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
                onChange={e => setBlockedForm({ ...blockedForm, notes: e.target.value })}
                data-testid="textarea-blocked-notes" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" data-testid="button-cancel-blocked-day"
                onClick={() => { setIsAddBlockedOpen(false); setBlockedForm({ groomerId:"", dates:[], reason:"sick", notes:"" }); }}>
                Cancel
              </Button>
              <Button className="bg-orange-600 hover:bg-orange-700" disabled={createBlockedMutation.isPending}
                data-testid="button-save-blocked-day"
                onClick={() => {
                  if (!blockedForm.groomerId || blockedForm.dates.length === 0) {
                    return;
                  }
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
