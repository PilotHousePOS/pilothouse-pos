/**
 * Smart abbreviation expansion system for product names and descriptions
 * Handles context-aware expansion (e.g., "Ph" can be pH or Prevue Hendrix)
 */

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
  'Xlg': 'Extra Large',
  'Xl': 'Extra Large',
  'Xxl': 'Extra Extra Large',
  'Xs': 'Extra Small',
  'Xsm': 'Extra Small',
  
  // Material/Quality
  'Hvy': 'Heavy',
  'Dty': 'Duty',
  'Lt': 'Light',
  'Dk': 'Dark',
  'Bk': 'Black',
  
  // Comfort/General
  'Cmfrt': 'Comfort',
  'Nat': 'Natural',
  'Natu': 'Natural',
  'Natl': 'Natural',
  'Rwrds': 'Rewards',
  
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
  
  // Chemistry (non-context dependent)
  'Phos': 'Phosphate',
  
  // Common misspellings
  'Thermoneter': 'Thermometer',
  
  // Food/Flavors
  'Blubrede': 'Blueberry',
  'White Gr': 'With Grain',
  'Red B': 'RedBarn',
  'Waf': 'Waffer',
  'Froz': 'Frozen',
  'Fr': 'Frozen',
  'Blo': 'Blood',
  'Cmbs': 'Crumbs',
  'Chckwcheese': 'Chicken With Cheese',
  'Whslm': 'Wholesome',
  'Whlsm': 'Wholesome',
  'Forti': 'Fortified',
  
  // Accessories
  'Hrness': 'Harness',
  
  // Fix awkward spacing issues
  'Div Ider': 'Divider',
  
  // Brands (only expand when at start or after space)
  'Kng': 'Kong',
  'Simplesolutions': 'Simple Solutions',
  'Ntrisrc': 'Nutrisource',
  'Rndlk': 'Round Lake Farm',
  'Friendfrm': 'Tiny Friends Farm',
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
 * @param text - Text to expand abbreviations in
 * @returns Text with expanded abbreviations
 */
export function expandAbbreviations(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';
  
  let result = text;
  
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
    const regex = new RegExp(`\\b${abbrev}\\b`, 'g');
    result = result.replace(regex, expansion);
  }
  
  return result;
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
