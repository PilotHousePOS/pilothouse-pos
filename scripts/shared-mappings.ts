// Shared abbreviation and spelling mappings used by both apply and validation scripts
// This ensures consistency and prevents drift between scripts

// Brands that should stay fully uppercase (don't title case these)
export const uppercaseBrands = ['IAMS', 'PPP', 'RC', 'EB'];

// Words to keep lowercase in title case (articles, conjunctions, prepositions, units)
export const lowercaseWords = ['and', 'is', 'or', 'but', 'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'lb', 'oz', 'kg', 'g', 'mg'];

// Abbreviation mappings - ORDER MATTERS!
// Multi-word patterns must come first to avoid partial replacements
export const abbreviationMappings: Record<string, string> = {
  // Special multi-word patterns (MUST BE FIRST)
  'BL BUF': 'Blue Buffalo',
  'bl buf': 'Blue Buffalo',
  'tri bl': 'Tri Blend',
  'sm br': 'Small Breed',
  'md br': 'Medium Breed',
  'lg br': 'Large Breed',
  'xlg br': 'Extra Large Breed',
  'mini br': 'Mini Breed',
  'toy br': 'Toy Breed',
  
  // Brands
  'sd': 'Science Diet',
  'RC': 'Royal Canin',
  'PPP': 'Purina Pro Plan',
  'EB': 'Eukanuba',
  'IAM': 'IAMS',
  'buf': 'Blue Buffalo',
  
  // Colors (process after "tri bl" and "BL BUF" to avoid conflicts)
  'wh': 'White',
  'whi': 'White',
  'gre': 'Grey',
  'bl': 'Black',
  'burgund': 'Burgundy',
  
  // Proteins
  'ck': 'Chicken',
  'chk': 'Chicken',
  'lam': 'Lamb',
  'bf': 'Beef',
  'tk': 'Turkey',
  'trk': 'Turkey',
  'salm': 'Salmon',
  'duc': 'Duck',
  'ri': 'rice',
  
  // Life stages
  'pup': 'Puppy',
  'jr': 'Junior',
  'sr': 'Senior',
  'ad': 'Adult',
  'adt': 'Adult',
  
  // Measurements
  '#': 'lb',
};

// Spelling correction dictionary
export const spellingCorrections: Record<string, string> = {
  'grasvel': 'gravel',
  'gravy': 'gravy', // Already correct, just mapping for reference
  // Add more as they're discovered
};

// Generate regex patterns for validation
export function getValidationPatterns() {
  return {
    brands: {
      'Science Diet': ['\\bsd\\b', '\\bSD\\b'],
      'Royal Canin': ['\\bRC\\b', '\\brc\\b'],
      'Purina Pro Plan': ['\\bPPP\\b', '\\bppp\\b'],
      'Eukanuba': ['\\bEB\\b', '\\beb\\b'],
      'IAMS': ['\\bIAM\\b', '\\biam\\b'],
      'Blue Buffalo': ['\\bbuf\\b', '\\bBUF\\b', '\\bBuf\\b'],
    },
    colors: {
      'White': ['\\bwh\\b', '\\bwhi\\b'],
      'Grey': ['\\bgre\\b'],
      'Black': ['\\bbl\\b', '\\bBL\\b'],
      'Burgundy': ['\\bburgund\\b'],
    },
    proteins: {
      'Chicken': ['\\bck\\b', '\\bchk\\b'],
      'Lamb': ['\\blam\\b'],
      'Salmon': ['\\bsalm\\b'],
      'Beef': ['\\bbf\\b'],
      'Turkey': ['\\btk\\b', '\\btrk\\b'],
      'Duck': ['\\bduc\\b'],
      'rice': ['\\bri\\b'],
    },
    sizes: {
      'Small Breed': ['sm br', 'SM BR'],
      'Medium Breed': ['md br', 'MD BR'],
      'Large Breed': ['lg br', 'LG BR'],
      'Extra Large Breed': ['xlg br', 'XLG BR'],
      'Mini Breed': ['mini br', 'MINI BR'],
      'Toy Breed': ['toy br', 'TOY BR'],
    },
    lifestages: {
      'Puppy': ['\\bpup\\b', '\\bPUP\\b'],
      'Junior': ['\\bjr\\b', '\\bJR\\b'],
      'Senior': ['\\bsr\\b', '\\bSR\\b'],
      'Adult': ['\\bad\\b', '\\badt\\b', '\\bAD\\b', '\\bADT\\b'],
    },
    measurements: {
      'lb': ['#(?=\\s|$)'],
    },
    spelling: {
      'gravel': ['\\bgrasvel\\b'],
    }
  };
}
