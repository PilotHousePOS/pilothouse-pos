/**
 * Brand Catalog Service
 * Provides validated, research-based abbreviation expansion for product names
 * 
 * IMPORTANT: This system replaces hard-coded guesswork with verified brand research.
 * All abbreviations must have evidence (URL, packaging photo, product line documentation).
 */

import type { IStorage } from './storage';
import type { BrandCatalogEntry } from '@shared/schema';

/**
 * Extracts the brand name from a product name string
 * Searches for brand tokens anywhere in the name, not just at the beginning
 * @param productName - Full product name (e.g., "3.5lb Science Diet Indoor" or "Freshpet Vit Gr")
 * @returns Brand name if found, null otherwise
 */
export function extractBrand(productName: string): string | null {
  if (!productName) return null;
  
  // Common pet brands to detect (ordered by priority/specificity)
  // Include alternate spellings and common variations
  // IMPORTANT: Brand name MUST match the catalog entries exactly
  // VERIFIED: All high-frequency brands from audit 2024-11-28
  const knownBrands = [
    // Food Brands
    { name: 'Science Diet', patterns: ['hill\'s science diet', 'science diet', 'sd'] },
    { name: 'Nutrisource', patterns: ['nutrisource', 'nutri source', 'nutr source'] },
    { name: 'Blue Buffalo', patterns: ['blue buffalo', 'bluebuffalo', 'blue buff', 'bb'] },
    { name: 'Taste of the Wild', patterns: ['taste of the wild', 'taste wild', 'tow'] },
    { name: 'Castor & Pollux', patterns: ['castor & pollux', 'castor and pollux'] },
    { name: 'Royal Canin', patterns: ['royal canin', 'royal can', 'rc'] },
    { name: 'Pro Plan', patterns: ['pro plan', 'proplan', 'pp'] },
    { name: 'Natural Balance', patterns: ['natural balance', 'nat balance', 'nb'] },
    { name: 'Rachael Ray', patterns: ['rachael ray'] },
    { name: 'Solid Gold', patterns: ['solid gold'] },
    { name: 'Fancy Feast', patterns: ['fancy feast'] },
    { name: 'Meow Mix', patterns: ['meow mix'] },
    { name: 'Kit & Kaboodle', patterns: ['kit & kaboodle', 'kit and kaboodle'] },
    { name: 'Special Kitty', patterns: ['special kitty'] },
    { name: 'Freshpet', patterns: ['freshpet', 'fresh pet'] },
    { name: 'Fromm', patterns: ['fromm'] },
    { name: 'Wellness', patterns: ['wellness'] },
    { name: 'Merrick', patterns: ['merrick'] },
    { name: 'Orijen', patterns: ['orijen'] },
    { name: 'Acana', patterns: ['acana'] },
    { name: 'Zignature', patterns: ['zignature', 'zign'] },
    { name: 'Canidae', patterns: ['canidae'] },
    { name: 'Instinct', patterns: ['instinct'] },
    { name: 'Earthborn', patterns: ['earthborn', 'earthborn holistic'] },
    { name: 'Nutro', patterns: ['nutro'] },
    { name: 'Eukanuba', patterns: ['eukanuba'] },
    { name: 'Diamond', patterns: ['diamond'] },
    { name: 'Bil-Jac', patterns: ['bil-jac', 'biljac'] },
    { name: 'Victor', patterns: ['victor'] },
    { name: 'Purina', patterns: ['purina'] },
    { name: 'Iams', patterns: ['iams'] },
    { name: 'Pedigree', patterns: ['pedigree'] },
    { name: 'Friskies', patterns: ['friskies'] },
    { name: 'Sheba', patterns: ['sheba'] },
    { name: 'Whiskas', patterns: ['whiskas'] },
    { name: 'Greenies', patterns: ['greenies'] },
    { name: 'Temptations', patterns: ['temptations'] },
    { name: 'Primal', patterns: ['primal'] },
    { name: 'Inaba', patterns: ['inaba', 'dashi cat', 'dasi cat', 'dashi delights'] },
    { name: 'Weruva', patterns: ['weruva', 'bff', 'b.f.f.', 'best feline friend'] },
    { name: 'Fussie Cat', patterns: ['fussie cat', 'fussie'] },
    { name: 'RedBarn', patterns: ['redbarn', 'red barn'] },
    
    // Toy & Accessory Brands
    { name: 'Kong', patterns: ['kong'] },
    { name: 'Nylabone', patterns: ['nylabone', 'nyla'] },
    { name: 'Benebone', patterns: ['benebone'] },
    { name: 'SmartBones', patterns: ['smartbones', 'smartbone'] },
    { name: 'Coastal', patterns: ['coastal'] },
    { name: 'Wolfgang', patterns: ['wolfgang', 'wlfgng'] },
    
    // Health & Supplements
    { name: 'Dogswell', patterns: ['dogswell'] },
    { name: 'Durvet', patterns: ['durvet'] },
    
    // Aquatic Brands (verified from filterConfig.ts + web search Nov 28, 2025)
    { name: 'Omega One', patterns: ['omega one'] },
    { name: 'Ocean Nutrition', patterns: ['ocean nutrition'] },
    { name: 'Hikari', patterns: ['hikari'] },
    { name: 'Tetra', patterns: ['tetra'] },
    { name: 'Aqueon', patterns: ['aqueon'] },
    { name: 'Marineland', patterns: ['marineland', 'marina'] },
    { name: 'API', patterns: ['api'] },
    { name: 'Fluval', patterns: ['fluval'] },
    { name: 'SeaChem', patterns: ['seachem'] },
    { name: 'GloFish', patterns: ['glofish'] },
    { name: 'Penn Plax', patterns: ['penn plax', 'penn-plax', 'pennplax', 'penn'] },
    { name: 'Cascade', patterns: ['cascade'] },
    { name: 'Aquatop', patterns: ['aquatop'] },
    { name: 'Aqualife', patterns: ['aqualife'] },
    
    // Reptile Brands (verified from filterConfig.ts)
    { name: 'Zoo Med', patterns: ['zoo med', 'zoomed'] },
    { name: 'Exo Terra', patterns: ['exo terra', 'exoterra'] },
    { name: 'Zilla', patterns: ['zilla'] },
    { name: 'Fluker\'s', patterns: ['fluker\'s', 'flukers', 'fluker'] },
    { name: 'ReptiCare', patterns: ['repticare', 'repti care'] },
    
    // Small Animal Brands
    { name: 'Kaytee', patterns: ['kaytee'] },
    { name: 'Oxbow', patterns: ['oxbow'] },
    { name: 'Li\'l Pals', patterns: ['li\'l pals', 'lilpals', 'lil pals'] },
    { name: 'Living World', patterns: ['living world'] },
    { name: 'Vitakraft', patterns: ['vitakraft'] },
    { name: 'Ware', patterns: ['ware'] },
    
    // Bird Brands (verified from web search Nov 28, 2025)
    { name: 'Birdlife', patterns: ['birdlife', 'bird life'] },
    { name: 'A&E Cage Co', patterns: ['a&e', 'a & e cage'] },
    { name: 'Prevue', patterns: ['prevue'] },
    { name: 'Vitapol', patterns: ['vitapol'] },
    
    // Health & Wellness (verified from web search Nov 28, 2025)
    { name: 'Skout\'s Honor', patterns: ['skout\'s honor', 'skouts honor', 'skoutshonor'] },
    { name: 'NaturVet', patterns: ['naturvet', 'natur vet'] },
    { name: 'Nature\'s Miracle', patterns: ['nature\'s miracle', 'natures miracle', 'naturesmiracle'] },
    { name: 'TropiClean', patterns: ['tropiclean', 'tropi clean'] },
    
    // Toys & Accessories (verified from web search Nov 28, 2025)
    { name: 'Tuffy', patterns: ['tuffy', 'tuffys'] },
    { name: 'JW Pet', patterns: ['jw pet', 'jw'] },
    { name: 'Rascals', patterns: ['rascals'] },
    { name: 'Playfuls', patterns: ['playfuls'] },
    
    // Collars & Leashes (verified from web search Nov 28, 2025)
    { name: 'Valhoma', patterns: ['valhoma'] },
    { name: 'Circle T', patterns: ['circle t', 'circle'] },
    { name: 'Lupine', patterns: ['lupine'] },
    
    // Cat Supplies (verified from web search Nov 28, 2025)
    { name: 'Catit', patterns: ['catit'] },
    { name: 'Intersand', patterns: ['intersand'] },
    { name: 'Petmate', patterns: ['petmate'] },
    { name: 'Van Ness', patterns: ['van ness', 'vanness'] },
    
    // Food & Treats (verified from web search Nov 28, 2025)
    { name: 'Vital Essentials', patterns: ['vital essentials', 'vital'] },
    { name: 'Euk', patterns: ['euk'] },
    
    // Grooming (verified from web search Nov 28, 2025)
    { name: 'Safari', patterns: ['safari'] },
    { name: 'FURminator', patterns: ['furminator'] },
    
    // Small Pet (additional brands)
    { name: 'Midwest', patterns: ['midwest'] },
    { name: 'Marshall', patterns: ['marshall', 'marshals'] },
    { name: 'Nation', patterns: ['nation'] },
    { name: 'Nibbles', patterns: ['nibbles'] },
    
    // Additional Verified Brands (Nov 28, 2025 - verified via web search)
    { name: 'Wee-Wee', patterns: ['wee-wee', 'weewee', 'wee wee'] },
    { name: 'Smokehouse', patterns: ['smokehouse', 'smkhouse'] },
    { name: 'Reptology', patterns: ['reptology', 'rept', 'repto'] },
    { name: 'Chuckit!', patterns: ['chuckit!', 'chuckit'] },
    { name: 'Four Paws', patterns: ['four paws', 'fourpaws'] },
    { name: 'Multipet', patterns: ['multipet', 'multi pet'] },
    { name: 'Bio Groom', patterns: ['bio groom', 'biogroom'] },
    { name: 'Turbo', patterns: ['turbo'] },
    { name: 'Quiet Time', patterns: ['quiet time', 'quiettime'] },
    { name: 'Spectrastone', patterns: ['spectrastone', 'spectra stone'] },
    { name: 'Komodo', patterns: ['komodo'] },
    { name: 'Pangea', patterns: ['pangea', 'galap'] },
    { name: 'Mammoth', patterns: ['mammoth'] },
    { name: 'Earthbath', patterns: ['earthbath'] },
    { name: 'ZippyPaws', patterns: ['zippy paws', 'zippypaws'] },
    { name: 'Weco', patterns: ['weco'] },
    { name: 'Zodiac', patterns: ['zodiac'] },
    { name: 'Thunder Shirt', patterns: ['thunder shirt', 'thundershirt'] },
    { name: 'JollyPet', patterns: ['jolly pet', 'jollypet'] },
    { name: 'Ranch Remedy', patterns: ['ranch remedy'] },
    { name: 'Bionic', patterns: ['bionic'] },
    { name: 'Replendish', patterns: ['replendish'] },
    { name: 'Pondmaster', patterns: ['pondmaster'] },
    { name: 'Forza', patterns: ['forza'] },
    { name: 'Higgins', patterns: ['higgins'] },
    { name: 'ZuPreem', patterns: ['zupreem'] },
    { name: 'VICTOR', patterns: ['victor', 'vict'] },
    { name: 'Petcrest', patterns: ['petcrest'] },
    { name: 'Tuesday\'s Natural Dog Company', patterns: ['tuesday\'s', 'tuesdays'] },
    { name: 'PetAg', patterns: ['petag', 'pet ag', 'fresh n clean', 'fresh \'n clean', 'freshnclean'] },
    { name: 'Beautifur', patterns: ['beautifur'] },
    { name: 'Kaylor', patterns: ['kaylor', 'sweet harvest', 'sweetharvest'] },
    { name: 'Outward Hound', patterns: ['outward hound', 'outwardhound'] },
    { name: 'PureBites', patterns: ['purebites', 'pure bites'] },
    { name: 'Himalayan', patterns: ['himalayan'] },
    { name: 'Health Extension', patterns: ['health extension', 'health exten'] },
    { name: 'Jones Natural Chews', patterns: ['jones', 'jones natural'] },
    { name: 'Banixx', patterns: ['banixx'] },
    { name: 'Cadet', patterns: ['cadet'] },
    { name: 'Pet Honesty', patterns: ['pet honesty', 'pethonesty'] },
    { name: 'Elanco', patterns: ['elanco', 'advantage'] },
    { name: 'Purina', patterns: ['purina', 'cat chow'] },
    { name: 'Inaba', patterns: ['inaba', 'churu', 'churo'] },
    { name: 'JUWEL', patterns: ['juwel', 'vision'] },
    { name: 'FurHaven', patterns: ['furhaven', 'fur haven'] },
    { name: 'Prevue Pet Products', patterns: ['prevue', 'birdie basics'] },
    { name: 'North States', patterns: ['north states', 'mypet'] },
    { name: 'Merrick', patterns: ['merrick', 'fresh kisses'] },
    { name: 'Hippie Hounds', patterns: ['hippie hounds', 'hippiehounds'] },
    { name: 'Goodwinol', patterns: ['goodwinol', 'vetrx'] },
    { name: 'Tomlyn', patterns: ['tomlyn'] },
    { name: 'BPV Environmental', patterns: ['bpv', 'fresh news', 'freshnews'] },
    { name: 'Multipet', patterns: ['multipet', 'lamb chop', 'lambchop'] },
    { name: 'Jazwares', patterns: ['jazwares', 'squishmallow', 'squishmallows'] },
    { name: 'Galapagos', patterns: ['galapagos', 'galopagoos'] },
    { name: 'Finley\'s', patterns: ['finley\'s', 'finleys'] },
    { name: 'Vitapol', patterns: ['vitapol', 'smackers'] },
    { name: 'The J.M. Smucker Company', patterns: ['milk bone', 'milkbone', 'milk-bone'] },
    { name: 'Scott Pet', patterns: ['scott pet', 'nutri chomps', 'nutrichomps'] },
    { name: 'Starmark', patterns: ['starmark'] },
    { name: 'Happy Dog of Cape Cod', patterns: ['happy dog', 'happydog'] },
    { name: 'Spectrum Brands', patterns: ['spectrum brands', 'nature\'s miracle', 'natures miracle'] },
    { name: 'Oxbow', patterns: ['oxbow', 'oxboy'] },
    { name: 'Ethical Products', patterns: ['ethical products', 'bam bone', 'bambone', 'bam-bone', 'bambne'] },
    { name: 'MidWest Homes for Pets', patterns: ['midwest', 'mid-west', 'skudo'] },
    
    // Misc Brands
    { name: 'Spot', patterns: ['spot'] },
    { name: 'Titan', patterns: ['titan'] },
    { name: 'Retro', patterns: ['retro'] },
    { name: 'SodaPup', patterns: ['sodapup', 'soda pup'] },
    { name: 'Bellabowl', patterns: ['bellabowl', 'bella bowl'] },
    { name: 'Pethouse', patterns: ['pethouse', 'pet house'] },
    { name: 'Sunburst', patterns: ['sunburst'] },
    { name: 'Wholesome', patterns: ['wholesome'] },
    { name: 'Adams', patterns: ['adams'] },
    { name: 'Happy', patterns: ['happy'] },
  ];
  
  const lowerName = productName.toLowerCase();
  
  // Search for brand patterns anywhere in the name (not just at start)
  for (const brand of knownBrands) {
    for (const pattern of brand.patterns) {
      // Use word boundary to match brand as a whole token
      const regex = new RegExp(`\\b${escapeRegex(pattern)}\\b`, 'i');
      if (regex.test(lowerName)) {
        return brand.name;
      }
    }
  }
  
  return null;
}

