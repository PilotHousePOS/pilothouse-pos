import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  Plus,
  Edit,
  Trash2,
  Users,
  Calendar,
  ShoppingBag,
  PawPrint,
  Package,
  Upload,
  X,
  Shield,
  ArrowLeft
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import AdminNotifications from "@/components/admin-notifications";
import { safeGoBack } from "@/lib/navigation";

// Calendar component for confirmed appointments
function AppointmentCalendar({ appointments }: { appointments: any[] }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Filter confirmed appointments for the selected date
  const confirmedAppointments = appointments.filter((apt: any) => 
    apt.status === 'confirmed' && 
    new Date(apt.appointmentDate).toDateString() === selectedDate.toDateString()
  );

  // Group appointments by time slot
  const timeSlots = [
    '9:00 AM', '9:15 AM', '9:30 AM', '9:45 AM',
    '10:00 AM', '10:15 AM', '10:30 AM', '10:45 AM',
    '11:00 AM', '11:15 AM', '11:30 AM', '11:45 AM',
    '12:00 PM', '12:15 PM', '12:30 PM', '12:45 PM',
    '1:00 PM', '1:15 PM', '1:30 PM'
  ];

  const getAppointmentForTime = (time: string) => {
    return confirmedAppointments.find((apt: any) => apt.appointmentTime === time);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + days);
    setSelectedDate(newDate);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Daily Appointment Calendar
        </CardTitle>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => changeDate(-1)}>
              ← Previous Day
            </Button>
            <h3 className="text-lg font-semibold">{formatDate(selectedDate)}</h3>
            <Button variant="outline" size="sm" onClick={() => changeDate(1)}>
              Next Day →
            </Button>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-sm text-gray-600 mb-4">
            {confirmedAppointments.length} confirmed appointments for this day
          </div>
          
          {timeSlots.map((time) => {
            const appointment = getAppointmentForTime(time);
            return (
              <div key={time} className="flex items-center gap-4 p-3 border rounded-lg">
                <div className="w-20 text-sm font-medium text-gray-700">
                  {time}
                </div>
                {appointment ? (
                  <div className="flex-1 bg-blue-50 p-3 rounded border-l-4 border-blue-500">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {appointment.petName} ({appointment.petType})
                        </h4>
                        <p className="text-sm text-gray-600">
                          Owner: {appointment.ownerFirstName} {appointment.ownerLastName}
                        </p>
                        <p className="text-sm text-gray-600">
                          Phone: {appointment.ownerPhoneNumber}
                        </p>
                        <p className="text-xs text-blue-600">
                          Service: {appointment.serviceType === 'grooming-full' ? 'Full Grooming' : 'Bath Only'}
                        </p>
                      </div>
                      <Badge variant="default" className="bg-green-600">
                        Confirmed
                      </Badge>
                    </div>
                    {appointment.specialNotes && (
                      <p className="text-xs text-gray-500 mt-2">
                        Notes: {appointment.specialNotes}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 text-gray-400 text-sm italic">
                    Available
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Order Details Card Component with Items
function OrderDetailsCard({ order, onStatusUpdate }: { order: any; onStatusUpdate: (status: string) => void }) {
  const [showItems, setShowItems] = useState(false);
  const { data: orderDetails, isLoading } = useQuery({
    queryKey: ["/api/orders", order.id],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${order.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch order details');
      return response.json();
    },
    enabled: showItems,
  });

  return (
    <div className="border rounded-lg">
      <div className="flex items-center justify-between p-4">
        <div className="flex-1">
          <h3 className="font-semibold">Order #{order.id}</h3>
          <div className="flex items-center mt-1 text-sm text-gray-600">
            <Calendar className="w-4 h-4 mr-1" />
            {new Date(order.orderDate || order.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
          <p className="text-sm text-gray-600 mt-1">Total: ${order.totalAmount}</p>
          <Button
            variant="link"
            size="sm"
            className="px-0 h-auto mt-1 text-brand-blue"
            onClick={() => setShowItems(!showItems)}
          >
            {showItems ? 'Hide' : 'View'} Items
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={order.status}
            onValueChange={onStatusUpdate}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {showItems && (
        <div className="border-t p-4 bg-gray-50">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading items...</p>
          ) : orderDetails?.items && orderDetails.items.length > 0 ? (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm mb-2">Order Items:</h4>
              {orderDetails.items.map((item: any, index: number) => (
                <div key={item.id || index} className="flex items-center justify-between p-2 bg-white rounded">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {item.supplyId ? `Supply #${item.supplyId}` : `Pet #${item.petId}`}
                    </p>
                    <p className="text-xs text-gray-500">Quantity: {item.quantity}</p>
                  </div>
                  <p className="text-sm font-semibold">${item.price}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No items found</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const typedUser = user as User;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddPetOpen, setIsAddPetOpen] = useState(false);
  const [isAddSupplyOpen, setIsAddSupplyOpen] = useState(false);
  const [editingPet, setEditingPet] = useState<any>(null);
  const [editingSupply, setEditingSupply] = useState<any>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);

  // Always call all hooks at the top level
  const { data: pets = [] } = useQuery({
    queryKey: ["/api/pets"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: supplies = [] } = useQuery({
    queryKey: ["/api/supplies"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["/api/orders"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: ["/api/appointments"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: unapprovedAppointments = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/appointments/unapproved"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: groomingSettings = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/grooming-settings"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  // Create Pet Mutation
  const createPetMutation = useMutation({
    mutationFn: async (petData: any) => {
      await apiRequest("POST", "/api/pets", petData);
    },
    onSuccess: () => {
      toast({
        title: "Pet Added",
        description: "Pet has been added successfully.",
      });
      setIsAddPetOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add pet.",
        variant: "destructive",
      });
    },
  });

  // Edit Pet Mutation
  const editPetMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PUT", `/api/pets/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Pet Updated",
        description: "Pet has been updated successfully.",
      });
      setEditingPet(null);
      queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update pet.",
        variant: "destructive",
      });
    },
  });

  // Delete Pet Mutation
  const deletePetMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/pets/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Pet Deleted",
        description: "Pet has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete pet.",
        variant: "destructive",
      });
    },
  });

  // Create Supply Mutation
  const createSupplyMutation = useMutation({
    mutationFn: async (supplyData: any) => {
      await apiRequest("POST", "/api/supplies", supplyData);
    },
    onSuccess: () => {
      toast({
        title: "Supply Added",
        description: "Supply has been added successfully.",
      });
      setIsAddSupplyOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add supply.",
        variant: "destructive",
      });
    },
  });

  // Edit Supply Mutation
  const editSupplyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PUT", `/api/supplies/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Supply Updated",
        description: "Supply has been updated successfully.",
      });
      setEditingSupply(null);
      queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update supply.",
        variant: "destructive",
      });
    },
  });

  // Delete Supply Mutation
  const deleteSupplyMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/supplies/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Supply Deleted",
        description: "Supply has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete supply.",
        variant: "destructive",
      });
    },
  });

  // Update Order Status Mutation
  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PUT", `/api/orders/${id}`, { status });
    },
    onSuccess: () => {
      toast({
        title: "Order Updated",
        description: "Order status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update order.",
        variant: "destructive",
      });
    },
  });

  // Update Appointment Status Mutation
  const approveAppointmentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PUT", `/api/admin/appointments/${id}/approve`, {});
    },
    onSuccess: () => {
      toast({
        title: "Appointment Approved",
        description: "The grooming appointment has been approved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments/unapproved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const rejectAppointmentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PUT", `/api/admin/appointments/${id}/reject`, {});
    },
    onSuccess: () => {
      toast({
        title: "Appointment Rejected",
        description: "The customer has been notified via email about the rejection.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments/unapproved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PUT", `/api/appointments/${id}`, { status });
    },
    onSuccess: () => {
      toast({
        title: "Appointment Updated",
        description: "Appointment status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update appointment.",
        variant: "destructive",
      });
    },
  });

  // Admin User Management Mutation
  const updateAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/admin`, { isAdmin });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "User admin status updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to update admin status",
        variant: "destructive",
      });
    },
  });

  // Grooming Settings Mutation
  const updateGroomingSettingMutation = useMutation({
    mutationFn: async ({ setting, value }: { setting: string; value: string }) => {
      const response = await apiRequest("PUT", "/api/admin/grooming-settings", { setting, value });
      return response;
    },
    onMutate: async ({ setting, value }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/admin/grooming-settings"] });
      
      // Snapshot the previous value
      const previousSettings = queryClient.getQueryData(["/api/admin/grooming-settings"]);
      
      // Optimistically update to the new value
      queryClient.setQueryData(["/api/admin/grooming-settings"], (old: any) => {
        if (!old) return [{ setting, value }];
        
        const existingIndex = old.findIndex((s: any) => s.setting === setting);
        if (existingIndex >= 0) {
          // Update existing setting
          const newSettings = [...old];
          newSettings[existingIndex] = { ...newSettings[existingIndex], value };
          return newSettings;
        } else {
          // Add new setting
          return [...old, { setting, value }];
        }
      });
      
      return { previousSettings };
    },
    onError: (err, variables, context) => {
      // If mutation fails, use the context returned from onMutate to roll back
      if (context?.previousSettings) {
        queryClient.setQueryData(["/api/admin/grooming-settings"], context.previousSettings);
      }
      toast({
        title: "Error",
        description: "Failed to update grooming settings",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Grooming settings have been updated successfully",
      });
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ["/api/admin/grooming-settings"] });
    },
  });

  const pendingAppointments = (appointments as any[]).filter((a: any) => a.status === 'scheduled').length;
  const pendingOrders = (orders as any[]).filter((o: any) => o.status === 'pending').length;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!typedUser?.isAdmin) {
    return (
      <div className="p-6">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">Administrator privileges required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Fixed Back Button */}
      <div className="fixed top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={safeGoBack}
          className="bg-white shadow-lg hover:bg-gray-100 rounded-full"
          data-testid="button-back"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
      </div>

      {/* Header */}
      <div className="px-6 pt-16 pb-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <div className="flex items-center space-x-3">
            <AdminNotifications />
            <Badge variant="secondary" className="bg-brand-blue text-white">
              Administrator
            </Badge>
          </div>
        </div>
      </div>

      <div className="px-6">{/* Content continues */}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col justify-center h-full">
            <PawPrint className="w-8 h-8 mx-auto mb-3 text-brand-blue" />
            <div className="text-2xl font-bold mb-1">{(pets as any[]).length}</div>
            <div className="text-sm text-gray-500">Total Pets</div>
          </CardContent>
        </Card>
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col justify-center h-full">
            <Package className="w-8 h-8 mx-auto mb-3 text-brand-orange" />
            <div className="text-2xl font-bold mb-1">{(supplies as any[]).length}</div>
            <div className="text-sm text-gray-500">Total Supplies</div>
          </CardContent>
        </Card>
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col justify-center h-full">
            <ShoppingBag className="w-8 h-8 mx-auto mb-3 text-brand-red" />
            <div className="text-2xl font-bold mb-1">{pendingOrders}</div>
            <div className="text-sm text-gray-500">Pending Orders</div>
          </CardContent>
        </Card>
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col justify-center h-full">
            <Calendar className="w-8 h-8 mx-auto mb-3 text-green-600" />
            <div className="text-2xl font-bold mb-1">{pendingAppointments}</div>
            <div className="text-sm text-gray-500">Pending Appts</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex w-max min-w-full gap-1 h-auto p-1">
            <TabsTrigger value="inventory" className="flex-1 text-xs py-3 px-3 whitespace-nowrap">
              <span className="hidden md:inline">Inventory</span>
              <span className="md:hidden">Stock</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex-1 text-xs py-3 px-3 whitespace-nowrap">
              <span className="hidden md:inline">Orders & Appointments</span>
              <span className="md:hidden">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="grooming" className="flex-1 text-xs py-3 px-3 whitespace-nowrap">
              <span className="hidden md:inline">Grooming Settings</span>
              <span className="md:hidden">Settings</span>
            </TabsTrigger>
            <TabsTrigger value="groomers" className="flex-1 text-xs py-3 px-3 whitespace-nowrap">
              Groomers
            </TabsTrigger>
            <TabsTrigger value="users" className="flex-1 text-xs py-3 px-3 whitespace-nowrap">
              Users
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex-1 text-xs py-3 px-3 whitespace-nowrap">
              Calendar
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="inventory" className="space-y-6">
          {/* Pets Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <PawPrint className="w-5 h-5" />
                  Pets ({(pets as any[]).length})
                </CardTitle>
                {/* Mobile: Custom Modal, Desktop: Dialog */}
                <div className="sm:hidden">
                  <Button 
                    size="sm" 
                    className="bg-brand-blue hover:bg-blue-600"
                    onClick={() => setIsAddPetOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Pet
                  </Button>
                </div>
                <div className="hidden sm:block">
                  <Dialog open={isAddPetOpen} onOpenChange={setIsAddPetOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-brand-blue hover:bg-blue-600">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Pet
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Add New Pet</DialogTitle>
                      </DialogHeader>
                      <AddPetForm onSubmit={(data) => createPetMutation.mutate(data)} />
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Mobile Full-Screen Modal */}
                {isAddPetOpen && (
                  <div className="sm:hidden fixed inset-0 z-50 bg-white">
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between p-4 border-b bg-white sticky top-0 z-10">
                        <h2 className="text-lg font-semibold">Add New Pet</h2>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setIsAddPetOpen(false)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <AddPetForm onSubmit={(data) => createPetMutation.mutate(data)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(pets as any[]).map((pet: any) => (
                  <div key={pet.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <h3 className="font-semibold">{pet.name}</h3>
                      <p className="text-sm text-gray-600">{pet.species} • {pet.breed} • ${pet.price}</p>
                      <p className="text-xs text-gray-500">{pet.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={pet.isAvailable ? "default" : "secondary"}>
                        {pet.isAvailable ? "Available" : "Adopted"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingPet(pet)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deletePetMutation.mutate(pet.id)}
                        disabled={deletePetMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Supplies Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Supplies ({(supplies as any[]).length})
                </CardTitle>
                <Dialog open={isAddSupplyOpen} onOpenChange={setIsAddSupplyOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-brand-orange hover:bg-orange-600">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Supply
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add New Supply</DialogTitle>
                    </DialogHeader>
                    <AddSupplyForm onSubmit={(data) => createSupplyMutation.mutate(data)} />
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(supplies as any[]).map((supply: any) => (
                  <div key={supply.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <h3 className="font-semibold">{supply.name}</h3>
                      <p className="text-sm text-gray-600">{supply.brand} • {supply.category} • ${supply.price}</p>
                      <p className="text-xs text-gray-500">Stock: {supply.stockQuantity}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={supply.stockQuantity > 0 ? "default" : "destructive"}>
                        {supply.stockQuantity > 0 ? "In Stock" : "Out of Stock"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingSupply(supply)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteSupplyMutation.mutate(supply.id)}
                        disabled={deleteSupplyMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-6">
          {/* Pending Approval Section */}
          {unapprovedAppointments.length > 0 && (
            <Card className="border-2 border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-700">
                  <Calendar className="w-5 h-5" />
                  Pending Approval ({unapprovedAppointments.length})
                </CardTitle>
                <CardDescription className="text-orange-600">
                  New grooming appointments awaiting admin approval
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {unapprovedAppointments.map((appointment: any) => (
                    <div key={appointment.id} className="flex items-center justify-between p-4 border border-orange-300 rounded-lg bg-white">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-orange-500 text-white">Pending Approval</Badge>
                        </div>
                        <h3 className="font-semibold">{appointment.serviceType || appointment.service}</h3>
                        <p className="text-sm text-gray-600">Pet: {appointment.petName} ({appointment.petType})</p>
                        <p className="text-sm text-gray-600">Owner: {appointment.ownerFirstName} {appointment.ownerLastName}</p>
                        <p className="text-sm text-gray-600">Phone: {appointment.ownerPhoneNumber}</p>
                        <p className="text-xs text-gray-500">Date: {new Date(appointment.appointmentDate).toLocaleDateString()} at {appointment.appointmentTime}</p>
                        {appointment.specialNotes && (
                          <p className="text-xs text-gray-500 mt-1">Notes: {appointment.specialNotes}</p>
                        )}
                        <p className="text-xs text-gray-500">Booked: {new Date(appointment.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => approveAppointmentMutation.mutate(appointment.id)}
                          disabled={approveAppointmentMutation.isPending || rejectAppointmentMutation.isPending}
                          data-testid={`approve-appointment-${appointment.id}`}
                        >
                          {approveAppointmentMutation.isPending ? 'Approving...' : 'Approve'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => rejectAppointmentMutation.mutate(appointment.id)}
                          disabled={approveAppointmentMutation.isPending || rejectAppointmentMutation.isPending}
                          data-testid={`reject-appointment-${appointment.id}`}
                        >
                          {rejectAppointmentMutation.isPending ? 'Rejecting...' : 'Reject'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Orders Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                Orders ({(orders as any[]).length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(orders as any[]).map((order: any) => (
                  <OrderDetailsCard 
                    key={order.id} 
                    order={order} 
                    onStatusUpdate={(status) => updateOrderMutation.mutate({ id: order.id, status })}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Appointments Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Appointments ({(appointments as any[]).length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(appointments as any[]).map((appointment: any) => (
                  <div key={appointment.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div 
                      className="flex-1 cursor-pointer hover:bg-gray-50 p-2 rounded"
                      onClick={() => setSelectedAppointment(appointment)}
                    >
                      <h3 className="font-semibold">{appointment.serviceType || appointment.service}</h3>
                      <p className="text-sm text-gray-600">Pet: {appointment.petName} ({appointment.petType})</p>
                      <p className="text-sm text-gray-600">Owner: {appointment.ownerFirstName} {appointment.ownerLastName}</p>
                      <p className="text-xs text-gray-500">{new Date(appointment.appointmentDate).toLocaleDateString()} at {appointment.appointmentTime}</p>
                      <p className="text-xs text-blue-600 mt-1">Click to view details</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        key={`appointment-${appointment.id}-${appointment.status}`}
                        value={appointment.status}
                        onValueChange={(status) => updateAppointmentMutation.mutate({ id: appointment.id, status })}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Pending</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                User Management ({users.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((userItem: any) => (
                  <Card key={userItem.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold">{userItem.firstName} {userItem.lastName}</h3>
                          <p className="text-sm text-gray-600">{userItem.email}</p>
                          <p className="text-xs text-gray-500">
                            Joined: {new Date(userItem.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant={userItem.isAdmin ? "default" : "secondary"}>
                            {userItem.isAdmin ? "Admin" : "User"}
                          </Badge>
                          <Switch
                            checked={userItem.isAdmin}
                            onCheckedChange={(checked) => {
                              updateAdminMutation.mutate({
                                userId: userItem.id,
                                isAdmin: checked
                              });
                            }}
                            disabled={updateAdminMutation.isPending}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-6">
          <AppointmentCalendar appointments={appointments} />
        </TabsContent>

        <TabsContent value="grooming">
          <Card>
            <CardHeader>
              <CardTitle>Grooming Appointment Settings</CardTitle>
              <CardDescription>
                Configure appointment restrictions, time slots, and capacity limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Operating Hours */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Operating Hours</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Start Time</label>
                    <input
                      type="time"
                      defaultValue={groomingSettings.find(s => s.setting === 'start_time')?.value || '09:00'}
                      className="w-full p-2 border rounded"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'start_time',
                        value: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">End Time</label>
                    <input
                      type="time"
                      defaultValue={groomingSettings.find(s => s.setting === 'end_time')?.value || '17:00'}
                      className="w-full p-2 border rounded"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'end_time',
                        value: e.target.value
                      })}
                    />
                  </div>
                </div>
              </div>

              {/* Available Days */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Available Days</h3>
                <div className="grid grid-cols-2 gap-4">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                    const settingName = `${day.toLowerCase()}_enabled`;
                    const currentSetting = groomingSettings.find(s => s.setting === settingName);
                    const isEnabled = currentSetting ? currentSetting.value === 'true' : true; // Default to true if not set
                    
                    return (
                      <div key={day} className="flex items-center space-x-3">
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => {
                            console.log(`Updating ${settingName} to ${checked}`);
                            updateGroomingSettingMutation.mutate({
                              setting: settingName,
                              value: checked.toString()
                            });
                          }}
                          disabled={updateGroomingSettingMutation.isPending}
                        />
                        <label className="text-sm font-medium cursor-pointer" onClick={() => {
                          const newValue = !isEnabled;
                          updateGroomingSettingMutation.mutate({
                            setting: settingName,
                            value: newValue.toString()
                          });
                        }}>
                          {day}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Appointment Capacity */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Appointment Limits</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Max Appointments Per Day</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      defaultValue={groomingSettings.find(s => s.setting === 'max_daily_appointments')?.value || '10'}
                      className="w-full p-2 border rounded"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'max_daily_appointments',
                        value: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Appointment Duration (minutes)</label>
                    <select
                      defaultValue={groomingSettings.find(s => s.setting === 'appointment_duration')?.value || '60'}
                      className="w-full p-2 border rounded"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'appointment_duration',
                        value: e.target.value
                      })}
                    >
                      <option value="30">30 minutes</option>
                      <option value="45">45 minutes</option>
                      <option value="60">1 hour</option>
                      <option value="90">1.5 hours</option>
                      <option value="120">2 hours</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Booking Restrictions */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Booking Restrictions</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Advance Booking Limit (days)</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      defaultValue={groomingSettings.find(s => s.setting === 'advance_booking_days')?.value || '30'}
                      className="w-full p-2 border rounded"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'advance_booking_days',
                        value: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Minimum Notice (hours)</label>
                    <input
                      type="number"
                      min="1"
                      max="72"
                      defaultValue={groomingSettings.find(s => s.setting === 'minimum_notice_hours')?.value || '24'}
                      className="w-full p-2 border rounded"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'minimum_notice_hours',
                        value: e.target.value
                      })}
                    />
                  </div>
                </div>
              </div>

              {/* Holiday/Block Dates */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Special Dates</h3>
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium mb-2">Blocked Dates (comma-separated, YYYY-MM-DD format)</label>
                    <textarea
                      placeholder="2025-12-25, 2025-01-01"
                      defaultValue={groomingSettings.find(s => s.setting === 'blocked_dates')?.value || ''}
                      className="w-full p-2 border rounded h-20"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'blocked_dates',
                        value: e.target.value
                      })}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter dates when appointments should not be available (holidays, maintenance, etc.)
                    </p>
                  </div>
                </div>
              </div>

              {updateGroomingSettingMutation.isPending && (
                <div className="text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">Updating settings...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Appointment Details Dialog */}
      {selectedAppointment && (
        <Dialog open={!!selectedAppointment} onOpenChange={() => setSelectedAppointment(null)}>
          <DialogContent className="max-w-md mx-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Appointment Details
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Service</Label>
                  <p className="text-gray-900">{selectedAppointment.serviceType}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Date</Label>
                    <p className="text-gray-900">{new Date(selectedAppointment.appointmentDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Time</Label>
                    <p className="text-gray-900">{selectedAppointment.appointmentTime}</p>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <h4 className="font-semibold text-gray-900 mb-2">Pet Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Pet Name</Label>
                      <p className="text-gray-900">{selectedAppointment.petName}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Pet Type</Label>
                      <p className="text-gray-900">{selectedAppointment.petType}</p>
                    </div>
                  </div>
                  {selectedAppointment.specialNotes && (
                    <div className="mt-3">
                      <Label className="text-sm font-semibold text-gray-700">Special Notes</Label>
                      <p className="text-gray-900">{selectedAppointment.specialNotes}</p>
                    </div>
                  )}
                </div>
                <div className="border-t pt-3">
                  <h4 className="font-semibold text-gray-900 mb-2">Owner Information</h4>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Name</Label>
                      <p className="text-gray-900">{selectedAppointment.ownerFirstName} {selectedAppointment.ownerLastName}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Phone Number</Label>
                      <p className="text-gray-900">{selectedAppointment.ownerPhoneNumber}</p>
                    </div>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Status</Label>
                    <Badge 
                      variant={
                        selectedAppointment.status === 'confirmed' ? 'default' : 
                        selectedAppointment.status === 'rejected' ? 'destructive' : 
                        'secondary'
                      }
                    >
                      {selectedAppointment.status === 'scheduled' ? 'Pending' : 
                       selectedAppointment.status.charAt(0).toUpperCase() + selectedAppointment.status.slice(1)}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Pet Dialog */}
      {editingPet && (
        <Dialog open={!!editingPet} onOpenChange={() => setEditingPet(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Pet</DialogTitle>
            </DialogHeader>
            <EditPetForm 
              pet={editingPet}
              onSubmit={(data) => editPetMutation.mutate({ id: editingPet.id, data })} 
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Supply Dialog */}
      {editingSupply && (
        <Dialog open={!!editingSupply} onOpenChange={() => setEditingSupply(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Supply</DialogTitle>
            </DialogHeader>
            <EditSupplyForm 
              supply={editingSupply}
              onSubmit={(data) => editSupplyMutation.mutate({ id: editingSupply.id, data })} 
            />
          </DialogContent>
        </Dialog>
      )}
      </div>
    </div>
  );
}

function EditPetForm({ pet, onSubmit }: { pet: any; onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: pet.name || "",
    species: pet.species || "",
    breed: pet.breed || "",
    age: pet.age || "",
    price: pet.price || "",
    description: pet.description || "",
    imageUrl: pet.imageUrl || "",
    isAvailable: pet.isAvailable || false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Species</label>
        <Select value={formData.species} onValueChange={(value) => setFormData({ ...formData, species: value })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select species" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mammals">Mammals</SelectItem>
            <SelectItem value="bird">Bird</SelectItem>
            <SelectItem value="fish">Fish</SelectItem>
            <SelectItem value="reptile">Reptile</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Breed</label>
        <input
          type="text"
          value={formData.breed}
          onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Age</label>
        <input
          type="text"
          value={formData.age}
          onChange={(e) => setFormData({ ...formData, age: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Price ($)</label>
        <input
          type="number"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full p-2 border rounded"
          rows={3}
        />
      </div>
      <ImageUpload 
        imageUrl={formData.imageUrl} 
        onImageChange={(url) => setFormData({ ...formData, imageUrl: url })} 
      />
      <div className="flex items-center space-x-2">
        <Switch
          checked={formData.isAvailable}
          onCheckedChange={(checked) => setFormData({ ...formData, isAvailable: checked })}
        />
        <label className="text-sm">Available for adoption</label>
      </div>
      <Button type="submit" className="w-full bg-brand-blue hover:bg-blue-600">
        Update Pet
      </Button>
    </form>
  );
}

function EditSupplyForm({ supply, onSubmit }: { supply: any; onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: supply.name || "",
    brand: supply.brand || "",
    category: supply.category || "",
    price: supply.price || "",
    description: supply.description || "",
    imageUrl: supply.imageUrl || "",
    imageUrls: supply.imageUrls || [],
    stockQuantity: supply.stockQuantity || 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Brand</label>
        <input
          type="text"
          value={formData.brand}
          onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
          className="w-full p-2 border rounded"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Category</label>
        <input
          type="text"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Price ($)</label>
        <input
          type="number"
          step="0.01"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Stock Quantity</label>
        <input
          type="number"
          value={formData.stockQuantity}
          onChange={(e) => setFormData({ ...formData, stockQuantity: Number(e.target.value) })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full p-2 border rounded"
          rows={3}
        />
      </div>
      <MultiImageUpload 
        imageUrls={formData.imageUrls || []} 
        onImagesChange={(urls) => setFormData({ ...formData, imageUrls: urls })} 
      />
      <Button type="submit" className="w-full bg-brand-blue hover:bg-blue-600">
        Update Supply
      </Button>
    </form>
  );
}

// Image Upload Component
function ImageUpload({ imageUrl, onImageChange }: { imageUrl: string; onImageChange: (url: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: "File Too Large",
        description: "Please select an image under 5MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      onImageChange(data.imageUrl);
      toast({
        title: "Image Uploaded",
        description: "Image has been uploaded successfully.",
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label>Image</Label>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
        {imageUrl ? (
          <div className="relative">
            <img src={imageUrl} alt="Preview" className="w-full sm:h-40 h-24 object-cover rounded" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => onImageChange('')}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="text-center sm:py-8 py-4">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Click to upload an image</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          className="w-full mt-3"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : imageUrl ? 'Change Image' : 'Upload Image'}
        </Button>
      </div>
    </div>
  );
}

// Multi-Image Upload Component
function MultiImageUpload({ imageUrls, onImagesChange }: { imageUrls: string[]; onImagesChange: (urls: string[]) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select an image under 5MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      // Add new image to the array
      onImagesChange([...imageUrls, data.imageUrl]);
      toast({
        title: "Image Uploaded",
        description: "Image has been uploaded successfully.",
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    const newUrls = imageUrls.filter((_, i) => i !== index);
    onImagesChange(newUrls);
  };

  return (
    <div className="space-y-3">
      <Label>Product Images ({imageUrls.length})</Label>
      
      {/* Display existing images */}
      {imageUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          {imageUrls.map((url, index) => (
            <div key={index} className="relative border-2 border-gray-300 rounded-lg overflow-hidden">
              <img src={url} alt={`Product ${index + 1}`} className="w-full h-32 object-cover" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 bg-white"
                onClick={() => removeImage(index)}
              >
                <X className="w-4 h-4" />
              </Button>
              <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-xs">
                Image {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new image button */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
        <div className="text-center py-4">
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Click to add another image</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
            e.target.value = ''; // Reset input
          }}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : '+ Add Image'}
        </Button>
      </div>
    </div>
  );
}

function AddPetForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    species: '',
    breed: '',
    age: '',
    price: '',
    description: '',
    imageUrl: '',
    isAvailable: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Pet Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>
      <div>
        <Label htmlFor="species">Species</Label>
        <Select value={formData.species} onValueChange={(value) => setFormData({ ...formData, species: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select species" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mammals">Mammals</SelectItem>
            <SelectItem value="bird">Bird</SelectItem>
            <SelectItem value="fish">Fish</SelectItem>
            <SelectItem value="reptile">Reptile</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="breed">Breed</Label>
          <Input
            id="breed"
            value={formData.breed}
            onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="age">Age</Label>
          <Input
            id="age"
            value={formData.age}
            onChange={(e) => setFormData({ ...formData, age: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="price">Price</Label>
        <Input
          id="price"
          type="number"
          step="0.01"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          required
        />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>
      <ImageUpload 
        imageUrl={formData.imageUrl} 
        onImageChange={(url) => setFormData({ ...formData, imageUrl: url })} 
      />
      <div className="flex items-center space-x-2">
        <Switch
          id="isAvailable"
          checked={formData.isAvailable}
          onCheckedChange={(checked) => setFormData({ ...formData, isAvailable: checked })}
        />
        <Label htmlFor="isAvailable">Available for adoption</Label>
      </div>
      <Button type="submit" className="w-full">Add Pet</Button>
    </form>
  );
}

function AddSupplyForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    brand: '',
    price: '',
    description: '',
    imageUrl: '',
    stockQuantity: '',
    weight: '',
    size: '',
    isActive: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      stockQuantity: parseInt(formData.stockQuantity) || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Product Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="category">Category</Label>
          <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="food">Food</SelectItem>
              <SelectItem value="toys">Toys</SelectItem>
              <SelectItem value="beds">Beds</SelectItem>
              <SelectItem value="leashes">Leashes</SelectItem>
              <SelectItem value="healthcare">Healthcare</SelectItem>
              <SelectItem value="accessories">Accessories</SelectItem>
              <SelectItem value="fish_tanks">Aquatics</SelectItem>
              <SelectItem value="reptile_tanks">Reptiles</SelectItem>
              <SelectItem value="bird_cages">Bird Cages</SelectItem>
              <SelectItem value="dog_cages">Dog Cages/Houses</SelectItem>
              <SelectItem value="small_animal_cages">Small Animal Cages</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            value={formData.brand}
            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="price">Price</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="stockQuantity">Stock Quantity</Label>
          <Input
            id="stockQuantity"
            type="number"
            value={formData.stockQuantity}
            onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>
      <ImageUpload 
        imageUrl={formData.imageUrl} 
        onImageChange={(url) => setFormData({ ...formData, imageUrl: url })} 
      />
      <Button type="submit" className="w-full">Add Supply</Button>
    </form>
  );
}

// Close the wrapper div at the end of the main return
// Adding this closing tag before the component ends