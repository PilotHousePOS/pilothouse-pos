/**
 * Automatic product categorization system
 * Analyzes product names, brands, and descriptions to assign filterType
 */

import { SUPPLY_FILTERS, FilterType } from './filterConfig';
import type { Supply } from '@shared/schema';

export interface CategorizationResult {
  filterType: 'aquatic' | 'reptile' | null;
  confidence: number; // 0-100
  reason: string;
}

/**
 * Automatically categorizes a product based on its name, brand, and description
 * @param product - Product to categorize
 * @returns Categorization result with filterType, confidence, and reason
 */
/**
 * Normalize brand name for comparison (handles "Zoo Med" vs "ZooMed")
 */
function normalizeBrand(brand: string): string {
  return brand.toLowerCase().replace(/['\s\-\.]/g, '');
}

export function categorizeProduct(product: Pick<Supply, 'name' | 'brand' | 'description'>): CategorizationResult {
  const name = (product.name || '').toLowerCase();
  const brand = normalizeBrand(product.brand || '');
  const description = (product.description || '').toLowerCase();
  
  let aquaticScore = 0;
  let reptileScore = 0;
  const matchedReasons: string[] = [];

  // **CRITICAL: Check brand exclusions FIRST before any scoring**
  // This prevents toy/aquatic brands from ever being categorized as reptile (and vice versa)
  // Use "includes" to handle brand variants like "Kong Company", "KONG®", etc.
  let excludedFromAquatic = false;
  let excludedFromReptile = false;

  for (const excludeBrand of SUPPLY_FILTERS.aquatic.excludeBrands) {
    const normalizedExclude = normalizeBrand(excludeBrand);
    if (brand.includes(normalizedExclude)) {
      excludedFromAquatic = true;
      matchedReasons.push(`Excluded from aquatic (brand): ${excludeBrand}`);
      break;
    }
  }

  for (const excludeBrand of SUPPLY_FILTERS.reptile.excludeBrands) {
    const normalizedExclude = normalizeBrand(excludeBrand);
    if (brand.includes(normalizedExclude)) {
      excludedFromReptile = true;
      matchedReasons.push(`Excluded from reptile (brand): ${excludeBrand}`);
      break;
    }
  }

  // Check exclusion keywords (also highest priority)
  for (const keyword of SUPPLY_FILTERS.aquatic.excludeKeywords) {
    if (name.includes(keyword.toLowerCase()) || description.includes(keyword.toLowerCase())) {
      excludedFromAquatic = true;
      matchedReasons.push(`Excluded from aquatic (keyword): "${keyword}"`);
      break;
    }
  }

  for (const keyword of SUPPLY_FILTERS.reptile.excludeKeywords) {
    if (name.includes(keyword.toLowerCase()) || description.includes(keyword.toLowerCase())) {
      excludedFromReptile = true;
      matchedReasons.push(`Excluded from reptile (keyword): "${keyword}"`);
      break;
    }
  }

  // Check aquatic brands (highest priority - 50 points) - ONLY if not excluded
  if (!excludedFromAquatic) {
    for (const aquaticBrand of SUPPLY_FILTERS.aquatic.includeBrands) {
      if (brand === normalizeBrand(aquaticBrand)) {
        aquaticScore += 50;
        matchedReasons.push(`Aquatic brand: ${aquaticBrand}`);
        break;
      }
    }
  }

  // Check reptile brands (highest priority - 50 points) - ONLY if not excluded
  if (!excludedFromReptile) {
    for (const reptileBrand of SUPPLY_FILTERS.reptile.includeBrands) {
      if (brand === normalizeBrand(reptileBrand)) {
        reptileScore += 50;
        matchedReasons.push(`Reptile brand: ${reptileBrand}`);
        break;
      }
    }
  }

  // Special rule: "bridge" products go to aquatics UNLESS "lizard" appears near it
  if (name.includes('bridge')) {
    // Check if "lizard" appears within 20 characters of "bridge"
    const bridgeIndex = name.indexOf('bridge');
    const searchStart = Math.max(0, bridgeIndex - 20);
    const searchEnd = Math.min(name.length, bridgeIndex + 26); // "bridge".length = 6, +20 = 26
    const nearbyText = name.substring(searchStart, searchEnd);
    
    if (nearbyText.includes('lizard')) {
      // It's a lizard bridge - let normal reptile rules handle it
      matchedReasons.push('Bridge with "lizard" - skipping aquatic rule');
    } else {
      // It's an aquarium bridge
      aquaticScore += 30;
      matchedReasons.push('Bridge (aquarium) name');
    }
  }

  // Check aquatic keywords in name (high priority - 30 points) - ONLY if not excluded
  if (!excludedFromAquatic) {
    for (const keyword of SUPPLY_FILTERS.aquatic.includeKeywords) {
      if (name.includes(keyword.toLowerCase())) {
        aquaticScore += 30;
        matchedReasons.push(`Fish/aquatic name: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check reptile keywords in name (high priority - 30 points) - ONLY if not excluded
  if (!excludedFromReptile) {
    for (const keyword of SUPPLY_FILTERS.reptile.includeKeywords) {
      if (name.includes(keyword.toLowerCase())) {
        reptileScore += 30;
        matchedReasons.push(`Reptile name: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check aquatic keywords in description (medium priority - 15 points) - ONLY if not excluded
  if (!excludedFromAquatic) {
    for (const keyword of SUPPLY_FILTERS.aquatic.includeKeywords) {
      if (description.includes(keyword.toLowerCase())) {
        aquaticScore += 15;
        matchedReasons.push(`Fish/aquatic description: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Check reptile keywords in description (medium priority - 15 points) - ONLY if not excluded
  if (!excludedFromReptile) {
    for (const keyword of SUPPLY_FILTERS.reptile.includeKeywords) {
      if (description.includes(keyword.toLowerCase())) {
        reptileScore += 15;
        matchedReasons.push(`Reptile description: "${keyword}"`);
        break; // Only count once
      }
    }
  }

  // Determine result based on scores
  const minConfidence = 25; // Minimum score to assign a category
  
  if (aquaticScore >= minConfidence && aquaticScore > reptileScore) {
    return {
      filterType: 'aquatic',
      confidence: Math.min(100, aquaticScore),
      reason: matchedReasons.join(', ')
    };
  } else if (reptileScore >= minConfidence && reptileScore > aquaticScore) {
    return {
      filterType: 'reptile',
      confidence: Math.min(100, reptileScore),
      reason: matchedReasons.join(', ')
    };
  } else {
    return {
      filterType: null,
      confidence: 0,
      reason: matchedReasons.length > 0 
        ? `${matchedReasons.join(', ')} (scores: aquatic=${aquaticScore}, reptile=${reptileScore})`
        : 'No specific fish/reptile indicators found'
    };
  }
}

/**
 * Batch categorize multiple products
 * @param products - Array of products to categorize
 * @returns Array of categorization results
 */
export function categorizeProducts(products: Pick<Supply, 'id' | 'name' | 'brand' | 'description'>[]): Array<{
  id: number;
  filterType: 'aquatic' | 'reptile' | null;
  confidence: number;
  reason: string;
}> {
  return products.map(product => ({
    id: product.id,
    ...categorizeProduct(product)
  }));
}
