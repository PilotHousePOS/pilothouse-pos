import { useState, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { formatCategory } from "@/lib/formatCategory";
import { 
  ChevronLeft, 
  ChevronRight, 
  Heart, 
  ShoppingCart, 
  ArrowLeft,
  Minus,
  Plus,
  Package,
  Printer
} from "lucide-react";
import type { Supply } from "@shared/schema";

interface SupplyWithRelated extends Supply {
  relatedProducts?: Supply[];
}

const defaultImages: Record<string, string> = {
  food: "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=600",
  toys: "https://images.unsplash.com/photo-1581888227599-779811939961?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=600",
  beds: "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=600",
  healthcare: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=600",
  accessories: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=600",
  aquatics: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=600",
  reptiles: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=600",
  default: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=600"
};

export default function SupplyDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const { data: supply, isLoading, error } = useQuery<SupplyWithRelated>({
    queryKey: [`/api/supplies/${id}`],
    enabled: !!id,
  });

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/cart", {
        supplyId: parseInt(id!),
        quantity,
      });
    },
    onSuccess: () => {
      toast({
        title: "Added to Cart",
        description: `${quantity}x ${supply?.name} has been added to your cart.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Please log in",
          description: "You need to be logged in to add items to cart.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add item to cart.",
        variant: "destructive",
      });
    },
  });

  const addToWishlistMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/wishlist", {
        supplyId: parseInt(id!),
      });
    },
    onSuccess: () => {
      toast({
        title: "Added to Wishlist",
        description: `${supply?.name} has been added to your wishlist.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Please log in",
          description: "You need to be logged in to add items to wishlist.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add item to wishlist.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !supply) {
    return (
      <div className="min-h-screen bg-black p-4">
        <Button 
          variant="ghost" 
          onClick={() => setLocation("/supplies")}
          className="text-white mb-4"
          data-testid="back-button"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Supplies
        </Button>
        <div className="text-center text-white">
          <h2 className="text-xl font-bold">Product not found</h2>
        </div>
      </div>
    );
  }

  const isValidImageUrl = (url: string) => url && (url.startsWith('http') || url.startsWith('/public-objects/'));
  const filteredImageUrls = supply.imageUrls?.filter((url: string) => isValidImageUrl(url)) || [];
  const singleImageUrl = supply.imageUrl && isValidImageUrl(supply.imageUrl) ? [supply.imageUrl] : [];
  const images = filteredImageUrls.length > 0 ? filteredImageUrls : singleImageUrl;
  const hasMultipleImages = images.length > 1;
  const fallbackImage = defaultImages[supply.category] || defaultImages.default;
  const currentImage = imageError || images.length === 0 ? fallbackImage : (images[currentImageIndex] || fallbackImage);

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
    if (distance > minSwipeDistance && hasMultipleImages) {
      setCurrentImageIndex((prev) => prev === images.length - 1 ? 0 : prev + 1);
    }
    if (distance < -minSwipeDistance && hasMultipleImages) {
      setCurrentImageIndex((prev) => prev === 0 ? images.length - 1 : prev - 1);
    }
  };

  const features = supply.features as Record<string, any> | null;
  const inStock = (supply.stockQuantity ?? 0) > 0;

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-gray-800 p-3 flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => window.history.back()}
          className="text-white"
          data-testid="back-button"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-xs text-gray-400">{formatCategory(supply.category)}</span>
        <Button variant="ghost" size="sm" className="text-white" data-testid="print-button">
          <Printer className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-4">
        <div 
          className="relative aspect-square bg-gray-900 rounded-lg overflow-hidden mb-4"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <img
            src={currentImage}
            alt={supply.name}
            className="w-full h-full object-contain"
            onError={() => setImageError(true)}
            data-testid="product-main-image"
          />
          
          <button 
            onClick={() => addToWishlistMutation.mutate()}
            className="absolute top-3 right-3 p-2 bg-black/50 rounded-full"
            data-testid="wishlist-button"
          >
            <Heart className="w-5 h-5 text-white" />
          </button>

          {hasMultipleImages && (
            <>
              <button 
                onClick={() => setCurrentImageIndex(prev => prev === 0 ? images.length - 1 : prev - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full"
                data-testid="image-prev"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              <button 
                onClick={() => setCurrentImageIndex(prev => prev === images.length - 1 ? 0 : prev + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full"
                data-testid="image-next"
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            </>
          )}
        </div>

        {hasMultipleImages && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentImageIndex(idx)}
                className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${
                  idx === currentImageIndex ? 'border-green-500' : 'border-gray-700'
                }`}
                data-testid={`thumbnail-${idx}`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="mb-6">
          <h1 className="text-xl font-bold mb-1" data-testid="product-name">{supply.name}</h1>
          {supply.brand && (
            <Link href={`/supplies?brand=${encodeURIComponent(supply.brand)}`}>
              <span className="text-green-500 text-sm cursor-pointer hover:underline" data-testid="product-brand">
                {supply.brand} &gt;
              </span>
            </Link>
          )}
          
          <div className="flex items-baseline gap-3 mt-3">
            <span className="text-2xl font-bold text-green-400" data-testid="product-price">
              ${Number(supply.price).toFixed(2)}
            </span>
          </div>

          <Badge 
            variant={inStock ? "default" : "destructive"} 
            className={`mt-2 ${inStock ? 'bg-green-600' : ''}`}
            data-testid="stock-status"
          >
            {inStock ? 'In Stock' : 'Out of Stock'}
          </Badge>

        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center border border-gray-700 rounded-lg">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="text-white"
              data-testid="qty-minus"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 text-center bg-transparent border-0 text-white"
              min={1}
              data-testid="qty-input"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuantity(quantity + 1)}
              className="text-white"
              data-testid="qty-plus"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <Button
            onClick={() => addToCartMutation.mutate()}
            disabled={!inStock || addToCartMutation.isPending}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            data-testid="add-to-cart"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            {addToCartMutation.isPending ? 'Adding...' : 'ADD TO CART'}
          </Button>
        </div>

        {supply.description && (
          <div className="mb-6 text-gray-300 text-sm leading-relaxed" data-testid="product-description">
            {supply.description}
          </div>
        )}

        <Accordion type="multiple" className="w-full" defaultValue={["details"]}>
          {features && (features.highlights || Object.keys(features).length > 0) && (
            <AccordionItem value="details" className="border-gray-700">
              <AccordionTrigger className="text-green-500 hover:text-green-400" data-testid="accordion-features">
                Details
              </AccordionTrigger>
              <AccordionContent className="text-gray-300">
                {features.highlights && Array.isArray(features.highlights) ? (
                  <ul className="space-y-2 text-sm">
                    {features.highlights.map((highlight: string, idx: number) => (
                      <li key={idx} className="flex items-start">
                        <span className="text-green-500 mr-2">•</span>
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="space-y-2 text-sm">
                    {Object.entries(features).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                        <span>{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {supply.ingredients && (
            <AccordionItem value="ingredients" className="border-gray-700">
              <AccordionTrigger className="text-green-500 hover:text-green-400" data-testid="accordion-ingredients">
                Ingredient Information
              </AccordionTrigger>
              <AccordionContent className="text-gray-300">
                <p className="font-semibold text-white mb-2">Ingredients</p>
                <p className="text-sm leading-relaxed">{supply.ingredients}</p>
              </AccordionContent>
            </AccordionItem>
          )}

          {(supply as any).materials && (
            <AccordionItem value="materials" className="border-gray-700">
              <AccordionTrigger className="text-green-500 hover:text-green-400" data-testid="accordion-materials">
                Product Materials
              </AccordionTrigger>
              <AccordionContent className="text-gray-300">
                <p className="font-semibold text-white mb-2">Materials</p>
                <p className="text-sm leading-relaxed">{(supply as any).materials}</p>
              </AccordionContent>
            </AccordionItem>
          )}

          {supply.guaranteedAnalysis && (
            <AccordionItem value="analysis" className="border-gray-700">
              <AccordionTrigger className="text-green-500 hover:text-green-400" data-testid="accordion-analysis">
                Guaranteed Analysis
              </AccordionTrigger>
              <AccordionContent className="text-gray-300">
                <table className="w-full text-sm" data-testid="guaranteed-analysis-table">
                  <tbody>
                    {(() => {
                      const parts = supply.guaranteedAnalysis.split('|');
                      const rows = [];
                      for (let i = 0; i < parts.length - 1; i += 2) {
                        rows.push(
                          <tr key={i} className="border-b border-gray-700">
                            <td className="py-2 font-semibold text-white">{parts[i].trim()}</td>
                            <td className="py-2 text-right">{parts[i + 1].trim()}</td>
                          </tr>
                        );
                      }
                      return rows;
                    })()}
                  </tbody>
                </table>
              </AccordionContent>
            </AccordionItem>
          )}

          {supply.instructions && (
            <AccordionItem value="instructions" className="border-gray-700">
              <AccordionTrigger className="text-green-500 hover:text-green-400" data-testid="accordion-instructions">
                {(supply as any).instructionLabel || 'Usage Instructions'}
              </AccordionTrigger>
              <AccordionContent className="text-gray-300 text-sm leading-relaxed">
                {supply.instructions}
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>

        {supply.relatedProducts && supply.relatedProducts.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-bold mb-4" data-testid="related-products-title">
              You May Also Like
            </h2>
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4" style={{ width: 'max-content' }}>
                {supply.relatedProducts.map((related) => (
                  <RelatedProductCard key={related.id} product={related} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RelatedProductCard({ product }: { product: Supply }) {
  const fallbackImage = defaultImages[product.category] || defaultImages.default;
  const isValidImageUrl = (url: string) => url && (url.startsWith('http') || url.startsWith('/public-objects/'));
  const imageUrl = product.imageUrl && isValidImageUrl(product.imageUrl) ? product.imageUrl : fallbackImage;
  const inStock = (product.stockQuantity ?? 0) > 0;

  return (
    <Link href={`/supplies/${product.id}`}>
      <Card className="w-40 bg-gray-900 border-gray-700 cursor-pointer hover:border-green-500 transition-colors" data-testid={`related-product-${product.id}`}>
        <CardContent className="p-2">
          <div className="relative aspect-square mb-2 rounded overflow-hidden">
            {inStock && (
              <Badge className="absolute top-1 left-1 bg-green-600 text-xs z-10">
                Back In Stock
              </Badge>
            )}
            <button className="absolute top-1 right-1 p-1 bg-black/50 rounded-full z-10">
              <Heart className="w-3 h-3 text-white" />
            </button>
            <img
              src={imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
          <h3 className="text-xs text-white line-clamp-2 mb-1">{product.name}</h3>
          <div className="text-green-400 font-bold text-sm">
            ${Number(product.price).toFixed(2)}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
