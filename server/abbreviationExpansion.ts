/**
 * Smart abbreviation expansion system for product names and descriptions
 * Priority: Brand catalog (research-backed) > Generic abbreviations (fallback)
 * Handles context-aware expansion (e.g., "Ph" can be pH or Prevue Hendrix)
 */

import type { IStorage } from './storage';
import { expandProductName } from './brandCatalog';

// Water chemistry keywords that indicate "Ph" means pH (water acidity), not Prevue Hendrix
const PH_CHEMISTRY_KEYWORDS = [
  'test', 'kit', 'down', 'up', 'balance', 'adjust', 'strip', 'meter',
  'buffer', 'calibration', 'probe', 'monitor', 'controller'
];

// Water chemistry brands that use "Ph" for pH
const PH_CHEMISTRY_BRANDS = [
  'api', 'aqueon', 'fluval', 'seachem', 'marineland', 'tetra'
];

// Aquarium keywords that indicate "Ga" means Gallon (volume measurement)
const GALLON_AQUARIUM_KEYWORDS = [
  'tank', 'aquarium', 'filter', 'heater', 'pump', 'canister', 'terrarium',
  'sump', 'refugium', 'overflow', 'water', 'kit', 'setup', 'system'
];

// Aquarium brands that commonly use "Ga" for Gallon measurements
const GALLON_AQUARIUM_BRANDS = [
  'aqueon', 'marineland', 'fluval', 'tetra', 'api', 'penn plax', 'pennplax',
  'zoo med', 'zilla', 'exo terra', 'glofish'
];

/**
 * Main abbreviation mappings
 * Key: abbreviation (case-insensitive match)
 * Value: full expansion
 */
