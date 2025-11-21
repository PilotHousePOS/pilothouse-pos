import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import SupplyCard from "@/components/supply-card";
import CartSidebar from "@/components/cart-sidebar";

const SUPPLY_CATEGORIES = [
  { id: 'food', label: 'Food', emoji: '🍖' },
  { id: 'toys', label: 'Toys', emoji: '🧸' },
  { id: 'beds', label: 'Beds', emoji: '🛏️' },
  { id: 'leashes', label: 'Leashes', emoji: '🦮' },
  { id: 'healthcare', label: 'Healthcare', emoji: '💊' },
  { id: 'accessories', label: 'Accessories', emoji: '🎀' },
  { id: 'aquatics', label: 'Aquatics', emoji: '🐠' },
  { id: 'reptiles', label: 'Reptiles', emoji: '🦎' },
  { id: 'birdSupplies', label: 'Bird Supplies', emoji: '🪺' },
  { id: 'dogCages', label: 'Dog Cages', emoji: '🏠' },
  { id: 'smallAnimalSupplies', label: 'Small Animal Supplies', emoji: '🐇' },
  { id: 'smallanimal', label: 'Small Animal', emoji: '🐹' },
  { id: 'dogTreats', label: 'Dog Treats', emoji: '🦴' },
  { id: 'catTreats', label: 'Cat Treats', emoji: '🐱' },
];

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

export default function Supplies() {
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  // Handle search submit
  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery, selectedCategory]);

  const { data, isLoading } = useQuery<{
    items: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>({
    queryKey: [
      "/api/supplies",
      { 
        page: currentPage, 
        limit: ITEMS_PER_PAGE,
        ...(selectedCategory && { category: selectedCategory }),
        ...(searchQuery && { search: searchQuery })
      }
    ],
  });

  const supplies = data?.items || [];
  const totalPages = data?.totalPages || 0;

  const { data: cartItems = [] } = useQuery({
    queryKey: ["/api/cart"],
  });

  const cartCount = cartItems.length;

  return (
    <div className="px-6 py-4 pb-20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Pet Supplies</h2>
        <Button
          variant="outline"
          className="relative"
          onClick={() => setIsCartOpen(true)}
        >
          🛒 Cart
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-brand-red text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </Button>
      </div>
      
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="relative mb-6 flex gap-2">
        <div className="relative flex-1">
          <Input
            type="text"
            placeholder="Search supplies..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10 bg-gray-100 border-none rounded-xl"
            data-testid="input-search-supplies"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        </div>
        <Button 
          type="submit" 
          className="bg-brand-blue hover:bg-brand-blue/90"
          data-testid="button-search-supplies"
        >
          Search
        </Button>
        {searchQuery && (
          <Button 
            type="button" 
            variant="outline"
            onClick={() => {
              setSearchInput('');
              setSearchQuery('');
            }}
            data-testid="button-clear-search"
          >
            Clear
          </Button>
        )}
      </form>

      {/* Category Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {SUPPLY_CATEGORIES.map((category) => (
          <Button
            key={category.id}
            variant="ghost"
            className={`bg-white rounded-xl p-4 text-center shadow-sm hover:shadow-md transition-shadow ${
              selectedCategory === category.id ? 'ring-2 ring-brand-blue' : ''
            }`}
            onClick={() => setSelectedCategory(selectedCategory === category.id ? '' : category.id)}
          >
            <div className="text-center">
              <div className="text-2xl mb-2">{category.emoji}</div>
              <div className="text-xs font-semibold text-gray-900">{category.label}</div>
            </div>
          </Button>
        ))}
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-200 rounded-xl h-20 animate-pulse"></div>
          ))}
        </div>
      ) : supplies.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🛍️</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No supplies found</h3>
          <p className="text-gray-500">
            {searchQuery 
              ? `No results for "${searchQuery}"` 
              : selectedCategory 
                ? `No ${selectedCategory} supplies available`
                : 'No supplies are currently available'}
          </p>
        </div>
      ) : (
        <>
          <div 
            className="space-y-4"
            onTouchStart={(e) => setTouchStart(e.targetTouches[0].clientX)}
            onTouchMove={(e) => setTouchEnd(e.targetTouches[0].clientX)}
            onTouchEnd={() => {
              if (touchStart - touchEnd > 75 && currentPage < totalPages - 1) {
                setCurrentPage(currentPage + 1);
              }
              if (touchStart - touchEnd < -75 && currentPage > 0) {
                setCurrentPage(currentPage - 1);
              }
            }}
          >
            {supplies.map((supply) => (
              <SupplyCard key={supply.id} supply={supply} />
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
                data-testid="button-previous-page"
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

      <CartSidebar isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
}
