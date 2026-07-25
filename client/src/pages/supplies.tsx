import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight, X, Tag, Settings } from "lucide-react";
import SupplyCard from "@/components/supply-card";
import CartSidebar from "@/components/cart-sidebar";
import BarcodeScanner from "@/components/barcode-scanner";
import { useAuth } from "@/hooks/useAuth";

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get('search') || '',
    category: params.get('category') || '',
    page: parseInt(params.get('page') || '0', 10),
  };
}

const ITEMS_PER_PAGE = 24;

// Default emoji for categories that don't specify one
const CATEGORY_EMOJI_MAP: Record<string, string> = {
  food: '🍽️', drink: '🥤', beverage: '🥤',
  clothing: '👕', apparel: '👗', accessories: '🎀',
  electronics: '📱', tech: '💻',
  health: '💊', healthcare: '🩺', wellness: '🌿',
  beauty: '💄', grooming: '✂️',
  toys: '🧸', games: '🎮',
  sports: '⚽', fitness: '🏋️',
  home: '🏠', furniture: '🛋️',
  garden: '🌱', outdoor: '🌳',
  books: '📚', stationery: '✏️',
  tools: '🔧', hardware: '🔨',
  auto: '🚗', automotive: '🚙',
  pet: '🐾', pets: '🐾',
};

function getCategoryEmoji(key: string, label: string): string {
  const lower = (key + ' ' + label).toLowerCase();
  for (const [keyword, emoji] of Object.entries(CATEGORY_EMOJI_MAP)) {
    if (lower.includes(keyword)) return emoji;
  }
  return '📦';
}

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
  const { user } = useAuth();
  const typedUser = user as any;
  const isAdmin = typedUser?.isAdmin;

  const [, setLocation] = useLocation();
  const urlParams = getUrlParams();

  const isInitialMount = useRef(true);

  const [searchInput, setSearchInput] = useState(urlParams.search);
  const [searchQuery, setSearchQuery] = useState(urlParams.search);
  const [selectedCategory, setSelectedCategory] = useState(urlParams.category);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(urlParams.page);
  const [showScanner, setShowScanner] = useState(false);

  // Sync state from URL on browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = getUrlParams();
      setSearchInput(params.search);
      setSearchQuery(params.search);
      setSelectedCategory(params.category);
      setCurrentPage(params.page);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    }
  }, []);

  // Auto-open scanner from iOS PWA ?scan=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('scan') === '1' && navigator.mediaDevices) {
      setShowScanner(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const updateUrl = useCallback((updates: Record<string, string | number>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === 0) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    const newSearch = params.toString();
    const newUrl = newSearch ? `/supplies?${newSearch}` : '/supplies';
    window.history.replaceState({}, '', newUrl);
  }, []);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedSearch = searchInput.trim();
    setSearchQuery(trimmedSearch);
    setCurrentPage(0);
    updateUrl({ search: trimmedSearch, page: 0 });
  };

  useEffect(() => {
    if (searchInput === '' && searchQuery !== '') {
      setSearchQuery('');
      updateUrl({ search: '' });
    }
  }, [searchInput, searchQuery, updateUrl]);

  useEffect(() => {
    updateUrl({ page: currentPage });
  }, [currentPage, updateUrl]);

  const categoryEffectRan = useRef(false);
  useEffect(() => {
    if (!categoryEffectRan.current) {
      categoryEffectRan.current = true;
      updateUrl({ category: selectedCategory });
      return;
    }
    updateUrl({ category: selectedCategory, page: 0 });
    setCurrentPage(0);
  }, [selectedCategory, updateUrl]);

  // Fetch tenant categories (public endpoint — no auth required)
  const { data: categoryDefs = [] } = useQuery<{ key: string; label: string }[]>({
    queryKey: ["/api/categories"],
    staleTime: 5 * 60 * 1000,
  });

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
        ...(searchQuery && { search: searchQuery }),
      }
    ],
  });

  const supplies = data?.items || [];
  const totalPages = data?.totalPages || 0;

  const { data: cartItems = [] } = useQuery({ queryKey: ["/api/cart"] });
  const cartCount = (cartItems as any[]).length;

  const noCategories = categoryDefs.length === 0;

  return (
    <div className="px-6 py-4 pb-20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Supplies</h2>
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
            className="pl-10 pr-16 bg-gray-100 dark:bg-gray-800 border-none rounded-xl"
            data-testid="input-search-supplies"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                className="text-gray-400 hover:text-gray-600 p-1"
                data-testid="button-clear-search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="text-gray-500 hover:text-brand-blue p-1"
              title="Scan barcode"
              data-testid="button-barcode-scanner"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M3 5v2M3 19v-2M21 5v2M21 19v-2M3 5h2M3 19h2M21 5h-2M21 19h-2"/>
                <rect x="7" y="7" width="3" height="10" rx="0.5"/>
                <rect x="14" y="7" width="3" height="10" rx="0.5"/>
                <rect x="11" y="7" width="1" height="10" rx="0.5"/>
              </svg>
            </button>
          </div>
        </div>
        <Button
          type="submit"
          className="bg-brand-blue hover:bg-brand-blue/90"
          data-testid="button-search-supplies"
        >
          Search
        </Button>
      </form>

      {/* Barcode Scanner overlay */}
      {showScanner && <BarcodeScanner onClose={() => setShowScanner(false)} />}

      {/* Category Grid — tenant-defined, or empty-state prompt */}
      {noCategories ? (
        <div className="mb-6 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-10 px-6 text-center">
          <Tag className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">No categories yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
            Categories help customers browse your products by type.
          </p>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => setLocation('/admin')}
            >
              <Settings className="w-4 h-4" />
              Add categories in Inventory
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {categoryDefs.map((cat) => (
            <Button
              key={cat.key}
              variant="ghost"
              className={`bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm hover:shadow-md transition-shadow h-auto min-h-[80px] flex items-center justify-center ${
                selectedCategory === cat.key ? 'ring-2 ring-brand-blue' : ''
              }`}
              onClick={() => setSelectedCategory(selectedCategory === cat.key ? '' : cat.key)}
            >
              <div className="text-center w-full">
                <div className="text-2xl mb-2">{getCategoryEmoji(cat.key, cat.label)}</div>
                <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 leading-tight">{cat.label}</div>
              </div>
            </Button>
          ))}
        </div>
      )}

      {/* Products Grid */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : supplies.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🛍️</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {noCategories ? 'No products yet' : 'No supplies found'}
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            {searchQuery
              ? `No results for "${searchQuery}"`
              : selectedCategory
                ? `No products in this category yet`
                : noCategories
                  ? 'Set up your categories and add products to get started.'
                  : 'No supplies are currently available'}
          </p>
          {isAdmin && noCategories && (
            <Button
              size="sm"
              className="mt-4 gap-2 bg-brand-blue hover:bg-brand-blue/90"
              onClick={() => setLocation('/admin')}
            >
              <Settings className="w-4 h-4" />
              Go to Inventory to add products
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {supplies.map((supply: any) => (
              <SupplyCard key={supply.id} supply={supply} />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
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
                <span className="text-xs text-gray-600 dark:text-gray-400">
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
