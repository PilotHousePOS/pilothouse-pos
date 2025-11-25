/**
 * EVIDENCE-BASED AQUATIC CATEGORY MAPPINGS
 * 
 * All brand categorizations verified from official websites
 * Research conducted: November 25, 2025
 * 
 * Evidence Sources:
 * - Hikari: hikariusa.com, hikari.info
 * - API: apifishcare.com
 * - Aqueon: aqueon.com
 * - Omega One: omegasea.net
 * - Ocean Nutrition: oceannutrition.com
 * - Tetra: tetra-fish.com
 * - Marineland: marineland.com
 * - Fluval: fluvalaquatics.com
 * - SeaChem: seachem.com
 * - GloFish: glofish.com
 */

// FOOD BRANDS
// Brands that ONLY or PRIMARILY make fish food

export const AQUATIC_FOOD_BRANDS = [
  // FOOD-ONLY BRANDS (verified: no medicine/equipment)
  'Omega One',        // Official site confirms: ONLY food products (flakes, pellets, frozen)
  'Ocean Nutrition',  // Official site confirms: ONLY food products (flakes, pellets, wafers, frozen)
  
  // FOOD + OTHER PRODUCTS (but food is primary line)
  'Hikari',          // Food + Treatments (verified: hikariusa.com has separate food/treatment sections)
  'API',             // Food + Medications + Water care (verified: apifishcare.com/products)
  'Tetra',           // Food + Water care + Equipment (verified: tetra-fish.com/products/nutrition.aspx)
  'Aqueon',          // Food + Water care + Equipment (verified: aqueon.com/products)
  'GloFish',         // Food + Supplies (verified: glofish.com/products)
  'Fluval',          // Bug Bites food + Equipment (verified: fluvalaquatics.com)
];

// MEDICINE/TREATMENT BRANDS
// Brands that specialize in medications and water treatments

export const AQUATIC_MEDICINE_BRANDS = [
  // MEDICINE SPECIALIST
  'SeaChem',         // Official site: PRIMARILY treatments/medications, NO food
                     // Products: Prime, Stability, ParaGuard, KanaPlex, MetroPlex, etc.
                     // Source: seachem.com/medications.php
  
  // BRANDS WITH MEDICINE LINES
  'API',             // Melafix, Pimafix, General Cure, E.M. Erythromycin, Furan-2
                     // Source: apifishcare.com/products/aquarium/freshwater/treatments
  
  'Hikari',          // Ich-X, PraziPro, CyroPro (disease treatments)
                     // Ultimate, Bio-Bandage (water conditioners)
                     // Source: hikariusa.com (treatment section)
  
  'Tetra',           // AquaSafe, SafeStart (water conditioners)
                     // Source: tetra-fish.com/products/water-care.aspx
  
  'Aqueon',          // Water conditioners, Pure Live Bacteria & Enzymes
                     // Source: aqueon.com/products
];

// SUPPLIES/EQUIPMENT BRANDS
// Brands that primarily make aquarium equipment and accessories

export const AQUATIC_SUPPLIES_BRANDS = [
  // EQUIPMENT-ONLY BRANDS
  'Marineland',      // Official site confirms: ONLY equipment (filters, tanks, lighting, heaters)
                     // NO food products
                     // Source: marineland.com/products
  
  // EQUIPMENT + FOOD BRANDS
  'Fluval',          // Primarily equipment (filters, tanks, lighting, heaters)
                     // Also makes Bug Bites food
                     // Source: fluvalaquatics.com
  
  'Aqueon',          // Equipment (filters, tanks, heaters, lighting) + Food + Water care
                     // Source: aqueon.com/products
  
  'Tetra',           // Equipment (filters, kits) + Food + Water care
                     // Source: tetra-fish.com/products
  
  'GloFish',         // Aquarium kits + Supplies + Food
                     // Source: glofish.com/products
];

// FOOD PRODUCT KEYWORDS
// Keywords that indicate fish food products (verified from official product names)