const ABBREVIATION_MAPPINGS: Record<string, string> = {
  // Size abbreviations
  'Lg': 'Large',
  'Med': 'Medium',
  'Md': 'Medium',
  'Sm': 'Small',
  'Min': 'Mini',
  'Xlg': 'Extra Large',
  'Xl': 'Extra Large',
  'Xxl': 'Extra Extra Large',
  'Xs': 'Extra Small',
  'Xsm': 'Extra Small',
  'Jum': 'Jumbo',
  
  // Material/Quality
  'Hvy': 'Heavy',
  'Dty': 'Duty',
  'Lt': 'Light',
  'Dk': 'Dark',
  'Bk': 'Black',
  'Rd': 'Red',
  
  // Comfort/General
  'Cmfrt': 'Comfort',
  'Nat': 'Natural',
  'Natu': 'Natural',
  'Natl': 'Natural',
  'Rwrds': 'Rewards',
  'Essen': 'Essentials',
  
  // Quantity
  'Pk': 'Pack',
  'Dbl': 'Double',
  'Sngl': 'Single',
  'Asst': 'Assorted',
  
  // Age/Demographics
  'Jr': 'Junior',
  'Sr': 'Senior',
  'Juvi': 'Juvenile',
  
  // Animals
  'Eleph': 'Elephant',
  'Shri': 'Shrimp',
  
  // Chemistry (non-context dependent)
  'Phos': 'Phosphate',
  
  // Common misspellings
  'Thermoneter': 'Thermometer',
  'Greeniues': 'Greenies',
  'Wishbne': 'Wishbone',
  
  // Food/Flavors
  'Blubrede': 'Blueberry',
  'White Gr': 'With Grain',
  'Red B': 'RedBarn',
  'Waf': 'Waffer',
  'Blo': 'Blood',
  'Cmbs': 'Crumbs',
  'Chckwcheese': 'Chicken With Cheese',
  'Whslm': 'Wholesome',
  'Whlsm': 'Wholesome',
  'Wholso': 'Wholesome',
  'Wholeso': 'Wholesome',
  'Forti': 'Fortified',
  'Bis': 'Bison',
  'Bore': 'Boar',
  'Ck': 'Chicken',
  'Chkn': 'Chicken',
  'Bcn': 'Bacon',
  'Pb': 'Peanut Butter',
  'Bne': 'Bone',
  'Tur': 'Turkey',
  'Ven': 'Venison',
  'Be': 'Beef',
  'Bef': 'Beef',
  'Veg': 'Vegetable',
  'Bar': 'Barley',
  'Pumpk': 'Pumpkin',
  'Sw Pot': 'Sweet Potato',
  'Gr Bean': 'Green Bean',
  'Br Rice': 'Brown Rice',
  'Prot': 'Protein',
  'He Wei': 'Healthy Weight',
  'Sensi': 'Sensitive',
  'Spiru': 'Spirulina',
  'Brin': 'Brine',
  'Sal': 'Salmon',
  'Dck': 'Duck',
  'duck': 'Duck',
  'Lmb': 'Lamb',
  'beef': 'Beef',
  'Truk': 'Turkey',
  'Veni': 'Venison',
  'App': 'Apple',
  'Chu': 'Chunks',
  'Riv': 'River',
  'Cich': 'Cichlid',
  'Pel': 'Pellets',
  'Sup': 'Super',
  'Col': 'Color',
  'Nib': 'Nibbles',
  'Pat': 'Pate',
  'Crip': 'Crisp',
  // 'Tndr Bts': 'Tender Bites',  // MOVED TO BRAND CATALOG
  // 'Lil Bts': 'Little Bites',  // MOVED TO BRAND CATALOG
  // 'Little Bts': 'Little Bites',  // MOVED TO BRAND CATALOG
  'Nutty Butt Bts': 'Nutty Butter Bites',
  'Bts': 'Bites',
  
  // Nutrisource Product Lines (fallback - prefer brand catalog)
  // 'Chom': 'Chompy Chompers',  // MOVED TO BRAND CATALOG
  // 'Chomp': 'Chompy Chompers',  // MOVED TO BRAND CATALOG
  
  // Accessories
  'Hrness': 'Harness',
  
  // Fix awkward spacing issues
  'Div Ider': 'Divider',
  
  // Aquarium Equipment
  'Whisp': 'Whisper',
  'Filt': 'Filter',
  'Crt': 'Cartridge',
  'Cart': 'Cartridge',
  'Crb': 'Carbon',
  'Therm': 'Thermometer',
  'Therma': 'Thermal',
  'Spng': 'Sponge',
  'Plnt': 'Plant',
  'Rck': 'Rock',
  'Blm': 'Bloom',
  'Flwr': 'Flower',
  'Ptch': 'Patch',
  'Mush': 'Mushroom',
  'Pnk': 'Pink',
  'Sprflx': 'Superflex',
  'Wld': 'Wild',
  'Mxred': 'Mixed',
  'Vib': 'Vibrant',
  'Repl': 'Replacement',
  'Pd': 'Pad',
  'Contr': 'Controller',
  'Con': 'Conditioner',
  'Wtr': 'Water',
  'Wat': 'Water',
  'Mod': 'Model',
  'Aquar': 'Aquarium',
  
  // Toys/Misc
  '&Fam': '& Family',
  '&fam': '& Family',
  
  // Brands (only expand when at start or after space)
  'Kng': 'Kong',
  'Vit': 'Vital',
  'Ess': 'Essentials',
  'Simplesolutions': 'Simple Solutions',
  'Ntrisrc': 'Nutrisource',
  'Nutrisrc': 'Nutrisource',
  'Rndlk': 'Round Lake Farm',
  'Friendfrm': 'Tiny Friends Farm',
  'Bluebuff': 'Bluebuffalo',
  'Arm&ham': 'Arm & Hammer',
  'Arm&hamm': 'Arm & Hammer',
  
  // Fromm Product Lines (fallback - prefer brand catalog)
  // 'Pure Sniffers': 'PurrSnickity',  // MOVED TO BRAND CATALOG
  // 'Pu Sniffers': 'PurrSnickity',  // MOVED TO BRAND CATALOG
  // 'Pur Sni': 'PurrSnickity',  // MOVED TO BRAND CATALOG
  // 'Pu Sni': 'PurrSnickity',  // MOVED TO BRAND CATALOG
  // 'Sniffers': 'PurrSnickity',  // MOVED TO BRAND CATALOG
  
  // Location/Environment (fallback - prefer brand catalog for Science Diet)
  // 'In Do': 'Indoor',  // MOVED TO BRAND CATALOG (Science Diet specific)
  
  // Brand-specific context (removed generic expansions - now use brand catalog)
  // Fromm, Freshpet, Science Diet, Nutrisource require brand catalog
};

