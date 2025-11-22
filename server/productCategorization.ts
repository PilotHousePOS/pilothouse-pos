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
 * Uses word-boundary matching and contextual scoring for robust detection
 * @param itemName - Product name to check
 * @returns Object with isLiveAnimal boolean, species, and detected keywords
 */
export function detectLiveAnimal(itemName: string): {
  isLiveAnimal: boolean;
  species: string | null;
  detectedKeywords: string[];
} {
  const nameLower = itemName.toLowerCase().trim();
  
  // Tokenize into words (handles hyphens, slashes, etc.)
  const words = nameLower.split(/[\s\-\/]+/).filter(w => w.length > 0);
  const wordSet = new Set(words);
  
  // **NEGATIVE SIGNALS**: Strong indicators this is a supply, not a live animal
  const supplyKeywords = new Set([
    // Food & Nutrition
    'food', 'foods', 'pellet', 'pellets', 'treat', 'treats', 'bedding', 'flakes', 'wafer', 'wafers',
    'chip', 'chips', 'block', 'stick', 'drops', 'powder', 'vitamin', 'vitamins', 'supplement', 'supplements', 'medicine', 'medicines',
    'hay', 'straw', 'litter', 'shavings',
    
    // Housing & Equipment
    'cage', 'cages', 'tank', 'tanks', 'aquarium', 'terrarium', 'habitat', 'filter', 'filters', 'heater', 'heaters', 'pump', 'pumps',
    'decoration', 'decorations', 'decor', 'toy', 'toys', 'bowl', 'bowls', 'bottle', 'bottles', 'substrate',
    'kit', 'kits', 'starter', 'starters', 'collar', 'collars', 'leash', 'harness', 'carrier', 'crate', 'brush', 'net',
    'ornament', 'ornaments', 'moss', 'hook', 'hooks', 'statue', 'statues', 'set', 'sets',
    
    // Products & Treatments
    'conditioner', 'treatment', 'treatments', 'cleaner', 'shampoo', 'spray', 'sprays', 'solution', 'solutions',
    'light', 'lights', 'lighting', 'bulb', 'bulbs', 'lamp', 'lamps', 'cave', 'caves', 'shelter', 'shelters', 'hide',
    'remover', 'control', 'system', 'systems', 'setup', 'setups', 'complete', 'care', 'decorative',
    'shed', 'shedding', 'aid', 'humidifier', 'training', 'trainer', 'perch', 'stand',
    
    // Merchandise & Product Types (comprehensive product noun taxonomy)
    'plush', 'stuffed', 'hoodie', 'shirt', 't-shirt', 'tshirt', 'tee', 'apparel', 'clothing',
    'keychain', 'poster', 'print', 'sticker', 'decal', 'magnet', 'mug', 'cup',
    'calendar', 'book', 'guide', 'magazine', 'journal', 'notebook',
    'hammock', 'blanket', 'towel', 'mat', 'pad', 'cushion',
    'charm', 'pendant', 'jewelry', 'necklace', 'bracelet',
    'figurine', 'model', 'replica', 'sculpture'
  ]);
  
  // Brand/product name words that indicate this is a supply product, not a live animal
  const brandProductWords = new Set([
    'buddy', 'guard', 'shield', 'safe', 'safestart', 'aquasafe', 'bettasafe',
    'bioscrub', 'bio', 'scrub', 'max', 'plus', 'pro', 'premium', 'ultimate'
  ]);
  
  // Check for supply keywords with word-boundary matching
  const hasSupplyKeyword = words.some(word => supplyKeywords.has(word));
  const hasBrandProductWord = words.some(word => brandProductWords.has(word));
  
  if (hasSupplyKeyword || hasBrandProductWord) {
    return { isLiveAnimal: false, species: null, detectedKeywords: [] };
  }
  
  // **POSITIVE SIGNALS**: Three-set taxonomy for robust detection
  
  // 1. Live indicators - explicit life stage, sex, and acquisition context
  const liveIndicators = new Set([
    'live', 'feeder', 'baby', 'babies', 'juvenile', 'juveniles', 'adult', 'adults',
    'hatchling', 'hatchlings', 'subadult', 'subadults', 'yearling', 'yearlings',
    'male', 'males', 'female', 'females', 'pair', 'pairs', 'breeding',
    'young', 'newborn', 'infant', 'fry', 'fingerling', 'tadpole', 'tadpoles'
  ]);
  
  // 2. Base species nouns - taxonomic/common names that can appear as trailing words
  const baseSpeciesNouns = new Set([
    // Fish
    'cichlid', 'cichlids', 'tetra', 'tetras', 'danio', 'danios', 'loach', 'loaches',
    'barb', 'barbs', 'gourami', 'gouramis', 'catfish', 'angelfish',
    // Reptiles
    'python', 'pythons', 'snake', 'snakes', 'gecko', 'geckos', 'dragon', 'dragons',
    'chameleon', 'chameleons', 'turtle', 'turtles', 'tortoise', 'tortoises',
    'lizard', 'lizards', 'frog', 'frogs', 'toad', 'toads',
    // Small animals
    'hamster', 'hamsters', 'gerbil', 'gerbils', 'mouse', 'mice', 'rat', 'rats',
    'rabbit', 'rabbits', 'guinea', 'pig', 'pigs', 'ferret', 'ferrets'
  ]);
  
  const hasLiveIndicator = words.some(word => liveIndicators.has(word));
  
  // **SPECIES DETECTION**: Check for animal species keywords with word-boundary matching
  const speciesPatterns: Record<string, string[]> = {
    // Small Animals
    mice: ['mice', 'mouse', 'pinkie', 'fuzzy', 'hopper'],
    hamster: ['hamster', 'hamsters'],
    guineapig: ['guinea', 'guineapig'],
    gerbil: ['gerbil', 'gerbils'],
    chinchilla: ['chinchilla', 'chinchillas'],
    ferret: ['ferret', 'ferrets'],
    rabbit: ['rabbit', 'rabbits', 'bunny', 'bunnies'],
    rat: ['rat', 'rats'],
    
    // Fish
    goldfish: ['goldfish'],
    betta: ['betta', 'bettas'],
    guppy: ['guppy', 'guppies'],
    molly: ['molly', 'mollies'],
    platy: ['platy', 'platies'],
    swordtail: ['swordtail', 'swordtails'],
    tetra: ['tetra', 'tetras'],
    angelfish: ['angelfish'],
    gourami: ['gourami', 'gouramis'],
    barb: ['barb', 'barbs'],
    danio: ['danio', 'danios'],
    rasbora: ['rasbora', 'rasboras'],
    loach: ['loach', 'loaches'],
    catfish: ['catfish', 'corydoras', 'cory', 'pleco', 'plecostomus'],
    cichlid: ['cichlid', 'cichlids'],
    discus: ['discus'],
    koi: ['koi'],
    
    // Reptiles
    gecko: ['gecko', 'geckos'],
    beardeddragon: ['beardie', 'bearded'],
    chameleon: ['chameleon', 'chameleons'],
    iguana: ['iguana', 'iguanas'],
    snake: ['snake', 'snakes'],
    turtle: ['turtle', 'turtles', 'tortoise', 'tortoises'],
    frog: ['frog', 'frogs'],
    salamander: ['salamander', 'salamanders', 'newt', 'newts'],
    
    // Birds
    parakeet: ['parakeet', 'parakeets', 'budgie', 'budgerigar'],
    cockatiel: ['cockatiel', 'cockatiels'],
    canary: ['canary', 'canaries'],
    finch: ['finch', 'finches'],
    parrot: ['parrot', 'parrots', 'macaw', 'conure']
  };
  
  // **EARLY CHECK FOR MULTI-WORD SPECIES PATTERNS** (for short names without single-word species keywords)
  // This handles cases like "Ball Python" where neither "ball" nor "python" are in species patterns
  if (words.length >= 2 && words.length <= 5) {
    const multiWordPatterns = [
      // Cichlids (various orderings)
      ['german', 'blue', 'ram'],
      ['blue', 'ram', 'cichlid'],
      ['ram', 'cichlid'],
      ['electric', 'blue'],
      
      // Other Fish
      ['neon', 'tetra'],
      ['cardinal', 'tetra'],
      ['zebra', 'danio'],
      ['clown', 'loach'],
      ['kuhli', 'loach'],
      
      // Reptiles
      ['leopard', 'gecko'],
      ['crested', 'gecko'],
      ['bearded', 'dragon'],
      ['jackson', 'chameleon'],
      ['veiled', 'chameleon'],
      ['panther', 'chameleon'],
      ['ball', 'python'],
      ['corn', 'snake'],
      ['king', 'snake'],
      
      // Small Animals & Amphibians
      ['guinea', 'pig'],
      ['tree', 'frog']
    ];
    
    // Map pattern to species for proper routing (COMPLETE MAPPING)
    const patternSpeciesMap: Record<string, string> = {
      // Reptiles
      'bearded-dragon': 'beardeddragon',
      'ball-python': 'snake',
      'corn-snake': 'snake',
      'king-snake': 'snake',
      'tree-frog': 'frog',
      'leopard-gecko': 'gecko',
      'crested-gecko': 'gecko',
      'jackson-chameleon': 'chameleon',
      'veiled-chameleon': 'chameleon',
      'panther-chameleon': 'chameleon',
      
      // Fish
      'neon-tetra': 'tetra',
      'cardinal-tetra': 'tetra',
      'zebra-danio': 'danio',
      'clown-loach': 'loach',
      'kuhli-loach': 'loach',
      'german-blue-ram': 'cichlid',
      'blue-ram-cichlid': 'cichlid',
      'ram-cichlid': 'cichlid',
      'electric-blue': 'cichlid',
      
      // Small Animals
      'guinea-pig': 'guineapig'
    };
    
    const matchedPattern = multiWordPatterns.find(pattern =>
      pattern.every(word => wordSet.has(word))
    );
    
    if (matchedPattern) {
      // **CRITICAL CHECK**: Verify remaining words are positive signals
      // Allowed: live indicators OR base species nouns (e.g., "Electric Blue Ram Cichlid")
      // Rejected: product nouns (e.g., "Corn Snake Deluxe")
      const patternSet = new Set(matchedPattern);
      const remainingWords = words.filter(word => 
        !patternSet.has(word) && 
        !liveIndicators.has(word) && 
        !baseSpeciesNouns.has(word)
      );
      
      // If there are remaining words that are NOT positive signals, this is likely a product
      if (remainingWords.length > 0) {
        // Fall through to single-word species check
      } else {
        // All words are either in the pattern, live indicators, or base species nouns → Live animal
        const patternKey = matchedPattern.join('-');
        const species = patternSpeciesMap[patternKey] || 'multiword';
        return { isLiveAnimal: true, species, detectedKeywords: matchedPattern };
      }
    }
  }
  
  // **SINGLE-WORD SPECIES KEYWORD CHECK**
  // Split species into SPECIFIC (safe to auto-approve) vs GENERIC (require live indicator or multi-word pattern)
  const specificSpeciesPatterns: Record<string, string[]> = {
    // These are VERY specific animal names - safe to auto-approve on simple names
    mice: ['mice', 'mouse', 'pinkie', 'fuzzy', 'hopper'],
    hamster: ['hamster', 'hamsters'],
    guineapig: ['guinea', 'guineapig'],
    gerbil: ['gerbil', 'gerbils'],
    chinchilla: ['chinchilla', 'chinchillas'],
    ferret: ['ferret', 'ferrets'],
    rabbit: ['rabbit', 'rabbits', 'bunny', 'bunnies'],
    goldfish: ['goldfish'],
    betta: ['betta', 'bettas']
  };
  
  const genericSpeciesPatterns: Record<string, string[]> = {
    // These are GENERIC - could appear in product names - require live indicator or multi-word pattern
    tetra: ['tetra', 'tetras'],
    gecko: ['gecko', 'geckos'],
    bearded: ['beardie', 'bearded'],
    chameleon: ['chameleon', 'chameleons'],
    iguana: ['iguana', 'iguanas'],
    snake: ['snake', 'snakes'],
    turtle: ['turtle', 'turtles', 'tortoise', 'tortoises'],
    frog: ['frog', 'frogs'],
    parrot: ['parrot', 'parrots'],
    cockatiel: ['cockatiel', 'cockatiels'],
    parakeet: ['parakeet', 'parakeets']
  };
  
  let detectedSpecies: string | null = null;
  const detectedKeywords: string[] = [];
  let isSpecificSpecies = false;
  
  // Check specific species first
  for (const [species, keywords] of Object.entries(specificSpeciesPatterns)) {
    for (const keyword of keywords) {
      if (wordSet.has(keyword)) {
        detectedKeywords.push(keyword);
        detectedSpecies = species;
        isSpecificSpecies = true;
        break;
      }
    }
    if (detectedSpecies) break;
  }
  
  // If no specific species, check generic species
  if (!detectedSpecies) {
    for (const [species, keywords] of Object.entries(genericSpeciesPatterns)) {
      for (const keyword of keywords) {
        if (wordSet.has(keyword)) {
          detectedKeywords.push(keyword);
          detectedSpecies = species;
          isSpecificSpecies = false;
          break;
        }
      }
      if (detectedSpecies) break;
    }
  }
  
  // No species keyword found
  if (!detectedSpecies) {
    return { isLiveAnimal: false, species: null, detectedKeywords: [] };
  }
  
  // **DECISION LOGIC**:
  // Case 1: Has explicit live indicator → Definitely a live animal
  if (hasLiveIndicator) {
    return { isLiveAnimal: true, species: detectedSpecies, detectedKeywords };
  }
  
  // Case 2: SPECIFIC species with simple name (≤3 words) → Live animal
  // Only SPECIFIC species can be auto-approved on word count alone
  if (isSpecificSpecies && words.length <= 3) {
    return { isLiveAnimal: true, species: detectedSpecies, detectedKeywords };
  }
  
  // Case 3: GENERIC species without live indicator → Reject (likely a product)
  // Generic species like "snake", "frog", "parrot" MUST have live indicator or multi-word pattern
  return { isLiveAnimal: false, species: null, detectedKeywords: [] };
}