/**
 * Looks up an abbreviation in the brand catalog with context awareness
 * @param storage - Storage interface
 * @param brand - Brand name (e.g., "Freshpet")
 * @param abbreviation - Abbreviated text (e.g., "Vit Gr")
 * @returns Expansion if found in catalog, null otherwise
 */
export async function lookupBrandAbbreviation(
  storage: IStorage,
  brand: string,
  abbreviation: string
): Promise<string | null> {
  const entry = await storage.lookupAbbreviation(brand, abbreviation);
  return entry ? entry.expansion : null;
}

/**
 * Escapes special regex characters in a string
 * @param text - Text to escape
 * @returns Escaped text safe for use in RegExp
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a string is alphanumeric (safe for word boundaries)
 * @param text - Text to check
 * @returns true if alphanumeric, false if contains punctuation/special chars
 */
function isAlphanumeric(text: string): boolean {
  return /^[a-zA-Z0-9\s]+$/.test(text);
}

/**
 * Expands abbreviations in a product name using the brand catalog
 * Falls back to null if no catalog entry exists (preventing guesswork)
 * 
 * @param storage - Storage interface
 * @param productName - Full product name with abbreviations
 * @param productBrand - Optional explicit brand (if not, will extract from name)
 * @returns Expanded product name or original if no matches found
 */
