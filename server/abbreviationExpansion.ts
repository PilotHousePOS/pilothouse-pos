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
  
  // Comfort/General
  'Cmfrt': 'Comfort',
  'Nat': 'Natural',
  'Natu': 'Natural',
  'Natl': 'Natural',
  
  // Quantity
  'Pk': 'Pack',
  'Dbl': 'Double',
  'Sngl': 'Single',
  'Asst': 'Assorted',
  
  // Age/Demographics
  'Jr': 'Junior',
  'Sr': 'Senior',
  
  // Animals
  'Eleph': 'Elephant',
  
  // Chemistry (non-context dependent)
  'Phos': 'Phosphate',
  
  // Food/Flavors
  'Blubrede': 'Blueberry',
  'White Gr': 'With Grain',
  'Red B': 'RedBarn',
  
  // Brands (only expand when at start or after space)
  'Kng': 'Kong',
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
