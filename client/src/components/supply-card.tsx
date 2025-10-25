import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [showDetails, setShowDetails] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 });
  const [modalZoom, setModalZoom] = useState(false);
  const [modalZoomPosition, setModalZoomPosition] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const modalImageRef = useRef<HTMLImageElement>(null);

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

  const handleModalMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!modalImageRef.current) return;
    
    const rect = modalImageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setModalZoomPosition({ x, y });
  };

  return (
    <>
    <Card className="shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={() => setShowDetails(true)}>
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
                  onClick={(e) => {
                    e.stopPropagation();
                    addToCartMutation.mutate();
                  }}
                  disabled={supply.stockQuantity === 0 || addToCartMutation.isPending}
                  data-testid="button-add-to-cart"
                >
                  {addToCartMutation.isPending ? "Adding..." : "Add to Cart"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Supply Details Modal */}
    <Dialog open={showDetails} onOpenChange={setShowDetails}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supply.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Image with Zoom */}
          <div 
            className="relative w-full h-80 cursor-zoom-in overflow-hidden rounded-lg border-2 border-gray-200"
            onMouseEnter={() => setModalZoom(true)}
            onMouseLeave={() => setModalZoom(false)}
            onMouseMove={handleModalMouseMove}
          >
            <img 
              ref={modalImageRef}
              src={imageUrl}
              alt={supply.name}
              className="w-full h-full object-contain" 
              data-testid="img-product-modal"
            />
            
            {/* Modal Zoom Overlay - Maximum size and clarity */}
            {modalZoom && (
              <div 
                className="fixed pointer-events-none border-4 border-black shadow-2xl overflow-hidden bg-white rounded-lg"
                style={{
                  width: '800px',
                  height: '800px',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 9999999,
                }}
              >
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage: `url(${imageUrl})`,
                    backgroundSize: '800%',
                    backgroundPosition: `${modalZoomPosition.x}% ${modalZoomPosition.y}%`,
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-semibold">Brand:</span>
              <span>{supply.brand}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Category:</span>
              <span className="capitalize">{supply.category}</span>
            </div>
            {supply.weight && (
              <div className="flex justify-between">
                <span className="font-semibold">Weight:</span>
                <span>{supply.weight}</span>
              </div>
            )}
            {supply.size && (
              <div className="flex justify-between">
                <span className="font-semibold">Size:</span>
                <span>{supply.size}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="font-semibold">Price:</span>
              <span className="text-brand-red font-bold text-lg">${supply.price}</span>
            </div>
            {supply.description && (
              <div>
                <span className="font-semibold">Description:</span>
                <p className="text-gray-600 mt-1">{supply.description}</p>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="font-semibold">Stock:</span>
              <Badge variant={supply.stockQuantity && supply.stockQuantity > 0 ? "default" : "destructive"}>
                {supply.stockQuantity && supply.stockQuantity > 0 ? `${supply.stockQuantity} in stock` : "Out of Stock"}
              </Badge>
            </div>
          </div>

          {/* Add to Cart in Modal */}
          <Button 
            className="w-full bg-brand-blue hover:bg-blue-600 text-white py-3"
            onClick={() => {
              addToCartMutation.mutate();
              setShowDetails(false);
            }}
            disabled={supply.stockQuantity === 0 || addToCartMutation.isPending}
            data-testid="button-modal-add-to-cart"
          >
            {addToCartMutation.isPending ? "Adding..." : supply.stockQuantity === 0 ? "Out of Stock" : "Add to Cart"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
