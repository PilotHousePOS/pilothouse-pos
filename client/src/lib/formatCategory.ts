/**
 * Format category names for display
 * Converts database category names to human-readable format
 * Examples:
 * - "smallanimal" → "Small Animal"
 * - "food" → "Food"
 * - "birdSupplies" → "Bird Supplies"
 * - "dogCages" → "Dog Cages"
 */
export function formatCategory(category: string | null | undefined): string {
  if (!category) return 'Uncategorized';

  const categoryMap: Record<string, string> = {
    food: 'Food',
    toys: 'Toys',
    beds: 'Beds',
    leashes: 'Leashes',
    leashesAndCollars: 'Leashes & Collars',
    healthcare: 'Healthcare',
    accessories: 'Accessories',
    aquatics: 'Aquatics',
    reptiles: 'Reptiles',
    birdSupplies: 'Bird Supplies',
    dogCages: 'Dog Cages',
    smallAnimalSupplies: 'Small Animal Supplies',
    smallanimal: 'Small Animal',
    fish: 'Fish',
    reptile: 'Reptile',
    dogFood: 'Dog Food',
    catFood: 'Cat Food',
    dogTreats: 'Dog Treats',
    catTreats: 'Cat Treats',
    treats: 'Treats',
    grooming: 'Services',
    cleaning: 'Cleaning',
    bowls: 'Bowls',
    carriers: 'Carriers',
    clothing: 'Clothing',
    feeders: 'Feeders',
    gates: 'Gates',
    litter: 'Litter',
    scratchers: 'Scratchers',
  };

  return categoryMap[category] || capitalizeWords(category);
}

/**
 * Capitalize first letter of each word and add spaces before capitals
 * Fallback for any category not in the map
 */
function capitalizeWords(str: string): string {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (match) => match.toUpperCase())
    .trim();
}