export const AQUATIC_FOOD_KEYWORDS = [
  // Food types (from Hikari, Ocean Nutrition, Omega One, API, Tetra, Aqueon product lines)
  'food', 'flake', 'pellet', 'wafer', 'granule', 'cuisine', 'diet',
  'staple', 'nutrition', 'formula', 'treat',
  
  // Preparation types (from official product names)
  'freeze dried', 'frozen', 'freeze-dried', 'bio-pure',
  
  // Ingredients (verified from Hikari Bio-Pure, Ocean Nutrition, Omega One lines)
  'shrimp', 'brine', 'bloodworm', 'tubifex', 'daphnia', 'krill',
  'spirulina', 'algae wafer', 'veggie', 'protein',
  
  // Fish species-specific foods (from all major brands' product lines)
  'cichlid', 'betta', 'goldfish', 'tropical', 'discus', 'tetra',
  'guppy', 'pleco', 'catfish', 'marine', 'reef',
  
  // Product line names (from official websites)
  'bio-gold', 'saki-hikari', 'massivore', 'algae eater',
  'community formula', 'veggie formula', 'color enhancing',
  'bug bites', 'glofish special flake', 'tetramin'
];

// MEDICINE/TREATMENT KEYWORDS
// Keywords that indicate medications and water treatments (verified from official product names)

export const AQUATIC_MEDICINE_KEYWORDS = [
  // Medications (from API, SeaChem, Hikari product lines)
  'medication', 'medicine', 'treatment', 'remedy', 'cure',
  
  // API products (verified: apifishcare.com)
  'melafix', 'pimafix', 'general cure', 'bettafix', 'erythromycin', 'furan',
  
  // SeaChem products (verified: seachem.com/medications.php)
  'paraguard', 'cupramine', 'kanaplex', 'metroplex', 'sulfaplex', 'neoplex', 'polyguard',
  
  // Hikari products (verified: hikariusa.com)
  'ich-x', 'prazipro', 'cyropro',
  
  // Water conditioners (from all major brands)
  'conditioner', 'water conditioner', 'tap water conditioner',
  
  // API water treatments (verified: apifishcare.com)
  'stress coat', 'stress zyme', 'quick start', 'aquasafe', 'safestart',
  
  // SeaChem water treatments (verified: seachem.com)
  'prime', 'stability', 'stressguard', 'clarity', 'purigen',
  
  // Hikari water treatments (verified: hikariusa.com)
  'ultimate', 'bio-bandage',
  
  // Condition keywords (from product descriptions)
  'disease', 'parasite', 'fungus', 'bacteria', 'infection', 'ich', 'velvet',
  'fin rot', 'wound', 'antiseptic', 'antibiotic', 'antifungal',
  
  // Treatment actions
  'detoxif', 'neutralize', 'remove chlorine', 'remove chloramine',
  'beneficial bacteria', 'supplement', 'health', 'aid', 'care'
];

// SUPPLIES/EQUIPMENT KEYWORDS
// Keywords that indicate equipment and accessories (verified from official product categories)

export const AQUATIC_SUPPLIES_KEYWORDS = [
  // Filtration equipment (from Marineland, Fluval, Aqueon, Tetra)
  'filter', 'filtration', 'canister', 'cartridge', 'media',
  'bio-wheel', 'penguin', 'whisper', 'magniflow',
  
  // Tank equipment (from all equipment brands)
  'aquarium', 'tank', 'kit', 'heater', 'thermometer',
  'lighting', 'led', 'lamp', 'bulb', 'hood',
  
  // Decorations and substrates
  'gravel', 'sand', 'substrate', 'decoration', 'ornament',
  'plant', 'cave', 'rock', 'driftwood',
  
  // Maintenance tools
  'test kit', 'scraper', 'net', 'siphon', 'vacuum',
  'algae scraper', 'magnet cleaner', 'water changer',
  
  // Equipment brand-specific products
  'marineland', 'fluval', 'aqueon', 'tetra',
  'spec', 'flex', 'evo', // Fluval tank series
  'glofish kit', 'glofish aquarium'
];
