import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function ReptilesPage() {
  const { toast } = useToast();

  const { data: pets = [], isLoading: petsLoading } = useQuery<any[]>({
    queryKey: ["/api/pets", { species: "reptile" }],
    queryFn: async () => {
      const response = await fetch("/api/pets?species=reptile");
      if (!response.ok) throw new Error("Failed to fetch reptiles");
      return response.json();
    },
  });

  const { data: supplies = [], isLoading: suppliesLoading } = useQuery<any[]>({
    queryKey: ["/api/supplies", { category: "reptile" }],
    queryFn: async () => {
      const response = await fetch("/api/supplies");
      if (!response.ok) throw new Error("Failed to fetch supplies");
      const allSupplies = await response.json();
      return allSupplies.filter((supply: any) => 
        supply.category?.toLowerCase().includes("reptile") || 
        supply.category?.toLowerCase().includes("lizard") ||
        supply.category?.toLowerCase().includes("snake") ||
        supply.category?.toLowerCase().includes("gecko") ||
        supply.category?.toLowerCase().includes("chameleon")
      );
    },
  });

  const handleAddToCart = async (item: any, type: "pet" | "supply") => {
    try {
      await apiRequest("POST", "/api/cart", {
        itemId: item.id,
        itemType: type,
        quantity: 1,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      
      toast({
        title: "Added to Cart",
        description: `${item.name} has been added to your cart.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add item to cart. Please try again.",
        variant: "destructive",
      });
    }
  };

  const isLoading = petsLoading || suppliesLoading;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-8 h-8" />
            <h1 className="text-3xl font-bold">Exotic Reptiles</h1>
          </div>
          <p className="text-green-100">Discover our collection of exotic reptiles and specialty care products</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
        {/* Reptiles Section */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">Exotic Reptiles</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <div className="h-48 bg-gray-200" />
                  <CardContent className="p-4">
                    <div className="h-4 bg-gray-200 rounded mb-2" />
                    <div className="h-3 bg-gray-200 rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : pets.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No exotic reptiles available at this time.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pets.map((pet: any) => (
                <Card key={pet.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-[4/3] bg-gray-200 overflow-hidden">
                    {pet.imageUrl && (
                      <img
                        src={pet.imageUrl}
                        alt={pet.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-lg mb-2">{pet.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">{pet.breed}</p>
                    {pet.description && (
                      <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                        {pet.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-green-600">
                        ${pet.price}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => handleAddToCart(pet, "pet")}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid={`add-to-cart-pet-${pet.id}`}
                      >
                        <ShoppingCart className="w-4 h-4 mr-1" />
                        Add to Cart
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Reptile Supplies Section */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">Reptile Care Supplies</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <div className="h-48 bg-gray-200" />
                  <CardContent className="p-4">
                    <div className="h-4 bg-gray-200 rounded mb-2" />
                    <div className="h-3 bg-gray-200 rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : supplies.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No reptile supplies available at this time.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {supplies.map((supply: any) => (
                <Card key={supply.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-[4/3] bg-gray-200 overflow-hidden">
                    {supply.imageUrl && (
                      <img
                        src={supply.imageUrl}
                        alt={supply.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-lg mb-2">{supply.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">{supply.category}</p>
                    {supply.description && (
                      <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                        {supply.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-green-600">
                        ${supply.price}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => handleAddToCart(supply, "supply")}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid={`add-to-cart-supply-${supply.id}`}
                      >
                        <ShoppingCart className="w-4 h-4 mr-1" />
                        Add to Cart
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