export async function expandProductName(
  storage: IStorage,
  productName: string,
  productBrand?: string | null
): Promise<string> {
  if (!productName) return '';
  
  // Extract brand from product name if not provided
  const brand = productBrand || extractBrand(productName);
  if (!brand) {
    // No brand detected - can't do context-aware expansion
    return productName;
  }
  
  // Get all catalog entries for this brand
  const brandEntries = await storage.getBrandCatalogByBrand(brand);
  if (brandEntries.length === 0) {
    // No catalog entries for this brand yet
    return productName;
  }
  
  // Try to match and expand abbreviations
  let expandedName = productName;
  
  for (const entry of brandEntries) {
    // Escape regex special characters
    const escapedAbbrev = escapeRegex(entry.abbreviation);
    
    // Build regex pattern based on abbreviation type
    let regex: RegExp;
    
    if (isAlphanumeric(entry.abbreviation)) {
      // For alphanumeric abbreviations, use word boundaries but also handle trailing punctuation
      // Matches: "Vit Gr", "Vit Gr,", "Vit Gr.", "Vit Gr/"
      regex = new RegExp(`\\b${escapedAbbrev}\\b(?=[\\s,./;:!?)]|$)`, 'gi');
    } else {
      // For non-alphanumeric (e.g., "w/", "S/D"), match with space/boundary context
      // and also handle trailing punctuation
      regex = new RegExp(`(^|\\s)${escapedAbbrev}(?=[\\s,./;:!?)]|$)`, 'gi');
      expandedName = expandedName.replace(regex, `$1${entry.expansion}`);
      continue;
    }
    
    expandedName = expandedName.replace(regex, entry.expansion);
  }
  
  return expandedName;
}

