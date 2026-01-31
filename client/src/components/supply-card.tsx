import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { formatCategory } from "@/lib/formatCategory";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Supply } from "@shared/schema";

interface SupplyCardProps {
  supply: Supply;
}

export default function SupplyCard({ supply }: SupplyCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDetails, setShowDetails] = useState(false);
  const [modalZoom, setModalZoom] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const modalImageRef = useRef<HTMLImageElement>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [imageError, setImageError] = useState(false);

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

  const defaultImages: Record<string, string> = {
    food: "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    toys: "https://images.unsplash.com/photo-1581888227599-779811939961?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    beds: "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    leashesAndCollars: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    healthcare: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    accessories: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    "Leashes & Collars": "https://images.unsplash.com/photo-1587300003388-59208cc962cb?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    aquatics: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    reptiles: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    dogTreats: "https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    smallanimal: "https://images.unsplash.com/photo-1425082661705-1834bfd09dca?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    birdSupplies: "https://images.unsplash.com/photo-1452570053594-1b985d6ea890?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    catFood: "https://images.unsplash.com/photo-1574158622682-e40e69881006?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    dogFood: "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    catTreats: "https://images.unsplash.com/photo-1574158622682-e40e69881006?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    grooming: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    cleaning: "https://images.unsplash.com/photo-1563453392212-326f5e854473?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    bowls: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    carriers: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    default: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
  };

  const isValidImageUrl = (url: string) => url && (url.startsWith('http') || url.startsWith('/public-objects/')) && !url.includes('placeholder');
  const mainImage = supply.imageUrl && isValidImageUrl(supply.imageUrl) ? supply.imageUrl : null;
  const additionalImages = supply.imageUrls?.filter((url: string) => isValidImageUrl(url) && url !== mainImage) || [];
  const images = mainImage ? [mainImage, ...additionalImages] : additionalImages;
  const hasMultipleImages = images.length > 1;
  const fallbackImage = defaultImages[supply.category] || defaultImages.default;
  const imageUrl = imageError || images.length === 0 ? fallbackImage : (images[currentImageIndex] || fallbackImage);
  
  const handleImageError = () => {
    setImageError(true);
  };

  // Minimum swipe distance (in px) required to trigger navigation
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe && hasMultipleImages) {
      // Swipe left - next image
      setCurrentImageIndex((prev) => 
        prev === images.length - 1 ? 0 : prev + 1
      );
    }
    
    if (isRightSwipe && hasMultipleImages) {
      // Swipe right - previous image
      setCurrentImageIndex((prev) => 
        prev === 0 ? images.length - 1 : prev - 1
      );
    }
  };

  return (
    <>
    <Link href={`/supplies/${supply.id}`}>
    <Card className="shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer" data-testid={`supply-card-${supply.id}`}>
      <CardContent className="p-0">
        <div className="flex">
          <div className="relative w-20 h-20 overflow-hidden">
            <img 
              src={imageUrl}
              alt={supply.name}
              className="w-full h-full object-cover"
              onError={handleImageError}
            />
          </div>
          <div className="p-4 flex-1">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 text-sm break-words">{supply.name}</h4>
                <p className="text-xs text-gray-500 break-words">{supply.brand}</p>
                <p className="text-xs text-gray-400">
                  {supply.weight && `${supply.weight} • `}
                  {supply.size && supply.size}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-brand-red">${supply.price}</p>
                <Button 
                  className="bg-brand-blue hover:bg-blue-600 text-white px-3 py-1 rounded-full text-xs mt-1"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addToCartMutation.mutate();
                  }}
                  disabled={addToCartMutation.isPending}
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
    </Link>

    {/* Supply Details Modal - kept for backwards compatibility */}
    <Dialog open={showDetails} onOpenChange={(open) => {
      setShowDetails(open);
      if (!open) {
        setCurrentImageIndex(0);
        setModalZoom(false);
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supply.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Large Expandable Image - Double-click to enlarge, swipable on mobile */}
          <div 
            className="relative w-full cursor-pointer rounded-lg overflow-visible group"
            onDoubleClick={() => setModalZoom(!modalZoom)}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <img 
              ref={modalImageRef}
              src={imageUrl}
              alt={supply.name}
              className="w-full h-auto object-contain transition-transform duration-300 ease-in-out rounded-lg shadow-lg"
              style={{
                maxHeight: modalZoom ? '90vh' : '500px',
                transform: modalZoom ? 'scale(1.5)' : 'scale(1)',
                transformOrigin: 'center center',
                zIndex: modalZoom ? 9999999 : 1,
                position: modalZoom ? 'relative' : 'relative',
              }}
              onError={handleImageError}
              data-testid="img-product-modal"
            />

            {hasMultipleImages && !modalZoom && (
              <>
                {/* Previous Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImageIndex((prev) => 
                      prev === 0 ? images.length - 1 : prev - 1
                    );
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                
                {/* Next Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImageIndex((prev) => 
                      prev === images.length - 1 ? 0 : prev + 1
                    );
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
                
                {/* Image Dots */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
                  {images.map((_: any, idx: number) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImageIndex(idx);
                      }}
                      className={`w-2 h-2 rounded-full transition-all ${
                        idx === currentImageIndex 
                          ? 'bg-white w-6' 
                          : 'bg-white/50 hover:bg-white/75'
                      }`}
                      aria-label={`Go to image ${idx + 1}`}
                    />
                  ))}
                </div>
                
                {/* Image Counter */}
                <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
                  {currentImageIndex + 1} / {images.length}
                </div>
              </>
            )}
          </div>

          {/* Product Details */}
          <div className="space-y-2">
            {supply.brand && (
              <div className="flex justify-between">
                <span className="font-semibold">Brand:</span>
                <span>{supply.brand}</span>
              </div>
            )}
            <div className="flex gap-6">
              <div>
                <span className="font-semibold">Category: </span>
                <span>{formatCategory(supply.category)}</span>
              </div>
              <div>
                <span className="font-semibold">Price: </span>
                <span className="text-brand-red font-bold text-lg">${supply.price}</span>
              </div>
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
            {supply.description && (
              <div>
                <span className="font-semibold">Description:</span>
                <p className="text-gray-600 mt-1">{supply.description}</p>
              </div>
            )}
          </div>

          {/* Add to Cart in Modal */}
          <Button 
            className="w-full bg-brand-blue hover:bg-blue-600 text-white py-3"
            onClick={() => {
              addToCartMutation.mutate();
              setShowDetails(false);
            }}
            disabled={addToCartMutation.isPending}
            data-testid="button-modal-add-to-cart"
          >
            {addToCartMutation.isPending ? "Adding..." : "Add to Cart"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
