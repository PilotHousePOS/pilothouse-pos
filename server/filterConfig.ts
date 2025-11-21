/**
 * Centralized filter configuration for supply categories
 * This allows easy maintenance and scalability for filtering supplies by type
 */

export interface FilterConfig {
  includeBrands: string[];
  includeKeywords: string[];
  excludeBrands: string[];
  excludeKeywords: string[];
}

export type FilterType = 'reptile' | 'aquatic' | 'smallanimal';

export const SUPPLY_FILTERS: Record<FilterType, FilterConfig> = {
  reptile: {
    // Reptile-specialized brands based on company research
    // ZooMed included - they make both reptile AND aquatic products (keywords will decide)
    includeBrands: ['ZooMed', 'Exo Terra', 'Zilla', "Fluker's", 'ReptiCare'],
    includeKeywords: [
      'gecko', 'lizard', 'snake', 'turtle', 'tortoise', 'chameleon',
      'bearded dragon', 'iguana', 'frog', 'toad', 'salamander', 'newt',
      'reptile', 'amphibian', 'terrarium', 'vivarium', 'repti'
    ],
    // Exclude ONLY pure aquatic brands and toy brands (NOT cross-category brands like ZooMed)
    excludeBrands: [
      'Tetra', 'Aqueon', 'GloFish', 'Marineland', 'API', 'Fluval', 'SeaChem', 'Hikari',
      'Kong', 'Nylabone', 'Chuckit!', 'Outward Hound', 'ZippyPaws', 'KONG'
    ],
    excludeKeywords: ['fish', 'aquarium', 'aquatic', 'glo fish', 'betta', 'pleco', 'plecostomus', 'dog toy', 'cat toy', 'pet toy']
  },
  aquatic: {
    // Aquatic-specialized brands based on company research:
    // - Hikari: Premium Japanese aquarium brand (fish food specialist)
    // - Tetra: World's largest aquarium brand (invented first flake food)
    // - Aqueon: Aquarium tanks and supplies (40+ years)
    // - API: Aquarium water testing and treatments
    // - Marineland: Aquarium filters and BIO-Wheel technology
    // - GloFish: Fluorescent fish brand (owned by Spectrum/Tetra)
    // - Fluval: Premium aquarium filters and equipment
    // - SeaChem: Advanced aquarium water care products
    includeBrands: ['Tetra', 'Aqueon', 'GloFish', 'Marineland', 'API', 'Fluval', 'SeaChem', 'Hikari'],
    includeKeywords: [
      'fish', 'aquarium', 'aquatic', 'betta', 'glo fish', 'goldfish',
      'tropical fish', 'freshwater', 'saltwater', 'reef', 'marine', 'koi',
      'cichlid', 'tetra', 'guppy', 'molly', 'platy', 'pleco', 'plecostomus',
      'swordtail', 'angelfish', 'barb', 'danio', 'rasbora', 'loach', 'catfish',
      'corydoras', 'cory', 'shrimp', 'snail', 'crab'
    ],
    // Exclude ONLY pure reptile brands and toy brands (NOT cross-category brands like ZooMed)
    // ZooMed removed - they make both aquatic AND reptile products
    excludeBrands: [
      'Exo Terra', 'Zilla', "Fluker's", 'ReptiCare',
      'Kong', 'Nylabone', 'Chuckit!', 'Outward Hound', 'ZippyPaws', 'KONG'
    ],
    excludeKeywords: [
      'gecko', 'lizard', 'snake', 'bearded dragon', 'iguana',
      'reptile', 'terrarium', 'vivarium', 'repti', 'dog toy', 'cat toy', 'pet toy'
    ]
  },
  smallanimal: {
    // Small animal specialized brands
    // Oxbow: Premium small animal nutrition and hay specialist
    // Kaytee: Leading small animal bedding, food, and habitat brand
    // Living World: Small pet supplies and accessories
    // Vitakraft: German small animal treats and food
    // Supreme: Science Selective small animal nutrition
    // Small Pet Select: Premium hay and bedding
    // Ferret Nation: Premium ferret cages and habitats
    // Marshall: Ferret food, treats, and accessories specialist
    // Ware: Small animal habitats, hideaways, and accessories
    includeBrands: ['Oxbow', 'Kaytee', 'Living World', 'Vitakraft', 'Supreme', 'Small Pet Select', "Brown's", 'Ferret Nation', 'Marshall', 'Ware', 'Nation'],
    includeKeywords: [
      'mouse', 'mice', 'ferret', 'chinchilla', 'hamster', 'rabbit', 'bunny',
      'guinea pig', 'gerbil', 'rat', 'hedgehog', 'sugar glider',
      'small animal', 'small pet', 'rodent', 'pocket pet',
      'cage', 'hutch', 'bedding', 'timothy hay', 'alfalfa hay'
    ],
    // Exclude brands specific to other categories
    excludeBrands: [
      'Tetra', 'Aqueon', 'GloFish', 'Marineland', 'API', 'Fluval', 'SeaChem', 'Hikari',
      'Exo Terra', 'Zilla', "Fluker's", 'ReptiCare',
      'Kong', 'Nylabone', 'Chuckit!', 'Outward Hound', 'ZippyPaws', 'KONG'
    ],
    excludeKeywords: [
      'fish', 'aquarium', 'aquatic', 'gecko', 'lizard', 'snake', 'reptile',
      'dog toy', 'cat toy', 'pet toy', 'dog', 'cat', 'puppy', 'kitten'
    ]
  }
};
