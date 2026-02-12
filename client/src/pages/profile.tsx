import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { 
  ShoppingBag, 
  Calendar, 
  Heart, 
  Settings, 
  Edit, 
  Plus,
  Shield,
  Gift,
  Star,
  Bell,
  BellOff,
  Loader2,
  Mail,
  MailX
} from "lucide-react";
import type { User, CustomerPet, Order, Appointment } from "@shared/schema";

export default function Profile() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showAddPet, setShowAddPet] = useState(false);
  const [newPet, setNewPet] = useState({ name: '', species: 'dog', breed: '', age: '', notes: '' });
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);

  const { data: currentUser, isLoading: userLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: customerPets = [] } = useQuery<CustomerPet[]>({
    queryKey: ["/api/customer-pets"],
    enabled: !!currentUser,
  });

  const addPetMutation = useMutation({
    mutationFn: async (petData: typeof newPet) => {
      const res = await apiRequest("POST", "/api/customer-pets", petData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-pets"] });
      setShowAddPet(false);
      setNewPet({ name: '', species: 'dog', breed: '', age: '', notes: '' });
      toast({ title: "Pet added!", description: "Your pet has been added to your profile." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add pet. Please try again.", variant: "destructive" });
    },
  });

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: !!currentUser,
  });

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/user/appointments"],
    enabled: !!currentUser,
  });

  const { data: loyaltyStatus } = useQuery<{
    totalSpent: string;
    loyaltyCredits: string;
    progressToNextReward: number;
    spendingThreshold: string;
    rewardAmount: string;
  }>({
    queryKey: ["/api/user/loyalty"],
    enabled: !!currentUser,
  });

  // Handle authentication errors and redirects
  useEffect(() => {
    if (error && !userLoading) {
      console.error("Profile authentication error:", error);
      toast({
        title: "Session expired",
        description: "Please sign in again.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    }
  }, [error, userLoading, toast]);

  useEffect(() => {
    setNotifEnabled(!!currentUser?.notificationsEnabled);
  }, [currentUser?.notificationsEnabled]);

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function handleNotificationToggle(enable: boolean) {
    setNotifLoading(true);
    try {
      if (enable) {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          toast({ title: "Not supported", description: "Push notifications are not supported on this browser.", variant: "destructive" });
          setNotifLoading(false);
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast({ title: "Permission denied", description: "Please allow notifications in your browser settings.", variant: "destructive" });
          setNotifLoading(false);
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const vapidRes = await fetch('/api/push/vapid-key');
        const { publicKey } = await vapidRes.json();
        if (reg.active) {
          reg.active.postMessage({ type: 'STORE_VAPID_KEY', key: publicKey });
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const subJson = sub.toJSON();
        await apiRequest('POST', '/api/push/subscribe', {
          subscription: {
            endpoint: subJson.endpoint,
            keys: { p256dh: subJson.keys!.p256dh, auth: subJson.keys!.auth },
          },
        });
        setNotifEnabled(true);
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        toast({ title: "Notifications enabled", description: "You'll get alerts for order updates!" });
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await apiRequest('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint });
          await sub.unsubscribe();
        } else {
          await apiRequest('POST', '/api/push/unsubscribe', {});
        }
        setNotifEnabled(false);
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        toast({ title: "Notifications disabled", description: "You won't receive push notifications anymore." });
      }
    } catch (err: any) {
      console.error('Notification toggle error:', err);
      toast({ title: "Error", description: err.message || "Failed to update notification settings", variant: "destructive" });
    }
    setNotifLoading(false);
  }

  const marketingOptIn = currentUser?.marketingEmailsOptIn !== false;
  const appointmentEmailsOptIn = (currentUser as any)?.appointmentEmailsOptIn !== false;

  const handleMarketingToggle = async (enable: boolean) => {
    try {
      await apiRequest('PUT', '/api/user/marketing-emails', { optIn: enable });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: enable ? "Marketing emails enabled" : "Marketing emails disabled",
        description: enable
          ? "You'll receive promotions and updates from us."
          : "You won't receive marketing emails. Order and important updates will still be sent.",
      });
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to update preference", variant: "destructive" });
    }
  };

  const handleAppointmentEmailToggle = async (enable: boolean) => {
    try {
      await apiRequest('PUT', '/api/user/appointment-emails', { optIn: enable });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: enable ? "Appointment emails enabled" : "Appointment emails disabled",
        description: enable
          ? "You'll receive email alerts when new appointments are booked."
          : "You won't receive appointment booking emails. Push notifications are unaffected.",
      });
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to update preference", variant: "destructive" });
    }
  };

  if (userLoading || !currentUser) {
    return (
      <div className="px-6 py-4 pb-20">
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-gray-200 rounded-full w-20 mx-auto"></div>
          <div className="h-4 bg-gray-200 rounded w-32 mx-auto"></div>
          <div className="h-4 bg-gray-200 rounded w-48 mx-auto"></div>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
    window.location.href = '/';
  };

  const userInitials = currentUser?.firstName && currentUser?.lastName 
    ? `${currentUser.firstName[0]}${currentUser.lastName[0]}`.toUpperCase()
    : currentUser?.email?.[0]?.toUpperCase() || 'U';

  const userName = currentUser?.firstName && currentUser?.lastName
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : currentUser?.email || 'User';

  return (
    <div className="px-6 py-4 pb-20">
      {/* Profile Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-brand-red rounded-full mx-auto mb-4 flex items-center justify-center">
          {currentUser?.profileImageUrl ? (
            <img 
              src={currentUser.profileImageUrl} 
              alt="Profile" 
              className="w-20 h-20 rounded-full object-cover"
            />
          ) : (
            <span className="text-2xl text-white font-bold">{userInitials}</span>
          )}
        </div>
        <h2 className="text-xl font-bold text-gray-900">{userName}</h2>
        <p className="text-sm text-gray-500">{currentUser?.email}</p>
        <div className="flex justify-center mt-2">
          <Badge variant="secondary" className="bg-green-100 text-green-700">
            Premium Member
          </Badge>
        </div>
      </div>

      {/* Loyalty Card Section */}
      {loyaltyStatus && (
        <div className="mb-8">
          <Card className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 text-white shadow-lg overflow-hidden">
            <CardContent className="p-5 relative">
              <div className="absolute top-2 right-2 opacity-20">
                <Star className="w-16 h-16" />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Gift className="w-5 h-5" />
                <h3 className="text-lg font-bold">Loyalty Rewards</h3>
              </div>
              
              {parseFloat(loyaltyStatus.loyaltyCredits) > 0 && (
                <div className="bg-white/20 backdrop-blur rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Available Credit</span>
                    <span className="text-2xl font-bold">${parseFloat(loyaltyStatus.loyaltyCredits).toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-white/80 mt-1">Apply at checkout!</p>
                </div>
              )}
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Progress to next ${loyaltyStatus.rewardAmount} reward</span>
                  <span className="font-semibold">{Math.round(loyaltyStatus.progressToNextReward)}%</span>
                </div>
                <Progress 
                  value={loyaltyStatus.progressToNextReward} 
                  className="h-3 bg-white/30"
                />
                <div className="flex items-center justify-between text-xs text-white/80">
                  <span>Spent: ${parseFloat(loyaltyStatus.totalSpent).toFixed(2)}</span>
                  <span>Goal: ${loyaltyStatus.spendingThreshold}</span>
                </div>
              </div>
              
              <p className="text-xs text-white/70 mt-3 text-center">
                Earn ${loyaltyStatus.rewardAmount} credit for every ${loyaltyStatus.spendingThreshold} spent!
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* My Pets Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">My Pets</h3>
          <Button variant="ghost" size="sm" className="text-brand-blue" onClick={() => setShowAddPet(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add Pet
          </Button>
        </div>
        <div className="space-y-3">
          {customerPets.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-gray-400 mb-2">🐾</div>
                <p className="text-gray-500 text-sm">No pets added yet</p>
              </CardContent>
            </Card>
          ) : (
            customerPets.map((pet: CustomerPet) => (
              <Card key={pet.id} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-brand-orange rounded-full flex items-center justify-center">
                      <span className="text-lg">
                        {pet.species === 'dog' ? '🐕' : 
                         pet.species === 'cat' ? '🐱' : 
                         pet.species === 'bird' ? '🦜' : '🐾'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{pet.name}</h4>
                      <p className="text-sm text-gray-500">
                        {pet.breed && `${pet.breed} • `}{pet.age}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Edit className="w-4 h-4 text-gray-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Dialog open={showAddPet} onOpenChange={setShowAddPet}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add a Pet</DialogTitle>
              <DialogDescription>Add your pet's information to your profile.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="pet-name">Name *</Label>
                <Input
                  id="pet-name"
                  placeholder="Pet's name"
                  value={newPet.name}
                  onChange={(e) => setNewPet({ ...newPet, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="pet-species">Species *</Label>
                <Select value={newPet.species} onValueChange={(value) => setNewPet({ ...newPet, species: value })}>
                  <SelectTrigger id="pet-species">
                    <SelectValue placeholder="Select species" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dog">Dog</SelectItem>
                    <SelectItem value="cat">Cat</SelectItem>
                    <SelectItem value="bird">Bird</SelectItem>
                    <SelectItem value="reptile">Reptile</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pet-breed">Breed</Label>
                <Input
                  id="pet-breed"
                  placeholder="e.g., Chihuahua, Persian, Parakeet"
                  value={newPet.breed}
                  onChange={(e) => setNewPet({ ...newPet, breed: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="pet-age">Age</Label>
                <Input
                  id="pet-age"
                  placeholder="e.g., 3 years"
                  value={newPet.age}
                  onChange={(e) => setNewPet({ ...newPet, age: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="pet-notes">Notes</Label>
                <Textarea
                  id="pet-notes"
                  placeholder="Any special notes about your pet"
                  value={newPet.notes}
                  onChange={(e) => setNewPet({ ...newPet, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <Button
                className="w-full"
                disabled={!newPet.name.trim() || addPetMutation.isPending}
                onClick={() => addPetMutation.mutate(newPet)}
              >
                {addPetMutation.isPending ? "Adding..." : "Add Pet"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
        <div className="space-y-3">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation('/orders')} data-testid="card-order-history">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <ShoppingBag className="w-5 h-5 text-brand-blue" />
                <span className="font-semibold text-gray-900 flex-1">Order History</span>
                <Badge variant="secondary">{orders.length}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation('/appointments')} data-testid="card-my-appointments">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-brand-blue" />
                <span className="font-semibold text-gray-900 flex-1">My Appointments</span>
                <Badge variant="secondary">{appointments.length}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation('/wishlist')} data-testid="card-wishlist">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Heart className="w-5 h-5 text-brand-red" />
                <span className="font-semibold text-gray-900 flex-1">Wishlist</span>
                <Badge variant="secondary">0</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation('/settings')}>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Settings className="w-5 h-5 text-gray-600" />
                <span className="font-semibold text-gray-900 flex-1">Settings</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Notifications */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Notifications</h3>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {notifEnabled ? (
                  <Bell className="w-5 h-5 text-brand-blue" />
                ) : (
                  <BellOff className="w-5 h-5 text-gray-400" />
                )}
                <div>
                  <span className="font-semibold text-gray-900">Push Notifications</span>
                  <p className="text-xs text-gray-500">
                    {currentUser?.isAdmin 
                      ? "Get notified when new orders come in" 
                      : "Get notified when your order is approved or ready"}
                  </p>
                </div>
              </div>
              {notifLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              ) : (
                <Switch
                  checked={notifEnabled}
                  onCheckedChange={handleNotificationToggle}
                />
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="mt-3">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {marketingOptIn ? (
                  <Mail className="w-5 h-5 text-brand-blue" />
                ) : (
                  <MailX className="w-5 h-5 text-gray-400" />
                )}
                <div>
                  <span className="font-semibold text-gray-900">Marketing Emails</span>
                  <p className="text-xs text-gray-500">
                    Receive promotions, deals, and updates. Order emails are always sent.
                  </p>
                </div>
              </div>
              <Switch
                checked={marketingOptIn}
                onCheckedChange={handleMarketingToggle}
              />
            </div>
          </CardContent>
        </Card>

        {currentUser?.isAdmin && (
          <Card className="mt-3">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {appointmentEmailsOptIn ? (
                    <Calendar className="w-5 h-5 text-brand-blue" />
                  ) : (
                    <Calendar className="w-5 h-5 text-gray-400" />
                  )}
                  <div>
                    <span className="font-semibold text-gray-900">Appointment Emails</span>
                    <p className="text-xs text-gray-500">
                      Receive email alerts when customers book appointments.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={appointmentEmailsOptIn}
                  onCheckedChange={handleAppointmentEmailToggle}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Admin Panel */}
      {currentUser?.isAdmin && (
        <div className="mb-8">
          <Card className="bg-gradient-to-r from-brand-blue to-brand-red text-white">
            <CardContent className="p-4">
              <h3 className="text-lg font-bold mb-3 flex items-center">
                <Shield className="w-5 h-5 mr-2" />
                Admin Panel
              </h3>
              <div className="space-y-2">
                <Button 
                  variant="ghost" 
                  className="w-full bg-black bg-opacity-40 hover:bg-opacity-60 text-white justify-start border border-white/20"
                  onClick={() => setLocation('/admin')}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full bg-black bg-opacity-40 hover:bg-opacity-60 text-white justify-start border border-white/20"
                  onClick={() => setLocation('/admin')}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Manage Inventory
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Logout Button */}
      <Button 
        variant="destructive" 
        className="w-full"
        onClick={handleLogout}
      >
        Sign Out
      </Button>
    </div>
  );
}
