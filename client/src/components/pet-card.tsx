import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Pet } from "@shared/schema";

interface PetCardProps {
  pet: Pet;
}

export default function PetCard({ pet }: PetCardProps) {
  const defaultImages = {
    dog: "https://images.unsplash.com/photo-1552053831-71594a27632d?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    cat: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    bird: "https://images.unsplash.com/photo-1452570053594-1b985d6ea890?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    fish: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
    reptile: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
  };

  const imageUrl = pet.imageUrl || defaultImages[pet.species as keyof typeof defaultImages] || defaultImages.dog;

  return (
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
            >
              {pet.isAvailable ? "View Details" : "Adopted"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
