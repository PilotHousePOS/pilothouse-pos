import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";
import { 
  ShoppingBag, 
  Calendar, 
  Heart, 
  Settings, 
  Edit, 
  Plus,
  Shield,
  Gift,
  Star
} from "lucide-react";
import type { User, CustomerPet, Order, Appointment } from "@shared/schema";

export default function Profile() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: currentUser, isLoading: userLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: customerPets = [] } = useQuery<CustomerPet[]>({
    queryKey: ["/api/customer-pets"],
    enabled: !!currentUser,
  });

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: !!currentUser,
  });

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
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
          <Button variant="ghost" size="sm" className="text-brand-blue">
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
