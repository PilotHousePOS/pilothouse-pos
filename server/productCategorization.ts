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

/**
 * Robust brand matching utility that checks BOTH the brand field AND product name
 * Many products have empty brand fields but the brand appears in the product name
 * @param productBrand - The brand field from the product (may be empty)
 * @param productName - The product name (often contains brand)
 * @param targetBrand - The brand we're looking for
 * @returns true if the brand is found in either field
 */
function matchesBrand(productBrand: string, productName: string, targetBrand: string): boolean {
  const normalizedTarget = normalizeBrand(targetBrand);
  const normalizedBrand = normalizeBrand(productBrand);
  const normalizedName = productName.toLowerCase();
  
  // Check brand field (normalized comparison)
  if (normalizedBrand.includes(normalizedTarget)) {
    return true;
  }
  
  // Check product name (case-insensitive, handle multi-word brands)
  const targetLower = targetBrand.toLowerCase();
  if (normalizedName.includes(targetLower)) {
    return true;
  }
  
  return false;
}

export function categorizeProduct(product: Pick<Supply, 'name' | 'brand' | 'description'>): CategorizationResult {
  const name = (product.name || '').toLowerCase();
  const brand = normalizeBrand(product.brand || '');
  const rawBrand = product.brand || '';
  const rawName = product.name || '';
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

  // Check if product matches any includeBrands for each category
  // We'll use these to give brand points later, but only if not excluded
  let matchesAquaticIncludeBrand = false;
  let matchesReptileIncludeBrand = false;
  let matchesSmallAnimalIncludeBrand = false;
  
  for (const includeBrand of SUPPLY_FILTERS.aquatic.includeBrands) {
    if (matchesBrand(rawBrand, rawName, includeBrand)) {
      matchesAquaticIncludeBrand = true;
      break;
    }
  }
  for (const includeBrand of SUPPLY_FILTERS.reptile.includeBrands) {
    if (matchesBrand(rawBrand, rawName, includeBrand)) {
      matchesReptileIncludeBrand = true;
      break;
    }
  }
  for (const includeBrand of SUPPLY_FILTERS.smallanimal.includeBrands) {
    if (matchesBrand(rawBrand, rawName, includeBrand)) {
      matchesSmallAnimalIncludeBrand = true;
      break;
    }
  }

  // Check brand exclusions first - MORE SPECIFIC excludeBrands should take priority over LESS SPECIFIC includeBrands
  // Example: "Tetra Fauna" in excludeBrands should block "Tetra" includeBrand scoring
  // However, if a product matches an includeBrand for its OWN category, don't exclude from that category
  // Example: "Tetra Fauna" matches reptile includeBrand, so don't exclude from reptile even if "Tetra" is in reptile excludeBrands
  for (const excludeBrand of SUPPLY_FILTERS.aquatic.excludeBrands) {
    if (matchesBrand(rawBrand, rawName, excludeBrand)) {
      brandExcludedFromAquatic = true;
      matchedReasons.push(`Brand excluded from aquatic: ${excludeBrand}`);
      break;
    }
  }

  // For reptile exclusions, skip if product matches a reptile includeBrand (allows Tetra Fauna to score reptile)
  if (!matchesReptileIncludeBrand) {
    for (const excludeBrand of SUPPLY_FILTERS.reptile.excludeBrands) {
      if (matchesBrand(rawBrand, rawName, excludeBrand)) {
        brandExcludedFromReptile = true;
        matchedReasons.push(`Brand excluded from reptile: ${excludeBrand}`);
        break;
      }
    }
  }

  // For small animal exclusions, skip if product matches a small animal includeBrand
  if (!matchesSmallAnimalIncludeBrand) {
    for (const excludeBrand of SUPPLY_FILTERS.smallanimal.excludeBrands) {
      if (matchesBrand(rawBrand, rawName, excludeBrand)) {
        brandExcludedFromSmallAnimal = true;
        matchedReasons.push(`Brand excluded from small animal: ${excludeBrand}`);
        break;
      }
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

  // Helper function for word-boundary keyword matching (prevents "uva" matching in "fluval")
  const matchesKeyword = (text: string, keyword: string): boolean => {
    const lowerKeyword = keyword.toLowerCase();
    // For short keywords (3 chars or less), require word boundaries
    if (lowerKeyword.length <= 3) {
      const regex = new RegExp(`\\b${lowerKeyword}\\b`, 'i');
      return regex.test(text);
    }
    // For longer keywords, simple includes is fine
    return text.includes(lowerKeyword);
  };

  // Check if brand is a cross-category brand (in ANY category's includeBrands)
  // Cross-category brands like API make products for multiple categories (aquatic AND reptile)
  // For these brands, keywords should decide the category, not brand exclusions
  // Pure dog food brands like Zignature are NOT in any includeBrands, so brand exclusions block keywords
  const isCrossCategoryBrand = 
    SUPPLY_FILTERS.aquatic.includeBrands.some(b => matchesBrand(rawBrand, rawName, b)) ||
    SUPPLY_FILTERS.reptile.includeBrands.some(b => matchesBrand(rawBrand, rawName, b)) ||
    SUPPLY_FILTERS.smallanimal.includeBrands.some(b => matchesBrand(rawBrand, rawName, b));

  // Check aquatic keywords in name (highest priority - 60 points)
  // Blocked by keyword exclusions AND brand exclusions (unless it's a cross-category brand)
  if (!keywordExcludedFromAquatic && (!brandExcludedFromAquatic || isCrossCategoryBrand)) {
    for (const keyword of SUPPLY_FILTERS.aquatic.includeKeywords) {
      if (matchesKeyword(name, keyword)) {
        aquaticScore += 60;
        matchedReasons.push(`Aquatic keyword: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check reptile keywords in name (highest priority - 60 points)
  // Cross-category brands like API (in aquatic includeBrands) can score reptile via "turtle" keyword
  if (!keywordExcludedFromReptile && (!brandExcludedFromReptile || isCrossCategoryBrand)) {
    for (const keyword of SUPPLY_FILTERS.reptile.includeKeywords) {
      if (matchesKeyword(name, keyword)) {
        reptileScore += 60;
        matchedReasons.push(`Reptile keyword: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check small animal keywords in name (highest priority - 60 points)
  if (!keywordExcludedFromSmallAnimal && (!brandExcludedFromSmallAnimal || isCrossCategoryBrand)) {
    for (const keyword of SUPPLY_FILTERS.smallanimal.includeKeywords) {
      if (matchesKeyword(name, keyword)) {
        smallAnimalScore += 60;
        matchedReasons.push(`Small animal keyword: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check aquatic brands (40 points) - blocked by BRAND exclusions AND KEYWORD exclusions
  // If a product contains an excluded keyword (e.g., "turtle"), it shouldn't get aquatic brand points
  // Example: "Api Turtle Water Conditioner" - API is aquatic brand, but "turtle" keyword blocks it
  if (!brandExcludedFromAquatic && !keywordExcludedFromAquatic) {
    for (const aquaticBrand of SUPPLY_FILTERS.aquatic.includeBrands) {
      if (matchesBrand(rawBrand, rawName, aquaticBrand)) {
        aquaticScore += 40;
        matchedReasons.push(`Aquatic brand: ${aquaticBrand}`);
        break;
      }
    }
  }

  // Check reptile brands (40 points) - blocked by BRAND exclusions AND KEYWORD exclusions
  // If a product contains an excluded keyword (e.g., "fish"), it shouldn't get reptile brand points
  if (!brandExcludedFromReptile && !keywordExcludedFromReptile) {
    for (const reptileBrand of SUPPLY_FILTERS.reptile.includeBrands) {
      if (matchesBrand(rawBrand, rawName, reptileBrand)) {
        reptileScore += 40;
        matchedReasons.push(`Reptile brand: ${reptileBrand}`);
        break;
      }
    }
  }

  // Check small animal brands (40 points) - blocked by BRAND exclusions AND KEYWORD exclusions
  // If a product contains an excluded keyword (e.g., "fish"), it shouldn't get small animal brand points
  if (!brandExcludedFromSmallAnimal && !keywordExcludedFromSmallAnimal) {
    for (const smallAnimalBrand of SUPPLY_FILTERS.smallanimal.includeBrands) {
      if (matchesBrand(rawBrand, rawName, smallAnimalBrand)) {
        smallAnimalScore += 40;
        matchedReasons.push(`Small animal brand: ${smallAnimalBrand}`);
        break;
      }
    }
  }

  // Special rule: "bridge" products go to aquatics UNLESS excluded
  // Exclude: bird brands, terrarium brands, lizard products
  if (name.includes('bridge')) {
    // Bird brands that make bridge toys for birds
    const birdBrands = ['happy beaks', 'a&e', 'a & e', 'birdie', 'prevue'];
    const isBirdProduct = birdBrands.some(b => name.includes(b) || rawName.toLowerCase().includes(b));
    
    // Terrarium brands that make flexible bridges for reptiles
    const terrariumBrands = ['galap', 'galapagos', 'exo terra', 'exoterra', 'zilla'];
    const isTerrarium = terrariumBrands.some(b => name.includes(b) || rawName.toLowerCase().includes(b));
    
    // Check if "lizard" appears within 20 characters of "bridge"
    const bridgeIndex = name.indexOf('bridge');
    const searchStart = Math.max(0, bridgeIndex - 20);
    const searchEnd = Math.min(name.length, bridgeIndex + 26);
    const nearbyText = name.substring(searchStart, searchEnd);
    const hasLizard = nearbyText.includes('lizard');
    
    if (isBirdProduct) {
      matchedReasons.push('Bridge excluded: bird brand product');
    } else if (isTerrarium) {
      matchedReasons.push('Bridge excluded: terrarium brand product');
    } else if (hasLizard) {
      matchedReasons.push('Bridge with "lizard" - skipping aquatic rule');
    } else {
      // It's an aquarium bridge decoration
      aquaticScore += 30;
      matchedReasons.push('Bridge (aquarium) name');
    }
  }

  // Check aquatic keywords in description (medium priority - 15 points)
  // Blocked by BOTH keyword exclusions AND brand exclusions
  if (!keywordExcludedFromAquatic && !brandExcludedFromAquatic) {
    for (const keyword of SUPPLY_FILTERS.aquatic.includeKeywords) {
      if (description.includes(keyword.toLowerCase())) {
        aquaticScore += 15;
        matchedReasons.push(`Aquatic description: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check reptile keywords in description (medium priority - 15 points)
  // Blocked by BOTH keyword exclusions AND brand exclusions
  if (!keywordExcludedFromReptile && !brandExcludedFromReptile) {
    for (const keyword of SUPPLY_FILTERS.reptile.includeKeywords) {
      if (description.includes(keyword.toLowerCase())) {
        reptileScore += 15;
        matchedReasons.push(`Reptile description: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check small animal keywords in description (medium priority - 15 points)
  // Blocked by BOTH keyword exclusions AND brand exclusions
  if (!keywordExcludedFromSmallAnimal && !brandExcludedFromSmallAnimal) {
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
  
  // **EARLY REJECTION: Check for multi-pack patterns** (e.g., "3pk", "12 pack", "variety pack")
  // These patterns indicate bundled products, not live animals
  const multiPackPatterns = [
    /\d+\s*pk\b/i,        // Matches: 3pk, 12pk, 3 pk
    /\d+\s*pack\b/i,      // Matches: 3pack, 12 pack
    /\d+\s*ct\b/i,        // Matches: 6ct, 12 ct (count)
    /\d+\s*count\b/i,     // Matches: 6 count
    /variety\s*pack/i,    // Matches: variety pack
    /value\s*pack/i,      // Matches: value pack
    /combo\s*pack/i,      // Matches: combo pack
    /starter\s*kit/i,     // Matches: starter kit
  ];
  
  if (multiPackPatterns.some(pattern => pattern.test(normalized))) {
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
    'vibrance', 'crisp', 'crisps', 'lovelies',
    'skull', 'gazer', 'squeak', 'dura', 'fused', 'mammoth', 'squeaker',
    'whisp', 'whisper', 'filt', 'cartridge', 'crt', 'crb', 'carbon', 'biobag', 'ex20', 'ex30', 'ex45', 'ex70',
    'pump550', 'pump1000', 'pond', 'whsip',
    'swimming', 'baby', 'family', '&fam',
    // Food flavors and product types - strong supply indicators
    // Note: 'cherry' is excluded because "Cherry Red Shrimp" and "Cherry Barb" are real fish/shrimp names
    'tropical', 'blueberry', 'strawberry', 'banana', 'mango', 'watermelon', 'plum', 'apple', 'grape',
    // Note: 'shrimp' excluded because "Cherry Red Shrimp", "Amano Shrimp" are real shrimp names
    'chicken', 'beef', 'salmon', 'tuna', 'liver', 'bacon', 'peanut', 'butter',
    'can', 'cans', 'canned', 'jar', 'jars', 'tube', 'tubes', 'pouch', 'pouches', 'refill', 'refills',
    'feeder', 'feeders', 'feeding', 'fed', 'freeze', 'dried', 'frozen', 'live',
    // Product identifier patterns
    'repashy', 'biothane', 'fauna', 'whis', 'whisper', 'repti', 'reptihab', 'reptisafe'
  ]);
  
  // **2. SUPPLY BRANDS** (-100 points each - very strong negative signal)
  // These brands are checked anywhere in the name
  const supplyBrands = new Set([
    'api', 'aqueon', 'marineland', 'fluval', 'seachem', 'hikari', 'omega', 'aquaclear', 'penn', 'plax', 'imagitarium',
    'zoomed', 'exoterra', 'zilla', 'flukers', 'repticare',
    'kaytee', 'oxbow', 'vitakraft', 'sunseed', 'higgins',
    'marshall', 'marshalls', 'oasis', 'vitaless',
    'kong', 'nylabone', 'chuckit', 'spot', 'spt', 'turbo', 'ethical', 'zippypaws', 'tuffy',
    'buddy', 'guard', 'shield', 'safe', 'safestart', 'aquasafe', 'bettasafe',
    'bioscrub', 'bio', 'scrub', 'max', 'plus', 'pro', 'premium', 'ultimate', 'activ',
    'friends', 'farm', 'barbie', 'barbies', 'spongebob', 'frozen', 'dory',
    // Additional major pet supply brands
    'tetrafauna', 'tetramin', 'tetrapro',
    'repashy', 'mazuri', 'purina', 'iams', 'eukanuba', 'royal', 'canin',
    'nutro', 'wellness', 'merrick', 'orijen', 'acana',
    'fromm', 'science', 'hills', 'proplan', 'beneful', 'pedigree', 'cesar'
  ]);
  
  // **2b. POSITION-SENSITIVE BRANDS** - Only reject if brand appears at BEGINNING of name
  // These could be confused with species names when appearing later in the name
  // e.g., "Tetra Whisper Filter" (brand) vs "Neon Tetra Reg" (species)
  // e.g., "Zoo Med Crested Gecko Food" (brand) vs actual crested gecko
  const firstWordBrands = new Set(['tetra', 'zoo', 'med', 'blue', 'buffalo', 'taste', 'wild', 'fancy', 'feast']);
  
  // Calculate supply score
  for (const word of words) {
    if (supplyKeywords.has(word)) supplyScore -= 100;
    if (supplyBrands.has(word)) supplyScore -= 100;
  }
  
  // Check if first word is a position-sensitive brand
  if (words.length > 0 && firstWordBrands.has(words[0])) {
    supplyScore -= 100;
  }
  // Also check first two words for "Zoo Med" pattern
  if (words.length >= 2 && words[0] === 'zoo' && words[1] === 'med') {
    supplyScore -= 200; // Very strong signal - definitely Zoo Med brand
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
    'hatchling', 'subadult', 'yearling', 'breeding', 'young', 'newborn', 'infant', 'fry',
    'reg', 'regular', 'small', 'medium', 'large', 'xlarge', 'assorted'
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
  const liveIndicatorsArray = Array.from(liveIndicators);
  for (const indicator of liveIndicatorsArray) {
    if (wordSet.has(indicator)) {
      liveScore += 20;
      detectedKeywords.push(indicator);
      break;
    }
  }
  
  // **SPECIAL CASE: Feeder fish** - "Feeder Rosy Red" pattern
  // These are live fish being sold as feeders
  if (normalized.includes('feeder rosy') || normalized.includes('rosy red')) {
    liveScore += 80;
    detectedSpecies = 'feederfish';
    detectedKeywords.push('feeder', 'rosy red');
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

/**
 * Standardize product names by fixing common spelling errors and expanding abbreviations
 * This should be called during import/auto-categorization to ensure data quality
 */
export function standardizeProductName(name: string): string {
  let result = name;
  
  // Fix spelling errors
  const spellingFixes: Record<string, string> = {
    'Gourment': 'Gourmet',
    'gourment': 'gourmet',
    'Enviroment': 'Environment',
    'enviroment': 'environment',
    'Enviromental': 'Environmental',
    'enviromental': 'environmental',
    'Cannibas': 'Cannabis',
    'cannibas': 'cannabis',
    'Naturalisic': 'Naturalistic',
    'naturalisic': 'naturalistic',
    'Palidirum': 'Paludarium',
    'palidirum': 'paludarium',
    'Mediterranin': 'Mediterranean',
    'mediterranin': 'mediterranean',
    ' Steal ': ' Steel ',
    'Galaop.': 'Galapagos',
    'galaop.': 'galapagos',
  };
  
  for (const [wrong, correct] of Object.entries(spellingFixes)) {
    result = result.replace(new RegExp(wrong, 'g'), correct);
  }
  
  // Expand abbreviations (with periods that indicate abbreviation)
  const abbreviations: Record<string, string> = {
    'Juv.': 'Juvenile',
    'juv.': 'juvenile',
    'Small.': 'Small',
    'small.': 'small',
    'Medium.': 'Medium',
    'medium.': 'medium',
    'Large.': 'Large',
    'large.': 'large',
    'Tropical.': 'Tropical',
    'tropical.': 'tropical',
    'Desert.': 'Desert',
    'desert.': 'desert',
    'Galap.': 'Galapagos',
    'galap.': 'galapagos',
    'Sub.': 'Substrate',
    'sub.': 'substrate',
    'Ass.': 'Assorted',
    'ass.': 'assorted',
    'Assort.': 'Assorted',
    'assort.': 'assorted',
    'Comfrt.': 'Comfort',
    'comfrt.': 'comfort',
    'Adv.': 'Advanced',
    'adv.': 'advanced',
    'Rept.': 'Reptile',
    'rept.': 'reptile',
    'Sys.': 'System',
    'sys.': 'system',
    'Repto.': 'Reptology',
    'repto.': 'reptology',
    'Cartridge.': 'Cartridge',
    'cartridge.': 'cartridge',
    '16ct.': '16 Count',
    'Spec.': 'Special',
    'spec.': 'special',
    'Unsc.': 'Unscented',
    'unsc.': 'unscented',
    'Vegetable.': 'Vegetable',
    'vegetable.': 'vegetable',
    'Original.': 'Original',
    'original.': 'original',
    'Replacement.': 'Replacement',
    'replacement.': 'replacement',
    'Regular.': 'Regular',
    'regular.': 'regular',
    'Orange.': 'Orange',
    'orange.': 'orange',
    'Com Fl.': 'Compact Fluorescent',
    'Com. Fl.': 'Compact Fluorescent',
    'Envi.': 'Environment',
    'envi.': 'environment',
    '16 Oz.': '16oz',
  };
  
  for (const [abbrev, expanded] of Object.entries(abbreviations)) {
    result = result.replace(new RegExp(abbrev.replace('.', '\\.'), 'g'), expanded);
  }
  
  // Expand common abbreviations without periods
  const noPeriodsAbbreviations: Record<string, string> = {
    'Xlrg': 'XLarge',
    'xlrg': 'xlarge',
    'Blck': 'Black',
    'blck': 'black',
    'Gloplnt': 'GloPlant',
    'gloplnt': 'gloplant',
    'Frzn': 'Frozen',
    'frzn': 'frozen',
    'Rcky Moun': 'Rocky Mountain',
    'rcky moun': 'rocky mountain',
    'Vitaless': 'Vital Essentials',
    'vitaless': 'vital essentials',
  };
  
  // Expand prefix abbreviations (at start of name)
  if (result.startsWith('Mw ')) {
    result = 'MidWest ' + result.substring(3);
  }
  if (result.startsWith('Pc ')) {
    result = 'PetCrest ' + result.substring(3);
  }
  
  for (const [abbrev, expanded] of Object.entries(noPeriodsAbbreviations)) {
    result = result.replace(new RegExp(`\\b${abbrev}\\b`, 'g'), expanded);
  }
  
  return result;
}

/**
 * Standardize brand names to ensure consistency
 * This should be called during import/auto-categorization
 */
export function standardizeBrandName(brand: string): string {
  if (!brand) return brand;
  
  const brandMappings: Record<string, string> = {
    'Penn Plax': 'Penn-Plax',
    'ZooMed': 'Zoo Med',
    'Tropiclean': 'TropiClean',
    'Coastal Pet': 'Coastal',
    'Bio-Groom': 'Bio Groom',
    'Prevue Pet Products': 'Prevue',
    'Mammoth Pet Products': 'Mammoth',
    "Lee's Aquarium & Pet Products": "Lee's",
    'Victor': 'VICTOR',
    'Galápagos': 'Galapagos',
    'JollyPet': 'Jolly Pets',
    'MidWest Homes for Pets': 'MidWest Homes For Pets',
    'Midwest': 'MidWest Homes For Pets',
    'Precision Pet': 'PetCrest',
  };
  
  return brandMappings[brand] || brand;
}
