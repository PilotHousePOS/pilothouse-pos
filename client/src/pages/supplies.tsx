import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import SupplyCard from "@/components/supply-card";
import CartSidebar from "@/components/cart-sidebar";

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get('search') || '',
    category: params.get('category') || '',
    page: parseInt(params.get('page') || '0', 10),
    animalType: params.get('animalType') || '',
    toyType: params.get('toyType') || '',
    healthcareType: params.get('healthcareType') || '',
    aquaticType: params.get('aquaticType') || '',
    reptileType: params.get('reptileType') || '',
    birdType: params.get('birdType') || '',
    smallAnimalProductType: params.get('smallAnimalProductType') || '',
    petFoodAnimalType: params.get('petFoodAnimalType') || '',
    treatAnimalType: params.get('treatAnimalType') || '',
  };
}

const SUPPLY_CATEGORIES = [
  { id: 'petFood', label: 'Pet Food', emoji: '🍖' },
  { id: 'treats', label: 'Treats', emoji: '🦴' },
  { id: 'toys', label: 'Toys', emoji: '🧸' },
  { id: 'beds', label: 'Beds', emoji: '🛏️' },
  { id: 'leashesAndCollars', label: 'Leashes & Collars', emoji: '🦮' },
  { id: 'healthcare', label: 'Healthcare', emoji: '💊' },
  { id: 'accessories', label: 'Accessories', emoji: '🎀' },
  { id: 'aquatics', label: 'Aquatics', emoji: '🐠' },
  { id: 'reptiles', label: 'Reptiles', emoji: '🦎' },
  { id: 'birdSupplies', label: 'Bird Supplies', emoji: '🪺' },
  { id: 'smallanimal', label: 'Small Animals', emoji: '🐹' },
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

const ANIMAL_TYPES = [
  { id: 'hamster', label: 'Hamster', emoji: '🐹' },
  { id: 'guinea-pig', label: 'Guinea Pig', emoji: '🐹' },
  { id: 'rabbit', label: 'Rabbit', emoji: '🐰' },
  { id: 'ferret', label: 'Ferret', emoji: '🦦' },
  { id: 'mouse-rat', label: 'Mouse/Rat', emoji: '🐭' },
  { id: 'gerbil', label: 'Gerbil', emoji: '🐭' },
  { id: 'chinchilla', label: 'Chinchilla', emoji: '🐭' },
];

const TOY_TYPES = [
  { id: 'dog-toys', label: 'Dog Toys', emoji: '🐕' },
  { id: 'cat-toys', label: 'Cat Toys', emoji: '🐱' },
  { id: 'bird-toys', label: 'Bird Toys', emoji: '🦜' },
  { id: 'small-animal-toys', label: 'Small Animal', emoji: '🐹' },
];

const HEALTHCARE_TYPES = [
  { id: 'flea-tick', label: 'Flea & Tick', emoji: '🪲' },
  { id: 'dental', label: 'Dental Care', emoji: '🦷' },
  { id: 'supplements', label: 'Supplements', emoji: '💊' },
  { id: 'grooming', label: 'Grooming', emoji: '🛁' },
  { id: 'first-aid', label: 'First Aid', emoji: '🩹' },
];

const AQUATIC_TYPES = [
  { id: 'fish-food', label: 'Fish Food', emoji: '🐟' },
  { id: 'medicine', label: 'Medicine', emoji: '💊' },
  { id: 'supplies', label: 'Supplies', emoji: '🏺' },
];

const REPTILE_TYPES = [
  { id: 'reptile-food', label: 'Reptile Food', emoji: '🦗' },
  { id: 'reptile-supplies', label: 'Supplies', emoji: '🏺' },
];

const BIRD_TYPES = [
  { id: 'bird-food', label: 'Bird Food', emoji: '🌾' },
  { id: 'bird-supplies', label: 'Supplies', emoji: '🏺' },
];

const SMALL_ANIMAL_PRODUCT_TYPES = [
  { id: 'small-animal-food', label: 'Food', emoji: '🥕' },
  { id: 'small-animal-supplies', label: 'Supplies', emoji: '🏺' },
];

const PET_FOOD_ANIMAL_TYPES = [
  { id: 'dog', label: 'Dog Food', emoji: '🐕' },
  { id: 'cat', label: 'Cat Food', emoji: '🐱' },
  { id: 'smallAnimal', label: 'Small Animal Food', emoji: '🐹' },
];

const TREAT_ANIMAL_TYPES = [
  { id: 'dog', label: 'Dog Treats', emoji: '🐕' },
  { id: 'cat', label: 'Cat Treats', emoji: '🐱' },
  { id: 'smallAnimal', label: 'Small Animal Treats', emoji: '🐹' },
];

export default function Supplies() {
  const [location, setLocation] = useLocation();
  const urlParams = getUrlParams();
  
  // Ref to track if this is the initial mount - skip page reset on mount
  const isInitialMount = useRef(true);
  
  const [searchInput, setSearchInput] = useState(urlParams.search);
  const [searchQuery, setSearchQuery] = useState(urlParams.search);
  const [selectedCategory, setSelectedCategory] = useState(urlParams.category);
  const [selectedAnimalType, setSelectedAnimalType] = useState(urlParams.animalType);
  const [selectedToyType, setSelectedToyType] = useState(urlParams.toyType);
  const [selectedHealthcareType, setSelectedHealthcareType] = useState(urlParams.healthcareType);
  const [selectedAquaticType, setSelectedAquaticType] = useState(urlParams.aquaticType);
  const [selectedReptileType, setSelectedReptileType] = useState(urlParams.reptileType);
  const [selectedBirdType, setSelectedBirdType] = useState(urlParams.birdType);
  const [selectedSmallAnimalProductType, setSelectedSmallAnimalProductType] = useState(urlParams.smallAnimalProductType);
  const [selectedPetFoodAnimalType, setSelectedPetFoodAnimalType] = useState(urlParams.petFoodAnimalType);
  const [selectedTreatAnimalType, setSelectedTreatAnimalType] = useState(urlParams.treatAnimalType);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(urlParams.page);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  
  // Sync state from URL on browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = getUrlParams();
      setSearchInput(params.search);
      setSearchQuery(params.search);
      setSelectedCategory(params.category);
      setSelectedAnimalType(params.animalType);
      setSelectedToyType(params.toyType);
      setSelectedHealthcareType(params.healthcareType);
      setSelectedAquaticType(params.aquaticType);
      setSelectedReptileType(params.reptileType);
      setSelectedBirdType(params.birdType);
      setSelectedSmallAnimalProductType(params.smallAnimalProductType);
      setSelectedPetFoodAnimalType(params.petFoodAnimalType);
      setSelectedTreatAnimalType(params.treatAnimalType);
      setCurrentPage(params.page);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  
  // Mark initial mount complete after first render
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
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

  // Handle search submit
  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedSearch = searchInput.trim();
    setSearchQuery(trimmedSearch);
    setCurrentPage(0);
    updateUrl({ search: trimmedSearch, page: 0 });
  };

  // Auto-reset search when input is cleared (backspace or X button)
  useEffect(() => {
    if (searchInput === '' && searchQuery !== '') {
      setSearchQuery('');
      updateUrl({ search: '' });
    }
  }, [searchInput, searchQuery, updateUrl]);

  // Update URL when page changes
  useEffect(() => {
    updateUrl({ page: currentPage });
  }, [currentPage, updateUrl]);

  // Track if category effect has run once (to skip page reset on initial mount)
  const categoryEffectRan = useRef(false);
  
  // Update URL when category changes
  useEffect(() => {
    // Skip page reset on initial mount - preserve URL page state
    if (!categoryEffectRan.current) {
      categoryEffectRan.current = true;
      // Still update URL with current values but don't reset page
      updateUrl({ category: selectedCategory });
      return;
    }
    
    updateUrl({ 
      category: selectedCategory, 
      page: 0,
      animalType: '',
      toyType: '',
      healthcareType: '',
      aquaticType: '',
      reptileType: '',
      birdType: '',
      smallAnimalProductType: '',
      petFoodAnimalType: '',
      treatAnimalType: ''
    });
    setCurrentPage(0);
    // Clear animal type when not in small animal category
    if (selectedCategory !== 'smallanimal') {
      setSelectedAnimalType('');
      setSelectedSmallAnimalProductType('');
    }
    // Clear toy type when not in toys category
    if (selectedCategory !== 'toys') {
      setSelectedToyType('');
    }
    // Clear healthcare type when not in healthcare category
    if (selectedCategory !== 'healthcare') {
      setSelectedHealthcareType('');
    }
    // Clear aquatic type when not in aquatics category
    if (selectedCategory !== 'aquatics') {
      setSelectedAquaticType('');
    }
    // Clear reptile type when not in reptiles category
    if (selectedCategory !== 'reptiles') {
      setSelectedReptileType('');
    }
    // Clear bird type when not in bird supplies category
    if (selectedCategory !== 'birdSupplies') {
      setSelectedBirdType('');
    }
    // Clear pet food animal type when not in pet food category
    if (selectedCategory !== 'petFood') {
      setSelectedPetFoodAnimalType('');
    }
    // Clear treat animal type when not in treats category
    if (selectedCategory !== 'treats') {
      setSelectedTreatAnimalType('');
    }
  }, [selectedCategory, updateUrl]);

  // Track if subfilter effect has run once (to skip page reset on initial mount)
  const subfilterEffectRan = useRef(false);
  
  // Update URL when sub-filters change
  useEffect(() => {
    // Skip page reset on initial mount - preserve URL page state
    if (!subfilterEffectRan.current) {
      subfilterEffectRan.current = true;
      return;
    }
    
    updateUrl({ 
      animalType: selectedAnimalType,
      toyType: selectedToyType,
      healthcareType: selectedHealthcareType,
      aquaticType: selectedAquaticType,
      reptileType: selectedReptileType,
      birdType: selectedBirdType,
      smallAnimalProductType: selectedSmallAnimalProductType,
      petFoodAnimalType: selectedPetFoodAnimalType,
      treatAnimalType: selectedTreatAnimalType,
      page: 0
    });
    setCurrentPage(0);
  }, [selectedAnimalType, selectedToyType, selectedHealthcareType, selectedAquaticType, selectedReptileType, selectedBirdType, selectedSmallAnimalProductType, selectedPetFoodAnimalType, selectedTreatAnimalType, updateUrl]);

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
        ...(selectedAnimalType && { animalType: selectedAnimalType }),
        ...(selectedToyType && { toyType: selectedToyType }),
        ...(selectedHealthcareType && { healthcareType: selectedHealthcareType }),
        ...(selectedAquaticType && { aquaticType: selectedAquaticType }),
        ...(selectedReptileType && { reptileType: selectedReptileType }),
        ...(selectedBirdType && { birdType: selectedBirdType }),
        ...(selectedSmallAnimalProductType && { smallAnimalProductType: selectedSmallAnimalProductType }),
        ...(selectedPetFoodAnimalType && { petFoodAnimalType: selectedPetFoodAnimalType }),
        ...(selectedTreatAnimalType && { treatAnimalType: selectedTreatAnimalType })
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
            className="pl-10 pr-10 bg-gray-100 border-none rounded-xl"
            data-testid="input-search-supplies"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              data-testid="button-clear-search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button 
          type="submit" 
          className="bg-brand-blue hover:bg-brand-blue/90"
          data-testid="button-search-supplies"
        >
          Search
        </Button>
      </form>

      {/* Category Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {SUPPLY_CATEGORIES.map((category) => (
          <Button
            key={category.id}
            variant="ghost"
            className={`bg-white rounded-xl p-4 text-center shadow-sm hover:shadow-md transition-shadow h-auto min-h-[80px] flex items-center justify-center ${
              selectedCategory === category.id ? 'ring-2 ring-brand-blue' : ''
            }`}
            onClick={() => setSelectedCategory(selectedCategory === category.id ? '' : category.id)}
          >
            <div className="text-center w-full">
              <div className="text-2xl mb-2">{category.emoji}</div>
              <div className="text-xs font-semibold text-gray-900 leading-tight">{category.label}</div>
            </div>
          </Button>
        ))}
      </div>

      {/* Pet Food Animal Type Filter (shows only for pet food category) */}
      {selectedCategory === 'petFood' && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Animal Type:</h3>
          <div className="grid grid-cols-2 gap-3">
            {PET_FOOD_ANIMAL_TYPES.map((animal) => (
              <Button
                key={animal.id}
                variant="outline"
                size="sm"
                className={`text-center py-3 h-auto min-h-[70px] flex items-center justify-center ${
                  selectedPetFoodAnimalType === animal.id ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white'
                }`}
                onClick={() => setSelectedPetFoodAnimalType(selectedPetFoodAnimalType === animal.id ? '' : animal.id)}
                data-testid={`button-filter-petfood-${animal.id}`}
              >
                <div className="flex flex-col items-center w-full">
                  <div className="text-lg mb-1">{animal.emoji}</div>
                  <div className="text-xs leading-tight">{animal.label}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Treats Animal Type Filter (shows only for treats category) */}
      {selectedCategory === 'treats' && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Animal Type:</h3>
          <div className="grid grid-cols-2 gap-3">
            {TREAT_ANIMAL_TYPES.map((animal) => (
              <Button
                key={animal.id}
                variant="outline"
                size="sm"
                className={`text-center py-3 h-auto min-h-[70px] flex items-center justify-center ${
                  selectedTreatAnimalType === animal.id ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white'
                }`}
                onClick={() => setSelectedTreatAnimalType(selectedTreatAnimalType === animal.id ? '' : animal.id)}
                data-testid={`button-filter-treat-${animal.id}`}
              >
                <div className="flex flex-col items-center w-full">
                  <div className="text-lg mb-1">{animal.emoji}</div>
                  <div className="text-xs leading-tight">{animal.label}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Animal Type Filter (shows only for small animal categories) */}
      {selectedCategory === 'smallanimal' && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Animal Type:</h3>
          <div className="grid grid-cols-3 gap-3">
            {ANIMAL_TYPES.map((animal) => (
              <Button
                key={animal.id}
                variant="outline"
                size="sm"
                className={`text-center py-3 h-auto min-h-[70px] flex items-center justify-center ${
                  selectedAnimalType === animal.id ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white'
                }`}
                onClick={() => setSelectedAnimalType(selectedAnimalType === animal.id ? '' : animal.id)}
                data-testid={`button-filter-${animal.id}`}
              >
                <div className="flex flex-col items-center w-full">
                  <div className="text-lg mb-1">{animal.emoji}</div>
                  <div className="text-xs leading-tight">{animal.label}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Toy Type Filter (shows only for toys category) */}
      {selectedCategory === 'toys' && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Toy Type:</h3>
          <div className="grid grid-cols-2 gap-3">
            {TOY_TYPES.map((toy) => (
              <Button
                key={toy.id}
                variant="outline"
                size="sm"
                className={`text-center py-3 h-auto min-h-[70px] flex items-center justify-center ${
                  selectedToyType === toy.id ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white'
                }`}
                onClick={() => setSelectedToyType(selectedToyType === toy.id ? '' : toy.id)}
                data-testid={`button-filter-${toy.id}`}
              >
                <div className="flex flex-col items-center w-full">
                  <div className="text-lg mb-1">{toy.emoji}</div>
                  <div className="text-xs leading-tight">{toy.label}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Healthcare Type Filter (shows only for healthcare category) */}
      {selectedCategory === 'healthcare' && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Product Type:</h3>
          <div className="grid grid-cols-3 gap-3">
            {HEALTHCARE_TYPES.map((healthcare) => (
              <Button
                key={healthcare.id}
                variant="outline"
                size="sm"
                className={`text-center py-3 h-auto min-h-[70px] flex items-center justify-center ${
                  selectedHealthcareType === healthcare.id ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white'
                }`}
                onClick={() => setSelectedHealthcareType(selectedHealthcareType === healthcare.id ? '' : healthcare.id)}
                data-testid={`button-filter-${healthcare.id}`}
              >
                <div className="flex flex-col items-center w-full">
                  <div className="text-lg mb-1">{healthcare.emoji}</div>
                  <div className="text-xs leading-tight">{healthcare.label}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Aquatic Type Filter (shows only for aquatics category) */}
      {selectedCategory === 'aquatics' && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Product Type:</h3>
          <div className="grid grid-cols-3 gap-3">
            {AQUATIC_TYPES.map((aquatic) => (
              <Button
                key={aquatic.id}
                variant="outline"
                size="sm"
                className={`text-center py-3 h-auto min-h-[70px] flex items-center justify-center ${
                  selectedAquaticType === aquatic.id ? 'bg-blue-500 text-white border-blue-500' : 'bg-white'
                }`}
                onClick={() => setSelectedAquaticType(selectedAquaticType === aquatic.id ? '' : aquatic.id)}
                data-testid={`button-filter-${aquatic.id}`}
              >
                <div className="flex flex-col items-center w-full">
                  <div className="text-lg mb-1">{aquatic.emoji}</div>
                  <div className="text-xs leading-tight">{aquatic.label}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Reptile Type Filter (shows only for reptiles category) */}
      {selectedCategory === 'reptiles' && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Product Type:</h3>
          <div className="grid grid-cols-2 gap-3">
            {REPTILE_TYPES.map((reptile) => (
              <Button
                key={reptile.id}
                variant="outline"
                size="sm"
                className={`text-center py-3 h-auto min-h-[70px] flex items-center justify-center ${
                  selectedReptileType === reptile.id ? 'bg-green-600 text-white border-green-600' : 'bg-white'
                }`}
                onClick={() => setSelectedReptileType(selectedReptileType === reptile.id ? '' : reptile.id)}
                data-testid={`button-filter-${reptile.id}`}
              >
                <div className="flex flex-col items-center w-full">
                  <div className="text-lg mb-1">{reptile.emoji}</div>
                  <div className="text-xs leading-tight">{reptile.label}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Bird Type Filter (shows only for bird supplies category) */}
      {selectedCategory === 'birdSupplies' && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Product Type:</h3>
          <div className="grid grid-cols-2 gap-3">
            {BIRD_TYPES.map((bird) => (
              <Button
                key={bird.id}
                variant="outline"
                size="sm"
                className={`text-center py-3 h-auto min-h-[70px] flex items-center justify-center ${
                  selectedBirdType === bird.id ? 'bg-amber-500 text-white border-amber-500' : 'bg-white'
                }`}
                onClick={() => setSelectedBirdType(selectedBirdType === bird.id ? '' : bird.id)}
                data-testid={`button-filter-${bird.id}`}
              >
                <div className="flex flex-col items-center w-full">
                  <div className="text-lg mb-1">{bird.emoji}</div>
                  <div className="text-xs leading-tight">{bird.label}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Small Animal Product Type Filter (shows only for small animal category) */}
      {selectedCategory === 'smallanimal' && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Product Type:</h3>
          <div className="grid grid-cols-2 gap-3">
            {SMALL_ANIMAL_PRODUCT_TYPES.map((productType) => (
              <Button
                key={productType.id}
                variant="outline"
                size="sm"
                className={`text-center py-3 h-auto min-h-[70px] flex items-center justify-center ${
                  selectedSmallAnimalProductType === productType.id ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white'
                }`}
                onClick={() => setSelectedSmallAnimalProductType(selectedSmallAnimalProductType === productType.id ? '' : productType.id)}
                data-testid={`button-filter-${productType.id}`}
              >
                <div className="flex flex-col items-center w-full">
                  <div className="text-lg mb-1">{productType.emoji}</div>
                  <div className="text-xs leading-tight">{productType.label}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

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
          <div className="space-y-4">
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
