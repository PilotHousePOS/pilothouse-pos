import { Supply } from './storage';
import {
  CATEGORY_MAPPINGS,
  CATEGORY_SCORING_WEIGHTS,
  CATEGORY_CONFIDENCE_THRESHOLD,
  BRAND_CATEGORY_DEFAULTS,
} from './categoryConfig';

export function normalizeBrand(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calculateCategoryScore(
  supply: Supply,
  category: string,
  skipExclusions: boolean = false
): number {
  const mapping = CATEGORY_MAPPINGS[category];
  if (!mapping) return 0;

  let score = 0;
  const supplyName = supply.name.toLowerCase();
  const supplyBrand = supply.brand?.toLowerCase() || '';
  const supplyDescription = supply.description?.toLowerCase() || '';
  
  const normalizedSupplyBrand = normalizeBrand(supply.brand || '');
  const normalizedSupplyName = normalizeBrand(supply.name);

  // Brand matching (25 points)
  for (const brand of mapping.brands) {
    const normalizedBrand = normalizeBrand(brand);
    
    // Check if brand appears in brand field or product name
    if (
      supplyBrand.includes(brand.toLowerCase()) ||
      normalizedSupplyBrand.includes(normalizedBrand) ||
      supplyName.includes(brand.toLowerCase()) ||
      normalizedSupplyName.includes(normalizedBrand)
    ) {
      score += CATEGORY_SCORING_WEIGHTS.brandMatch;
      break; // Only count once per category
    }
  }

  // Name keyword matching (15 points per keyword, max 3 keywords = 45 points)
  let nameKeywordMatches = 0;
  const maxNameKeywords = 3;
  for (const keyword of mapping.nameKeywords) {
    const keywordLower = keyword.toLowerCase();
    if (supplyName.includes(keywordLower)) {
      score += CATEGORY_SCORING_WEIGHTS.nameKeyword;
      nameKeywordMatches++;
      if (nameKeywordMatches >= maxNameKeywords) break;
    }
  }

  // Description keyword matching (10 points per keyword, max 2 keywords = 20 points)
  if (supplyDescription) {
    let descKeywordMatches = 0;
    const maxDescKeywords = 2;
    for (const keyword of mapping.descriptionKeywords) {
      const keywordLower = keyword.toLowerCase();
      if (supplyDescription.includes(keywordLower)) {
        score += CATEGORY_SCORING_WEIGHTS.descriptionKeyword;
        descKeywordMatches++;
        if (descKeywordMatches >= maxDescKeywords) break;
      }
    }
  }

  // Exclusion penalty (-30 points per match) - skip if checking brand defaults
  if (!skipExclusions && mapping.exclusionKeywords) {
    for (const keyword of mapping.exclusionKeywords) {
      const keywordLower = keyword.toLowerCase();
      if (supplyName.includes(keywordLower) || supplyDescription.includes(keywordLower)) {
        score += CATEGORY_SCORING_WEIGHTS.exclusionPenalty;
        break; // Only penalize once
      }
    }
  }

  // Special pattern-based scoring for food category
  if (category === 'food') {
    // Weight/volume patterns suggest food products (+10 points)
    const foodSizePattern = /\d+(\.\d+)?\s*(oz|lb|g|kg|gal|ml)\b/i;
    if (foodSizePattern.test(supplyName)) {
      score += 10;
    }
  }

  return score;
}

export function determineCategory(supply: Supply, excludeCategories: string[] = []): string | null {
  const supplyName = supply.name.toLowerCase();
  const supplyBrand = supply.brand?.toLowerCase() || '';
  const supplyDescription = supply.description?.toLowerCase() || '';
  
  // SPECIAL HANDLING: Aquatic and Reptile items need subcategorization
  // When 'aquatics' or 'reptiles' are excluded, use keyword patterns to assign food/healthcare/accessories
  if (excludeCategories.includes('aquatics') || excludeCategories.includes('reptiles')) {
    
    // Fish Food keywords (prioritize food detection)
    const foodKeywords = [
      'food', 'pellet', 'flake', 'wafer', 'cuisine', 'granule', 'treat', 
      'shrimp', 'brine', 'bloodworm', 'tubifex', 'daphnia', 'krill',
      'spirulina', 'algae wafer', 'cichlid', 'betta', 'goldfish', 'tropical',
      'freeze dried', 'frozen', 'diet', 'nutrition'
    ];
    
    // Medicine/Healthcare keywords
    const healthcareKeywords = [
      'treatment', 'conditioner', 'stress', 'medication', 'remedy', 'cure',
      'disease', 'parasite', 'fungus', 'bacteria', 'infection', 'supplement',
      'water conditioner', 'stress coat', 'aquarium salt', 'medicine',
      'antibiotic', 'anti-', 'health', 'aid', 'care'
    ];
    
    // Check for food keywords
    for (const keyword of foodKeywords) {
      if (supplyName.includes(keyword) || supplyDescription.includes(keyword)) {
        return 'food';
      }
    }
    
    // Check for healthcare keywords
    for (const keyword of healthcareKeywords) {
      if (supplyName.includes(keyword) || supplyDescription.includes(keyword)) {
        return 'healthcare';
      }
    }
    
    // Default to accessories for specialty items (equipment, decorations, etc.)
    return 'accessories';
  }
  
  // STANDARD CATEGORIZATION for non-specialty items
  
  // First check brand-specific defaults for overlapping brands
  for (const [brand, defaultCategory] of Object.entries(BRAND_CATEGORY_DEFAULTS)) {
    // Skip if this category is excluded
    if (excludeCategories.includes(defaultCategory)) continue;
    
    const brandLower = brand.toLowerCase();
    if (supplyBrand.includes(brandLower) || supplyName.includes(brandLower)) {
      // Brand found, but verify with scoring to prevent misclassification
      // Skip exclusions for brand defaults (e.g., ProPlan with "toy" should still be food)
      const categoryScore = calculateCategoryScore(supply, defaultCategory, true);
      // If brand default category has reasonable score (>15), use it
      if (categoryScore >= 15) {
        return defaultCategory;
      }
    }
  }

  // Standard scoring approach
  const categories = Object.keys(CATEGORY_MAPPINGS).filter(cat => !excludeCategories.includes(cat));
  const scores: { category: string; score: number }[] = [];

  for (const category of categories) {
    const score = calculateCategoryScore(supply, category);
    scores.push({ category, score });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  const topScore = scores[0];
  
  // Return category if it meets the confidence threshold
  if (topScore.score >= CATEGORY_CONFIDENCE_THRESHOLD) {
    return topScore.category;
  }

  return null; // Not confident enough
}

export interface CategoryStats {
  food: number;
  toys: number;
  beds: number;
  leashes: number;
  healthcare: number;
  accessories: number;
  aquatics: number;
  reptiles: number;
  birdCages: number;
  dogCages: number;
  smallAnimalCages: number;
  dogTreats: number;
  catTreats: number;
  unchanged: number;
}

export function getEmptyStats(): CategoryStats {
  return {
    food: 0,
    toys: 0,
    beds: 0,
    leashes: 0,
    healthcare: 0,
    accessories: 0,
    aquatics: 0,
    reptiles: 0,
    birdCages: 0,
    dogCages: 0,
    smallAnimalCages: 0,
    dogTreats: 0,
    catTreats: 0,
    unchanged: 0,
  };
}