/**
 * Validates if an abbreviation expansion is documented in the catalog
 * @param storage - Storage interface
 * @param brand - Brand name
 * @param abbreviation - Abbreviated text
 * @param expectedExpansion - What we think it should expand to
 * @returns true if catalog confirms this expansion, false otherwise
 */
export async function validateExpansion(
  storage: IStorage,
  brand: string,
  abbreviation: string,
  expectedExpansion: string
): Promise<boolean> {
  const entry = await storage.lookupAbbreviation(brand, abbreviation);
  if (!entry) return false;
  
  return entry.expansion.toLowerCase() === expectedExpansion.toLowerCase();
}

/**
 * Common dictionary words and product attributes that should not be flagged as abbreviations
 */
const KNOWN_WORDS = new Set([
  'grain', 'free', 'fresh', 'vital', 'pure', 'natural', 'organic', 'premium',
  'adult', 'puppy', 'kitten', 'senior', 'indoor', 'outdoor', 'small', 'large',
  'medium', 'chicken', 'beef', 'lamb', 'fish', 'salmon', 'turkey', 'duck',
  'venison', 'bison', 'pork', 'rabbit', 'quail', 'with', 'and', 'plus',
  'formula', 'recipe', 'food', 'treat', 'snack', 'chew', 'bite', 'meal',
  'stew', 'pate', 'shred', 'slice', 'chunk', 'gravy', 'broth', 'sauce',
  'dry', 'wet', 'canned', 'bag', 'can', 'pouch', 'tray', 'cup', 'bowl',
  'lb', 'oz', 'lbs', 'ounce', 'pound', 'gram', 'kg',
]);

