import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Pencil, Trash2, ShieldCheck, TrendingUp } from "lucide-react";
import type { User } from "@shared/schema";

interface EmployeePermissions {
  canManageOrders: boolean;
  canApplyDiscounts: boolean;
  canIssueRefunds: boolean;
  canManageCustomers: boolean;
  canManageLoyalty: boolean;
  canManageInventory: boolean;
  canViewReports: boolean;
  canManageAppointments: boolean;
  canManageGrooming: boolean;
  canManageBoarding: boolean;
  canAccessSettings: boolean;
}

const PERM_LABELS: { key: keyof EmployeePermissions; label: string; description: string }[] = [
  { key: "canManageOrders",       label: "Manage Orders",       description: "Create, edit, and process orders at POS" },
  { key: "canApplyDiscounts",     label: "Apply Discounts",     description: "Apply discount codes or manual price reductions" },
  { key: "canIssueRefunds",       label: "Issue Refunds",       description: "Process refunds on existing orders" },
  { key: "canManageCustomers",    label: "Manage Customers",    description: "View and edit customer profiles" },
  { key: "canManageLoyalty",      label: "Manage Loyalty",      description: "Add or adjust customer loyalty credits" },
  { key: "canManageInventory",    label: "Manage Inventory",    description: "Edit products, stock levels, and categories" },
  { key: "canViewReports",        label: "View Reports",        description: "Access POS sales reports and analytics" },
  { key: "canManageAppointments", label: "Manage Appointments", description: "Create, reschedule, and cancel appointments" },
  { key: "canManageGrooming",     label: "Grooming",            description: "Access the grooming and groomers tabs" },
  { key: "canManageBoarding",     label: "Boarding",            description: "Access boarding records" },
  { key: "canAccessSettings",     label: "Store Settings",      description: "View and edit store configuration (use with care)" },
];

const DEFAULT_PERMS: EmployeePermissions = {
  canManageOrders: false, canApplyDiscounts: false, canIssueRefunds: false,
  canManageCustomers: false, canManageLoyalty: false, canManageInventory: false,
  canViewReports: false, canManageAppointments: false, canManageGrooming: false,
  canManageBoarding: false, canAccessSettings: false,
};

interface Props { typedUser: User | null }

