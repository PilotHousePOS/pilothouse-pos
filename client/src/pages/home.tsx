import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Bell, ShoppingCart } from "lucide-react";
import animalHouseLogoPath from "@assets/Circle Mascot Logo_1750438195696.jpg";

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: pets = [] } = useQuery({
    queryKey: ["/api/pets"],
  });

  const { data: cartItems = [] } = useQuery({
    queryKey: ["/api/cart"],
  });

  const featuredPets = pets.slice(0, 3);
  const cartCount = cartItems.length;

  // Calculate stats
  const petStats = pets.reduce((acc, pet) => {
    if (pet.species === 'dog') acc.dogs++;
    else if (pet.species === 'cat') acc.cats++;
    else if (pet.species === 'bird') acc.birds++;
    return acc;
  }, { dogs: 0, cats: 0, birds: 0 });

  return (
    <div className="pb-20">
      {/* Status Bar */}
      <div className="bg-brand-blue text-white text-xs py-1 px-4 flex justify-between items-center">
        <span>9:41 AM</span>
        <span>100% 📶 📶 🔋</span>
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-brand-red rounded-full flex items-center justify-center">
              <img 
                src={animalHouseLogoPath} 
                alt="Animal House Mascot" 
                className="w-8 h-8 rounded-full object-cover" 
              />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Animal House</h1>
              <p className="text-xs text-gray-500">Pet Store & Care</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button className="relative p-2">
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="absolute -top-1 -right-1 bg-brand-red text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">3</span>
            </button>
            <button className="relative p-2" onClick={() => setLocation('/supplies')}>
              <ShoppingCart className="w-5 h-5 text-gray-600" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-brand-red text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-brand-blue to-brand-red p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Welcome Back!</h2>
            <p className="text-blue-100 mb-4">Find your perfect pet companion</p>
            <Button 
              onClick={() => setLocation('/pets')}
              className="bg-white text-brand-blue hover:bg-gray-100 px-6 py-2 rounded-full font-semibold shadow-lg"
            >
              Browse Pets
            </Button>
          </div>
          <div className="text-6xl">🐕</div>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="px-6 py-4 bg-brand-gray">
        <div className="grid grid-cols-3 gap-4">
          <Card className="text-center shadow-sm">
            <CardContent className="p-4">
              <div className="text-2xl mb-1">🐕</div>
              <div className="text-lg font-bold text-gray-900">{petStats.dogs}</div>
              <div className="text-xs text-gray-500">Dogs Available</div>
            </CardContent>
          </Card>
          <Card className="text-center shadow-sm">
            <CardContent className="p-4">
              <div className="text-2xl mb-1">🐱</div>
              <div className="text-lg font-bold text-gray-900">{petStats.cats}</div>
              <div className="text-xs text-gray-500">Cats Available</div>
            </CardContent>
          </Card>
          <Card className="text-center shadow-sm">
            <CardContent className="p-4">
              <div className="text-2xl mb-1">🦜</div>
              <div className="text-lg font-bold text-gray-900">{petStats.birds}</div>
              <div className="text-xs text-gray-500">Birds Available</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Featured Pets */}
      <section className="px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Featured Pets</h3>
          <Button 
            variant="ghost" 
            className="text-brand-blue text-sm font-semibold p-0"
            onClick={() => setLocation('/pets')}
          >
            View All
          </Button>
        </div>
        <div className="space-y-4">
          {featuredPets.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-gray-400 mb-2">🐾</div>
                <p className="text-gray-500">No pets available at the moment</p>
              </CardContent>
            </Card>
          ) : (
            featuredPets.map((pet) => (
              <Card key={pet.id} className="shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex">
                    <img 
                      src={pet.imageUrl || `https://images.unsplash.com/photo-1552053831-71594a27632d?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200`}
                      alt={pet.name}
                      className="w-24 h-24 object-cover" 
                    />
                    <div className="p-4 flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">{pet.name}</h4>
                          <p className="text-sm text-gray-500">{pet.breed}</p>
                          <p className="text-xs text-gray-400">{pet.age}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-brand-red">${pet.price}</p>
                          <Button 
                            className="bg-brand-blue text-white px-3 py-1 rounded-full text-xs mt-1"
                            onClick={() => setLocation('/pets')}
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* Services Section */}
      <section className="px-6 py-6 bg-brand-gray">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Our Services</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card 
            className="text-center shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setLocation('/booking')}
          >
            <CardContent className="p-4">
              <div className="text-3xl mb-2">✂️</div>
              <div className="text-sm font-semibold text-gray-900">Pet Grooming</div>
              <div className="text-xs text-gray-500 mt-1">Professional care</div>
            </CardContent>
          </Card>
          <Card 
            className="text-center shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setLocation('/booking')}
          >
            <CardContent className="p-4">
              <div className="text-3xl mb-2">🏥</div>
              <div className="text-sm font-semibold text-gray-900">Vet Checkup</div>
              <div className="text-xs text-gray-500 mt-1">Health first</div>
            </CardContent>
          </Card>
          <Card 
            className="text-center shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setLocation('/supplies')}
          >
            <CardContent className="p-4">
              <div className="text-3xl mb-2">🛍️</div>
              <div className="text-sm font-semibold text-gray-900">Pet Supplies</div>
              <div className="text-xs text-gray-500 mt-1">Food & toys</div>
            </CardContent>
          </Card>
          <Card 
            className="text-center shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setLocation('/booking')}
          >
            <CardContent className="p-4">
              <div className="text-3xl mb-2">🎓</div>
              <div className="text-sm font-semibold text-gray-900">Training</div>
              <div className="text-xs text-gray-500 mt-1">Expert guidance</div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
