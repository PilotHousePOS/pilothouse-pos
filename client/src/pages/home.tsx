import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Bell, ShoppingCart, Heart, Star, ArrowRight, Sparkles } from "lucide-react";
import animalHouseLogoPath from "@assets/Circle Mascot Logo_1750438195696.jpg";
import { pushNotificationManager } from "@/lib/pushNotifications";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const handleNotificationClick = async () => {
    try {
      const enabled = await pushNotificationManager.enablePushNotifications();
      if (enabled) {
        setNotificationsEnabled(true);
        toast({
          title: "Notifications Enabled!",
          description: "You'll receive updates when your orders are ready.",
        });
      } else {
        toast({
          title: "Notifications Blocked",
          description: "Please allow notifications in your browser settings.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Notification setup error:', error);
      toast({
        title: "Notification Error",
        description: "Failed to set up notifications. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handleLogout = () => {
    console.log('Logging out...');
    
    // Clear token from localStorage first
    localStorage.removeItem('token');
    localStorage.clear();
    
    // Force immediate redirect to landing page
    window.location.href = '/';
  };
  const [, setLocation] = useLocation();

  const { data: pets = [] } = useQuery({
    queryKey: ["/api/pets"],
    retry: false,
  });

  const { data: supplies = [] } = useQuery({
    queryKey: ["/api/supplies"],
    retry: false,
  });

  const { data: cartItems = [] } = useQuery({
    queryKey: ["/api/cart"],
    retry: false,
  });

  const featuredPets = (pets as any[]).slice(0, 2);
  const featuredSupplies = (supplies as any[]).slice(0, 3);
  const cartCount = (cartItems as any[]).length;

  // Calculate stats
  const totalPets = (pets as any[]).filter((p: any) => p.isAvailable).length;
  const totalSupplies = (supplies as any[]).length;

  return (
    <div className="pb-20 bg-gradient-to-b from-gray-50 to-white">
      {/* Modern Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-brand-red to-brand-orange rounded-2xl flex items-center justify-center shadow-lg">
                <img 
                  src={animalHouseLogoPath} 
                  alt="Animal House" 
                  className="w-8 h-8 rounded-xl object-cover" 
                />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white"></div>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue to-brand-red bg-clip-text text-transparent">
                Animal House
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                {isLoading ? 'Loading...' : 
                 user && (user as any).firstName ? `Welcome, ${(user as any).firstName}${(user as any).isAdmin ? ' (Admin)' : ''}` : 
                 'Where pets find families'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              className={`relative p-3 rounded-full transition-colors ${
                notificationsEnabled 
                  ? 'bg-green-100 hover:bg-green-200' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              onClick={handleNotificationClick}
              title="Enable notifications for order updates"
            >
              <Bell className={`w-5 h-5 ${notificationsEnabled ? 'text-green-600' : 'text-gray-600'}`} />
              {notificationsEnabled && (
                <span className="absolute top-1 right-1 bg-green-500 text-white text-xs rounded-full w-3 h-3 flex items-center justify-center text-[10px]">✓</span>
              )}
            </button>
            <button 
              className="relative p-3 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors" 
              onClick={() => setLocation('/supplies')}
            >
              <ShoppingCart className="w-5 h-5 text-gray-600" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 bg-brand-red text-white text-xs rounded-full w-3 h-3 flex items-center justify-center text-[10px]">
                  {cartCount}
                </span>
              )}
            </button>
            <button 
              className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              onClick={handleLogout}
            >
              <span className="text-xs font-medium">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section with Modern Cards */}
      <section className="px-6 py-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-brand-orange mr-2" />
            <h2 className="text-3xl font-bold text-gray-900">Find Your Perfect</h2>
          </div>
          <h3 className="text-4xl font-bold bg-gradient-to-r from-brand-blue via-brand-red to-brand-orange bg-clip-text text-transparent mb-4">
            Furry Friend
          </h3>
          <p className="text-gray-600 text-lg">Discover loving companions waiting for their forever home</p>
        </div>


      </section>

      {/* Featured Pets - Modern Carousel Style */}
      <section className="px-6 pb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 flex items-center">
              <Star className="w-6 h-6 text-brand-orange mr-2" />
              Featured Pets
            </h3>
            <p className="text-gray-500 text-sm">Ready to find their forever home</p>
          </div>
          <Button 
            variant="ghost" 
            className="text-brand-blue font-semibold hover:bg-brand-blue/10 rounded-full px-4"
            onClick={() => setLocation('/pets')}
          >
            View All
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {featuredPets.length === 0 ? (
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-dashed border-2 border-gray-300">
            <CardContent className="p-8 text-center">
              <div className="text-6xl mb-4">🐾</div>
              <h4 className="font-semibold text-gray-900 mb-2">New Friends Coming Soon!</h4>
              <p className="text-gray-500">We're preparing amazing pets for adoption</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {featuredPets.map((pet: any) => (
              <Card key={pet.id} className="overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-0">
                  <div className="flex">
                    <div className="relative w-32 h-32">
                      <img 
                        src={pet.imageUrl || `https://images.unsplash.com/photo-1552053831-71594a27632d?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200`}
                        alt={pet.name}
                        className="w-full h-full object-cover" 
                      />
                      <div className="absolute top-2 left-2">
                        <Badge className="bg-green-500 text-white text-xs border-0">Available</Badge>
                      </div>
                      <button className="absolute top-2 right-2 p-1 bg-white/80 rounded-full hover:bg-white transition-colors">
                        <Heart className="w-4 h-4 text-gray-600 hover:text-brand-red" />
                      </button>
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-bold text-lg text-gray-900">{pet.name}</h4>
                          <div className="text-lg">
                            {pet.species === 'dog' ? '🐕' : 
                             pet.species === 'cat' ? '🐱' : 
                             pet.species === 'bird' ? '🦜' : 
                             pet.species === 'fish' ? '🐟' : '🦎'}
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 font-medium">{pet.breed}</p>
                        <p className="text-xs text-gray-500">{pet.age} old</p>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-brand-red">${pet.price}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Services Grid - Modern Design */}
      <section className="px-6 pb-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Complete Pet Care Services
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Card 
            className="bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer"
            onClick={() => setLocation('/aquatics')}
          >
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-green-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">🐠</span>
              </div>
              <h4 className="font-bold text-gray-900 mb-1">Aquatics</h4>
              <p className="text-green-700 text-sm font-medium">Prices Vary</p>
              <p className="text-gray-600 text-xs mt-1">Fish & Aquarium Care</p>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer"
            onClick={() => setLocation('/reptiles')}
          >
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">🦎</span>
              </div>
              <h4 className="font-bold text-gray-900 mb-1">Exotic Reptiles</h4>
              <p className="text-purple-700 text-sm font-medium">Specialty Pets</p>
              <p className="text-gray-600 text-xs mt-1">Rare & Common Species</p>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer"
            onClick={() => setLocation('/booking')}
          >
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">📅</span>
              </div>
              <h4 className="font-bold text-gray-900 mb-1">Book Grooming</h4>
              <p className="text-blue-700 text-sm font-medium">Schedule Now</p>
              <p className="text-gray-600 text-xs mt-1">Bath & Full Service</p>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer"
            onClick={() => setLocation('/supplies')}
          >
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">🎁</span>
              </div>
              <h4 className="font-bold text-gray-900 mb-1">Supplies</h4>
              <p className="text-orange-700 text-sm font-medium">Best Prices</p>
              <p className="text-gray-600 text-xs mt-1">All Your Pet Needs</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