export default function StaffTab({ typedUser }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<User | null>(null);
  const [permEmployee, setPermEmployee] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);

  // form state
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", phoneNumber: "" });
  const [perms, setPerms] = useState<EmployeePermissions>(DEFAULT_PERMS);

  const { data: employees = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/employees"],
  });

  const { data: salesStats = [] } = useQuery<Array<{ userId: string; firstName: string | null; lastName: string | null; orderCount: number; totalSales: string }>>({
    queryKey: ["/api/admin/employees/sales-stats"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/admin/employees", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/employees"] }); setCreateOpen(false); setForm({ firstName: "", lastName: "", email: "", password: "", phoneNumber: "" }); toast({ title: "Employee account created" }); },
    onError: (e: any) => toast({ title: "Failed to create employee", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof form> }) => apiRequest("PATCH", `/api/admin/employees/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/employees"] }); setEditEmployee(null); toast({ title: "Employee updated" }); },
    onError: (e: any) => toast({ title: "Failed to update employee", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/employees/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/employees"] }); setDeleteConfirm(null); toast({ title: "Employee removed" }); },
    onError: (e: any) => toast({ title: "Failed to remove employee", description: e.message, variant: "destructive" }),
  });

  const permsMutation = useMutation({
    mutationFn: ({ id, p }: { id: string; p: EmployeePermissions }) => apiRequest("PUT", `/api/admin/employees/${id}/permissions`, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/employees"] }); setPermEmployee(null); toast({ title: "Permissions saved" }); },
    onError: (e: any) => toast({ title: "Failed to save permissions", description: e.message, variant: "destructive" }),
  });

  const openPerms = async (emp: User) => {
    setPermEmployee(emp);
    try {
      const res = await apiRequest("GET", `/api/admin/employees/${emp.id}/permissions`);
      const existing: Partial<EmployeePermissions> = await res.json();
      setPerms({ ...DEFAULT_PERMS, ...existing });
    } catch {
      setPerms(DEFAULT_PERMS);
    }
  };

  const openEdit = (emp: User) => {
    setEditEmployee(emp);
    setForm({ firstName: emp.firstName ?? "", lastName: emp.lastName ?? "", email: emp.email ?? "", password: "", phoneNumber: emp.phoneNumber ?? "" });
  };

  const activePermCount = (emp: User) => {
    const stat = salesStats.find(s => s.userId === emp.id);
    return stat ? stat.orderCount : 0;
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="accounts">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="accounts">Employee Accounts</TabsTrigger>
            <TabsTrigger value="sales">Sales Attribution</TabsTrigger>
          </TabsList>
          <Button size="sm" onClick={() => { setForm({ firstName: "", lastName: "", email: "", password: "", phoneNumber: "" }); setCreateOpen(true); }}>
            <UserPlus className="h-4 w-4 mr-2" /> Add Employee
          </Button>
        </div>

        {/* ── Accounts tab ── */}
        <TabsContent value="accounts" className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading employees…</p>
          ) : employees.length === 0 ? (
            <Card>
              <CardContent className="pt-10 pb-10 text-center text-muted-foreground">
                <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No employee accounts yet</p>
                <p className="text-sm mt-1">Create accounts for your staff so they can log in and track their sales.</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map(emp => {
                  const stat = salesStats.find(s => s.userId === emp.id);
                  return (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">{emp.firstName} {emp.lastName}</TableCell>
                      <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                      <TableCell className="text-muted-foreground">{emp.phoneNumber ?? "—"}</TableCell>
                      <TableCell>
                        {stat ? (
                          <Badge variant="secondary">{stat.orderCount} orders · ${parseFloat(stat.totalSales).toFixed(2)}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">No sales yet</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-end">
                          <Button size="icon" variant="ghost" title="Manage permissions" onClick={() => openPerms(emp)}>
                            <ShieldCheck className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(emp)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Remove" onClick={() => setDeleteConfirm(emp)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ── Sales Attribution tab ── */}
        <TabsContent value="sales" className="mt-4">
          {salesStats.length === 0 ? (
            <Card>
              <CardContent className="pt-10 pb-10 text-center text-muted-foreground">
                <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No attributed sales yet</p>
                <p className="text-sm mt-1">Sales will appear here once employees start processing orders.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {salesStats.map(s => (
                <Card key={s.userId}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{s.firstName} {s.lastName}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-2xl font-bold">${parseFloat(s.totalSales).toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">{s.orderCount} order{s.orderCount !== 1 ? "s" : ""}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create Employee Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Employee Account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>First Name</Label><Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Last Name</Label><Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Phone (optional)</Label><Input value={form.phoneNumber} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Temporary password for first login" /></div>
            <p className="text-xs text-muted-foreground">The employee logs in at your store's sign-in page with these credentials. You can set their permissions after creating the account.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.email || !form.password || !form.firstName}>
              {createMutation.isPending ? "Creating…" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Employee Dialog ── */}
      <Dialog open={!!editEmployee} onOpenChange={v => !v && setEditEmployee(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>First Name</Label><Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Last Name</Label><Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={form.phoneNumber} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))} /></div>
            <div className="space-y-1"><Label>New Password <span className="text-muted-foreground">(leave blank to keep current)</span></Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEmployee(null)}>Cancel</Button>
            <Button onClick={() => editEmployee && updateMutation.mutate({ id: editEmployee.id, data: { ...form, ...(form.password ? {} : { password: undefined }) } })} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Permissions Dialog ── */}
      <Dialog open={!!permEmployee} onOpenChange={v => !v && setPermEmployee(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Permissions — {permEmployee?.firstName} {permEmployee?.lastName}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">Toggle what this employee is allowed to do. Everything is off by default.</p>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {PERM_LABELS.map(({ key, label, description }) => (
              <div key={key} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <Switch
                  checked={!!perms[key]}
                  onCheckedChange={v => setPerms(p => ({ ...p, [key]: v }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermEmployee(null)}>Cancel</Button>
            <Button onClick={() => permEmployee && permsMutation.mutate({ id: permEmployee.id, p: perms })} disabled={permsMutation.isPending}>
              {permsMutation.isPending ? "Saving…" : "Save Permissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={v => !v && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove Employee</DialogTitle></DialogHeader>
          <p className="text-sm">Remove <strong>{deleteConfirm?.firstName} {deleteConfirm?.lastName}</strong>? Their sales history will be preserved. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
