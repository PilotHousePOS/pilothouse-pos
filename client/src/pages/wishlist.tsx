import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Heart, Trash2, ShoppingCart } from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { WishlistItem, Supply, Pet } from "@shared/schema";
import { safeGoBack } from "@/lib/navigation";

interface WishlistItemWithDetails extends WishlistItem {
  supply?: Supply;
  pet?: Pet;
}

export default function Wishlist() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wishlistItems, isLoading } = useQuery<WishlistItemWithDetails[]>({
    queryKey: ["/api/wishlist"],
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/wishlist/${id}`, {});
    },
    onSuccess: () => {
      toast({
        title: "Removed from Wishlist",
        description: "Item has been removed from your wishlist.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove item from wishlist.",
        variant: "destructive",
      });
    },
  });

  const addToCartMutation = useMutation({
    mutationFn: async ({ supplyId, petId }: { supplyId?: number; petId?: number }) => {
      await apiRequest("POST", "/api/cart", {
        supplyId,
        petId,
        quantity: 1,
      });
    },
    onSuccess: () => {
      toast({
        title: "Added to Cart",
        description: "Item has been added to your cart.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add item to cart.",
        variant: "destructive",
      });
    },
  });

  const handleAddToCart = (item: WishlistItemWithDetails) => {
    if (item.supplyId) {
      addToCartMutation.mutate({ supplyId: item.supplyId });
    } else if (item.petId) {
      addToCartMutation.mutate({ petId: item.petId });
    }
  };

  // For now, we'll need to fetch the actual supply/pet details from the API
  // This is a simplified version - in production you'd want to join the data on the backend
  const getItemName = (item: WishlistItemWithDetails) => {
    if (item.supplyId) {
      return `Supply #${item.supplyId}`;
    } else if (item.petId) {
      return `Pet #${item.petId}`;
    }
    return "Unknown Item";
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
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
      <div className="bg-brand-red text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center pl-12">
          <div>
            <h1 className="text-2xl font-extrabold" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>Wishlist</h1>
            <p className="text-sm font-semibold text-white" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.4)' }}>Items you want to purchase later</p>
          </div>
        </div>
      </div>

      {/* Wishlist Items */}
      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-red"></div>
            <p className="text-gray-500 mt-2">Loading wishlist...</p>
          </div>
        ) : !wishlistItems || wishlistItems.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Heart className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Your Wishlist is Empty</h3>
              <p className="text-gray-500 mb-4">Save items you love for later!</p>
              <Button
                onClick={() => setLocation("/supplies")}
                className="bg-brand-red hover:bg-red-600"
                data-testid="button-browse"
              >
                Browse Products
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {wishlistItems.map((item) => (
              <Card
                key={item.id}
                className="shadow-sm hover:shadow-md transition-shadow"
                data-testid={`card-wishlist-${item.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                        {item.supplyId ? (
                          <ShoppingCart className="w-8 h-8 text-brand-blue" />
                        ) : (
                          <Heart className="w-8 h-8 text-brand-red" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{getItemName(item)}</h3>
                        <p className="text-sm text-gray-500">
                          {item.supplyId ? "Supply" : "Pet"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-brand-blue border-brand-blue hover:bg-brand-blue hover:text-white"
                        onClick={() => handleAddToCart(item)}
                        disabled={addToCartMutation.isPending}
                        data-testid={`button-add-to-cart-${item.id}`}
                      >
                        <ShoppingCart className="w-4 h-4 mr-1" />
                        Add to Cart
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:bg-red-50"
                        onClick={() => removeFromWishlistMutation.mutate(item.id)}
                        disabled={removeFromWishlistMutation.isPending}
                        data-testid={`button-remove-${item.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