/**
 * Determines if "Ph" should be treated as pH (water chemistry) or Prevue Hendrix (brand)
 * @param text - The full text being analyzed
 * @param phPosition - Position of "Ph" in the text
 * @returns true if it's water chemistry pH, false if it's Prevue Hendrix brand
 */
function isWaterChemistryPh(text: string, phPosition: number): boolean {
  const lowerText = text.toLowerCase();
  const afterPh = lowerText.substring(phPosition + 2).trim();
  
  // Check if followed by chemistry keywords
  for (const keyword of PH_CHEMISTRY_KEYWORDS) {
    if (afterPh.startsWith(keyword)) {
      return true;
    }
  }
  
  // Check if preceded by chemistry brand
  const beforePh = lowerText.substring(0, phPosition).trim();
  for (const brand of PH_CHEMISTRY_BRANDS) {
    if (beforePh.endsWith(brand)) {
      return true;
    }
  }
  
  // Default: it's Prevue Hendrix brand
  return false;
}

/**
 * Determines if "Ga" should be treated as Gallon (volume measurement) in aquarium context
 * @param text - The full text being analyzed
 * @param gaPosition - Position of "Ga" in the text
 * @returns true if it's Gallon measurement, false otherwise
 */
function isAquariumGallon(text: string, gaPosition: number): boolean {
  const lowerText = text.toLowerCase();
  const afterGa = lowerText.substring(gaPosition + 2).trim();
  const beforeGa = lowerText.substring(0, gaPosition).trim();
  
  // Check if followed by aquarium keywords (e.g., "10 Ga Tank")
  for (const keyword of GALLON_AQUARIUM_KEYWORDS) {
    if (afterGa.startsWith(keyword)) {
      return true;
    }
  }
  
  // Check if preceded by a number (e.g., "10 Ga" or "20Ga")
  // Look for digits immediately before or with a space
  if (/\d\s*$/.test(beforeGa)) {
    return true;
  }
  
  // Check if preceded by aquarium brand
  for (const brand of GALLON_AQUARIUM_BRANDS) {
    if (beforeGa.includes(brand)) {
      return true;
    }
  }
  
  // Check if the text contains aquarium keywords anywhere
  for (const keyword of GALLON_AQUARIUM_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return true;
    }
  }
  
  // Default: not a gallon measurement
  return false;
}

/**
 * Expands abbreviations in a text string with context awareness
 * Uses brand catalog first (research-backed), then falls back to generic mappings
 * @param text - Text to expand abbreviations in
 * @param storage - Optional storage for brand catalog lookup (async version recommended)
 * @returns Text with expanded abbreviations
 */
