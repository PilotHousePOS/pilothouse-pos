import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Fish, X, ChevronLeft, ChevronRight, ArrowLeft, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { safeGoBack } from "@/lib/navigation";
import { useDebounce } from "@/hooks/use-debounce";

const ITEMS_PER_PAGE = 24;

// Helper function to calculate which page indicators to display (max 5)
function getPageIndicators(currentPage: number, totalPages: number): number[] {
  const MAX_INDICATORS = 5;
  
  if (totalPages <= MAX_INDICATORS) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  
  let startPage = Math.max(0, currentPage - Math.floor(MAX_INDICATORS / 2));
  let endPage = startPage + MAX_INDICATORS;
  
  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(0, endPage - MAX_INDICATORS);
  }
  
  return Array.from({ length: endPage - startPage }, (_, i) => startPage + i);
}

const AQUATIC_CATEGORIES = [
  { id: 'food', label: 'Fish Food', emoji: '🐟' },
  { id: 'healthcare', label: 'Medicine', emoji: '💊' },
  { id: 'accessories', label: 'Supplies', emoji: '🏺' },
];

export default function AquaticsPage() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<"pet" | "supply" | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [modalZoom, setModalZoom] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Debounce search to avoid flickering on every keystroke
  const searchQuery = useDebounce(searchInput, 500);

  const { data: petsData, isLoading: petsLoading } = useQuery<any>({
    queryKey: ["/api/pets", { species: "fish" }],
    queryFn: async () => {
      const response = await fetch("/api/pets?species=fish");
      if (!response.ok) throw new Error("Failed to fetch fish");
      return response.json();
    },
  });
  
  const pets = petsData?.pets || [];

  const { data: suppliesData, isLoading: suppliesLoading } = useQuery<any>({
    queryKey: ["/api/supplies", { category: selectedCategory || "aquatic-supplies", page: currentPage, limit: ITEMS_PER_PAGE, search: searchQuery }],
    queryFn: async () => {
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const categoryParam = selectedCategory ? `&category=${selectedCategory}` : '&category=aquatic-supplies';
      const response = await fetch(`/api/supplies?filterType=aquatic${categoryParam}&page=${currentPage}&limit=${ITEMS_PER_PAGE}${searchParam}`);
      if (!response.ok) throw new Error("Failed to fetch supplies");
      return response.json();
    },
  });

  const supplies = suppliesData?.items || [];
  const totalPages = suppliesData?.totalPages || 0;

  // Reset page when search or category changes
  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery, selectedCategory]);

  // Reset page when totalPages changes or currentPage is out of bounds
  useEffect(() => {
    if (totalPages > 0 && currentPage >= totalPages) {
      setCurrentPage(0);
    }
  }, [totalPages, currentPage]);

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
                    {(pet.imageUrls?.[0] || pet.imageUrl) && (
                      <img
                        src={pet.imageUrls?.[0] || pet.imageUrl}
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
          
          {/* Category Filter */}
          <div className="mb-6">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === '' ? 'default' : 'outline'}
                onClick={() => setSelectedCategory('')}
                className={`${selectedCategory === '' ? 'bg-blue-600 hover:bg-blue-700' : 'hover:bg-gray-100'}`}
                data-testid="filter-category-all"
              >
                All Supplies
              </Button>
              {AQUATIC_CATEGORIES.map((cat) => (
                <Button
                  key={cat.id}
                  variant={selectedCategory === cat.id ? 'default' : 'outline'}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`${selectedCategory === cat.id ? 'bg-blue-600 hover:bg-blue-700' : 'hover:bg-gray-100'}`}
                  data-testid={`filter-category-${cat.id}`}
                >
                  <span className="mr-2">{cat.emoji}</span>
                  {cat.label}
                </Button>
              ))}
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="relative mb-6">
            <Input
              type="text"
              placeholder="Search aquatic supplies..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 bg-white border-gray-200 rounded-xl"
              data-testid="input-search-aquatic-supplies"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          </div>

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
            <>
              <div 
                className="grid grid-cols-1 md:grid-cols-2 gap-6 auto-rows-max"
                onTouchStart={(e) => {
                  setTouchStart(e.targetTouches[0].clientX);
                  setTouchEnd(0);
                }}
                onTouchMove={(e) => setTouchEnd(e.targetTouches[0].clientX)}
                onTouchEnd={() => {
                  if (touchEnd !== 0) {
                    if (touchStart - touchEnd > 75 && currentPage < totalPages - 1) {
                      setCurrentPage(currentPage + 1);
                    }
                    if (touchStart - touchEnd < -75 && currentPage > 0) {
                      setCurrentPage(currentPage - 1);
                    }
                  }
                }}
              >
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
                      {(supply.imageUrls?.[0] || supply.imageUrl) && (
                        <img
                          src={supply.imageUrls?.[0] || supply.imageUrl}
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

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 0}
                    className="text-blue-600 hover:text-blue-800"
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600">
                      Page {currentPage + 1} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                      {getPageIndicators(currentPage, totalPages).map((i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentPage(i)}
                          className={`w-2 h-2 rounded-full transition-all ${
                            i === currentPage ? 'bg-blue-600 w-6' : 'bg-gray-300 hover:bg-gray-400'
                          }`}
                          aria-label={`Go to page ${i + 1}`}
                          data-testid={`page-indicator-${i}`}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages - 1}
                    className="text-blue-600 hover:text-blue-800"
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Item Details Dialog */}
      <Dialog open={selectedItem !== null} onOpenChange={() => {
        setSelectedItem(null);
        setCurrentImageIndex(0);
        setModalZoom(false);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedItem?.name}</DialogTitle>
          </DialogHeader>
          
          {selectedItem && (() => {
            const images = selectedItem.imageUrls?.filter((url: string) => url) || 
                          (selectedItem.imageUrl ? [selectedItem.imageUrl] : []);
            const hasMultipleImages = images.length > 1;
            
            return (
              <div className="space-y-4">
                {images.length > 0 && (
                  <div 
                    className="relative w-full cursor-pointer rounded-lg overflow-visible group"
                    onDoubleClick={() => setModalZoom(!modalZoom)}
                  >
                    <img
                      src={images[currentImageIndex]}
                      alt={selectedItem.name}
                      className="w-full h-auto object-contain transition-transform duration-300 ease-in-out rounded-lg shadow-lg"
                      style={{
                        maxHeight: modalZoom ? '90vh' : '500px',
                        transform: modalZoom ? 'scale(1.5)' : 'scale(1)',
                        transformOrigin: 'center center',
                        zIndex: modalZoom ? 9999999 : 1,
                        position: modalZoom ? 'relative' : 'relative',
                      }}
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
                              onClick={() => setCurrentImageIndex(idx)}
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
                    setCurrentImageIndex(0);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  data-testid={`dialog-add-to-cart-${selectedItem.id}`}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Add to Cart
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
