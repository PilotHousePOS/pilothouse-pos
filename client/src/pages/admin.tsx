import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Shield
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function Admin() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddPetOpen, setIsAddPetOpen] = useState(false);
  const [isAddSupplyOpen, setIsAddSupplyOpen] = useState(false);
  const [editingPet, setEditingPet] = useState(null);
  const [editingSupply, setEditingSupply] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingAppointment, setEditingAppointment] = useState(null);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  // Show access denied for non-admin users
  if (!user?.isAdmin) {
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

  const { data: pets = [] } = useQuery({
    queryKey: ["/api/pets"],
    enabled: isAuthenticated && user?.isAdmin,
  });

  const { data: supplies = [] } = useQuery({
    queryKey: ["/api/supplies"],
    enabled: isAuthenticated && user?.isAdmin,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["/api/orders"],
    enabled: isAuthenticated && user?.isAdmin,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["/api/appointments"],
    enabled: isAuthenticated && user?.isAdmin,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && user?.isAdmin,
  });

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
      toast({
        title: "Error",
        description: "Failed to delete pet.",
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

  if (isLoading) {
    return (
      <div className="px-6 py-4 pb-20">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="px-6 py-4 pb-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p className="text-gray-600">You need admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  const pendingAppointments = appointments.filter(a => a.status === 'scheduled').length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;

  return (
    <div className="px-6 py-4 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <Badge variant="secondary" className="bg-brand-blue text-white">
          Administrator
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <PawPrint className="w-8 h-8 mx-auto mb-2 text-brand-blue" />
            <div className="text-2xl font-bold">{pets.length}</div>
            <div className="text-sm text-gray-500">Total Pets</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Package className="w-8 h-8 mx-auto mb-2 text-brand-orange" />
            <div className="text-2xl font-bold">{supplies.length}</div>
            <div className="text-sm text-gray-500">Total Supplies</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-brand-red" />
            <div className="text-2xl font-bold">{pendingOrders}</div>
            <div className="text-sm text-gray-500">Pending Orders</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-green-600" />
            <div className="text-2xl font-bold">{pendingAppointments}</div>
            <div className="text-sm text-gray-500">Pending Appts</div>
          </CardContent>
        </Card>
      </div>

      {/* Management Tabs */}
      <Tabs defaultValue="pets" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pets">Pets</TabsTrigger>
          <TabsTrigger value="supplies">Supplies</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="pets" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Manage Pets</h3>
            <Dialog open={isAddPetOpen} onOpenChange={setIsAddPetOpen}>
              <DialogTrigger asChild>
                <Button className="bg-brand-blue hover:bg-blue-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Pet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Pet</DialogTitle>
                </DialogHeader>
                <AddPetForm onSubmit={(data) => createPetMutation.mutate(data)} />
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-3">
            {pets.map((pet) => (
              <Card key={pet.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{pet.name}</h4>
                      <p className="text-sm text-gray-500">{pet.breed} • {pet.age} • ${pet.price}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={pet.isAvailable ? "default" : "secondary"}>
                        {pet.isAvailable ? "Available" : "Sold"}
                      </Badge>
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="supplies" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Manage Supplies</h3>
            <Dialog open={isAddSupplyOpen} onOpenChange={setIsAddSupplyOpen}>
              <DialogTrigger asChild>
                <Button className="bg-brand-blue hover:bg-blue-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Supply
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Supply</DialogTitle>
                </DialogHeader>
                <AddSupplyForm onSubmit={(data) => createSupplyMutation.mutate(data)} />
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-3">
            {supplies.map((supply) => (
              <Card key={supply.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{supply.name}</h4>
                      <p className="text-sm text-gray-500">
                        {supply.brand} • {supply.category} • ${supply.price}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={supply.stockQuantity > 0 ? "default" : "destructive"}>
                        Stock: {supply.stockQuantity}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setEditingSupply(supply)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteSupplyMutation.mutate(supply.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <h3 className="text-lg font-semibold">Recent Orders</h3>
          <div className="space-y-3">
            {orders.map((order) => (
              <Card key={order.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">Order #{order.id}</h4>
                      <p className="text-sm text-gray-500">
                        ${order.totalAmount} • {new Date(order.orderDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Select 
                        value={order.status} 
                        onValueChange={(status) => updateOrderMutation.mutate({ id: order.id, status })}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="processing">Processing</SelectItem>
                          <SelectItem value="shipped">Shipped</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="appointments" className="space-y-4">
          <h3 className="text-lg font-semibold">Recent Appointments</h3>
          <div className="space-y-3">
            {appointments.map((appointment) => (
              <Card key={appointment.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{appointment.petName}</h4>
                      <p className="text-sm text-gray-500">
                        {appointment.serviceType} • {appointment.appointmentDate} at {appointment.appointmentTime}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Select 
                        value={appointment.status} 
                        onValueChange={(status) => updateAppointmentMutation.mutate({ id: appointment.id, status })}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="in-progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="no-show">No Show</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">User Management</h3>
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-gray-600">Manage admin access</span>
            </div>
          </div>
          
          <div className="space-y-4">
            {users.map((userItem: any) => (
              <Card key={userItem.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {userItem.firstName?.[0] || userItem.email?.[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-medium">
                          {userItem.firstName && userItem.lastName 
                            ? `${userItem.firstName} ${userItem.lastName}`
                            : userItem.email
                          }
                        </h4>
                        <p className="text-sm text-gray-500">{userItem.email}</p>
                        <p className="text-xs text-gray-400">
                          Member since {new Date(userItem.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <Badge variant={userItem.isAdmin ? "default" : "secondary"}>
                        {userItem.isAdmin ? "Admin" : "Customer"}
                      </Badge>
                      <div className="flex items-center space-x-2">
                        <Label htmlFor={`admin-${userItem.id}`} className="text-sm">
                          Admin Access
                        </Label>
                        <Switch
                          id={`admin-${userItem.id}`}
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
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Pet Dialog */}
      {editingPet && (
        <Dialog open={!!editingPet} onOpenChange={() => setEditingPet(null)}>
          <DialogContent>
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
          <DialogContent>
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
        <input
          type="text"
          value={formData.species}
          onChange={(e) => setFormData({ ...formData, species: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
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
          onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
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
          required
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
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
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
      <Button type="submit" className="w-full bg-brand-blue hover:bg-blue-600">
        Update Supply
      </Button>
    </form>
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
            <SelectItem value="dog">Dog</SelectItem>
            <SelectItem value="cat">Cat</SelectItem>
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
      <div>
        <Label htmlFor="imageUrl">Image URL</Label>
        <Input
          id="imageUrl"
          type="url"
          value={formData.imageUrl}
          onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
        />
      </div>
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
      <Button type="submit" className="w-full">Add Supply</Button>
    </form>
  );
}
