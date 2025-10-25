import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Filter } from "lucide-react";
import PetCard from "@/components/pet-card";

const PET_SPECIES = [
  { id: 'all', label: 'All Pets', emoji: '🐾' },
  { id: 'mammals', label: 'Mammals', emoji: '🐕' },
  { id: 'bird', label: 'Birds', emoji: '🦜' },
  { id: 'fish', label: 'Fish', emoji: '🐟' },
  { id: 'reptile', label: 'Reptiles', emoji: '🦎' },
];

export default function Pets() {
  const getSpeciesFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('species') || 'all';
  };

  const [selectedSpecies, setSelectedSpecies] = useState(getSpeciesFromUrl());

  useEffect(() => {
    // Update species when URL changes
    const species = getSpeciesFromUrl();
    setSelectedSpecies(species);
  }, []);

  const { data: pets = [], isLoading } = useQuery({
    queryKey: selectedSpecies === 'all' ? ["/api/pets"] : ["/api/pets", selectedSpecies],
    queryFn: async () => {
      const url = selectedSpecies === 'all' 
        ? '/api/pets'
        : `/api/pets?species=${selectedSpecies}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch pets');
      return response.json();
    },
  });

  return (
    <div className="px-6 py-4 pb-20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Available Pets</h2>
        <Button variant="ghost" size="icon">
          <Filter className="w-5 h-5 text-gray-600" />
        </Button>
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
            {selectedSpecies === 'all' 
              ? 'No pets are currently available' 
              : `No ${selectedSpecies}s are currently available`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {pets.map((pet: any) => (
            <PetCard key={pet.id} pet={pet} />
          ))}
        </div>
      )}
    </div>
  );
}
