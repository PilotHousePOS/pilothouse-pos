import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Pet } from "@shared/schema";

interface PetCardProps {
  pet: Pet;
}

export default function PetCard({ pet }: PetCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [modalZoom, setModalZoom] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const modalImageRef = useRef<HTMLImageElement>(null);

  const defaultImages = {
    mammals: "https://images.unsplash.com/photo-1552053831-71594a27632d?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    bird: "https://images.unsplash.com/photo-1452570053594-1b985d6ea890?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    fish: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    reptile: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
  };

  const images = pet.imageUrls?.filter((url: string) => url) || 
                (pet.imageUrl ? [pet.imageUrl] : []);
  const hasMultipleImages = images.length > 1;
  const imageUrl = images[currentImageIndex] || defaultImages[pet.species as keyof typeof defaultImages] || defaultImages.mammals;

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
      <Card className="shadow-sm overflow-hidden hover:shadow-md transition-shadow">
        <CardContent className="p-0">
          <img 
            src={imageUrl}
            alt={pet.name}
            className="w-full h-32 object-cover" 
          />
          <div className="p-3">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 text-sm">{pet.name}</h4>
                <p className="text-xs text-gray-500">{pet.breed}</p>
                <p className="text-xs text-gray-400">{pet.age}</p>
              </div>
              {!pet.isAvailable && (
                <Badge variant="secondary" className="text-xs">
                  Adopted
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-brand-red">${pet.price}</p>
              <Button 
                className="bg-brand-blue hover:bg-blue-600 text-white py-1 px-3 rounded-lg text-xs"
                disabled={!pet.isAvailable}
                onClick={() => setShowDetails(true)}
              >
                {pet.isAvailable ? "View Details" : "Adopted"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pet Details Modal */}
      <Dialog open={showDetails} onOpenChange={(open) => {
        setShowDetails(open);
        if (!open) {
          setCurrentImageIndex(0);
          setModalZoom(false);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pet.name}</DialogTitle>
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
                alt={pet.name}
                className="w-full h-auto object-contain transition-transform duration-300 ease-in-out rounded-lg shadow-lg"
                style={{
                  maxHeight: modalZoom ? '90vh' : '500px',
                  transform: modalZoom ? 'scale(1.5)' : 'scale(1)',
                  transformOrigin: 'center center',
                  zIndex: modalZoom ? 9999999 : 1,
                  position: modalZoom ? 'relative' : 'relative',
                }}
                data-testid="img-pet-modal"
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
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="font-semibold">Species:</span>
                <span className="capitalize">{pet.species}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Breed:</span>
                <span>{pet.breed}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Age:</span>
                <span>{pet.age}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Price:</span>
                <span className="text-brand-red font-bold">${pet.price}</span>
              </div>
              {pet.description && (
                <div>
                  <span className="font-semibold">Description:</span>
                  <p className="text-gray-600 mt-1">{pet.description}</p>
                </div>
              )}
              <div className="flex justify-between">
                <span className="font-semibold">Status:</span>
                <Badge variant={pet.isAvailable ? "default" : "secondary"}>
                  {pet.isAvailable ? "Available" : "Adopted"}
                </Badge>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
