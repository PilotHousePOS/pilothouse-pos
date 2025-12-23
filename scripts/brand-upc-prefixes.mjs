/**
 * Brand-to-UPC Prefix Mapping
 * 
 * This module provides validation to ensure UPCs are only assigned to products
 * from the correct brand based on their GS1/UPC prefix.
 * 
 * UPC prefixes are assigned by GS1 (formerly UCC) to manufacturers.
 * This prevents cross-brand UPC assignment errors.
 */

// Known brand-to-UPC prefix mapping
// Format: prefix -> array of valid brand name variations (lowercase)
export const BRAND_UPC_PREFIXES = {
  // Reptile brands
  '097612': ['zoo med', 'zoomed', 'zoo-med'],
  '015561': ['exo terra', 'exoterra', 'hagen', 'fluval', 'marina', 'nutrafin', 'living world'],
  '091197': ["fluker's", 'flukers', 'fluker'],
  '096316': ['zilla'],
  
  // Aquatic brands
  '046798': ['tetra'],
  '015905': ['aqueon'],
  '042055': ['hikari'],
  '317163': ['api'],
  '047431': ['marineland'],
  '030172': ['penn-plax', 'pennplax', 'penn plax'],
  
  // Small animal/bird brands
  '071859': ['kaytee'],
  '744845': ['oxbow'],  // Corrected from 034846
  '071354': ['vitakraft'],
  '048081': ['prevue', 'prevue pet'],
  
  // Pet food brands
  '064992': ['orijen', 'acana', 'champion petfoods'],
  '052742': ["hill's", 'hills', 'science diet', 'healthy advantage'],
  '859610': ['blue buffalo', 'blue wilderness', 'blue freedom'],
  '072705': ['fromm'],
  '030111': ['royal canin', 'royalcanin'],
  '019014': ['nutro'],
  '769949': ['taste of the wild'],
  '074198': ['diamond', 'diamond naturals'],
  '840243': ['blue buffalo', 'instinct', "nature's variety"],  // Blue Buffalo also uses 840243!
  '038100': ['purina', 'pro plan', 'beneful', 'friskies', 'fancy feast'],
  '023100': ['pedigree', 'iams', 'eukanuba'],
  
  // Dog/cat accessory brands
  '076484': ['kong', 'coastal', "li'l pals", 'lil pals', 'safari', 'titan', 'lazer brite', 'easy rider'],  // Coastal family brands
  '018214': ['nylabone', 'coastal', "li'l pals", 'lil pals', 'lazer brite', 'easy rider'],  // Nylabone uses 018214 prefix!
  '018065': ['nylabone', "nature's miracle", 'natures miracle'],  // Nylabone also uses 018065
  '854111': ['benebone'],  // Corrected from 810833
  '810039': ['smartbones'],
  '785184': ['redbarn', 'red barn'],
  '642863': ['greenies'],
  '871864': ['whimzees'],
  '660048': ['chuckit', 'chuck it'],
  '029695': ['petmate', 'chuckit', 'chuck it'],  // Petmate owns Chuckit
  '022517': ['catit'],
  '073893': ['nutrisource'],
  '077234': ['ethical pet', 'spot', 'colorful springs'],
  '618940': ['jw pet', 'jw'],
  '045663': ['safari', 'four paws', '4 paws'],
  '645095': ['tropiclean', 'tropi clean'],
  '693804': ['dogswell'],
  '768303': ['cadet'],
  
  // Additional small animal prefixes  
  '045125': ['kaytee'],  // Kaytee also uses this prefix
  '730582': ['living world', 'friendsfarm', 'hagen'],
};

/**
 * Get the expected brand(s) for a UPC based on its prefix
 * @param {string} upc - The UPC code to check
 * @returns {Object|null} - { prefix, brandNames } or null if no match
 */
export function getUpcBrand(upc) {
  if (!upc) return null;
  const cleanUpc = upc.replace(/[^0-9]/g, '');
  
  for (const [prefix, brandNames] of Object.entries(BRAND_UPC_PREFIXES)) {
    if (cleanUpc.startsWith(prefix)) {
      return { prefix, brandNames };
    }
  }
  return null;
}

/**
 * Check if a supply's brand matches the expected brand for a UPC
 * @param {string} supplyBrand - The brand of the supply/product
 * @param {string} upc - The UPC to validate
 * @returns {Object} - { valid: boolean, reason?: string, upcBrand?: Object }
 */
export function validateBrandUpcMatch(supplyBrand, upc) {
  const upcBrand = getUpcBrand(upc);
  
  // If we don't have a known prefix mapping, we can't validate - allow it
  if (!upcBrand) {
    return { valid: true, reason: 'Unknown UPC prefix - cannot validate' };
  }
  
  // If supply has no brand, we can't validate - be cautious and reject
  if (!supplyBrand) {
    return { 
      valid: false, 
      reason: `Supply has no brand. UPC prefix ${upcBrand.prefix} belongs to: ${upcBrand.brandNames.join('/')}`
    };
  }
  
  const normalizedSupply = supplyBrand.toLowerCase().trim();
  
  // Check if supply brand matches any of the UPC brand names
  for (const upcBrandName of upcBrand.brandNames) {
    if (normalizedSupply.includes(upcBrandName) || upcBrandName.includes(normalizedSupply)) {
      return { valid: true, upcBrand };
    }
  }
  
  // Brand doesn't match - reject
  return { 
    valid: false, 
    reason: `Brand mismatch: "${supplyBrand}" != expected ${upcBrand.brandNames.join('/')} (prefix ${upcBrand.prefix})`,
    upcBrand
  };
}

/**
 * Validate all pending/accepted matches and flag brand conflicts
 * @param {Object} matches - The matches object from match_queue.json
 * @returns {Array} - Array of matches with brand conflicts
 */
export function findBrandConflicts(matches) {
  const conflicts = [];
  
  for (const [matchId, match] of Object.entries(matches)) {
    if (match.status === 'pending' || match.status === 'accepted') {
      const validation = validateBrandUpcMatch(match.supplyBrand, match.upc);
      if (!validation.valid) {
        conflicts.push({
          matchId,
          ...match,
          conflictReason: validation.reason
        });
      }
    }
  }
  
  return conflicts;
}

export default { 
  BRAND_UPC_PREFIXES, 
  getUpcBrand, 
  validateBrandUpcMatch, 
  findBrandConflicts 
};