export function expandAbbreviations(text: string | null | undefined, storage?: IStorage): string {
  if (!text || typeof text !== 'string') return '';
  
  // NOTE: This is the synchronous version for backwards compatibility
  // For brand catalog expansion, use expandAbbreviationsAsync instead
  
  let result = text;
  
  // Fix spacing issues first
  // 1. Replace double (or more) spaces with single space
  result = result.replace(/\s{2,}/g, ' ');
  
  // 2. Fix ampersand spacing: add space before & if missing
  result = result.replace(/([a-zA-Z])&/g, '$1 &');
  
  // 3. Fix ampersand spacing: add space after & if missing (except &fam which we handle separately)
  result = result.replace(/&([a-zA-Z])/g, '& $1');
  
  // Handle "Ph" with context detection (must be done first before other replacements)
  // Match "Ph" as a whole word at the start or after a space
  const phRegex = /\bPh\b/g;
  let match;
  const phMatches: Array<{index: number, isChemistry: boolean}> = [];
  
  while ((match = phRegex.exec(result)) !== null) {
    phMatches.push({
      index: match.index,
      isChemistry: isWaterChemistryPh(result, match.index)
    });
  }
  
  // Replace from end to start to preserve positions
  for (let i = phMatches.length - 1; i >= 0; i--) {
    const { index, isChemistry } = phMatches[i];
    if (isChemistry) {
      // Water chemistry: Ph → pH
      result = result.substring(0, index) + 'pH' + result.substring(index + 2);
    } else {
      // Brand name: Ph → Prevue Hendrix
      result = result.substring(0, index) + 'Prevue Hendrix' + result.substring(index + 2);
    }
  }
  
  // Handle "Ga" with context detection (aquarium gallon measurements)
  // Match "Ga" as a whole word
  const gaRegex = /\bGa\b/gi;
  const gaMatches: Array<{index: number, isGallon: boolean}> = [];
  
  while ((match = gaRegex.exec(result)) !== null) {
    gaMatches.push({
      index: match.index,
      isGallon: isAquariumGallon(result, match.index)
    });
  }
  
  // Replace from end to start to preserve positions
  for (let i = gaMatches.length - 1; i >= 0; i--) {
    const { index, isGallon } = gaMatches[i];
    if (isGallon) {
      // Aquarium measurement: Ga → Gallon
      result = result.substring(0, index) + 'Gallon' + result.substring(index + 2);
    }
    // Otherwise leave "Ga" as-is (could be abbreviation for Georgia, etc.)
  }
  
  // Expand other abbreviations (whole word matches)
  for (const [abbrev, expansion] of Object.entries(ABBREVIATION_MAPPINGS)) {
    // Create regex that matches whole word (case-insensitive)
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    result = result.replace(regex, expansion);
  }
  
  return result;
}

/**
 * Async version: Expands abbreviations using brand catalog FIRST, then generic fallback
 * This is the preferred method for new code
 * @param text - Text to expand abbreviations in
 * @param storage - Storage interface for brand catalog
 * @returns Promise with object containing expanded text and catalog usage flag
 */
