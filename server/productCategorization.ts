/**
 * Automatic product categorization system
 * Analyzes product names, brands, and descriptions to assign filterType
 */

import { SUPPLY_FILTERS, FilterType } from './filterConfig';
import type { Supply } from '@shared/schema';

export interface CategorizationResult {
  filterType: 'aquatic' | 'reptile' | 'smallanimal' | null;
  confidence: number; // 0-100
  reason: string;
}

/**
 * Automatically categorizes a product based on its name, brand, and description
 * @param product - Product to categorize
 * @returns Categorization result with filterType, confidence, and reason
 */
/**
 * Normalize brand name for comparison (handles "Zoo Med" vs "ZooMed")
 */
function normalizeBrand(brand: string): string {
  return brand.toLowerCase().replace(/['\s\-\.]/g, '');
}

export function categorizeProduct(product: Pick<Supply, 'name' | 'brand' | 'description'>): CategorizationResult {
  const name = (product.name || '').toLowerCase();
  const brand = normalizeBrand(product.brand || '');
  const description = (product.description || '').toLowerCase();
  
  let aquaticScore = 0;
  let reptileScore = 0;
  let smallAnimalScore = 0;
  const matchedReasons: string[] = [];

  // **THREE-TIER EXCLUSION SYSTEM:**
  // 1. Hard exclusions (toy brands): Excluded from ALL categories → immediately return null
  // 2. Soft exclusions (pure category brands): Brand doesn't score, but keywords can
  // 3. Cross-category brands (ZooMed): Not excluded, both brand and keywords score
  
  let brandExcludedFromAquatic = false;
  let brandExcludedFromReptile = false;
  let brandExcludedFromSmallAnimal = false;
  let keywordExcludedFromAquatic = false;
  let keywordExcludedFromReptile = false;
  let keywordExcludedFromSmallAnimal = false;

  // Check brand exclusions (for brand scoring only)
  for (const excludeBrand of SUPPLY_FILTERS.aquatic.excludeBrands) {
    const normalizedExclude = normalizeBrand(excludeBrand);
    if (brand.includes(normalizedExclude)) {
      brandExcludedFromAquatic = true;
      matchedReasons.push(`Brand excluded from aquatic: ${excludeBrand}`);
      break;
    }
  }

  for (const excludeBrand of SUPPLY_FILTERS.reptile.excludeBrands) {
    const normalizedExclude = normalizeBrand(excludeBrand);
    if (brand.includes(normalizedExclude)) {
      brandExcludedFromReptile = true;
      matchedReasons.push(`Brand excluded from reptile: ${excludeBrand}`);
      break;
    }
  }

  for (const excludeBrand of SUPPLY_FILTERS.smallanimal.excludeBrands) {
    const normalizedExclude = normalizeBrand(excludeBrand);
    if (brand.includes(normalizedExclude)) {
      brandExcludedFromSmallAnimal = true;
      matchedReasons.push(`Brand excluded from small animal: ${excludeBrand}`);
      break;
    }
  }

  // **HARD STOP: If brand excluded from ALL categories (toy brands), immediately return null**
  // This prevents Kong "Frog Toy" from scoring reptile points via "frog" keyword
  if (brandExcludedFromAquatic && brandExcludedFromReptile && brandExcludedFromSmallAnimal) {
    return {
      filterType: null,
      confidence: 0,
      reason: `Hard exclusion: ${matchedReasons.join(', ')} - toy brand never categorized`
    };
  }

  // Check keyword exclusions (for keyword scoring only)
  for (const keyword of SUPPLY_FILTERS.aquatic.excludeKeywords) {
    if (name.includes(keyword.toLowerCase()) || description.includes(keyword.toLowerCase())) {
      keywordExcludedFromAquatic = true;
      matchedReasons.push(`Keyword excluded from aquatic: "${keyword}"`);
      break;
    }
  }

  for (const keyword of SUPPLY_FILTERS.reptile.excludeKeywords) {
    if (name.includes(keyword.toLowerCase()) || description.includes(keyword.toLowerCase())) {
      keywordExcludedFromReptile = true;
      matchedReasons.push(`Keyword excluded from reptile: "${keyword}"`);
      break;
    }
  }

  for (const keyword of SUPPLY_FILTERS.smallanimal.excludeKeywords) {
    if (name.includes(keyword.toLowerCase()) || description.includes(keyword.toLowerCase())) {
      keywordExcludedFromSmallAnimal = true;
      matchedReasons.push(`Keyword excluded from small animal: "${keyword}"`);
      break;
    }
  }

  // Check aquatic keywords in name (highest priority - 60 points)
  // ONLY blocked by keyword exclusions, NOT brand exclusions
  if (!keywordExcludedFromAquatic) {
    for (const keyword of SUPPLY_FILTERS.aquatic.includeKeywords) {
      if (name.includes(keyword.toLowerCase())) {
        aquaticScore += 60;
        matchedReasons.push(`Aquatic keyword: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check reptile keywords in name (highest priority - 60 points)
  // ONLY blocked by keyword exclusions, NOT brand exclusions
  if (!keywordExcludedFromReptile) {
    for (const keyword of SUPPLY_FILTERS.reptile.includeKeywords) {
      if (name.includes(keyword.toLowerCase())) {
        reptileScore += 60;
        matchedReasons.push(`Reptile keyword: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check small animal keywords in name (highest priority - 60 points)
  // ONLY blocked by keyword exclusions, NOT brand exclusions
  if (!keywordExcludedFromSmallAnimal) {
    for (const keyword of SUPPLY_FILTERS.smallanimal.includeKeywords) {
      if (name.includes(keyword.toLowerCase())) {
        smallAnimalScore += 60;
        matchedReasons.push(`Small animal keyword: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check aquatic brands (40 points) - blocked by BRAND exclusions
  if (!brandExcludedFromAquatic) {
    for (const aquaticBrand of SUPPLY_FILTERS.aquatic.includeBrands) {
      if (brand === normalizeBrand(aquaticBrand)) {
        aquaticScore += 40;
        matchedReasons.push(`Aquatic brand: ${aquaticBrand}`);
        break;
      }
    }
  }

  // Check reptile brands (40 points) - blocked by BRAND exclusions
  if (!brandExcludedFromReptile) {
    for (const reptileBrand of SUPPLY_FILTERS.reptile.includeBrands) {
      if (brand === normalizeBrand(reptileBrand)) {
        reptileScore += 40;
        matchedReasons.push(`Reptile brand: ${reptileBrand}`);
        break;
      }
    }
  }

  // Check small animal brands (40 points) - blocked by BRAND exclusions
  if (!brandExcludedFromSmallAnimal) {
    for (const smallAnimalBrand of SUPPLY_FILTERS.smallanimal.includeBrands) {
      if (brand === normalizeBrand(smallAnimalBrand)) {
        smallAnimalScore += 40;
        matchedReasons.push(`Small animal brand: ${smallAnimalBrand}`);
        break;
      }
    }
  }

  // Special rule: "bridge" products go to aquatics UNLESS "lizard" appears near it
  if (name.includes('bridge')) {
    // Check if "lizard" appears within 20 characters of "bridge"
    const bridgeIndex = name.indexOf('bridge');
    const searchStart = Math.max(0, bridgeIndex - 20);
    const searchEnd = Math.min(name.length, bridgeIndex + 26); // "bridge".length = 6, +20 = 26
    const nearbyText = name.substring(searchStart, searchEnd);
    
    if (nearbyText.includes('lizard')) {
      // It's a lizard bridge - let normal reptile rules handle it
      matchedReasons.push('Bridge with "lizard" - skipping aquatic rule');
    } else {
      // It's an aquarium bridge
      aquaticScore += 30;
      matchedReasons.push('Bridge (aquarium) name');
    }
  }

  // Check aquatic keywords in description (medium priority - 15 points)
  // ONLY blocked by keyword exclusions, NOT brand exclusions
  if (!keywordExcludedFromAquatic) {
    for (const keyword of SUPPLY_FILTERS.aquatic.includeKeywords) {
      if (description.includes(keyword.toLowerCase())) {
        aquaticScore += 15;
        matchedReasons.push(`Aquatic description: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check reptile keywords in description (medium priority - 15 points)
  // ONLY blocked by keyword exclusions, NOT brand exclusions
  if (!keywordExcludedFromReptile) {
    for (const keyword of SUPPLY_FILTERS.reptile.includeKeywords) {
      if (description.includes(keyword.toLowerCase())) {
        reptileScore += 15;
        matchedReasons.push(`Reptile description: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check small animal keywords in description (medium priority - 15 points)
  // ONLY blocked by keyword exclusions, NOT brand exclusions
  if (!keywordExcludedFromSmallAnimal) {
    for (const keyword of SUPPLY_FILTERS.smallanimal.includeKeywords) {
      if (description.includes(keyword.toLowerCase())) {
        smallAnimalScore += 15;
        matchedReasons.push(`Small animal description: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Determine result based on scores
  const minConfidence = 25; // Minimum score to assign a category
  
  // Find the highest score among all categories
  const scores = [
    { type: 'aquatic' as const, score: aquaticScore },
    { type: 'reptile' as const, score: reptileScore },
    { type: 'smallanimal' as const, score: smallAnimalScore }
  ];
  
  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];
  
  if (winner.score >= minConfidence) {
    return {
      filterType: winner.type,
      confidence: Math.min(100, winner.score),
      reason: matchedReasons.join(', ')
    };
  } else {
    return {
      filterType: null,
      confidence: 0,
      reason: matchedReasons.length > 0 
        ? `${matchedReasons.join(', ')} (scores: aquatic=${aquaticScore}, reptile=${reptileScore}, small animal=${smallAnimalScore})`
        : 'No specific category indicators found'
    };
  }
}

/**
 * Batch categorize multiple products
 * @param products - Array of products to categorize
 * @returns Array of categorization results
 */
export function categorizeProducts(products: Pick<Supply, 'id' | 'name' | 'brand' | 'description'>[]): Array<{
  id: number;
  filterType: 'aquatic' | 'reptile' | 'smallanimal' | null;
  confidence: number;
  reason: string;
}> {
  return products.map(product => ({
    id: product.id,
    ...categorizeProduct(product)
  }));
}

/**
 * Detects if a product name represents a live animal using a robust scoring system
 * Scores supply indicators (negative) vs. live animal indicators (positive)
 * @param itemName - Product name to check
 * @returns Object with isLiveAnimal boolean, species, and detected keywords
 */
export function detectLiveAnimal(itemName: string): {
  isLiveAnimal: boolean;
  species: string | null;
  detectedKeywords: string[];
} {
  const nameLower = itemName.toLowerCase().trim();
  
  // Normalize Unicode apostrophes to ASCII
  const normalized = nameLower.replace(/[''`´]/g, "'");
  
  // **EARLY REJECTION: Check for weight patterns** (e.g., "7.9", ".71oz", "2oz", "12.2oz")
  // These patterns indicate food/supply products with weight measurements
  const weightPatterns = [
    /\d+\.?\d*oz\b/,      // Matches: 2oz, 12.2oz, .71oz
    /\d+\.?\d*lb\b/,      // Matches: 5lb, 2.5lb
    /\d+\.?\d*g\b/,       // Matches: 100g, 2.5g
    /\d+\.?\d*kg\b/,      // Matches: 1kg, 1.5kg
    /\b\d+\.\d+\b/        // Matches standalone decimals: 7.9, 2.5, 0.71
  ];
  
  if (weightPatterns.some(pattern => pattern.test(normalized))) {
    return { isLiveAnimal: false, species: null, detectedKeywords: [] };
  }
  
  // Tokenize into words, strip possessives
  const words = normalized
    .split(/[\s\-\/]+/)
    .map(w => w.replace(/'s$/g, ''))
    .map(w => w.replace(/[']/g, ''))
    .filter(w => w.length > 0);
  const wordSet = new Set(words);
  
  // **SCORING SYSTEM**: Calculate supply score vs live animal score
  let supplyScore = 0;  // Negative indicators (this is a product)
  let liveScore = 0;     // Positive indicators (this is a live animal)
  const detectedKeywords: string[] = [];
  let detectedSpecies: string | null = null;
  
  // **1. SUPPLY KEYWORDS** (-100 points each - very strong negative signal)
  const supplyKeywords = new Set([
    'food', 'foods', 'pellet', 'treat', 'treats', 'bedding', 'flakes', 'wafer', 'chip', 'drops', 'powder',
    'vitamin', 'supplement', 'medicine', 'hay', 'litter', 'shavings', 'diet', 'meal', 'nutrition',
    'bite', 'crunch', 'nibbles', 'nugget', 'formula', 'blend', 'buffet', 'floating', 'sinking',
    'vitamized', 'lax', 'rx', 'bts', 'ext', 'minnow', 'vitaless', 'aquaplt', 'plnt',
    'oz', 'lb', 'lbs', 'ounce', 'pound', 'gram', 'g', 'kg',
    'cage', 'tank', 'aquarium', 'terrarium', 'habitat', 'filter', 'heater', 'pump',
    'decoration', 'decor', 'toy', 'toys', 'bowl', 'bottle', 'substrate', 'kit', 'starter',
    'collar', 'leash', 'harness', 'carrier', 'crate', 'brush', 'net', 'ornament', 'moss', 'hook',
    'statue', 'set', 'sets', 'bag', 'glove', 'wrap', 'hide', 'tunnel',
    'felt', 'fleece', 'yarn', 'sponge', 'shaggy', 'squeaky', 'plush', 'fuzzy',
    'rattle', 'clatter', 'crinkle', 'led', 'catnip', 'rope', 'tug', 'heartbeat', 'donutz', 'buddies', 'sooth',
    'conditioner', 'treatment', 'cleaner', 'shampoo', 'spray', 'solution',
    'light', 'bulb', 'lamp', 'cave', 'shelter', 'den', 'hideaway', 'log', 'rock', 'stone', 'gravel',
    'remover', 'control', 'system', 'setup', 'complete', 'care', 'decorative',
    'shed', 'shedding', 'aid', 'humidifier', 'training', 'trainer', 'perch', 'stand',
    'odor', 'spritz', 'gdibye', 'daily', 'multi',
    'tools', 'tool', 'mirror', 'thermometer', 'renewal', 'renew', 'basic', 'basics',
    'shaker', 'diver', 'test', 'tester', 'strip', 'meter', 'gauge', 'reader',
    'hoodie', 'shirt', 'apparel', 'clothing', 'keychain', 'poster', 'sticker', 'magnet', 'mug',
    'calendar', 'book', 'guide', 'magazine', 'notebook', 'hammock', 'blanket', 'towel', 'mat', 'pad', 'cushion',
    'charm', 'pendant', 'jewelry', 'necklace', 'figurine', 'model', 'replica',
    'plant', 'plants', 'volcano', 'castle', 'bridge', 'arch', 'bubbler', 'aerator',
    'vibrance', 'crisp', 'crisps', 'lovelies'
  ]);
  
  // **2. SUPPLY BRANDS** (-100 points each - very strong negative signal)
  const supplyBrands = new Set([
    'api', 'aqueon', 'marineland', 'fluval', 'seachem', 'hikari', 'omega', 'aquaclear', 'penn', 'plax', 'imagitarium',
    'zoomed', 'exoterra', 'zilla', 'flukers', 'repticare',
    'kaytee', 'oxbow', 'vitakraft', 'sunseed', 'higgins',
    'marshall', 'marshalls', 'oasis', 'vitaless',
    'kong', 'nylabone', 'chuckit', 'spot', 'spt', 'turbo', 'ethical', 'zippypaws', 'tuffy',
    'buddy', 'guard', 'shield', 'safe', 'safestart', 'aquasafe', 'bettasafe',
    'bioscrub', 'bio', 'scrub', 'max', 'plus', 'pro', 'premium', 'ultimate', 'activ',
    'friends', 'farm', 'barbie', 'barbies', 'spongebob', 'frozen', 'dory'
  ]);
  
  // Calculate supply score
  for (const word of words) {
    if (supplyKeywords.has(word)) supplyScore -= 100;
    if (supplyBrands.has(word)) supplyScore -= 100;
  }
  
  // If heavy supply score, immediately reject
  if (supplyScore <= -100) {
    return { isLiveAnimal: false, species: null, detectedKeywords: [] };
  }
  
  // **POSITIVE SIGNALS**: Three-set taxonomy for robust detection
  
  
  // **3. SPECIFIC SPECIES** (+80 points - very specific animal names, safe to auto-approve)
  const specificSpecies: Record<string, string[]> = {
    // Fish - Livebearers
    molly: ['molly', 'mollies'],
    platy: ['platy', 'platies'],
    swordtail: ['swordtail', 'swordtails'],
    guppy: ['guppy', 'guppies'],
    
    // Fish - Bettas & Gouramis  
    betta: ['betta', 'bettas'],
    gourami: ['gourami', 'gouramis'],
    
    // Fish - Goldfish & Koi
    goldfish: ['goldfish'],
    koi: ['koi'],
    
    // Fish - Angelfish & Discus
    angelfish: ['angelfish'],
    discus: ['discus'],
    
    // Fish - Specialty
    arowana: ['arowana', 'arowanas'],
    
    // Small Animals
    chinchilla: ['chinchilla', 'chinchillas'],
    hamster: ['hamster', 'hamsters'],
    gerbil: ['gerbil', 'gerbils'],
    guineapig: ['guinea'],
    hedgehog: ['hedgehog', 'hedgehogs']
  };
  
  // **4. GENERIC SPECIES** (+40 points - could appear in product names)
  const genericSpecies: Record<string, string[]> = {
    // Small Animals
    rabbit: ['rabbit', 'rabbits', 'bunny', 'bunnies'],
    rat: ['rat', 'rats'],
    mouse: ['mouse', 'mice'],
    ferret: ['ferret', 'ferrets'],
    
    // Fish - Tetras & Small Schooling
    tetra: ['tetra', 'tetras'],
    rasbora: ['rasbora', 'rasboras'],
    danio: ['danio', 'danios'],
    barb: ['barb', 'barbs'],
    
    // Fish - Catfish & Bottom Dwellers
    catfish: ['catfish', 'pleco', 'plecostomus', 'cory', 'corydoras', 'paleatus', 'aeneus'],
    loach: ['loach', 'loaches'],
    
    // Fish - Cichlids
    cichlid: ['cichlid', 'cichlids', 'ram', 'peacock', 'aulonocara', 'maylandia', 'apistogramma', 'severum', 'nyererei'],
    
    // Fish - Sharks & Polypterus (aquarium sharks)
    shark: ['shark', 'sharks'],
    polypterus: ['polypterus', 'bichir', 'senegalus', 'dinosaur'],
    
    // Fish - Shrimp & Invertebrates
    shrimp: ['shrimp', 'shrimps', 'neocaridina', 'amano'],
    
    // Fish - Algae Eaters
    algaeeater: ['siamese', 'chinese', 'farlowella'],
    
    // Reptiles
    gecko: ['gecko', 'geckos'],
    chameleon: ['chameleon', 'chameleons'],
    snake: ['snake', 'snakes'],
    dragon: ['dragon', 'dragons'],
    
    // Amphibians
    frog: ['frog', 'frogs'],
    turtle: ['turtle', 'turtles'],
    newt: ['newt', 'newts']
  };
  
  // **5. LIVE INDICATORS** (+20 points - explicit live animal signals)
  const liveIndicators = new Set([
    'live', 'baby', 'babies', 'juvenile', 'adult', 'male', 'female', 'pair',
    'hatchling', 'subadult', 'yearling', 'breeding', 'young', 'newborn', 'infant', 'fry'
  ]);
  
  // **6. MULTI-WORD PATTERNS** (+60 points - specific multi-word animal names)
  const multiWordPatterns: Record<string, string[]> = {
    // Tetras
    'neon-tetra': ['neon', 'tetra'],
    'cardinal-tetra': ['cardinal', 'tetra'],
    'black-tetra': ['black', 'tetra'],
    'serpae-tetra': ['serpae', 'tetra'],
    'glowlight-tetra': ['glowlight', 'tetra'],
    'ember-tetra': ['ember', 'tetra'],
    
    // Danios & Rasboras
    'zebra-danio': ['zebra', 'danio'],
    'leopard-danio': ['leopard', 'danio'],
    'harlequin-rasbora': ['harlequin', 'rasbora'],
    
    // Barbs
    'cherry-barb': ['cherry', 'barb'],
    'tiger-barb': ['tiger', 'barb'],
    
    // Loaches
    'clown-loach': ['clown', 'loach'],
    'kuhli-loach': ['kuhli', 'loach'],
    'yoyo-loach': ['yoyo', 'loach'],
    
    // Cichlids
    'german-ram': ['german', 'ram'],
    'electric-blue': ['electric', 'blue'],
    
    // Catfish
    'cory-cat': ['cory', 'cat'],
    
    // Reptiles
    'leopard-gecko': ['leopard', 'gecko'],
    'crested-gecko': ['crested', 'gecko'],
    'bearded-dragon': ['bearded', 'dragon'],
    'ball-python': ['ball', 'python'],
    'corn-snake': ['corn', 'snake'],
    'jackson-chameleon': ['jackson', 'chameleon'],
    
    // Amphibians
    'african-frog': ['african', 'frog'],
    'tree-frog': ['tree', 'frog'],
    
    // Small Animals
    'guinea-pig': ['guinea', 'pig']
  };
  
  // Calculate live animal score
  // Check specific species
  for (const [species, keywords] of Object.entries(specificSpecies)) {
    if (keywords.some(kw => wordSet.has(kw))) {
      liveScore += 80;
      detectedSpecies = species;
      detectedKeywords.push(keywords.find(kw => wordSet.has(kw)) || keywords[0]);
      break;
    }
  }
  
  // Check generic species
  if (!detectedSpecies) {
    for (const [species, keywords] of Object.entries(genericSpecies)) {
      if (keywords.some(kw => wordSet.has(kw))) {
        liveScore += 40;
        detectedSpecies = species;
        detectedKeywords.push(keywords.find(kw => wordSet.has(kw)) || keywords[0]);
        break;
      }
    }
  }
  
  // Check multi-word patterns
  for (const [patternName, patternWords] of Object.entries(multiWordPatterns)) {
    if (patternWords.every(w => wordSet.has(w))) {
      liveScore += 60;
      if (!detectedSpecies) {
        detectedSpecies = patternName.split('-')[1] || 'multiword';
        detectedKeywords.push(...patternWords);
      }
      break;
    }
  }
  
  // Check live indicators
  for (const indicator of liveIndicators) {
    if (wordSet.has(indicator)) {
      liveScore += 20;
      detectedKeywords.push(indicator);
      break;
    }
  }
  
  // **DECISION LOGIC**
  // Threshold: Need liveScore >= 60 to be considered a live animal
  // This means: specific species (80) OR generic species + live indicator (40+20=60) OR multi-word pattern (60)
  
  if (liveScore >= 60 && detectedSpecies && words.length <= 6) {
    return { isLiveAnimal: true, species: detectedSpecies, detectedKeywords };
  }
  
  // Default: Not a live animal
  return { isLiveAnimal: false, species: null, detectedKeywords: [] };
}
