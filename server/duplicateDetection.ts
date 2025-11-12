import { createHash } from "crypto";
import type { Supply, InsertSupply } from "@shared/schema";

/**
 * Normalizes a string for consistent comparison:
 * - Converts to lowercase
 * - Trims whitespace
 * - Collapses multiple spaces to single space
 * - PRESERVES all punctuation and special characters that carry business meaning
 *   (like +, #, &, /, -, parentheses, etc.)
 */
export function normalizeString(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " "); // Only collapse multiple spaces to single space
}

/**
 * Creates a composite key from name + brand + size for duplicate detection
 * Format: "normalizedName|normalizedBrand|normalizedSize"
 */
export function createCompositeKey(
  name: string,
  brand: string | null | undefined,
  size: string | null | undefined
): string {
  const normalizedName = normalizeString(name);
  const normalizedBrand = normalizeString(brand);
  const normalizedSize = normalizeString(size);
  
  return `${normalizedName}|${normalizedBrand}|${normalizedSize}`;
}

/**
 * Normalizes SKU for consistent matching:
 * - Converts to uppercase
 * - Trims whitespace
 * - Removes dashes and spaces
 */
export function normalizeSku(sku: string | null | undefined): string | null {
  if (!sku) return null;
  return sku
    .toUpperCase()
    .trim()
    .replace(/[-\s]/g, ""); // Remove dashes and spaces
}

/**
 * Calculates SHA-256 checksum of supply data for change detection
 * Includes all fields that matter for content comparison
 */
export function calculateDataChecksum(supply: {
  name: string;
  category: string;
  brand?: string | null;
  price: string | number;
  description?: string | null;
  stockQuantity?: number | null;
  size?: string | null;
  weight?: string | null;
}): string {
  // Create stable string representation of data
  const data = JSON.stringify({
    name: normalizeString(supply.name),
    category: normalizeString(supply.category),
    brand: normalizeString(supply.brand),
    price: typeof supply.price === 'string' ? parseFloat(supply.price) : supply.price,
    description: normalizeString(supply.description),
    stockQuantity: supply.stockQuantity || 0,
    size: normalizeString(supply.size),
    weight: normalizeString(supply.weight),
  });
  
  // Calculate SHA-256 hash
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Determines the match type between a staged item and existing supply
 */
export type MatchType = "exact" | "update" | "new" | "duplicate_sku" | "duplicate_composite";

export interface DuplicateMatch {
  matchType: MatchType;
  matchedSupply: Supply | null;
  conflictReason: string | null;
  shouldUpdate: boolean;
}

/**
 * Checks for duplicates using multiple strategies:
 * 1. SKU match (if SKU provided)
 * 2. Composite key match (name + brand + size)
 * 3. Checksum comparison to detect actual changes
 */
export function findDuplicateMatch(
  stagedItem: {
    sku?: string | null;
    name: string;
    brand?: string | null;
    size?: string | null;
    dataChecksum: string;
  },
  existingSupplies: Supply[]
): DuplicateMatch {
  const normalizedSku = normalizeSku(stagedItem.sku);
  const compositeKey = createCompositeKey(stagedItem.name, stagedItem.brand, stagedItem.size);
  
  // Strategy 1: Check for SKU match first (most reliable if available)
  if (normalizedSku) {
    const skuMatch = existingSupplies.find(s => {
      // Note: Existing supplies table doesn't have SKU yet, so this is future-proofing
      return false; // TODO: Enable when supplies table has SKU column
    });
    
    if (skuMatch) {
      const existingChecksum = calculateDataChecksum(skuMatch);
      const isExactMatch = existingChecksum === stagedItem.dataChecksum;
      
      return {
        matchType: isExactMatch ? "exact" : "update",
        matchedSupply: skuMatch,
        conflictReason: isExactMatch ? "Exact duplicate (SKU match)" : "SKU match with different data",
        shouldUpdate: !isExactMatch,
      };
    }
  }
  
  // Strategy 2: Check for composite key match (name + brand + size)
  const compositeMatch = existingSupplies.find(s => {
    const existingCompositeKey = createCompositeKey(s.name, s.brand, s.size);
    return existingCompositeKey === compositeKey;
  });
  
  if (compositeMatch) {
    const existingChecksum = calculateDataChecksum(compositeMatch);
    const isExactMatch = existingChecksum === stagedItem.dataChecksum;
    
    return {
      matchType: isExactMatch ? "exact" : "update",
      matchedSupply: compositeMatch,
      conflictReason: isExactMatch 
        ? "Exact duplicate (name/brand/size match)" 
        : "Name/brand/size match with different data (price, description, stock, etc.)",
      shouldUpdate: !isExactMatch,
    };
  }
  
  // No match found - this is a new item
  return {
    matchType: "new",
    matchedSupply: null,
    conflictReason: null,
    shouldUpdate: false,
  };
}