export async function expandAbbreviationsAsync(
  text: string | null | undefined,
  storage: IStorage
): Promise<{ expanded: string; catalogUsed: boolean }> {
  if (!text || typeof text !== 'string') return { expanded: '', catalogUsed: false };
  
  // Step 0: Smart context-aware pattern expansion (Brand-specific fixes)
  
  // Nutrisource: "Grill" → "Grillin' Grillers"
  // Handle "Nutrisource Grill [anything]" → "Nutrisource Grillin' Grillers [anything]"
  // Uses negative lookahead to prevent matching "Grilled" or "Grills" or "Grillin'"
  const nutrisourceGrillPattern = /\b(Nutrisource)\s+Grill(?!ed|s|in')\b/gi;
  let preProcessed = text.replace(nutrisourceGrillPattern, "$1 Grillin' Grillers");
  
  // Fromm Product Line Expansions
  // Reference: https://frommfamily.com/products/cat/four-star/
  
  // "Pure Sniffers" or "Pu Sniffers" → "PurrSnickitty"
  const frommPureSniffersPattern = /\b(Fromm)\s+Pure\s+Sniffers\b/gi;
  preProcessed = preProcessed.replace(frommPureSniffersPattern, "$1 PurrSnickitty");
  const frommPuSniffersPattern = /\b(Fromm)\s+Pu\s+Sniffers\b/gi;
  preProcessed = preProcessed.replace(frommPuSniffersPattern, "$1 PurrSnickitty");
  
  // "Cat Game" or "Game" → "Game Bird Recipe" (Four-Star)
  const frommGamePattern = /\b(Fromm)\s+Cat\s+Game\b/gi;
  preProcessed = preProcessed.replace(frommGamePattern, "$1 Cat Game Bird Recipe");
  
  // "Cat Surf" or "Surf" → "Surf & Turf" (Four-Star)
  const frommSurfPattern = /\b(Fromm)\s+Cat\s+Surf\b/gi;
  preProcessed = preProcessed.replace(frommSurfPattern, "$1 Cat Surf & Turf");
  
  // "Cat Saslm" → "Cat Salmon" (typo fix)
  const frommSaslmPattern = /\b(Fromm)\s+Cat\s+Saslm\b/gi;
  preProcessed = preProcessed.replace(frommSaslmPattern, "$1 Cat Salmon");
  
  // "Cat Has Duck" or "Has Duck" → "Hasen Duckenpfeffer" (Four-Star)
  const frommHasPattern = /\b(Fromm)\s+Cat\s+Has\s+Duck\b/gi;
  preProcessed = preProcessed.replace(frommHasPattern, "$1 Cat Hasen Duckenpfeffer");
  
  // "Beef Living" → "Beef Frittata Veg" (Four-Star)
  const frommBeefLivingPattern = /\b(Fromm)\s+Beef\s+Living\b/gi;
  preProcessed = preProcessed.replace(frommBeefLivingPattern, "$1 Beef Frittata Veg");
  const frommCatBeefLivingPattern = /\b(Fromm)\s+Cat\s+Beef\s+Living\b/gi;
  preProcessed = preProcessed.replace(frommCatBeefLivingPattern, "$1 Cat Beef Frittata Veg");
  
  // Blue Buffalo Product Line Expansions
  // Reference: https://www.bluebuffalo.com/
  
  // "LP" → "Life Protection Formula"
  const blueBuffaloLPPattern = /\b(Blue Buffalo|BB|Bl Buf)\s+LP\b/gi;
  preProcessed = preProcessed.replace(blueBuffaloLPPattern, (match, brand) => `${brand} Life Protection Formula`);
  
  // "Wild" or "Wilderness" standalone after brand
  const blueBuffaloWildPattern = /\b(Blue Buffalo|BB)\s+Wild(?!erness)\b/gi;
  preProcessed = preProcessed.replace(blueBuffaloWildPattern, "$1 Wilderness");
  
  // "Gr Free" or "Freedom" → "Freedom"
  const blueBuffaloFreedomPattern = /\b(Blue Buffalo|BB|Bl Buf)\s+Gr\s+Free\b/gi;
  preProcessed = preProcessed.replace(blueBuffaloFreedomPattern, "$1 Freedom");
  
  // Taste of the Wild Product Line Expansions
  // Reference: https://www.tasteofthewildpetfood.com/
  
  // "Hi Prair" → "High Prairie"
  const totwHiPrairPattern = /\b(Taste of the Wild|TOW|Tow)\s+Hi\s+Prair\b/gi;
  preProcessed = preProcessed.replace(totwHiPrairPattern, "$1 High Prairie");
  
  // "Pac Strm" → "Pacific Stream"
  const totwPacStrmPattern = /\b(Taste of the Wild|TOW|Tow)\s+Pac\s+Strm\b/gi;
  preProcessed = preProcessed.replace(totwPacStrmPattern, "$1 Pacific Stream");
  
  // "Gr Free" → "Grain Free" (context: after TOTW)
  const totwGrFreePattern = /\b(Taste of the Wild|TOW|Tow)\s+Gr\s+Free\b/gi;
  preProcessed = preProcessed.replace(totwGrFreePattern, "$1 Grain Free");
  
  // Merrick Product Line Expansions
  // Reference: https://www.merrickpetcare.com/
  
  // "Clas" → "Classic"
  const merrickClasPattern = /\b(Merrick)\s+Clas\b/gi;
  preProcessed = preProcessed.replace(merrickClasPattern, "$1 Classic");
  
  // "Bckctry" → "Backcountry"
  const merrickBckctryPattern = /\b(Merrick)\s+Bckctry\b/gi;
  preProcessed = preProcessed.replace(merrickBckctryPattern, "$1 Backcountry");
  
  // "Gr Free" → "Grain Free" (context: after Merrick)
  const merrickGrFreePattern = /\b(Merrick)\s+Gr\s+Free\b/gi;
  preProcessed = preProcessed.replace(merrickGrFreePattern, "$1 Grain Free");
  
  // Pro Plan Product Line Expansions  
  // Reference: https://www.purina.com/pro-plan
  
  // "Svr" → "Savor" (older branding, now "Complete Essentials")
  const proPlanSvrPattern = /\b(Pro Plan|PP|Pr Pln)\s+Svr\b/gi;
  preProcessed = preProcessed.replace(proPlanSvrPattern, "$1 Savor");
  
  // "Fcs" → "Focus" (older branding, now "Specialized")
  const proPlanFcsPattern = /\b(Pro Plan|PP|Pr Pln)\s+Fcs\b/gi;
  preProcessed = preProcessed.replace(proPlanFcsPattern, "$1 Focus");
  
  // "Sprt" → "Sport"
  const proPlanSprtPattern = /\b(Pro Plan|PP|Pr Pln)\s+Sprt\b/gi;
  preProcessed = preProcessed.replace(proPlanSprtPattern, "$1 Sport");
  
  // "Sen" → "Sensitive Skin & Stomach"
  const proPlanSenPattern = /\b(Pro Plan|PP|Pr Pln)\s+Sen\b/gi;
  preProcessed = preProcessed.replace(proPlanSenPattern, "$1 Sensitive Skin & Stomach");
  
  // Royal Canin Breed-Specific Expansions
  // Reference: https://www.royalcanin.com/us/dogs/products/breed-health-nutrition
  
  // "Germ Shep" → "German Shepherd"
  const royalCaninGermShepPattern = /\b(Royal Canin|RC|Ry Can)\s+Germ\s+Shep\b/gi;
  preProcessed = preProcessed.replace(royalCaninGermShepPattern, "$1 German Shepherd");
  
  // "Gldn Retr" → "Golden Retriever"
  const royalCaninGldnRetrPattern = /\b(Royal Canin|RC|Ry Can)\s+Gldn\s+Retr\b/gi;
  preProcessed = preProcessed.replace(royalCaninGldnRetrPattern, "$1 Golden Retriever");
  
  // "Med" → "Medium" (when after Royal Canin)
  const royalCaninMedPattern = /\b(Royal Canin|RC)\s+Med\b/gi;
  preProcessed = preProcessed.replace(royalCaninMedPattern, "$1 Medium");
  
  // Science Diet / Hill's Prescription Diet Expansions
  // Reference: https://www.hillspet.com/
  
  // "Indo" → "Indoor"
  const scienceDietIndoPattern = /\b(Science Diet|SD|Sci Diet)\s+Indo\b/gi;
  preProcessed = preProcessed.replace(scienceDietIndoPattern, "$1 Indoor");
  
  // Prescription Diet letter codes (a/d, b/d, c/d, etc.)
  // Note: These are already handled well by the brand catalog, but adding context-aware expansion
  // "/d" means "diet" in all Hill's Prescription Diet formulas
  
  // Wellness Product Line Expansions
  // Reference: https://www.wellnesspetfood.com/
  
  // "CORE+" → "CORE+" (ensure proper capitalization)
  const wellnessCorePattern = /\b(Wellness)\s+Core\b/gi;
  preProcessed = preProcessed.replace(wellnessCorePattern, "$1 CORE");
  
  // "Comp Health" → "Complete Health"
  const wellnessCompHealthPattern = /\b(Wellness)\s+Comp\s+Health\b/gi;
  preProcessed = preProcessed.replace(wellnessCompHealthPattern, "$1 Complete Health");
  
  // Natural Balance Product Line Expansions
  // Reference: https://www.naturalbalanceinc.com/
  
  // "LID" or "L.I.D." → "Limited Ingredient Diets"
  const naturalBalanceLIDPattern = /\b(Natural Balance|Nat Balance)\s+L\.?I\.?D\.?\b/gi;
  preProcessed = preProcessed.replace(naturalBalanceLIDPattern, "$1 Limited Ingredient Diets");
  
  // Orijen Product Line Expansions
  // Reference: https://www.orijenpetfoods.com/
  
  // "Reg Red" → "Regional Red"
  const orijenRegRedPattern = /\b(Orijen)\s+Reg\s+Red\b/gi;
  preProcessed = preProcessed.replace(orijenRegRedPattern, "$1 Regional Red");
  
  // "Six Fish" remains "Six Fish" (already correct, but ensure proper capitalization)
  
  // Canidae Product Line Expansions
  // Reference: https://canidae.com/
  
  // "ALS" → "All Life Stages"
  const canidaeALSPattern = /\b(Canidae)\s+ALS\b/gi;
  preProcessed = preProcessed.replace(canidaeALSPattern, "$1 All Life Stages");
  
  // "PURE" already correct - ensure capitalization
  const canidaePurePattern = /\b(Canidae)\s+Pure\b/gi;
  preProcessed = preProcessed.replace(canidaePurePattern, "$1 PURE");
  
  // Instinct Product Line Expansions
  // Reference: https://instinctpetfood.com/
  
  // "Raw Bst" → "Raw Boost"
  const instinctRawBoostPattern = /\b(Instinct)\s+Raw\s+Bst\b/gi;
  preProcessed = preProcessed.replace(instinctRawBoostPattern, "$1 Raw Boost");
  
  // "Ult Protein" → "Ultimate Protein"
  const instinctUltProteinPattern = /\b(Instinct)\s+Ult\s+Protein\b/gi;
  preProcessed = preProcessed.replace(instinctUltProteinPattern, "$1 Ultimate Protein");
  
  // Step 1: Try brand catalog expansion (research-backed, context-aware)
  const catalogResult = await expandProductName(storage, preProcessed);
  const catalogUsed = catalogResult !== preProcessed; // Track if catalog made changes
  
  // Step 2: Fall back to generic abbreviation expansion
  // Fix spacing issues first
  let result = catalogResult;
  result = result.replace(/\s{2,}/g, ' ');
  result = result.replace(/([a-zA-Z])&/g, '$1 &');
  result = result.replace(/&([a-zA-Z])/g, '& $1');
  
  // Handle "Ph" with context detection
  const phRegex = /\bPh\b/g;
  let match;
  const phMatches: Array<{index: number, isChemistry: boolean}> = [];
  
  while ((match = phRegex.exec(result)) !== null) {
    phMatches.push({
      index: match.index,
      isChemistry: isWaterChemistryPh(result, match.index)
    });
  }
  
  for (let i = phMatches.length - 1; i >= 0; i--) {
    const { index, isChemistry } = phMatches[i];
    if (isChemistry) {
      result = result.substring(0, index) + 'pH' + result.substring(index + 2);
    } else {
      result = result.substring(0, index) + 'Prevue Hendrix' + result.substring(index + 2);
    }
  }
  
  // Handle "Ga" with context detection
  const gaRegex = /\bGa\b/gi;
  const gaMatches: Array<{index: number, isGallon: boolean}> = [];
  
  while ((match = gaRegex.exec(result)) !== null) {
    gaMatches.push({
      index: match.index,
      isGallon: isAquariumGallon(result, match.index)
    });
  }
  
  for (let i = gaMatches.length - 1; i >= 0; i--) {
    const { index, isGallon } = gaMatches[i];
    if (isGallon) {
      result = result.substring(0, index) + 'Gallon' + result.substring(index + 2);
    }
  }
  
  // Expand other abbreviations (whole word matches)
  for (const [abbrev, expansion] of Object.entries(ABBREVIATION_MAPPINGS)) {
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    result = result.replace(regex, expansion);
  }
  
  return { expanded: result, catalogUsed };
}

/**
 * Expands abbreviations in both name and description of a product
 * @param name - Product name
 * @param description - Product description
 * @returns Object with expanded name and description
 */
export function expandProductAbbreviations(
  name: string | null | undefined,
  description: string | null | undefined
): { name: string; description: string } {
  return {
    name: expandAbbreviations(name),
    description: expandAbbreviations(description)
  };
}

/**
 * Async version: Expands abbreviations in both name and description using brand catalog
 * This is the preferred method for new code
 * @param name - Product name
 * @param description - Product description
 * @param storage - Storage interface for brand catalog
 * @returns Promise with object containing expanded name, description, and catalog usage flag
 */
export async function expandProductAbbreviationsAsync(
  name: string | null | undefined,
  description: string | null | undefined,
  storage: IStorage
): Promise<{ name: string; description: string; catalogUsed: boolean }> {
  const nameResult = await expandAbbreviationsAsync(name, storage);
  const descResult = await expandAbbreviationsAsync(description, storage);
  
  return {
    name: nameResult.expanded,
    description: descResult.expanded,
    catalogUsed: nameResult.catalogUsed || descResult.catalogUsed
  };
}
