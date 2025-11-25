import { Supply } from '@shared/schema';
import {
  CATEGORY_MAPPINGS,
  CATEGORY_SCORING_WEIGHTS,
  CATEGORY_CONFIDENCE_THRESHOLD,
  BRAND_CATEGORY_DEFAULTS,
} from './categoryConfig';
import {
  AQUATIC_FOOD_BRANDS,
  AQUATIC_MEDICINE_BRANDS,
  AQUATIC_SUPPLIES_BRANDS,
  AQUATIC_FOOD_KEYWORDS,
  AQUATIC_MEDICINE_KEYWORDS,
  AQUATIC_SUPPLIES_KEYWORDS
} from './aquaticCategoryEvidence';

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
  
  // EVIDENCE-BASED AQUATIC SUBCATEGORIZATION
  // Only apply aquatic evidence logic when actually processing aquatic items (filterType='aquatic')
  if (supply.filterType === 'aquatic' && excludeCategories.includes('aquatics')) {
    
    // PRIORITY 1: Brand-based categorization (highest confidence)
    // Check if brand is a food-only specialist
    for (const brand of AQUATIC_FOOD_BRANDS) {
      const brandLower = brand.toLowerCase();
      if (supplyBrand.includes(brandLower) || supplyName.includes(brandLower)) {
        // Verify it's actually a food product with keyword check
        for (const keyword of AQUATIC_FOOD_KEYWORDS) {
          if (supplyName.includes(keyword) || supplyDescription.includes(keyword)) {
            return 'food';
          }
        }
        // If no food keywords found but it's a food brand, still likely food
        // but score it to be safe
        break;
      }
    }
    
    // Check if brand is a medicine specialist
    for (const brand of AQUATIC_MEDICINE_BRANDS) {
      const brandLower = brand.toLowerCase();
      if (supplyBrand.includes(brandLower) || supplyName.includes(brandLower)) {
        // Verify it's actually a medicine product with keyword check
        for (const keyword of AQUATIC_MEDICINE_KEYWORDS) {
          if (supplyName.includes(keyword) || supplyDescription.includes(keyword)) {
            return 'healthcare';
          }
        }
        // If SeaChem brand but no medicine keywords, might be a filter media or accessory
        if (brandLower.includes('seachem')) {
          // Check if it's Purigen, filter media, or other accessories
          const accessoryKeywords = ['purigen', 'filter', 'media', 'pad', 'carbon'];
          for (const keyword of accessoryKeywords) {
            if (supplyName.includes(keyword) || supplyDescription.includes(keyword)) {
              return 'accessories';
            }
          }
        }
        break;
      }
    }
    
    // PRIORITY 2: Keyword-based categorization (verified keywords from official sources)
    // Count keyword matches for each category
    let foodScore = 0;
    let healthcareScore = 0;
    let suppliesScore = 0;
    
    // Food keyword scoring
    for (const keyword of AQUATIC_FOOD_KEYWORDS) {
      if (supplyName.includes(keyword)) foodScore += 10;
      if (supplyDescription.includes(keyword)) foodScore += 5;
    }
    
    // Healthcare keyword scoring
    for (const keyword of AQUATIC_MEDICINE_KEYWORDS) {
      if (supplyName.includes(keyword)) healthcareScore += 10;
      if (supplyDescription.includes(keyword)) healthcareScore += 5;
    }
    
    // Supplies keyword scoring
    for (const keyword of AQUATIC_SUPPLIES_KEYWORDS) {
      if (supplyName.includes(keyword)) suppliesScore += 10;
      if (supplyDescription.includes(keyword)) suppliesScore += 5;
    }
    
    // Return highest scoring category if it meets threshold
    const maxScore = Math.max(foodScore, healthcareScore, suppliesScore);
    if (maxScore >= 10) { // At least one keyword match in name
      if (foodScore === maxScore) return 'food';
      if (healthcareScore === maxScore) return 'healthcare';
      if (suppliesScore === maxScore) return 'accessories';
    }
    
    // PRIORITY 3: Default to accessories if no clear match
    // Equipment, decorations, and other supplies
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
