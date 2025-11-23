import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import PetCard from "@/components/pet-card";
import { useDebounce } from "@/hooks/use-debounce";

const ITEMS_PER_PAGE = 20;

const PET_SPECIES = [
  { id: 'all', label: 'All Pets', emoji: '🐾' },
  { id: 'Small Animals', label: 'Small Animals', emoji: '🐕' },
  { id: 'bird', label: 'Birds', emoji: '🦜' },
  { id: 'fish', label: 'Fish', emoji: '🐟' },
  { id: 'reptile', label: 'Reptiles', emoji: '🦎' },
];

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

export default function Pets() {
  const getSpeciesFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('species') || 'all';
  };

  const [selectedSpecies, setSelectedSpecies] = useState(getSpeciesFromUrl());
  const [searchInput, setSearchInput] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  
  // Debounce search query
  const searchQuery = useDebounce(searchInput, 500);

  useEffect(() => {
    // Update species when URL changes
    const species = getSpeciesFromUrl();
    setSelectedSpecies(species);
  }, []);

  // Reset to page 0 when search query changes
  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery, selectedSpecies]);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/pets", selectedSpecies, searchQuery, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedSpecies !== 'all') {
        params.append('species', selectedSpecies);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      params.append('page', currentPage.toString());
      params.append('limit', ITEMS_PER_PAGE.toString());
      
      const url = `/api/pets?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch pets');
      return response.json();
    },
  });

  const pets = data?.pets || [];
  const pagination = data?.pagination || { currentPage: 0, totalPages: 0, totalCount: 0, pageSize: ITEMS_PER_PAGE };
  const totalPages = pagination.totalPages;
  const pageIndicators = getPageIndicators(currentPage, totalPages);

  return (
    <div className="px-6 py-4 pb-20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Available Pets</h2>
        <div className="text-sm text-gray-500">
          {pagination.totalCount} {pagination.totalCount === 1 ? 'pet' : 'pets'}
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            type="text"
            placeholder="Search pets by name, species, breed..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10 bg-white border-gray-300 rounded-xl h-12"
            data-testid="input-search-pets"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 mb-6 overflow-x-auto pb-2">
        {PET_SPECIES.map((species) => (
          <Button
            key={species.id}
            variant={selectedSpecies === species.id ? "default" : "secondary"}
            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${
              selectedSpecies === species.id
                ? 'bg-brand-blue text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
            onClick={() => setSelectedSpecies(species.id)}
            data-testid={`button-filter-${species.id}`}
          >
            {species.label} {species.emoji}
          </Button>
        ))}
      </div>

      {/* Pet Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-gray-200 rounded-xl h-48 animate-pulse"></div>
          ))}
        </div>
      ) : pets.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🐾</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No pets found</h3>
          <p className="text-gray-500">
            {searchQuery 
              ? `No results for "${searchQuery}"` 
              : selectedSpecies === 'all' 
                ? 'No pets are currently available' 
                : `No ${selectedSpecies}s are currently available`}
          </p>
        </div>
      ) : (
        <>
          <div 
            className="grid grid-cols-2 gap-4"
            onTouchStart={(e) => setTouchStart(e.targetTouches[0].clientX)}
            onTouchMove={(e) => setTouchEnd(e.targetTouches[0].clientX)}
            onTouchEnd={() => {
              if (touchStart - touchEnd > 75 && currentPage < totalPages - 1) {
                setCurrentPage(currentPage + 1);
              }
              if (touchStart - touchEnd < -75 && currentPage > 0) {
                setCurrentPage(currentPage - 1);
              }
              setTouchStart(0);
              setTouchEnd(0);
            }}
          >
            {pets.map((pet: any) => (
              <PetCard key={pet.id} pet={pet} />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                className="rounded-full"
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>

              <div className="flex gap-2">
                {pageIndicators.map((pageIndex) => (
                  <button
                    key={pageIndex}
                    onClick={() => setCurrentPage(pageIndex)}
                    className={`w-10 h-10 rounded-full font-semibold transition-colors ${
                      currentPage === pageIndex
                        ? 'bg-brand-blue text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    data-testid={`button-page-${pageIndex}`}
                  >
                    {pageIndex + 1}
                  </button>
                ))}
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage === totalPages - 1}
                className="rounded-full"
                data-testid="button-next-page"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
