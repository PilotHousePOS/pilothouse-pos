import { useState } from "react";
import { Eye, EyeOff, Clock, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  UserPlus, Pencil, Trash2, ShieldCheck, TrendingUp,
  KeyRound, Shield, Copy, Check, Lock, Settings2,
} from "lucide-react";
import type { User } from "@shared/schema";
import GroomersSection from "@/components/tabs/GroomersSection";

// ── Permission definitions ───────────────────────────────────────────────────

interface EmployeePermissions {
  // Basic (all employees)
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
  // Admin-level extended (only when isAdmin toggle is on)
  canManageStaff: boolean;
  canManageEmail: boolean;
  canManageWaitlist: boolean;
  canManageEstimates: boolean;
  canManageInvoicing: boolean;
  canManageSmsBlasts: boolean;
  canManageMemberships: boolean;
  canManageSpecials: boolean;
  canManageChargeAccounts: boolean;
  // Feature-toggle permissions
  canToggleAppointments: boolean;
  canToggleLoyalty: boolean;
  canToggleBoarding: boolean;
  canToggleHiring: boolean;
  canToggleEmailMarketing: boolean;
  canTogglePets: boolean;
}

const BASIC_PERMS: { key: keyof EmployeePermissions; label: string; description: string }[] = [
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

const ADMIN_PERMS: { key: keyof EmployeePermissions; label: string; description: string }[] = [
  { key: "canManageStaff",          label: "Manage Staff Accounts",  description: "Create, edit, and remove other employee accounts" },
  { key: "canManageEmail",          label: "Email Center",           description: "Send and manage email campaigns" },
  { key: "canManageWaitlist",       label: "Waitlist",               description: "Manage the customer waitlist" },
  { key: "canManageEstimates",      label: "Estimates",              description: "Create and manage estimates" },
  { key: "canManageInvoicing",      label: "Invoicing",              description: "Create and send invoices" },
  { key: "canManageSmsBlasts",      label: "SMS Blasts",             description: "Send bulk SMS campaigns" },
  { key: "canManageMemberships",    label: "Memberships",            description: "Manage membership plans and subscribers" },
  { key: "canManageSpecials",       label: "Specials & Promotions",  description: "Create and manage promotions" },
  { key: "canManageChargeAccounts", label: "Charge Accounts",        description: "Manage customer charge accounts" },
  { key: "canEditHomepage",            label: "Edit Homepage",                    description: "Edit the title, text, colors, and cards on the customer-facing homepage" },
  { key: "canToggleAppointments",      label: "Toggle Appointments Feature",      description: "Turn the Service Booking & Appointments feature on or off store-wide" },
  { key: "canToggleLoyalty",           label: "Toggle Loyalty Feature",           description: "Turn the Loyalty & Rewards Program on or off store-wide" },
  { key: "canToggleBoarding",          label: "Toggle Boarding Feature",          description: "Turn the Boarding & Check-In feature on or off store-wide" },
  { key: "canToggleHiring",            label: "Toggle Hiring Feature",            description: "Turn the Job Application Portal on or off store-wide" },
  { key: "canToggleEmailMarketing",    label: "Toggle Email Marketing Feature",   description: "Turn Email Marketing on or off store-wide" },
  { key: "canTogglePets",              label: "Toggle Pet Profiles Feature",      description: "Turn Pet Profiles on or off store-wide" },
];

const DEFAULT_PERMS: EmployeePermissions = {
  canManageOrders: false, canApplyDiscounts: false, canIssueRefunds: false,
  canManageCustomers: false, canManageLoyalty: false, canManageInventory: false,
  canViewReports: false, canManageAppointments: false, canManageGrooming: false,
  canManageBoarding: false, canAccessSettings: false,
  canManageStaff: false, canManageEmail: false, canManageWaitlist: false,
  canManageEstimates: false, canManageInvoicing: false, canManageSmsBlasts: false,
  canManageMemberships: false, canManageSpecials: false, canManageChargeAccounts: false,
  canToggleAppointments: false, canToggleLoyalty: false, canToggleBoarding: false,
  canToggleHiring: false, canToggleEmailMarketing: false, canTogglePets: false,
};

interface Props { typedUser: User | null }

// ── Helpers ──────────────────────────────────────────────────────────────────

function PermToggle({ pkey, label, description, value, onChange }: {
  pkey: string; label: string; description: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function StaffTab({ typedUser }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<User | null>(null);
  const [permEmployee, setPermEmployee] = useState<User | null>(null);
  const [pinEmployee, setPinEmployee] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);

  const ALL_WEEK_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

  // form state
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", password: "", phoneNumber: "", makeAdmin: false,
    defaultWorkDays: ["Monday","Tuesday","Wednesday","Thursday","Friday"] as string[],
    defaultTimeSlot: "9-5",
  });
  const [perms, setPerms] = useState<EmployeePermissions>(DEFAULT_PERMS);
  const [isAdminEmployee, setIsAdminEmployee] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Override PIN panel state
  const [overridePin, setOverridePin]           = useState("");
  const [overrideSuccess, setOverrideSuccess]   = useState(false);
  const [overridePinSet, setOverridePinSet]     = useState("");
  const [overridePinSaving, setOverridePinSaving] = useState(false);
  const [overridePinVisible, setOverridePinVisible] = useState(false);

  // Tab label editor state
  const [labelDraft, setLabelDraft] = useState<Record<string, string> | null>(null);

  // Service group assignment (when creating/editing employees)
  const [serviceGroupId, setServiceGroupId] = useState<string>("");

  // queries
  const { data: employees = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/employees"],
  });
  const { data: tenantInfo } = useQuery<{ enabledFeatures?: any }>({
    queryKey: ["/api/tenants/current"],
    enabled: !typedUser?.isEmployee,
  });
  const savedTabLabels: Record<string, string> = tenantInfo?.enabledFeatures?.tabLabels ?? {};

  // Derive service groups from tenant settings
  const rawServiceGroups: { id: string; name: string }[] = (tenantInfo?.enabledFeatures as any)?.serviceGroups ?? [];
  const serviceGroups = rawServiceGroups.length > 0 ? rawServiceGroups : [{ id: "default", name: "Service Members" }];
  const { data: salesStats = [] } = useQuery<Array<{
    userId: string; firstName: string | null; lastName: string | null;
    orderCount: number; totalSales: string;
  }>>({ queryKey: ["/api/admin/employees/sales-stats"] });

  // mutations
  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const emp = await apiRequest("POST", "/api/admin/employees", data);
      // Optionally also add them to a service group
      if (serviceGroupId) {
        const empJson = await emp.json();
        await apiRequest("POST", "/api/admin/groomers", {
          name: `${data.firstName}${data.lastName ? " " + data.lastName : ""}`,
          email: data.email || undefined,
          phone: data.phoneNumber || undefined,
          groupId: serviceGroupId,
          isActive: true,
        });
        return empJson;
      }
      return emp.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/groomers"] });
      setCreateOpen(false);
      setServiceGroupId("");
      setForm({ firstName: "", lastName: "", email: "", password: "", phoneNumber: "", makeAdmin: false, defaultWorkDays: ["Monday","Tuesday","Wednesday","Thursday","Friday"], defaultTimeSlot: "9-5" });
      toast({ title: "Employee account created" + (serviceGroupId ? " and added to service roster" : "") });
    },
    onError: (e: any) => toast({ title: "Failed to create employee", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/admin/employees/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      setEditEmployee(null);
      toast({ title: "Employee updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/employees/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      setDeleteConfirm(null);
      toast({ title: "Employee removed" });
    },
    onError: (e: any) => toast({ title: "Failed to remove", description: e.message, variant: "destructive" }),
  });

  const permsMutation = useMutation({
    mutationFn: ({ id, p }: { id: string; p: EmployeePermissions }) =>
      apiRequest("PUT", `/api/admin/employees/${id}/permissions`, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      setPermEmployee(null);
      toast({ title: "Permissions saved" });
    },
    onError: (e: any) => toast({ title: "Failed to save permissions", description: e.message, variant: "destructive" }),
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) =>
      apiRequest("POST", `/api/admin/employees/${id}/set-pin`, { pin }),
    onSuccess: () => {
      setPinEmployee(null);
      setNewPin("");
      toast({ title: "PIN updated successfully" });
    },
    onError: (e: any) => toast({ title: "Failed to set PIN", description: e.message, variant: "destructive" }),
  });

  // Override PIN verification mutation (for the employee panel)
  const overrideMutation = useMutation({
    mutationFn: (pin: string) => apiRequest("POST", "/api/auth/admin-override", { pin, action: "staff_tab_override" }),
    onSuccess: () => {
      setOverrideSuccess(true);
      setOverridePin("");
      setTimeout(() => setOverrideSuccess(false), 10_000);
    },
    onError: () => toast({ title: "Incorrect override PIN", variant: "destructive" }),
  });

  // POS override config query + mutation (admin only)
  const { data: posOverrideConfig = {}, refetch: refetchPosOverride } = useQuery<{
    requirePinForRefund?: boolean; requirePinForVoid?: boolean;
    requirePinForDiscount?: boolean; requirePinForDrawer?: boolean;
  }>({
    queryKey: ["/api/admin/pos-override-config"],
    enabled: !typedUser?.isEmployee,
  });

  const posOverrideMutation = useMutation({
    mutationFn: (data: object) => apiRequest("PUT", "/api/admin/pos-override-config", data),
    onSuccess: () => { refetchPosOverride(); toast({ title: "POS override settings saved" }); },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const saveLabelsMutation = useMutation({
    mutationFn: (labels: Record<string, string>) => apiRequest("PUT", "/api/admin/tab-labels", labels),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tenants/current"] });
      setLabelDraft(null);
      toast({ title: "Labels saved", description: "Tab names updated." });
    },
    onError: (e: any) => toast({ title: "Failed to save labels", description: e.message, variant: "destructive" }),
  });

  const saveOverridePin = async () => {
    if (overridePinSet.length !== 4) return;
    setOverridePinSaving(true);
    try {
      const res = await apiRequest("PUT", "/api/admin/override-pin", { pin: overridePinSet });
      if (res.ok) { setOverridePinSet(""); toast({ title: "Override PIN set" }); }
      else { const d = await res.json(); toast({ title: d.message || "Failed", variant: "destructive" }); }
    } finally { setOverridePinSaving(false); }
  };

  const POS_OVERRIDE_OPTIONS = [
    { key: "requirePinForRefund",   label: "Refunds",           description: "Employee must request manager override to issue a refund" },
    { key: "requirePinForVoid",     label: "Voids",             description: "Employee must request manager override to void a transaction" },
    { key: "requirePinForDiscount", label: "Manual Discounts",  description: "Employee must request override before applying a manual discount" },
    { key: "requirePinForDrawer",   label: "Open Drawer",       description: "Employee must request override to manually open the cash drawer" },
  ] as const;

  // handlers
  const openPerms = async (emp: User) => {
    setPermEmployee(emp);
    setIsAdminEmployee(!!emp.isAdmin);
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
    setForm({
      firstName: emp.firstName ?? "", lastName: emp.lastName ?? "",
      email: emp.email ?? "", password: "", phoneNumber: emp.phoneNumber ?? "",
      makeAdmin: !!emp.isAdmin,
      defaultWorkDays: (emp as any).defaultWorkDays ?? ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      defaultTimeSlot: (emp as any).defaultTimeSlot ?? "9-5",
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const activeCount = (emp: User) => salesStats.find(s => s.userId === emp.id)?.orderCount ?? 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Tabs defaultValue="accounts">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="accounts">Staff Accounts</TabsTrigger>
            <TabsTrigger value="sales">Sales by Employee</TabsTrigger>
          </TabsList>
          <Button size="sm" onClick={() => {
            setForm({ firstName: "", lastName: "", email: "", password: "", phoneNumber: "", makeAdmin: false, defaultWorkDays: ["Monday","Tuesday","Wednesday","Thursday","Friday"], defaultTimeSlot: "9-5" });
            setCreateOpen(true);
          }}>
            <UserPlus className="h-4 w-4 mr-2" /> Add Employee
          </Button>
        </div>

        {/* ── Staff Accounts ── */}
        <TabsContent value="accounts" className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading employees…</p>
          ) : employees.length === 0 ? (
            <Card>
              <CardContent className="pt-10 pb-10 text-center text-muted-foreground">
                <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No employee accounts yet</p>
                <p className="text-sm mt-1">Create accounts for your staff. Each gets a unique employee code and PIN for quick sign‑in.</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map(emp => {
                  const stat = salesStats.find(s => s.userId === emp.id);
                  return (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-muted-foreground">{emp.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {emp.employeeCode ? (
                          <button
                            onClick={() => copyCode(emp.employeeCode!)}
                            className="flex items-center gap-1 font-mono text-sm bg-muted px-2 py-0.5 rounded hover:bg-muted/80 transition-colors"
                            title="Click to copy"
                          >
                            {emp.employeeCode}
                            {copiedCode === emp.employeeCode
                              ? <Check className="h-3 w-3 text-green-500" />
                              : <Copy className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell>
                        {emp.isAdmin
                          ? <Badge className="bg-amber-100 text-amber-800 border-amber-200">Admin</Badge>
                          : <Badge variant="secondary">Staff</Badge>}
                      </TableCell>
                      <TableCell>
                        {stat
                          ? <span className="text-sm">{stat.orderCount} orders · <span className="font-medium">${parseFloat(stat.totalSales).toFixed(2)}</span></span>
                          : <span className="text-muted-foreground text-sm">No sales yet</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" title="Set PIN" onClick={() => { setPinEmployee(emp); setNewPin(""); }}>
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Permissions" onClick={() => openPerms(emp)}>
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

          {/* How sign-in works — updated info box */}
          <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">How employee sign-in works</p>
            <p className="text-blue-700 text-xs leading-relaxed">
              Employees sign in on the store's <strong>Sign In page</strong> — tap the <strong>Staff Sign-In</strong> tab,
              select their name, and enter their 4-digit PIN. All sales and changes are tracked to their account.
            </p>
          </div>

          {/* ── Manager / Owner Override panel (employee sessions only) ── */}
          {typedUser?.isEmployee && (
            <Card className="mt-4 border-amber-200 bg-amber-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-600" />
                  Manager / Owner Override
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Need a manager to approve an action? Enter the store override PIN. Every use is logged.
                </p>
                {overrideSuccess ? (
                  <p className="text-sm text-green-700 font-medium">✓ Override confirmed. Manager may now sign in on the Sign In page.</p>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={overridePin}
                      onChange={e => setOverridePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      className="text-center text-xl tracking-widest font-mono max-w-[100px]"
                    />
                    <Button
                      onClick={() => overridePin.length === 4 && overrideMutation.mutate(overridePin)}
                      disabled={overridePin.length !== 4 || overrideMutation.isPending}
                    >
                      {overrideMutation.isPending ? "Verifying…" : "Verify & Log"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Set Override PIN (admin/owner sessions only) ── */}
          {!typedUser?.isEmployee && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Store Override PIN
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Set a 4-digit Owner PIN for POS overrides. Both this PIN and any admin account's personal PIN are always accepted — the Owner PIN gives you a private code that's separate from your managers'.
                </p>
                <div className="flex gap-2 items-center">
                  <div className="relative">
                    <Input
                      type={overridePinVisible ? "text" : "password"}
                      inputMode="numeric"
                      maxLength={4}
                      value={overridePinSet}
                      onChange={e => setOverridePinSet(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="New 4-digit PIN"
                      className="text-center text-xl tracking-widest font-mono max-w-[140px] pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setOverridePinVisible(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {overridePinVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    onClick={saveOverridePin}
                    disabled={overridePinSet.length !== 4 || overridePinSaving}
                  >
                    {overridePinSaving ? "Saving…" : "Set PIN"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── POS Override Requirements (admin/owner sessions only) ── */}
          {!typedUser?.isEmployee && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  POS Override Requirements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Choose which POS actions require employees to enter the store override PIN before proceeding.
                </p>
                <div className="space-y-1">
                  {POS_OVERRIDE_OPTIONS.map(({ key, label, description }) => (
                    <div key={key} className="flex items-start justify-between gap-4 py-2">
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                      <Switch
                        checked={!!(posOverrideConfig as any)?.[key]}
                        onCheckedChange={v => posOverrideMutation.mutate({ ...posOverrideConfig, [key]: v })}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Rename Tabs & Labels (admin/owner only) ── */}
          {!typedUser?.isEmployee && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Pencil className="h-4 w-4" />
                    Rename Tabs &amp; Labels
                  </CardTitle>
                  {labelDraft === null && (
                    <button
                      onClick={() => setLabelDraft({ ...savedTabLabels })}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Customize the names shown on the Staff tabs and section headings. Leave blank to use the default name.
                </p>
                {labelDraft === null ? (
                  /* Read-only preview */
                  <div className="space-y-1.5 text-sm">
                    {[
                      { key: 'staff',          def: 'Staff Accounts', hint: '"Staff Accounts" tab label' },
                      { key: 'groomers',       def: 'Staff',          hint: 'Service staff section heading' },
                    ].map(({ key, def, hint }) => (
                      <div key={key} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground text-xs">{hint}</span>
                        <span className="font-medium">{savedTabLabels[key] || def}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Edit mode */
                  <div className="space-y-3">
                    {[
                      { key: 'staff',    def: 'Staff Accounts', label: '"Staff Accounts" tab' },
                      { key: 'groomers', def: 'Staff',          label: 'Service staff section heading' },
                    ].map(({ key, def, label }) => (
                      <div key={key}>
                        <Label className="text-xs text-muted-foreground">{label}</Label>
                        <Input
                          placeholder={def}
                          value={labelDraft[key] ?? ''}
                          onChange={e => setLabelDraft(d => ({ ...d!, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLabelDraft(null)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={saveLabelsMutation.isPending}
                        onClick={() => saveLabelsMutation.mutate(labelDraft!)}
                        className="flex-1"
                      >
                        {saveLabelsMutation.isPending ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Sales by Employee ── */}
        <TabsContent value="sales" className="mt-4">
          {salesStats.length === 0 ? (
            <Card>
              <CardContent className="pt-10 pb-10 text-center text-muted-foreground">
                <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No attributed sales yet</p>
                <p className="text-sm mt-1">Sales appear here once employees start processing orders while logged in.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {salesStats.map(s => (
                <Card key={s.userId}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <span className="text-blue-700 font-semibold text-sm">
                          {(s.firstName?.[0] ?? "?").toUpperCase()}
                        </span>
                      </div>
                      <CardTitle className="text-base">{s.firstName} {s.lastName}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">${parseFloat(s.totalSales).toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground mt-1">{s.orderCount} order{s.orderCount !== 1 ? "s" : ""}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Service Staff (Groomers) ── */}
      <GroomersSection typedUser={typedUser} />

      {/* ── Create Employee Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Employee Account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>First Name</Label><Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Last Name</Label><Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label><Input value={form.phoneNumber} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="They can also sign in via PIN after you set one" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Grant Admin Access</p>
                <p className="text-xs text-muted-foreground">Unlocks a wider set of permissions you can assign</p>
              </div>
              <Switch checked={form.makeAdmin} onCheckedChange={v => setForm(f => ({ ...f, makeAdmin: v }))} />
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5"><Clock className="h-4 w-4" /> Default Weekly Schedule</p>
              <p className="text-xs text-muted-foreground">Used to auto-fill the employee schedule tab</p>
              <div className="flex flex-wrap gap-2">
                {ALL_WEEK_DAYS.map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, defaultWorkDays: f.defaultWorkDays.includes(day) ? f.defaultWorkDays.filter(d => d !== day) : [...f.defaultWorkDays, day] }))}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${form.defaultWorkDays.includes(day) ? 'bg-green-600 text-white border-green-600' : 'bg-background border-input text-muted-foreground'}`}
                  >
                    {day.slice(0,3)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Hours</Label>
                <Input
                  placeholder="e.g. 9-5"
                  value={form.defaultTimeSlot}
                  onChange={e => setForm(f => ({ ...f, defaultTimeSlot: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5"><Users className="h-4 w-4" /> Add to Service Roster</p>
              <p className="text-xs text-muted-foreground">Optionally add this employee to a service group so they appear as an assignable provider in bookings.</p>
              <Select value={serviceGroupId} onValueChange={setServiceGroupId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="— Not in service roster —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Not in service roster —</SelectItem>
                  {serviceGroups.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground bg-muted rounded p-2">
              An <strong>employee code</strong> (e.g. E01) is auto-generated. Set a 4-digit PIN after creating the account so they can sign in at the POS keypad.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.email || !form.firstName}
            >
              {createMutation.isPending ? "Creating…" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Employee Dialog ── */}
      <Dialog open={!!editEmployee} onOpenChange={v => !v && setEditEmployee(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit — {editEmployee?.firstName} {editEmployee?.lastName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>First Name</Label><Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Last Name</Label><Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phoneNumber} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>New Password <span className="text-muted-foreground text-xs">(leave blank to keep current)</span></Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-amber-500" /> Admin Access
                </p>
                <p className="text-xs text-muted-foreground">Grants access to admin-level permissions</p>
              </div>
              <Switch checked={form.makeAdmin} onCheckedChange={v => setForm(f => ({ ...f, makeAdmin: v }))} />
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5"><Clock className="h-4 w-4" /> Default Weekly Schedule</p>
              <div className="flex flex-wrap gap-2">
                {ALL_WEEK_DAYS.map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, defaultWorkDays: f.defaultWorkDays.includes(day) ? f.defaultWorkDays.filter(d => d !== day) : [...f.defaultWorkDays, day] }))}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${form.defaultWorkDays.includes(day) ? 'bg-green-600 text-white border-green-600' : 'bg-background border-input text-muted-foreground'}`}
                  >
                    {day.slice(0,3)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Hours</Label>
                <Input
                  placeholder="e.g. 9-5"
                  value={form.defaultTimeSlot}
                  onChange={e => setForm(f => ({ ...f, defaultTimeSlot: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEmployee(null)}>Cancel</Button>
            <Button
              onClick={() => editEmployee && updateMutation.mutate({
                id: editEmployee.id,
                data: {
                  firstName: form.firstName, lastName: form.lastName,
                  email: form.email, phoneNumber: form.phoneNumber,
                  isAdmin: form.makeAdmin,
                  defaultWorkDays: form.defaultWorkDays,
                  defaultTimeSlot: form.defaultTimeSlot,
                  ...(form.password ? { password: form.password } : {}),
                },
              })}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Set PIN Dialog ── */}
      <Dialog open={!!pinEmployee} onOpenChange={v => !v && setPinEmployee(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Set PIN — {pinEmployee?.firstName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter a new 4-digit PIN the employee will use at the sign-in keypad.</p>
            <div className="space-y-1.5">
              <Label>New PIN (4 digits)</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                className="text-center text-xl tracking-widest font-mono"
              />
            </div>
            {pinEmployee?.employeeCode && (
              <div className="bg-muted rounded p-2 text-xs text-muted-foreground">
                Employee code: <span className="font-mono font-medium">{pinEmployee.employeeCode}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinEmployee(null)}>Cancel</Button>
            <Button
              onClick={() => pinEmployee && pinMutation.mutate({ id: pinEmployee.id, pin: newPin })}
              disabled={newPin.length !== 4 || pinMutation.isPending}
            >
              {pinMutation.isPending ? "Saving…" : "Save PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Permissions Dialog ── */}
      <Dialog open={!!permEmployee} onOpenChange={v => !v && setPermEmployee(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Permissions — {permEmployee?.firstName} {permEmployee?.lastName}
              {isAdminEmployee && <Badge className="bg-amber-100 text-amber-800 border-amber-200 ml-1">Admin</Badge>}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">Everything is off by default. Toggle what this employee is allowed to do.</p>

          <div className="max-h-[60vh] overflow-y-auto space-y-1 pr-1">
            {/* Basic permissions */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1 pb-1">Staff Capabilities</p>
            {BASIC_PERMS.map(({ key, label, description }) => (
              <PermToggle
                key={key} pkey={key} label={label} description={description}
                value={!!perms[key]}
                onChange={v => setPerms(p => ({ ...p, [key]: v }))}
              />
            ))}

            {/* Admin-level permissions — only shown when employee is admin */}
            {isAdminEmployee && (
              <>
                <Separator className="my-3" />
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide pb-1 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Admin Controls
                </p>
                <p className="text-xs text-muted-foreground mb-2">These are only available because admin access is enabled for this account.</p>
                {ADMIN_PERMS.map(({ key, label, description }) => (
                  <PermToggle
                    key={key} pkey={key} label={label} description={description}
                    value={!!perms[key]}
                    onChange={v => setPerms(p => ({ ...p, [key]: v }))}
                  />
                ))}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermEmployee(null)}>Cancel</Button>
            <Button
              onClick={() => permEmployee && permsMutation.mutate({ id: permEmployee.id, p: perms })}
              disabled={permsMutation.isPending}
            >
              {permsMutation.isPending ? "Saving…" : "Save Permissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={v => !v && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove Employee</DialogTitle></DialogHeader>
          <p className="text-sm">
            Remove <strong>{deleteConfirm?.firstName} {deleteConfirm?.lastName}</strong>? Their sales history is preserved but they will no longer be able to sign in. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing…" : "Remove Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
