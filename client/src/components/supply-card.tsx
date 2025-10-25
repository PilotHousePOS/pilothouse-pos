import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Supply } from "@shared/schema";

interface SupplyCardProps {
  supply: Supply;
}

export default function SupplyCard({ supply }: SupplyCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showZoom, setShowZoom] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/cart", {
        supplyId: supply.id,
        quantity: 1,
      });
    },
    onSuccess: () => {
      toast({
        title: "Added to Cart",
        description: `${supply.name} has been added to your cart.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
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
        description: "Failed to add item to cart.",
        variant: "destructive",
      });
    },
  });

  const defaultImages = {
    food: "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    toys: "https://images.unsplash.com/photo-1581888227599-779811939961?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    beds: "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    leashes: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    healthcare: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    accessories: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
  };

  const imageUrl = supply.imageUrl || defaultImages[supply.category as keyof typeof defaultImages] || defaultImages.food;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setZoomPosition({ x, y });
  };

  return (
    <Card className="shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-0">
        <div className="flex">
          <div 
            className="relative w-20 h-20 cursor-zoom-in overflow-hidden"
            onMouseEnter={() => setShowZoom(true)}
            onMouseLeave={() => setShowZoom(false)}
            onMouseMove={handleMouseMove}
          >
            <img 
              ref={imageRef}
              src={imageUrl}
              alt={supply.name}
              className="w-full h-full object-cover" 
            />
            
            {/* Zoom Overlay */}
            {showZoom && (
              <div 
                className="fixed pointer-events-none border-4 border-gray-800 shadow-2xl rounded-lg overflow-hidden bg-white"
                style={{
                  width: '500px',
                  height: '500px',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 999999,
                }}
              >
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage: `url(${imageUrl})`,
                    backgroundSize: '400%',
                    backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              </div>
            )}
          </div>
          <div className="p-4 flex-1">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 text-sm">{supply.name}</h4>
                <p className="text-xs text-gray-500">{supply.brand}</p>
                <p className="text-xs text-gray-400">
                  {supply.weight && `${supply.weight} • `}
                  {supply.size && supply.size}
                </p>
                {supply.stockQuantity <= 5 && supply.stockQuantity > 0 && (
                  <Badge variant="destructive" className="text-xs mt-1">
                    Low Stock
                  </Badge>
                )}
                {supply.stockQuantity === 0 && (
                  <Badge variant="secondary" className="text-xs mt-1">
                    Out of Stock
                  </Badge>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-brand-red">${supply.price}</p>
                <Button 
                  className="bg-brand-blue hover:bg-blue-600 text-white px-3 py-1 rounded-full text-xs mt-1"
                  onClick={() => addToCartMutation.mutate()}
                  disabled={supply.stockQuantity === 0 || addToCartMutation.isPending}
                >
                  {addToCartMutation.isPending ? "Adding..." : "Add to Cart"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
