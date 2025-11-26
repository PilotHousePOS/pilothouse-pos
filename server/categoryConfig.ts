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
  'Pro Plan': 'food',      // ProPlan is dog/cat food (toy = breed size, not accessory)
  'Purina Pro Plan': 'food', // ProPlan is dog/cat food
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
      // Aquatic/fish accessories - NOT food
      'heater', 'filter', 'gravel', 'plant', 'log', 'ceramic', 'moss ball',
      'bamboo', 'maple', 'papaya', 'betta kit', 'betta clean', 'betta bowl',
      'betta beads', 'betta ultimate', 'fish tank', 'tank decor', 'ornament',
      'decoration', 'cave', 'hide', 'hideout', 'thermometer', 'air pump',
      'air stone', 'siphon', 'net', 'water conditioner', 'dechlorinator',
    ],
  },

  toys: {
    brands: [
      'KONG', 'Chuckit', 'Nylabone', 'Outward Hound', 'West Paw', 'ZippyPaws',
      'Hartz', 'Multipet', 'Ethical Pet', 'Petstages', 'SmartyKat', 'Yeowww!',
      'GoDog', 'SPOT', 'Mammoth', 'Benebone', 'Tuffy', 'Bullymake', 'Jolly Pets',
      'Planet Dog', 'Trixie', 'Nina Ottosson', 'iFetch', 'Kng', 'Spot',
      'Jones', 'Smartplay', 'Pacific Perch',
      // Sea-themed toy brands (these make fish/ocean toys, NOT aquarium products)
      'Rascals', 'Playfuls',
      // Small animal toy brands (verified from research: Kaytee, Oxbow, Ware make toys AND food)
      // These brands need keyword matching to distinguish toys from food
      'Sofier', 'YIXUND', 'VESPRO', 'mini&moe', 'Rosewood',
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
      // Sea-themed toys (NOT aquarium products - these are dog/cat toys)
      'angler fish', 'jellyfish', 'crab toy', 'octopus toy', 'shark toy',
      'sea creature', 'ocean toy', 'fishbone', 'fish toy', 'clownfish toy',
      // Cat-specific toys
      'catnip toy', 'teaser wand', 'feather toy', 'cat mouse',
      'scratching post', 'cat tree', 'scratcher', 'track toy',
      // Bird/small animal toys (NOT aquarium perch/bridge)
      'bird perch', 'natural perch', 'rope perch', 'platform perch',
      'bird swing', 'bird ladder', 'hamster bridge', 'gerbil bridge',
      'bell toy', 'chewing toy', 'foraging toy', 'activity toy',
      'rotating perch', 'spinning toy', 'exercise wheel',
      'woven ball', 'grass ball', 'seagrass', 'vine ball',
      'apple wood stick', 'timothy stick', 'chew stick',
      // Small animal toy specific keywords (verified: Kaytee, Oxbow product lines)
      'runabout ball', 'run-about ball', 'run about ball', 'hamster ball',
      'comfort wheel', 'giant wheel', 'silent wheel', 'flying saucer',
      'chewbular', 'tunnel toy', 'crinkle tunnel', 'flex tunnel',
      'hay ball', 'crazy hay ball', 'enriched life', 'hamsteroids',
      'combo toy', 'willow ball', 'willow branch', 'chew cube',
      'gnaw stick', 'play tunnel', 'hideout', 'play bridge',
      // Only "toy" when clearly a toy
      ' toy ', 'dog toy', 'cat toy', 'pet toy', 'chew toy', 'bird toy',
    ],
    descriptionKeywords: [
      'interactive', 'engaging', 'entertaining', 'stimulating', 'bouncy', 'floating',
    ],
    exclusionKeywords: [
      'food', 'treat', 'kibble', 'meal', 'dinner', 'nutrition', 'gravy', 'stew',
      'shampoo', 'wipes', 'collar', 'leash', 'harness', 'bed', 'crate',
      // CRITICAL: Exclude ALL aquarium-related terms to prevent fish products from appearing in toys
      // Note: Don't exclude "fish" alone (catches "fishbone" toys) - use specific fish names instead
      'aquarium', 'fish tank', 'betta', 'glo fish', 'goldfish', 'tropical fish',
      'molly reg', 'molly ', 'platy', 'swordtail', 'cichlid', 'guppy', 'angelfish',
      'tetra reg', 'tetra ', 'balloon lyretail', 'balloon green', 'brooklyn bridge',
      'aquatic', 'freshwater', 'saltwater', 'marine', ' fish ', 'reg fish',
    ],
  },

  dogTreats: {
    brands: [
      // Premium treat brands
      'Zuke\'s', 'Old Mother Hubbard', 'Cloud Star', 'Bocce\'s Bakery', 'Blue Buffalo',
      'Wellness', 'Merrick', 'RedBarn', 'Barkworthies', 'Best Bully Sticks',
      'Jack & Pup', 'Nature\'s Variety', 'Instinct', 'Primal', 'Stella & Chewy\'s',
      'Full Moon', 'Plato', 'Riley\'s Organics', 'Dogswell', 'Whimzees',
      // Mass market treat brands
      'Milk-Bone', 'Pup-Peroni', 'Greenies', 'Beggin\'', 'Nudges', 'Purina Busy',
      'Dentastix', 'Pedigree', 'Rachael Ray', 'Cesar', 'Beneful',
      'Blue Dog Bakery', 'Three Dog Bakery', 'Wet Noses', 'Loving Pets',
      // Dental/chew treat brands
      'Whimzees', 'OraVet', 'Dentastix', 'Greenies', 'Fresh Breath', 'TropiClean',
      // Natural/jerky brands
      'Happy Howie\'s', 'Newman\'s Own', 'Wellness', 'Natural Balance', 'Canine Naturals',
      'Smartbones', 'DreamBone', 'Good\'n\'Fun', 'Himalayan', 'Himalayan Dog Chew',
      // Training treat brands
      'Stewart', 'Bil-Jac', 'Crazy Dog', 'Blue Buffalo Wilderness Trail Treats',
    ],
    nameKeywords: [
      // Explicit treat terms
      'dog treat', 'dog snack', 'training treat', 'puppy treat', 'doggy treat',
      'treats for dogs', 'dog biscuit', 'dog cookie', 'dog jerky',
      // Dental treats
      'dental treat', 'dental chew', 'dentastix', 'greenies', 'breath treat',
      'teeth cleaning', 'tartar control', 'dental stick', 'toothbrush treat',
      // Chew treats (not toys)
      'bully stick', 'rawhide', 'collagen stick', 'pizzle stick', 'beef stick',
      'pig ear', 'cow ear', 'lamb ear', 'jerky stick', 'trachea',
      'tendon', 'gullet', 'tripe', 'esophagus', 'beef cheek',
      // Soft treats
      'soft chew', 'soft treat', 'training bite', 'mini treat', 'tiny treat',
      'chewy treat', 'moist treat', 'semi-moist', 'tender bite',
      // Freeze-dried/dehydrated treats
      'freeze dried', 'freeze-dried', 'dehydrated', 'air dried', 'air-dried',
      'single ingredient', 'pure meat', 'meat only',
      // Specific treat types
      'peanut butter treat', 'bacon treat', 'chicken treat', 'beef treat',
      'salmon treat', 'sweet potato treat', 'apple treat',
      // Functional treats
      'calming treat', 'hip joint treat', 'probiotic treat', 'vitamin treat',
      'supplement treat', 'wellness treat',
      // Size/portion descriptors
      'bite size', 'mini bite', 'tiny bite', 'small bite', 'treat pouch',
    ],
    descriptionKeywords: [
      'reward', 'training', 'delicious', 'tasty', 'wholesome', 'nutritious',
      'limited ingredient', 'grain free treat', 'natural treat', 'healthy snack',
    ],
    exclusionKeywords: [
      // Exclude food (meals)
      'dog food', 'kibble', 'dry food', 'wet food', 'canned food', 'meal', 'dinner',
      'breakfast', 'nutrition', 'formula', 'diet', 'lb bag',
      // Exclude non-treats
      'toy', 'ball', 'collar', 'leash', 'bed', 'crate', 'bowl',
      'shampoo', 'supplement pill', 'medication',
    ],
  },

  catTreats: {
    brands: [
      // Premium cat treat brands
      'Temptations', 'Greenies', 'Friskies Party Mix', 'Fancy Feast', 'Sheba',
      'Tiki Cat', 'Weruva', 'Inaba', 'Churu', 'Purebites', 'Halo',
      'Wellness Kittles', 'Blue Buffalo Bursts', 'Feline Greenies',
      // Natural/freeze-dried brands
      'Vital Essentials', 'Stella & Chewy\'s', 'Primal', 'Instinct', 'Nature\'s Variety',
      'Northwest Naturals', 'Orijen', 'Acana', 'Whole Life',
      // Mass market brands
      'Meow Mix', 'Cat Chow', 'Purina Fancy Feast', 'Whiskas', '9Lives',
      'Kit & Kaboodle', 'Friskies', 'Delectables', 'Sheba Meaty Tender Sticks',
      // Specialty treat brands
      'Ciao', 'CatSure', 'Hartz Delectables', 'SmartBites', 'Feline Natural',
      'Applaws', 'Catit Creamy', 'Lil\' Soups', 'Broths', 'Cat-Man-Doo',
    ],
    nameKeywords: [
      // Explicit treat terms
      'cat treat', 'cat snack', 'kitty treat', 'kitten treat', 'treats for cats',
      'cat biscuit', 'cat cookie', 'crunchy treat', 'soft treat',
      // Dental treats
      'dental treat', 'feline greenies', 'teeth cleaning', 'tartar control',
      'breath treat', 'dental stick',
      // Lickable/creamy treats
      'lickable treat', 'creamy treat', 'squeeze up', 'liquid treat',
      'puree', 'broth', 'bisque', 'soup', 'churu', 'delectables',
      'creamy lickable', 'lick treat', 'wet treat', 'gravy treat',
      // Crunchy treats
      'temptations', 'party mix', 'crunchy treat', 'crispy treat',
      'crunch', 'snack mix', 'variety pack',
      // Freeze-dried/dehydrated treats
      'freeze dried', 'freeze-dried', 'dehydrated', 'air dried', 'air-dried',
      'single ingredient', 'pure meat', 'meat only', 'protein treat',
      // Specific treat flavors/types
      'tuna treat', 'salmon treat', 'chicken treat', 'seafood treat',
      'turkey treat', 'catnip treat', 'bonito flake', 'shrimp treat',
      // Functional treats
      'calming treat', 'hairball treat', 'vitamin treat', 'probiotic treat',
      'wellness treat', 'urinary treat', 'joint treat',
      // Size/portion descriptors
      'bite size', 'mini bite', 'tiny bite', 'small bite', 'treat stick',
      'meaty stick', 'tender stick',
    ],
    descriptionKeywords: [
      'reward', 'delicious', 'tasty', 'irresistible', 'wholesome', 'nutritious',
      'limited ingredient', 'grain free treat', 'natural treat', 'healthy snack',
      'cats love', 'feline favorite', 'purrfect',
    ],
    exclusionKeywords: [
      // Exclude food (meals)
      'cat food', 'kibble', 'dry food', 'wet food', 'canned food', 'meal', 'dinner',
      'breakfast', 'nutrition', 'formula', 'diet', 'lb bag', 'pate',
      // Exclude non-treats
      'toy', 'ball', 'collar', 'leash', 'bed', 'crate', 'litter', 'bowl',
      'shampoo', 'supplement pill', 'medication', 'scratching post',
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
      'Topiclean', 'Adams', 'PetOdor',
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
      // Pet clothing & fashion brands
      'Aria', 'Zack & Zoey', 'Casual Canine', 'East Side Collection', 'Hip Doggie',
      'Pup Crew', 'Pet Life', 'Fashion Pet', 'Rubie\'s', 'Bootique',
      // Cat litter brands (these go in accessories, NOT aquatics)
      'Intersand', 'Dr. Elsey', 'Dr Elsey', 'Arm & Hammer', 'Tidy Cats', 'World\'s Best',
      'Fresh Step', 'Scoop Away', 'Precious Cat', 'Cat\'s Pride', "Cat's Pride",
      // Pet bowl/feeding brands
      'Bella', 'Bellabowl', 'Neater Feeder', 'PetRageous',
    ],
    nameKeywords: [
      // Pet clothing & apparel
      'bow', 'bow tie', 'bowtie', 'hair bow', 'ribbon', 'bandana', 'bandanna',
      'tanktop', 'tank top', 'sweater', 'coat', 'jacket', 'raincoat', 'hoodie',
      'costume', 'dress', 'tutu', 'shirt', 't-shirt', 'tee', 'vest',
      'pajamas', 'pjs', 'bathrobe', 'robe',
      // Decorative items
      'bell', 'bells', 'charm', 'tag charm', 'id tag', 'decorative tag',
      'sticker', 'stickers', 'decal', 'decals', 'patch', 'patches',
      'decoration', 'ornament', 'seasonal decor', 'holiday decor',
      // Accessories
      'scarf', 'neckerchief', 'hat', 'cap', 'sunglasses', 'goggles',
      'socks', 'booties', 'shoes', 'sneakers',
      // Cat litter products
      'cat litter', 'clumping litter', 'scoopable litter', 'odorlock', 'odor lock',
      'litter box', 'litter pan', 'litter scoop', 'litter mat',
      // Pet bowls/feeders
      'pet bowl', 'food bowl', 'water bowl', 'feeding bowl', 'bellabowl',
      'elevated bowl', 'slow feeder', 'automatic feeder',
    ],
    descriptionKeywords: [
      'fashionable', 'stylish', 'decorative', 'adorable', 'cute', 'festive',
      'odor control', 'clumping', 'absorbent', // For cat litter
    ],
    exclusionKeywords: [
      'food', 'kibble', 'treat', 'meal', 'toy', 'ball', 'chew',
      'aquarium', 'cage', 'crate', 'carrier',
      'shampoo', 'brush', 'clipper', 'bed',
    ],
  },

  aquatics: {
    brands: [
      'Fluval', 'Seachem', 'API', 'Marineland', 'Aqueon', 'GloFish', 'Tetra',
      'Hikari', 'Aqua Culture', 'Top Fin', 'Penn Plax', 'Omega One',
      'Aquatop', 'Hydor', 'Eheim', 'Marina', 'Aquascapes', 'Imagitarium',
    ],
    nameKeywords: [
      // Aquarium equipment
      'aquarium', 'fish tank', 'filter', 'pump', 'heater', 'thermometer',
      'air stone', 'bubbler', 'airstone', 'air pump', 'powerhead',
      // Water treatment
      'water treatment', 'water conditioner', 'clarity', 'zeo-carb',
      'cartridge', 'media', 'ammonia', 'nitrite', 'ph buffer',
      // Aquarium decor
      'substrate', 'gravel', 'sand', 'aquarium decor', 'aquarium ornament',
      'aquarium plant', 'betta plant', 'artificial plant', 'silk plant',
      'anemone', 'corkscrew', 'grass plant', 'aquarium background',
      // Betta specific
      'betta', 'betta log', 'betta diver', 'betta hammock', 'bettamatic',
      // Maintenance
      'algae scraper', 'gravel vacuum', 'fish net', 'siphon',
    ],
    descriptionKeywords: [
      'freshwater', 'saltwater', 'marine', 'aquatic', 'underwater',
    ],
    exclusionKeywords: [
      'food', 'flakes', 'pellets', 'turtle food', 'fish food',
      // CRITICAL: Exclude reptile brands/products - they should be in reptiles category
      'tetrafauna', 'reptohabitat', 'reptofilter', 'reptomin', 'reptosafe',
      'exo terra', 'exoterra', 'zilla', "fluker's", 'flukers', 'repticare',
      'gecko', 'lizard', 'snake', 'bearded dragon', 'iguana', 'chameleon',
      'turtle', 'tortoise', 'terrarium', 'vivarium', 'reptile', 'amphibian',
      // CRITICAL: Exclude toy products (sea-themed toys should stay in toys)
      'dog toy', 'cat toy', 'pet toy', 'squeaky', 'plush toy', 'chew toy',
      'kong', 'nylabone', 'benebone', 'fishbone', 'fetch', 'teaser wand', 'wrangler',
      // CRITICAL: Exclude bird products (sand perches are for birds, not aquariums)
      'perch', 'perches', 'bird cage', 'a & e', 'a&e', 'birdlife', 'jw insight',
      // CRITICAL: Exclude cat/dog products (cat/dog water fountain filters are NOT aquarium filters)
      'catit', 'cat fountain', 'cat water fountain', 'flowfoun', 'pixi', 'zeus fountain', 'dogit',
      // CRITICAL: Exclude small animal products (not aquarium)
      'bathing sand', 'friendsfarm', 'friends farm', 'tiny friends', 'sunburst nutty',
      // CRITICAL: Exclude dog food/treat brands with fish ingredients
      'zignature', 'fruitables', 'bluebuffalo', 'blue buffalo',
      // CRITICAL: Exclude fragrance/air freshener products
      'pethouse', 'wax melt', 'car freshener', 'reed diffuser',
      // CRITICAL: Exclude bird gravel paper (for bird cage bottoms)
      'gravel paper',
      // CRITICAL: Exclude dog/cat food with fish ingredients (should stay in food)
      'cat food', 'dog food', 'puppy food', 'kitten food',
      'cat treat', 'dog treat', 'puppy treat', 'kitten treat',
      'for cats', 'for dogs', 'for kittens', 'for puppies',
      // CRITICAL: Exclude cat litter products (Intersand Odorlock, etc.)
      'cat litter', 'litter box', 'odorlock', 'odor lock', 'clumping litter',
      // CRITICAL: Exclude pet bowls (Bellabowl Fish Blue/Purple are bowls, not fish products)
      'pet bowl', 'bellabowl', 'food bowl', 'water bowl', 'feeding bowl',
    ],
  },

  reptiles: {
    brands: [
      // Primary reptile brands
      'Zoo Med', 'ZooMed', 'Exo Terra', 'Exoterra', 'Fluker\'s', 'Flukers', 'Zilla', 'ReptiCare',
      'Reptile Supply', 'Thrive', 'Komodo', 'Reptisun', 'Repti',
      // Tetra's reptile line (separate from aquatics Tetra)
      'Tetrafauna', 'Tetra Fauna',
      // Reptile accessories brands
      'Reptology', 'Carolina Custom Cages', 'Lugarti',
    ],
    nameKeywords: [
      // Terrarium equipment
      'terrarium', 'vivarium', 'heat lamp', 'heating lamp', 'basking lamp',
      'UVB', 'uvb bulb', 'basking bulb', 'ceramic heater', 'heat mat',
      'under tank heater', 'thermostat', 'thermometer hygrometer',
      // Tetrafauna specific products
      'reptohabitat', 'reptofilter', 'reptomin', 'reptosafe', 'reptoguard',
      'sand mat', 'decorative filter',
      // Reptile habitat decor
      'hide', 'cave', 'rock lair', 'reptile cave', 'basking platform',
      'vines', 'reptile vine', 'background', 'terrarium background',
      'paludarium', 'desert substrate', 'coconut fiber', 'reptile bark',
      'forest floor', 'eco earth', 'plantation soil', 'excavator clay',
      // Species specific
      'gecko', 'bearded dragon', 'snake', 'lizard', 'iguana',
      'chameleon', 'tortoise', 'turtle', 'hermit crab',
      // Supplements (non-food)
      'calcium dust', 'vitamin dust', 'supplement cube', 'orange cube',
      'mineral block', 'cuttlebone', 'repti calcium', 'reptivite',
    ],
    descriptionKeywords: [
      'reptile', 'amphibian', 'tropical', 'desert habitat', 'arboreal',
    ],
    exclusionKeywords: [
      'food', 'crickets', 'mealworms', 'frozen food', 'reptile food',
      // CRITICAL: Exclude all aquatic keywords to prevent ZooMed betta → reptiles
      'betta', 'fish', 'aquarium', 'fish tank', 'aquatic', 'freshwater',
      'saltwater', 'marine', 'goldfish', 'tropical fish', 'glo fish',
    ],
  },

  birdSupplies: {
    brands: [
      'Prevue Pet', 'Prevue Hendryx', 'Vision', 'Yaheetech', 'Mcage',
      'A&E Cage', 'Midwest Homes', 'Ferplast', 'Kaytee', 'You & Me',
    ],
    nameKeywords: [
      // Bird housing
      'bird cage', 'aviary', 'flight cage', 'breeding cage', 'travel cage',
      'parakeet cage', 'cockatiel cage', 'parrot cage', 'finch cage',
      'canary cage', 'bird habitat', 'bird home',
      // Cage accessories
      'cage cover', 'cage liner', 'cage tray', 'grate', 'perch cover',
      'nest', 'nesting box', 'bird nest', 'nest material', 'nesting material',
      'bird bath', 'bath house', 'bird mirror',
      // Cage parts
      'cage door', 'play top', 'playtop', 'cage stand', 'caster wheels',
    ],
    descriptionKeywords: [
      'spacious', 'durable cage', 'bird home', 'avian housing',
    ],
    exclusionKeywords: [
      'food', 'seed', 'pellets', 'toy', 'perch', 'swing', 'ladder',
    ],
  },

  dogCages: {
    brands: [
      'MidWest', 'MidWest Homes', 'Petmate', 'Precision Pet', 'AmazonBasics',
      'IRIS', 'Carlson', 'Regalo', 'Frisco', 'EliteField', 'Vari Kennel',
      'New World', 'ProSelect', 'Aspen Pet',
    ],
    nameKeywords: [
      // Dog crates & kennels
      'dog crate', 'dog kennel', 'wire crate', 'plastic crate', 'soft crate',
      'travel crate', 'airline crate', 'vari kennel', 'pet carrier',
      'crate divider', 'crate mat', 'crate cover', 'crate tray',
      // Dog houses
      'dog house', 'doghouse', 'outdoor house', 'insulated house',
      'elevated house', 'weatherproof house',
      // Gates & pens
      'exercise pen', 'playpen', 'pet gate', 'baby gate', 'pressure gate',
      'freestanding gate', 'puppy pen', 'x-pen',
    ],
    descriptionKeywords: [
      'secure', 'containment', 'training crate', 'house training',
    ],
    exclusionKeywords: [
      'food', 'toy', 'bed', 'bowl', 'leash', 'collar',
    ],
  },

  smallAnimalSupplies: {
    brands: [
      'Kaytee', 'Prevue Pet', 'Living World', 'Ferplast', 'Ware',
      'MidWest', 'You & Me', 'Oxbow', 'All Living Things', 'Habitrail',
    ],
    nameKeywords: [
      // Small animal housing
      'hamster cage', 'guinea pig cage', 'rabbit cage', 'rabbit hutch',
      'chinchilla cage', 'gerbil cage', 'mouse cage', 'rat cage',
      'ferret cage', 'hedgehog cage', 'small animal habitat',
      'critter cage', 'critter home', 'modular habitat',
      // Cage components
      'cage accessories', 'hideout', 'tunnel', 'hamster tube',
      'exercise loop', 'ramp', 'platform', 'second level',
      'cage bedding tray', 'wire top', 'habitat topper',
      // Outdoor housing
      'outdoor hutch', 'rabbit run', 'enclosure', 'playpen',
    ],
    descriptionKeywords: [
      'spacious habitat', 'multi-level', 'ventilated', 'easy clean',
    ],
    exclusionKeywords: [
      'food', 'hay', 'pellets', 'treat', 'chew toy', 'bedding',
    ],
  },
};

// Lowered to 15 to allow single-keyword matches for specialized products (e.g., betta=aquatics)
// Pattern matching (oz, lb) adds +10pts to food products
// Strong exclusion penalties (-30) prevent false positives
export const CATEGORY_CONFIDENCE_THRESHOLD = 15;