/**
 * Suggests research needed for unknown abbreviations
 * Scans a product name and identifies abbreviations not in the catalog
 * Filters out common dictionary words to reduce false positives
 * 
 * @param storage - Storage interface
 * @param productName - Product name to analyze
 * @param productBrand - Brand of the product
 * @returns Array of potential abbreviations that need research
 */
export async function suggestResearch(
  storage: IStorage,
  productName: string,
  productBrand?: string | null
): Promise<string[]> {
  if (!productName) return [];
  
  const brand = productBrand || extractBrand(productName);
  if (!brand) return [];
  
  // Get catalog entries for this brand
  const brandEntries = await storage.getBrandCatalogByBrand(brand);
  const knownAbbreviations = new Set(brandEntries.map(e => e.abbreviation.toLowerCase()));
  
  // Find potential abbreviations
  const words = productName.split(/\s+/);
  const potentialAbbrevs: string[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lowerWord = word.toLowerCase();
    
    // Skip if too short or too long
    if (word.length < 2 || word.length > 10) continue;
    
    // Skip if it's all numbers or a weight/size indicator
    if (/^\d+$/.test(word) || /^\d+(\.\d+)?(lb|oz|kg|g)$/i.test(word)) continue;
    
    // Skip if it's a known dictionary word
    if (KNOWN_WORDS.has(lowerWord)) continue;
    
    // Skip if already in catalog
    if (knownAbbreviations.has(lowerWord)) continue;
    
    // Flag if it looks like an abbreviation:
    // 1. Has mixed case pattern (e.g., "GrainFree" or "Gr" or "Vit")
    // 2. Very short (2-4 chars) and not a common word
    // 3. Contains punctuation that might be abbreviation marker (e.g., "w/", "S/D")
    
    const hasMixedCase = /[A-Z]/.test(word) && /[a-z]/.test(word);
    const isVeryShort = word.length <= 4 && !KNOWN_WORDS.has(lowerWord);
    const hasPunctuation = /[\/\-\.\&]/.test(word);
    const highConsonantRatio = word.replace(/[aeiou]/gi, '').length / word.length > 0.7;
    
    if (hasMixedCase || isVeryShort || hasPunctuation || (highConsonantRatio && word.length <= 6)) {
      potentialAbbrevs.push(word);
    }
    
    // Also check two-word combinations (e.g., "Grain Free" might be abbreviated as "Gr Fr")
    if (i < words.length - 1) {
      const nextWord = words[i + 1];
      const twoWord = `${word} ${nextWord}`;
      if (!knownAbbreviations.has(twoWord.toLowerCase()) && 
          (word.length <= 6 && nextWord.length <= 6)) {
        potentialAbbrevs.push(twoWord);
      }
    }
  }
  
  return Array.from(new Set(potentialAbbrevs));
}

