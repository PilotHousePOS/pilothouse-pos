/**
 * Brand Name Expansion Utility
 * Maps common brand abbreviations found in product names to their full brand names
 * This allows searches for full brand names to find products with abbreviated names
 */

/**
 * Brand name mapping: abbreviated version → full brand name
 * Based on actual product data from database screenshots (Nov 2025)
 */
const BRAND_ABBREVIATIONS: Record<string, string[]> = {
  // Blue Buffalo variations
  'blue b': ['blue buffalo', 'bluebuffalo', 'blue b'],
  'blue buffalo': ['blue b', 'blue buffalo', 'bluebuffalo'],
  
  // Diamond variations
  'diam': ['diamond', 'diam'],
  'diamond': ['diam', 'diamond'],
  
  // Primal variations
  'prim': ['primal', 'prim'],
  'prim kitr': ['primal kitty', 'primal kitten', 'prim kitr'],
  'prim fd': ['primal freeze dried', 'primal fd', 'primal'],
  'primal': ['prim', 'prim fd', 'prim kitr', 'primal'],
  'primal kitty': ['prim kitr', 'primal kitty'],
  'primal freeze dried': ['prim fd', 'primal freeze dried'],
  
  // Next Level variations (already seems full in screenshots, but adding for consistency)
  'next level': ['next level', 'next lvl'],
  'next lvl': ['next level', 'next lvl'],
};

/**
 * Expands a search query to include brand name variations
 * Example: "Diamond" → ["Diamond", "Diam"]
 * Example: "Blue Buffalo" → ["Blue Buffalo", "Blue B"]
 * 
 * @param query - Original search query
 * @returns Array of search variations to try (always trimmed)
 */
export function expandBrandNames(query: string): string[] {
  if (!query || !query.trim()) {
    return [query.trim()];
  }
  
  const lowerQuery = query.toLowerCase().trim();
  
  // Check if query matches any known brand abbreviation or full name
  for (const [key, variations] of Object.entries(BRAND_ABBREVIATIONS)) {
    if (lowerQuery === key || lowerQuery.includes(key)) {
      // Return all variations for this brand
      return variations;
    }
  }
  
  // No brand match found - return trimmed original query
  return [lowerQuery];
}

/**
 * Enhanced search that tries multiple brand name variations
 * Returns true if ANY variation matches the text
 * 
 * @param text - Text to search in (product name, brand, description)
 * @param query - Search query
 * @returns True if any brand variation matches
 */
export function searchWithBrandExpansion(text: string, query: string): boolean {
  if (!text || !query) {
    return false;
  }
  
  const lowerText = text.toLowerCase();
  const variations = expandBrandNames(query);
  
  // Check if any variation appears in the text
  return variations.some(variation => 
    lowerText.includes(variation.toLowerCase())
  );
}
