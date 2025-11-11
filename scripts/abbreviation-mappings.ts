// Structured abbreviation mapping configuration
// Each mapping includes business rules, case handling, and validation

export interface AbbreviationMapping {
  pattern: RegExp;
  replacement: string;
  category: 'brand' | 'size' | 'protein' | 'life_stage' | 'diet' | 'formula' | 'measurement' | 'common';
  priority: number; // Process high priority first (higher numbers = higher priority)
  preserveCase?: boolean; // If true, match original case
  whitelist?: string[]; // Product names/brands to exclude from this rule
  notes?: string;
}

// Abbreviation mappings organized by priority batches
export const abbreviationMappings: AbbreviationMapping[] = [
  // BATCH 1: SCIENCE DIET BRAND (Priority: 100)
  {
    pattern: /\bsd\b/gi,
    replacement: 'Science Diet',
    category: 'brand',
    priority: 100,
    notes: '202 products - Primary brand abbreviation'
  },
  
  // BATCH 2: MAJOR BRANDS (Priority: 90)
  {
    pattern: /\bRC\b/g,
    replacement: 'Royal Canin',
    category: 'brand',
    priority: 90,
    preserveCase: true
  },
  {
    pattern: /\bPPP\b/g,
    replacement: 'Purina Pro Plan',
    category: 'brand',
    priority: 90,
    preserveCase: true
  },
  {
    pattern: /\bEB\b/g,
    replacement: 'Eukanuba',
    category: 'brand',
    priority: 90,
    preserveCase: true
  },
  {
    pattern: /\bIAM\b/g,
    replacement: 'IAMS',
    category: 'brand',
    priority: 90,
    preserveCase: true
  },
  
  // BATCH 3: PROTEINS (Priority: 80)
  {
    pattern: /\bck\b/gi,
    replacement: 'Chicken',
    category: 'protein',
    priority: 80,
    whitelist: ['BLACK', 'NECK'], // Avoid expanding in "black" or "neck"
    notes: '168 products'
  },
  {
    pattern: /\bchk\b/gi,
    replacement: 'Chicken',
    category: 'protein',
    priority: 80
  },
  {
    pattern: /\bsalm\b/gi,
    replacement: 'Salmon',
    category: 'protein',
    priority: 80,
    notes: '42 products'
  },
  {
    pattern: /\blam\b/gi,
    replacement: 'Lamb',
    category: 'protein',
    priority: 80,
    notes: '30 products'
  },
  {
    pattern: /\bbf\b/gi,
    replacement: 'Beef',
    category: 'protein',
    priority: 80
  },
  {
    pattern: /\btk\b/gi,
    replacement: 'Turkey',
    category: 'protein',
    priority: 80
  },
  {
    pattern: /\btrk\b/gi,
    replacement: 'Turkey',
    category: 'protein',
    priority: 80
  },
  {
    pattern: /\bduc\b/gi,
    replacement: 'Duck',
    category: 'protein',
    priority: 80
  },
  {
    pattern: /\bdk\b/gi,
    replacement: 'Duck',
    category: 'protein',
    priority: 80,
    whitelist: ['DK GREY'], // Preserve "Dk Grey" color names
  },
  
  // BATCH 4: SIZES (Priority: 70)
  {
    pattern: /\bsm br\b/gi,
    replacement: 'Small Breed',
    category: 'size',
    priority: 70,
    notes: '50 products'
  },
  {
    pattern: /\blg br\b/gi,
    replacement: 'Large Breed',
    category: 'size',
    priority: 70,
    notes: '50 products'
  },
  {
    pattern: /\bmd br\b/gi,
    replacement: 'Medium Breed',
    category: 'size',
    priority: 70
  },
  {
    pattern: /\bxlg br\b/gi,
    replacement: 'Extra Large Breed',
    category: 'size',
    priority: 70
  },
  {
    pattern: /\bmini br\b/gi,
    replacement: 'Mini Breed',
    category: 'size',
    priority: 70
  },
  {
    pattern: /\btoy br\b/gi,
    replacement: 'Toy Breed',
    category: 'size',
    priority: 70
  },
  
  // BATCH 5: LIFE STAGES (Priority: 60)
  {
    pattern: /\bpup\b/gi,
    replacement: 'Puppy',
    category: 'life_stage',
    priority: 60,
    whitelist: ['POP-UP', 'CUP'], // Don't expand in "pop-up" or "pup cup"
    notes: '30 products'
  },
  {
    pattern: /\bjr\b/gi,
    replacement: 'Junior',
    category: 'life_stage',
    priority: 60,
    whitelist: ['T-JR'], // Product code prefixes
    notes: '9 products'
  },
  {
    pattern: /\bsr\b/gi,
    replacement: 'Senior',
    category: 'life_stage',
    priority: 60
  },
  {
    pattern: /\badt?\b/gi,
    replacement: 'Adult',
    category: 'life_stage',
    priority: 60
  },
  
  // BATCH 6: COMMON WORDS (Priority: 50)
  {
    pattern: /\borg\b/gi,
    replacement: 'Organic',
    category: 'common',
    priority: 50,
    notes: '16 products'
  },
  {
    pattern: /\basst\b/gi,
    replacement: 'Assorted',
    category: 'common',
    priority: 50,
    notes: '10 products'
  },
  {
    pattern: /\bnat\b/gi,
    replacement: 'Natural',
    category: 'common',
    priority: 50,
    notes: '9 products'
  },
  {
    pattern: /\bout\b/gi,
    replacement: 'Outdoor',
    category: 'common',
    priority: 50,
    whitelist: ['TIME OUT', 'WORK OUT', 'CHECK OUT'],
    notes: '7 products - avoid expanding in compound words'
  },
  {
    pattern: /\bind\b/gi,
    replacement: 'Indoor',
    category: 'common',
    priority: 50,
    notes: '3 products'
  },
  {
    pattern: /\bw\//gi,
    replacement: 'with',
    category: 'common',
    priority: 50,
    notes: '1 product'
  },
  
  // BATCH 7: FORMULAS (Priority: 40)
  {
    pattern: /\bent\b/gi,
    replacement: 'Entree',
    category: 'formula',
    priority: 40,
    whitelist: ['ENTERTAINMENT', 'ENTER'], // Don't expand partial words
    notes: '2 products'
  },
  {
    pattern: /\bfrm\b/gi,
    replacement: 'Formula',
    category: 'formula',
    priority: 40
  },
  {
    pattern: /\bform\b/gi,
    replacement: 'Formula',
    category: 'formula',
    priority: 40
  },
  {
    pattern: /\brec\b/gi,
    replacement: 'Recipe',
    category: 'formula',
    priority: 40
  },
  
  // BATCH 8: MEASUREMENTS (Priority: 30)
  {
    pattern: /#(?=\s|$)/g, // Only replace # when followed by space or end of string
    replacement: 'lb',
    category: 'measurement',
    priority: 30,
    notes: 'Normalize pound symbol to "lb" for clarity'
  },
  
  // BATCH 9: DIET TYPES (Priority: 20)
  {
    pattern: /\bhp\b/gi,
    replacement: 'High Protein',
    category: 'diet',
    priority: 20,
    whitelist: ['HP COLLAR'], // Preserve product codes
    notes: '3 products'
  },
  {
    pattern: /\bgf\b/gi,
    replacement: 'Grain Free',
    category: 'diet',
    priority: 20
  },
  {
    pattern: /\bgrn fr\b/gi,
    replacement: 'Grain Free',
    category: 'diet',
    priority: 20
  },
  {
    pattern: /\bltd\b/gi,
    replacement: 'Limited Ingredient Diet',
    category: 'diet',
    priority: 20
  },
  {
    pattern: /\bli\b/gi,
    replacement: 'Limited Ingredient',
    category: 'diet',
    priority: 20
  },
];

// Export mappings grouped by priority for batch processing
export function getMappingsByPriority(): Map<number, AbbreviationMapping[]> {
  const grouped = new Map<number, AbbreviationMapping[]>();
  
  for (const mapping of abbreviationMappings) {
    const existing = grouped.get(mapping.priority) || [];
    existing.push(mapping);
    grouped.set(mapping.priority, existing);
  }
  
  return grouped;
}

// Get batch name by priority level
export function getBatchName(priority: number): string {
  const names: Record<number, string> = {
    100: 'Science Diet Brand',
    90: 'Major Brands',
    80: 'Proteins',
    70: 'Sizes',
    60: 'Life Stages',
    50: 'Common Words',
    40: 'Formulas',
    30: 'Measurements',
    20: 'Diet Types'
  };
  return names[priority] || `Priority ${priority}`;
}
