export interface CategoryMapping {
  brands: string[];
  nameKeywords: string[];
  descriptionKeywords: string[];
  exclusionKeywords?: string[];
}

export interface CategoryScoringWeights {
  brandMatch: number;
  nameKeyword: number;
  descriptionKeyword: number;
  exclusionPenalty: number;
}

// Reduced weights to require multiple signals
export const CATEGORY_SCORING_WEIGHTS: CategoryScoringWeights = {
  brandMatch: 25,        // Reduced from 50 - now requires additional signals
  nameKeyword: 15,       // Reduced from 30 - prevents single keyword from exceeding threshold
  descriptionKeyword: 10, // Reduced from 15
  exclusionPenalty: -30,  // Strong penalty to prevent misclassification
};

// Brand-specific category defaults for overlapping brands
export const BRAND_CATEGORY_DEFAULTS: Record<string, string> = {
  'KONG': 'toys',          // KONG is primarily a toy brand
  'Ruffwear': 'leashes',   // Ruffwear is primarily leashes/harnesses
  'Blue Buffalo': 'food',  // Blue Buffalo is primarily food
  'Chuckit': 'toys',       // Chuckit is toys
  'FURminator': 'healthcare', // FURminator is grooming tools
};

export const CATEGORY_MAPPINGS: Record<string, CategoryMapping> = {
  food: {
    brands: [
      // Premium/specialty brands
      'Purina', 'Pro Plan', 'Purina Pro Plan', 'Hill\'s', 'Hills', 'Science Diet', 'Royal Canin',
      'Blue Buffalo', 'IAMS', 'Eukanuba', 'Nutro', 'Taste of the Wild', 'Wellness',
      'Natural Balance', 'Merrick', 'Orijen', 'Acana', 'Fromm', 'Canidae', 'Ziwi',
      'Stella & Chewy\'s', 'Primal', 'Instinct', 'Nature\'s Variety', 'Solid Gold',
      // Mass market brands
      'Diamond', 'Diam', 'Kirkland', 'Pedigree', 'Friskies', 'Fancy Feast', 'Whiskas',
      'Meow Mix', 'Kit & Kaboodle', '9Lives', 'Sheba', 'Temptations', 'Greenies',
      'Rachael Ray', 'Cesar', 'Beneful', 'Dog Chow', 'Cat Chow', 'Purina ONE',
      // Premium wet food brands
      'Tiki Cat', 'Weruva', 'BFF', 'Nulo', 'Halo', 'Castor & Pollux', 'Newman\'s Own',
      // Store/house brands
      'Authority', 'Simply Nourish', 'Whole Earth Farms', 'Dave\'s', 'Nature\'s Recipe',
      'Nutri Sou', 'Vit Essen', 'Tow Can', 'Nutrient',
      // Small animal food brands
      'Kaytee', 'Oxbow', 'Vitakraft', 'Higgins', 'Lafeber', 'Mazuri',
    ],
    nameKeywords: [
      // Very specific food terms (avoid generic words like "chew")
      'kibble', 'pate', 'stew', 'gravy', 'broth', 'entree', 'recipe', 'formula',
      'nutrition', 'diet', 'mignon', 'gourmet', 'cuisine', 'feast', 'delights',
      // Specific protein terms with context
      'chicken gravy', 'beef gravy', 'lamb gravy', 'salmon gravy', 'tuna gravy',
      'chicken stew', 'beef stew', 'turkey stew',
      // Packaging/format specific to food
      'canned', 'pouch', 'can', ' oz', 'lb bag', 'dry food', 'wet food',
      // Life stage (only when combined with food context)
      'puppy food', 'kitten food', 'adult food', 'senior food',
      // Specific meal types
      'breakfast', 'dinner', 'supper', 'cuts in gravy', 'flaked',
      // Small animal specific food terms
      'fortidiet', 'pellets', 'hay', 'timothy', 'alfalfa',
    ],
    descriptionKeywords: [
      'nutritious', 'balanced', 'complete', 'wholesome', 'digestible', 'protein-rich',
    ],
    exclusionKeywords: [
      'toy', 'ball', 'bowl', 'feeder', 'dispenser', 'collar', 'leash', 'bed',
      'crate', 'carrier', 'shampoo', 'brush', 'clipper', 'cage', 'aquarium',
      'plush', 'squeaky', 'rope', 'frisbee', 'fetch', 'tug',
    ],
  },

  toys: {
    brands: [
      'KONG', 'Chuckit', 'Nylabone', 'Outward Hound', 'West Paw', 'ZippyPaws',
      'Hartz', 'Multipet', 'Ethical Pet', 'Petstages', 'SmartyKat', 'Yeowww!',
      'GoDog', 'SPOT', 'Mammoth', 'Benebone', 'Tuffy', 'Bullymake', 'Jolly Pets',
      'Planet Dog', 'Trixie', 'Nina Ottosson', 'iFetch', 'Kng', 'Spot',
      'Jones', 'Smartplay', 'Pacific Perch',
    ],
    nameKeywords: [
      // Specific toy types (not generic "chew")
      'ball', 'frisbee', 'disc', 'fetch', 'tug toy', 'rope toy', 'plush toy',
      'squeaky toy', 'squeaker', 'launcher', 'thrower', 'floater',
      'puzzle toy', 'interactive toy', 'enrichment toy',
      // Specific descriptors
      'honk duck', 'wild knots', 'whirlz', 'funfood', 'glow ball',
      'max glow', 'ultra ball', 'wubba', 'goodie bone',
      // Cat-specific toys
      'catnip toy', 'teaser wand', 'feather toy', 'cat mouse',
      'scratching post', 'cat tree', 'scratcher', 'track toy',
      // Bird/small animal toys
      'perch', 'branch', 'swing', 'ladder', 'bridge',
      // Only "toy" when clearly a toy
      ' toy ', 'dog toy', 'cat toy', 'pet toy', 'chew toy',
    ],
    descriptionKeywords: [
      'interactive', 'engaging', 'entertaining', 'stimulating', 'bouncy', 'floating',
    ],
    exclusionKeywords: [
      'food', 'treat', 'kibble', 'meal', 'dinner', 'nutrition', 'gravy', 'stew',
      'shampoo', 'wipes', 'collar', 'leash', 'harness', 'bed', 'crate',
    ],
  },

  beds: {
    brands: [
      'K&H', 'K & H', 'FurHaven', 'Furhaven', 'Coolaroo', 'PetFusion', 'Sealy',
      'Best Friends', 'MidWest', 'AKC', 'Serta', 'Casper', 'Big Barker',
      'Orthopedic', 'Memory Foam', 'Friends Forever', 'Brindle', 'BarksBar',
    ],
    nameKeywords: [
      'pet bed', 'dog bed', 'cat bed', 'mattress', 'bolster bed', 'orthopedic bed',
      'memory foam bed', 'donut bed', 'cuddler bed', 'cave bed', 'burrow bed',
      'heated bed', 'cooling bed', 'elevated bed', 'cot', 'lounger',
      'crate pad', 'pet blanket', 'pet throw', 'sleeping mat',
    ],
    descriptionKeywords: [
      'comfortable', 'supportive', 'washable', 'soft', 'plush', 'cozy', 'orthopedic',
    ],
    exclusionKeywords: [
      'food', 'toy', 'ball', 'collar', 'leash', 'aquarium', 'cage',
    ],
  },

  leashes: {
    brands: [
      'Flexi', 'Ruffwear', 'Lupine', 'PetSafe', 'Coastal', 'Blueberry',
      'Max and Neo', 'Mendota', 'EzyDog', 'Kurgo', 'Chai\'s Choice', 'ThunderLeash',
      'Gentle Leader', 'Halti', 'Julius-K9', 'Rabbitgoo', 'Frisco', 'Titan',
    ],
    nameKeywords: [
      'leash', 'lead', 'collar', 'harness', 'vest', 'retractable', 'tie-out',
      'training collar', 'training lead', 'traffic lead', 'hands-free leash',
      'slip lead', 'coupler', 'double leash',
      'dog collar', 'cat collar', 'reflective collar', 'no-pull harness',
      'pocket harness', 'pktsml hrness', 'traincllr',
    ],
    descriptionKeywords: [
      'durable', 'strong', 'control', 'walking', 'training', 'safety', 'reflective',
    ],
    exclusionKeywords: [
      'food', 'toy', 'bed', 'shampoo', 'aquarium', 'cage',
    ],
  },

  healthcare: {
    brands: [
      'Vetoquinol', 'Nutramax', 'Dasuquin', 'Cosequin', 'Zesty Paws',
      'Virbac', 'VetriScience', 'NaturVet', 'Pet Naturals', 'Only Natural Pet',
      'Denamarin', 'Denosyl', 'Proviable', 'FortiFlora', 'Purina Pro Plan Veterinary',
      'Advantage', 'Frontline', 'Seresto', 'Bravecto', 'NexGard', 'Simparica',
      'Heartgard', 'Interceptor', 'Trifexis', 'Revolution', 'Capstar',
      'FURminator', 'Safari', 'Oster', 'Wahl', 'Andis', 'TropiClean', 'Earthbath',
      'Burt\'s Bees', 'Veterinary Formula', 'Douxo', 'Malaseb', 'Zymox',
      'Topiclean', 'Adams', 'Petodor',
    ],
    nameKeywords: [
      // Supplements & medications
      'supplement', 'vitamin', 'probiotic', 'glucosamine', 'joint care',
      'hip and joint', 'calming', 'anxiety relief', 'liver support',
      // Flea & tick
      'flea collar', 'tick collar', 'flea treatment', 'tick treatment',
      'flea spray', 'tick spray', 'preventive',
      // Grooming & hygiene
      'shampoo', 'conditioner', 'ear therapy', 'ear cleaner', 'ear wipes',
      'dental wipes', 'ear therapy wipes', 'deepcleansing',
      'grooming brush', 'slicker brush', 'deshedding tool', 'nail clipper',
      // Medical supplies
      'wound care', 'first aid', 'antiseptic', 'ointment', 'bandage',
      // Odor control (not litter)
      'odor spray', 'perfume', 'cologne', 'deodorizer',
    ],
    descriptionKeywords: [
      'veterinary', 'health', 'wellness', 'therapeutic', 'medical', 'vet approved',
    ],
    exclusionKeywords: [
      'toy', 'ball', 'bed', 'crate', 'carrier', 'bowl', 'feeder',
    ],
  },

  accessories: {
    brands: [
      'Petmate', 'MidWest', 'Precision Pet', 'Aspen Pet', 'Frisco', 'Iris',
      'Richell', 'Carlson', 'Regalo', 'Carlson Pet', 'YETI', 'RTIC',
      'Bergan', 'Van Ness', 'Pioneer Pet', 'Catit', 'Drinkwell', 'PetSafe',
      'Fluval', 'Seachem', 'API', 'Marineland', 'Aqueon', 'GloFish', 'Tetra',
      'Zoo Med', 'ZooMed', 'Exo Terra', 'Flukers', 'Zilla',
      'Vari Kennel',
    ],
    nameKeywords: [
      // Aquarium/fish supplies
      'aquarium', 'fish tank', 'filter', 'pump', 'heater', 'thermometer',
      'air stone', 'bubbler', 'substrate', 'gravel', 'sand', 'decor',
      'ornament', 'plant', 'betta plant', 'water treatment', 'conditioner',
      'clarity', 'zeo-carb', 'cartridge', 'media',
      // Reptile/terrarium supplies
      'terrarium', 'vivarium', 'heat lamp', 'UVB', 'basking', 'hide',
      'cave', 'reptile', 'gecko', 'bearded dragon', 'snake', 'lizard',
      'calcium', 'supplement cube', 'orange cube',
      // Bird supplies
      'bird cage', 'aviary', 'perch', 'nest', 'feeder', 'bird bath',
      // Small animal housing
      'cage', 'habitat', 'hutch', 'enclosure', 'exercise wheel',
      // Crates & carriers
      'crate', 'kennel', 'carrier', 'vari kennel', 'travel crate',
      // Bowls & feeders
      'bowl', 'dish', 'feeder', 'waterer', 'fountain', 'automatic feeder',
      // Litter & waste
      'litter box', 'litter scoop', 'waste bag', 'poop bag',
      // Pet clothing
      'tanktop', 'sweater', 'coat', 'jacket', 'raincoat', 'costume',
      // Misc accessories
      'replacement parts', 'stacker', 'castle', 'bridge', 'troll',
    ],
    descriptionKeywords: [
      'convenient', 'practical', 'essential', 'functional', 'storage', 'organization',
    ],
    exclusionKeywords: [
      'food', 'kibble', 'treat', 'meal', 'gravy', 'stew',
    ],
  },
};

// Lowered to 40 to allow brand (25) + 1 keyword (15) or 3 keywords (45)
// This requires at least 2-3 orthogonal signals to categorize
export const CATEGORY_CONFIDENCE_THRESHOLD = 40;
