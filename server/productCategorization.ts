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
 * Detects if a product name represents a live animal (should go to pets, not supplies)
 * @param itemName - Product name to check
 * @returns Object with isLiveAnimal boolean, species, and detected keywords
 */
export function detectLiveAnimal(itemName: string): {
  isLiveAnimal: boolean;
  species: string | null;
  detectedKeywords: string[];
} {
  const nameLower = itemName.toLowerCase();
  const detectedKeywords: string[] = [];
  let species: string | null = null;

  // **STEP 1: Check supply exclusions FIRST** - If it's clearly a supply, return immediately
  const supplyExclusions = [
    // Food & Nutrition
    'food', 'pellet', 'treat', 'bedding', 'flakes', 'wafer',
    'chip', 'pellets', 'block', 'stick', 'drops', 'powder',
    'vitamin', 'supplement', 'medicine', 'nutrition',
    
    // Housing & Accessories
    'cage', 'tank', 'aquarium', 'terrarium', 'habitat',
    'filter', 'heater', 'decoration', 'decor', 'toy', 'bowl', 'bottle',
    'substrate', 'collar', 'leash', 'harness', 'carrier', 'crate', 'brush',
    'shavings', 'litter', 'hay', 'straw',
    'pump', 'air pump', 'whisper', 'cave', 'shelter', 'hide',
    'light', 'lighting', 'bulb', 'lamp', 'uvb', 'basking',
    
    // Products & Kits
    'kit', 'starter', 'system', 'setup', 'complete', 'care',
    'conditioner', 'treatment', 'cleaner', 'remover', 'control',
    
    // Shampoos & Grooming
    'shampoo', 'spray', 'wipes', 'solution',
    
    // Brand/Product Names (when species names are used as brands)
    'safestart', 'safe start', 'aquasafe', 'bettasafe', 'aquacare',
    'complete care', 'ultimate', 'premium', 'professional', 'advanced',
    'shield', 'guard', 'protect', 'defense', 'max', 'plus', 'pro'
  ];

  const isSupply = supplyExclusions.some(exclusion => nameLower.includes(exclusion));
  
  if (isSupply) {
    // It's a supply - don't even check for animal keywords
    return {
      isLiveAnimal: false,
      species: null,
      detectedKeywords: []
    };
  }

  // **STEP 2: Check for explicit "live animal" indicators**
  const explicitLiveIndicators = [
    'live', 'feeder', 'baby', 'juvenile', 'adult',
    'male', 'female', 'pair', 'breeding', 'starter'
  ];

  const hasExplicitLiveIndicator = explicitLiveIndicators.some(indicator => 
    nameLower.includes(indicator)
  );

  // **STEP 3: Check animal keywords** - Only match if standalone or with live indicator
  const liveAnimalPatterns = {
    // Small Animals / Rodents - Use standalone word boundaries where possible
    mice: ['live mice', 'feeder mice', 'pinkie mice', 'fuzzy mice', 'hopper mice', 'mice'],
    hamster: ['hamster'],
    guineapig: ['guinea pig', 'guinea-pig', 'guineapig'],
    gerbil: ['gerbil'],
    chinchilla: ['chinchilla'],
    ferret: ['ferret'], // Will be validated as standalone by word count check
    rabbit: ['rabbit', 'bunny'], // Will be validated as standalone by word count check
    rat: ['live rat', 'feeder rat', 'rat'],
    
    // Fish (common species) - More specific patterns
    goldfish: ['goldfish', 'gold fish'],
    betta: ['betta fish', 'betta'],
    guppy: ['guppy', 'guppies'],
    molly: ['molly', 'mollies'],
    platy: ['platy', 'platies'],
    swordtail: ['swordtail', 'sword tail'],
    tetra: ['neon tetra', 'cardinal tetra', 'tetra'],
    angelfish: ['angelfish', 'angel fish'],
    gourami: ['gourami'],
    barb: ['tiger barb', 'cherry barb', 'barb'],
    danio: ['zebra danio', 'danio'],
    rasbora: ['rasbora'],
    loach: ['clown loach', 'kuhli loach', 'loach'],
    catfish: ['corydoras', 'cory', 'plecostomus', 'pleco', 'catfish'],
    cichlid: ['african cichlid', 'german blue ram', 'electric blue', 'cichlid'],
    discus: ['discus'],
    koi: ['koi'],
    
    // Reptiles
    gecko: ['leopard gecko', 'crested gecko', 'gecko'],
    beardeddragon: ['bearded dragon', 'beardie'],
    chameleon: ['veiled chameleon', 'panther chameleon', 'jackson chameleon', "jackson's chameleon", 'chameleon'],
    iguana: ['iguana'],
    snake: ['ball python', 'corn snake', 'king snake', 'snake'],
    turtle: ['turtle', 'tortoise'],
    frog: ['tree frog', 'frog'],
    salamander: ['salamander', 'newt'],
    
    // Birds
    parakeet: ['parakeet', 'budgie', 'budgerigar'],
    cockatiel: ['cockatiel'],
    canary: ['canary'],
    finch: ['finch'],
    parrot: ['parrot', 'macaw', 'conure']
  };

  // Check each pattern
  for (const [speciesKey, patterns] of Object.entries(liveAnimalPatterns)) {
    for (const pattern of patterns) {
      // Check if pattern exists in the name
      if (nameLower.includes(pattern)) {
        detectedKeywords.push(pattern);
        species = speciesKey;
        break;
      }
    }
    if (species) break; // Found a match, stop searching
  }

  // **STEP 4: Determine if it's a live animal**
  // Require EITHER:
  // - Explicit live indicator (e.g., "live goldfish", "feeder mice")
  // - OR animal keyword that matched AND name is reasonably short (≤5 words to allow for multi-word species names like "German Blue Ram Cichlid")
  const isReasonablyShortName = nameLower.split(' ').length <= 5;
  
  const isLiveAnimal = detectedKeywords.length > 0 && (
    hasExplicitLiveIndicator || isReasonablyShortName
  );

  return {
    isLiveAnimal,
    species: isLiveAnimal ? species : null,
    detectedKeywords
  };
}
