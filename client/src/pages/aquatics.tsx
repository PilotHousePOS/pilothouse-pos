import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Fish, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";

export default function AquaticsPage() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<"pet" | "supply" | null>(null);

  const { data: pets = [], isLoading: petsLoading } = useQuery<any[]>({
    queryKey: ["/api/pets", { species: "fish" }],
    queryFn: async () => {
      const response = await fetch("/api/pets?species=fish");
      if (!response.ok) throw new Error("Failed to fetch fish");
      return response.json();
    },
  });

  const { data: supplies = [], isLoading: suppliesLoading } = useQuery<any[]>({
    queryKey: ["/api/supplies", { category: "aquatic" }],
    queryFn: async () => {
      const response = await fetch("/api/supplies");
      if (!response.ok) throw new Error("Failed to fetch supplies");
      const allSupplies = await response.json();
      return allSupplies.filter((supply: any) => 
        supply.category?.toLowerCase().includes("aquatic") || 
        supply.category?.toLowerCase().includes("fish")
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
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Fish className="w-8 h-8" />
            <h1 className="text-3xl font-bold">Aquatics</h1>
          </div>
          <p className="text-blue-100">Explore our selection of aquatic animals and supplies</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 pb-16 space-y-12">
        {/* Fish Section */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">Aquatic Animals</h2>
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
                <Fish className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No aquatic animals available at this time.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 auto-rows-max">
              {pets.map((pet: any) => (
                <Card 
                  key={pet.id} 
                  className="overflow-visible hover:shadow-lg transition-shadow flex flex-col min-w-0 cursor-pointer"
                  onClick={() => {
                    setSelectedItem(pet);
                    setSelectedType("pet");
                  }}
                >
                  <div className="h-48 bg-gray-200 overflow-hidden flex-shrink-0">
                    {pet.imageUrl && (
                      <img
                        src={pet.imageUrl}
                        alt={pet.name}
                        className="w-full h-full object-contain transition-transform duration-300 hover:scale-110"
                      />
                    )}
                  </div>
                  <CardContent className="p-4 pb-6 flex flex-col flex-grow">
                    <h3 className="font-bold text-lg mb-2">{pet.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">{pet.breed}</p>
                    {pet.description && (
                      <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                        {pet.description}
                      </p>
                    )}
                    <div className="mt-auto pt-2 space-y-3">
                      <div className="text-lg font-bold text-blue-600">
                        ${pet.price}
                      </div>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToCart(pet, "pet");
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        data-testid={`add-to-cart-pet-${pet.id}`}
                      >
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Add to Cart
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Aquatic Supplies Section */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">Aquatic Supplies</h2>
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
                <p>No aquatic supplies available at this time.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 auto-rows-max">
              {supplies.map((supply: any) => (
                <Card 
                  key={supply.id} 
                  className="overflow-visible hover:shadow-lg transition-shadow flex flex-col min-w-0 cursor-pointer"
                  onClick={() => {
                    setSelectedItem(supply);
                    setSelectedType("supply");
                  }}
                >
                  <div className="h-48 bg-gray-200 overflow-hidden flex-shrink-0">
                    {supply.imageUrl && (
                      <img
                        src={supply.imageUrl}
                        alt={supply.name}
                        className="w-full h-full object-contain transition-transform duration-300 hover:scale-110"
                      />
                    )}
                  </div>
                  <CardContent className="p-4 pb-6 flex flex-col flex-grow">
                    <h3 className="font-bold text-lg mb-2">{supply.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">{supply.category}</p>
                    {supply.description && (
                      <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                        {supply.description}
                      </p>
                    )}
                    <div className="mt-auto pt-2 space-y-3">
                      <div className="text-lg font-bold text-blue-600">
                        ${supply.price}
                      </div>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToCart(supply, "supply");
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        data-testid={`add-to-cart-supply-${supply.id}`}
                      >
                        <ShoppingCart className="w-4 h-4 mr-2" />
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

      {/* Item Details Dialog */}
      <Dialog open={selectedItem !== null} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedItem?.name}</DialogTitle>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              {selectedItem.imageUrl && (
                <div className="w-full h-64 bg-gray-200 rounded-lg overflow-hidden">
                  <img
                    src={selectedItem.imageUrl}
                    alt={selectedItem.name}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              
              <div className="space-y-2">
                {selectedType === "pet" && selectedItem.breed && (
                  <div>
                    <span className="font-semibold">Breed:</span> {selectedItem.breed}
                  </div>
                )}
                {selectedType === "pet" && selectedItem.species && (
                  <div>
                    <span className="font-semibold">Species:</span> {selectedItem.species}
                  </div>
                )}
                {selectedType === "supply" && selectedItem.category && (
                  <div>
                    <span className="font-semibold">Category:</span> {selectedItem.category}
                  </div>
                )}
                {selectedItem.description && (
                  <div>
                    <span className="font-semibold">Description:</span>
                    <p className="mt-1 text-gray-700">{selectedItem.description}</p>
                  </div>
                )}
                <div className="text-2xl font-bold text-blue-600 pt-2">
                  ${selectedItem.price}
                </div>
              </div>

              <Button
                onClick={() => {
                  handleAddToCart(selectedItem, selectedType!);
                  setSelectedItem(null);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700"
                data-testid={`dialog-add-to-cart-${selectedItem.id}`}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Add to Cart
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
