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
    // Tetrafauna added - Tetra's reptile product line (reptohabitat, reptofilter, etc.)
    // Reptology added - reptile accessories brand
    includeBrands: ['ZooMed', 'Exo Terra', 'Exoterra', 'Zilla', "Fluker's", 'Flukers', 'ReptiCare', 'Tetrafauna', 'Tetra Fauna', 'Reptology'],
    includeKeywords: [
      'gecko', 'lizard', 'snake', 'turtle', 'tortoise', 'chameleon',
      'bearded dragon', 'iguana', 'frog', 'toad', 'salamander', 'newt',
      'reptile', 'amphibian', 'terrarium', 'vivarium', 'repti',
      'reptohabitat', 'reptofilter', 'sand mat', 'heat lamp', 'basking',
      'uvb', 'uva', 'ceramic heater', 'heat mat', 'under tank heater',
      'mealworm', 'cricket', 'dubia roach', 'calcium dust'
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
    // - Omega One: Premium aquarium fish food with natural ingredients
    // - Ocean Nutrition: Premium frozen and freeze-dried aquarium foods
    includeBrands: ['Tetra', 'Aqueon', 'GloFish', 'Marineland', 'API', 'Fluval', 'SeaChem', 'Hikari', 'Omega One', 'Ocean Nutrition', 'Penn Plax', 'Marina'],
    includeKeywords: [
      'fish', 'aquarium', 'aquatic', 'betta', 'glo fish', 'goldfish',
      'tropical fish', 'freshwater', 'saltwater', 'reef', 'marine', 'koi',
      'cichlid', 'tetra', 'guppy', 'molly', 'platy', 'pleco', 'plecostomus',
      'swordtail', 'angelfish', 'barb', 'danio', 'rasbora', 'loach', 'catfish',
      'corydoras', 'cory', 'shrimp', 'snail', 'hermit crab'
    ],
    // Exclude reptile brands (including Tetrafauna which is Tetra's reptile line)
    // Exclude toy brands that make sea-themed toys (Kong, Spot, Rascals, etc.)
    // Exclude pet food brands with fish ingredients
    excludeBrands: [
      // Reptile brands
      'Exo Terra', 'Exoterra', 'Zilla', "Fluker's", 'Flukers', 'ReptiCare', 'Tetrafauna', 'Tetra Fauna', 'Reptology',
      // Toy brands (make sea-themed toys like Kong Jellyfish, Spot Fish, etc.)
      'Kong', 'KONG', 'Nylabone', 'Chuckit!', 'Outward Hound', 'ZippyPaws', 'Spot', 'SPOT',
      'Tuffy', 'Rascals', 'Playfuls', 'Benebone', 'Multipet', 'Ethical Pet',
      // Dog/cat food brands with fish ingredients (should stay in food category)
      'Blue Buffalo', 'Fromm', 'Nutrisource', 'Orijen', 'Acana', 'Wellness', 'Welln',
      'Zignature', 'Primal', 'Red Barn', 'RedBarn', 'Victor', 'Vict',
      'Merrick', 'Canidae', 'Natural Balance', 'Taste of the Wild',
      // Cat litter brands (Intersand products have "cat" in name but are litter, not aquatic)
      'Intersand'
    ],
    excludeKeywords: [
      // Reptile keywords
      'gecko', 'lizard', 'snake', 'bearded dragon', 'iguana',
      'turtle', 'tortoise',  // Turtles are reptiles, not fish - even aquatic turtles
      'reptile', 'terrarium', 'vivarium', 'repti', 'amphibian',
      'frog', 'toad', 'salamander', 'newt', 'chameleon',  // Amphibians are reptile section
      'reptohabitat', 'reptofilter', 'sand mat',
      // Toy keywords
      'dog toy', 'cat toy', 'pet toy', 'teaser wand', 'wrangler', 'squeaky',
      'plush toy', 'chew toy', 'fishbone', 'fetch',
      // Exclude cat/dog food with fish ingredients (multi-word to avoid matching "catfish")
      'cat food', 'cat treat', 'kitten food', 'kitten treat',
      'dog food', 'dog treat', 'puppy food', 'puppy treat',
      'for cats', 'for dogs', 'for kittens', 'for puppies',
      'catit', 'fussiecat', 'i love cats',  // Cat food brands
      ' cat ', ' dog ', ' puppy ', ' kitten ',  // Space-bounded to avoid matching catfish/dogfish
      // Pet accessories that shouldn't be in aquatics
      'cat litter', 'litter box', 'odorlock', 'odor lock',
      'pet bowl', 'bellabowl', 'bellabown', 'food bowl', 'water bowl'
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