/**
 * Bulk expand product names using the brand catalog
 * More efficient than calling expandProductName individually
 * 
 * @param storage - Storage interface
 * @param products - Array of {name, brand} objects
 * @returns Array of expanded product names
 */
export async function bulkExpandProducts(
  storage: IStorage,
  products: Array<{ name: string; brand?: string | null }>
): Promise<string[]> {
  // Get all brand catalog entries at once
  const allEntries = await storage.getAllBrandCatalogEntries();
  
  // Group by brand for efficient lookup
  const entriesByBrand = new Map<string, BrandCatalogEntry[]>();
  for (const entry of allEntries) {
    const brand = entry.brand.toLowerCase();
    if (!entriesByBrand.has(brand)) {
      entriesByBrand.set(brand, []);
    }
    entriesByBrand.get(brand)!.push(entry);
  }
  
  // Expand each product
  return products.map(product => {
    const brand = (product.brand || extractBrand(product.name))?.toLowerCase();
    if (!brand) return product.name;
    
    const brandEntries = entriesByBrand.get(brand);
    if (!brandEntries || brandEntries.length === 0) return product.name;
    
    let expandedName = product.name;
    for (const entry of brandEntries) {
      // Escape regex special characters
      const escapedAbbrev = escapeRegex(entry.abbreviation);
      
      // Build regex pattern based on abbreviation type
      let regex: RegExp;
      
      if (isAlphanumeric(entry.abbreviation)) {
        // For alphanumeric abbreviations, use word boundaries but also handle trailing punctuation
        regex = new RegExp(`\\b${escapedAbbrev}\\b(?=[\\s,./;:!?)]|$)`, 'gi');
      } else {
        // For non-alphanumeric, match with space/boundary context and trailing punctuation
        regex = new RegExp(`(^|\\s)${escapedAbbrev}(?=[\\s,./;:!?)]|$)`, 'gi');
        expandedName = expandedName.replace(regex, `$1${entry.expansion}`);
        continue;
      }
      
      expandedName = expandedName.replace(regex, entry.expansion);
    }
    
    return expandedName;
  });
}
