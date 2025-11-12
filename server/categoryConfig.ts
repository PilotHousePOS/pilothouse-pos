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
      'Earthborn', 'Earthborn Holistic', 'AvoDerm', 'Open Farm', 'Pinnacle',
      'VICTOR', 'Victor', 'NutriSource', 'Tuffy\'s', 'Full Moon', 'Dr. Marty',
      'Freshpet', 'The Farmer\'s Dog', 'Nom Nom', 'Ollie', 'Tucker\'s',
      // Mass market brands
      'Diamond', 'Diam', 'Kirkland', 'Pedigree', 'Friskies', 'Fancy Feast', 'Whiskas',
      'Meow Mix', 'Kit & Kaboodle', '9Lives', 'Sheba', 'Temptations', 'Greenies',
      'Rachael Ray', 'Cesar', 'Beneful', 'Dog Chow', 'Cat Chow', 'Purina ONE',
      'Kibbles \'n Bits', 'Milk-Bone', 'Pup-Peroni',
      // Premium wet food brands
      'Tiki Cat', 'Weruva', 'BFF', 'Nulo', 'Halo', 'Castor & Pollux', 'Newman\'s Own',
      // Store/house brands
      'Authority', 'Simply Nourish', 'Whole Earth Farms', 'Dave\'s', 'Nature\'s Recipe',
      'Nutri Sou', 'Vit Essen', 'Tow Can', 'Nutrient',
      // Small animal food brands
      'Kaytee', 'Oxbow', 'Oxbow Animal Health', 'Vitakraft', 'Higgins', 'Lafeber', 'Lafeber\'s',
      'Mazuri', 'Supreme Petfoods', 'Small Pet Select', 'Wild Harvest', 'Living World',
      'Tiny Friends Farm', 'Science Selective',
      // Bird food brands
      'ZuPreem', 'Harrison\'s', 'Harrison\'s Bird Foods', 'Brown\'s', 'FM Browns', 'Volkman',
      'Dr. Harvey\'s', 'Avi-Cakes', 'Nutri-Berries',
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
      'fortidiet', 'pellets', 'hay', 'timothy hay', 'alfalfa hay', 'orchard hay',
      'timothy', 'alfalfa', 'rabbit food', 'guinea pig food', 'hamster food',
      'chinchilla food', 'ferret food', 'critical care', 'vitamin c',
      // Bird specific food terms
      'bird food', 'seed mix', 'seed blend', 'parakeet food', 'cockatiel food',
      'parrot food', 'finch food', 'canary food', 'macaw food', 'conure food',
      'fruitblend', 'nutri-berries', 'avi-cakes', 'spray millet', 'millet spray',
      'bird pellets', 'parakeet pellets', 'parrot pellets',
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
      // Small animal toy brands
      'Sofier', 'YIXUND', 'VESPRO', 'mini&moe',
      // Bird toy brands
      'Bonka Bird Toys', 'Planet Pleasures', 'Super Bird Creations', 'JW Pet',
      'Kyouki', 'Bird Safe Store', 'KATUMO', 'Prevue Pet', 'Agape',
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
      'perch', 'bird perch', 'natural perch', 'rope perch', 'platform perch',
      'swing', 'bird swing', 'ladder', 'bridge', 'bird ladder',
      'bell toy', 'chewing toy', 'foraging toy', 'activity toy',
      'rotating perch', 'spinning toy', 'exercise wheel',
      'woven ball', 'grass ball', 'seagrass', 'vine ball',
      'apple wood stick', 'timothy stick', 'chew stick',
      // Only "toy" when clearly a toy
      ' toy ', 'dog toy', 'cat toy', 'pet toy', 'chew toy', 'bird toy',
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
      // Small animal bedding brands
      'Carefresh', 'American Wood Fibers', 'AWF', 'Catalyst Pet', 'Burgess',
      // Small animal accessory brands (overlaps with toys/food)
      'Ferplast', 'WARE', 'You & Me', 'The Hay Experts',
    ],
    nameKeywords: [
      // Aquarium/fish supplies
      'aquarium', 'fish tank', 'filter', 'pump', 'heater', 'thermometer',
      'air stone', 'bubbler', 'substrate', 'gravel', 'sand', 'decor',
      'ornament', 'plant', 'betta plant', 'water treatment', 'conditioner',
      'clarity', 'zeo-carb', 'cartridge', 'media', 'betta', 'marine',
      'anemone', 'corkscrew', 'grass plant', 'leaf',
      // Reptile/terrarium supplies
      'terrarium', 'vivarium', 'heat lamp', 'UVB', 'basking', 'hide',
      'cave', 'reptile', 'gecko', 'bearded dragon', 'snake', 'lizard',
      'calcium', 'supplement cube', 'orange cube', 'tortoise', 'turtle',
      'paludarium', 'backround', 'rock lair', 'betta log', 'betta diver',
      'bettamatic', 'pure water care', 'repuvb',
      // Bird supplies
      'bird cage', 'aviary', 'nest', 'bird bath', 'cuttlebone', 'mineral block',
      'nesting material', 'bird mirror',
      // Small animal bedding
      'bedding', 'paper bedding', 'wood shavings', 'aspen shavings', 'pine pellets',
      'clean & cozy', 'confetti', 'nap & nest', 'douglas fir', 'paper fiber',
      // Small animal housing
      'cage', 'habitat', 'hutch', 'enclosure', 'hamtrac', 'hideout', 'tunnel',
      'exercise loop', 'exercise pen', 'playpen',
      // Crates & carriers
      'crate', 'kennel', 'carrier', 'vari kennel', 'travel crate',
      // Bowls & feeders
      'bowl', 'dish', 'feeder', 'waterer', 'fountain', 'automatic feeder', 'water bottle',
      'hay feeder', 'hay rack',
      // Litter & waste
      'litter box', 'litter scoop', 'waste bag', 'poop bag', 'litter',
      // Pet clothing
      'tanktop', 'sweater', 'coat', 'jacket', 'raincoat', 'costume',
      // Misc accessories
      'replacement parts', 'stacker', 'castle', 'bridge', 'troll',
      'sponge filter', 'ecorenew', 'forza', 'spectrastone',
    ],
    descriptionKeywords: [
      'convenient', 'practical', 'essential', 'functional', 'storage', 'organization',
    ],
    exclusionKeywords: [
      'food', 'kibble', 'treat', 'meal', 'gravy', 'stew',
    ],
  },
};

// Lowered to 25 to allow brand-only matches for well-known food/toy brands
// Pattern matching (oz, lb) adds +10pts to food products
// Strong exclusion penalties (-30) prevent false positives
export const CATEGORY_CONFIDENCE_THRESHOLD = 25;
