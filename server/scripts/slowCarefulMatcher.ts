import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, and, isNull, ilike, or, sql } from 'drizzle-orm';
import * as fs from 'fs';

interface ExtractedProduct {
  productNumber: string;
  upc: string;
  description: string;
  expandedDesc: string;
  brand: string;
}

// Load extracted products
const products: ExtractedProduct[] = JSON.parse(
  fs.readFileSync('/tmp/all_extracted_products.json', 'utf-8')
);

console.log(`Loaded ${products.length} extracted products with UPCs`);

// Normalize text for matching
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract tokens
function getTokens(text: string): string[] {
  return normalize(text).split(' ').filter(t => t.length > 1);
}

// Get numeric size from product
function extractSize(text: string): {value: number, unit: string} | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(oz|lb|g|ml|ct|pk|in|ft|gal)/i);
  if (match) {
    return { value: parseFloat(match[1]), unit: match[2].toLowerCase() };
  }
  return null;
}

// Calculate token overlap score
function tokenOverlapScore(tokens1: string[], tokens2: string[]): number {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  
  let matches = 0;
  for (const token of set1) {
    if (set2.has(token)) matches++;
  }
  
  // Jaccard-like score but weighted toward precision
  const precision = matches / set1.size;
  const recall = matches / set2.size;
  
  if (precision + recall === 0) return 0;
  return 2 * (precision * recall) / (precision + recall);
}

// Check if brand matches
function brandMatches(dbBrand: string, productBrand: string): boolean {
  if (!dbBrand || !productBrand) return false;
  
  const dbNorm = normalize(dbBrand);
  const prodNorm = normalize(productBrand);
  
  return dbNorm.includes(prodNorm) || prodNorm.includes(dbNorm) ||
         dbNorm.split(' ').some(w => prodNorm.includes(w)) ||
         prodNorm.split(' ').some(w => dbNorm.includes(w));
}

// Main matching function
async function runSlowMatcher() {
  console.log('=== Slow Careful Matcher ===\n');
  
  // Get supplies without SKU
  const unmatchedSupplies = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`${unmatchedSupplies.length} supplies need SKU matching\n`);
  
  // Create product lookup by expanded tokens
  const productsByToken = new Map<string, ExtractedProduct[]>();
  
  for (const product of products) {
    const tokens = getTokens(product.expandedDesc);
    for (const token of tokens) {
      if (token.length > 2) {
        if (!productsByToken.has(token)) {
          productsByToken.set(token, []);
        }
        productsByToken.get(token)!.push(product);
      }
    }
  }
  
  console.log(`Built token index with ${productsByToken.size} tokens\n`);
  
  let matchCount = 0;
  const matchLog: string[] = [];
  const skippedLog: string[] = [];
  
  for (let i = 0; i < unmatchedSupplies.length; i++) {
    const supply = unmatchedSupplies[i];
    const supplyName = supply.name;
    const supplyBrand = supply.brand || '';
    
    const supplyTokens = getTokens(supplyName);
    const supplySize = extractSize(supplyName);
    
    // Find candidate products by token overlap
    const candidateScores = new Map<string, {product: ExtractedProduct, score: number}>();
    
    // Get candidates from token index
    for (const token of supplyTokens) {
      const candidates = productsByToken.get(token) || [];
      for (const candidate of candidates) {
        const key = candidate.upc;
        if (!candidateScores.has(key)) {
          candidateScores.set(key, { product: candidate, score: 0 });
        }
        candidateScores.get(key)!.score += 1;
      }
    }
    
    // Score all candidates
    let bestMatch: ExtractedProduct | null = null;
    let bestScore = 0;
    
    for (const [upc, {product, score: tokenHits}] of candidateScores) {
      // Skip if too few token hits
      if (tokenHits < 2) continue;
      
      const productTokens = getTokens(product.expandedDesc);
      
      // Calculate detailed score
      let score = 0;
      
      // Token overlap (0-40 points)
      const overlap = tokenOverlapScore(supplyTokens, productTokens);
      score += overlap * 40;
      
      // Brand match (0-25 points)
      if (brandMatches(supplyBrand, product.brand)) {
        score += 25;
      }
      
      // Size match (0-20 points)
      const productSize = extractSize(product.expandedDesc);
      if (supplySize && productSize) {
        if (supplySize.unit === productSize.unit && 
            Math.abs(supplySize.value - productSize.value) < 0.5) {
          score += 20;
        }
      }
      
      // Word count penalty for very different lengths
      const lenDiff = Math.abs(supplyTokens.length - productTokens.length);
      score -= lenDiff * 2;
      
      // Boost for exact substring matches
      const supplyNorm = normalize(supplyName);
      const productNorm = normalize(product.expandedDesc);
      
      if (productNorm.includes(supplyNorm.slice(0, 15)) ||
          supplyNorm.includes(productNorm.slice(0, 15))) {
        score += 10;
      }
      
      // Check for key product words
      const keyWords = ['food', 'treat', 'toy', 'filter', 'pump', 'heater', 'light', 
                       'conditioner', 'medication', 'supplement', 'shampoo', 'collar',
                       'leash', 'bowl', 'cage', 'bed', 'chew', 'bone'];
      for (const kw of keyWords) {
        const inSupply = supplyTokens.includes(kw);
        const inProduct = productTokens.includes(kw);
        if (inSupply && inProduct) {
          score += 5;
        } else if (inSupply !== inProduct) {
          score -= 5;
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }
    
    // Threshold for acceptance - lowered to catch good matches
    const threshold = 42;
    
    if (bestMatch && bestScore >= threshold) {
      // Apply the match
      await db.update(supplies)
        .set({ sku: bestMatch.upc })
        .where(eq(supplies.id, supply.id));
      
      matchCount++;
      matchLog.push(`[${bestScore.toFixed(1)}] "${supplyName}" -> "${bestMatch.description}" (${bestMatch.upc})`);
      
      if (matchCount % 100 === 0) {
        console.log(`Matched ${matchCount}...`);
      }
    } else if (bestMatch && bestScore > 30) {
      skippedLog.push(`[${bestScore.toFixed(1)}] "${supplyName}" ~ "${bestMatch.description}" (${bestMatch.upc})`);
    }
    
    // Progress update
    if ((i + 1) % 500 === 0) {
      console.log(`Processed ${i + 1}/${unmatchedSupplies.length}`);
    }
  }
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Matched: ${matchCount}`);
  console.log(`Near-matches (score 30-45): ${skippedLog.length}`);
  
  // Save logs
  fs.writeFileSync('/tmp/slow_match_log.txt', matchLog.join('\n'));
  fs.writeFileSync('/tmp/slow_near_matches.txt', skippedLog.join('\n'));
  
  console.log('\nLogs saved to /tmp/slow_match_log.txt and /tmp/slow_near_matches.txt');
  
  // Final counts
  const finalWithSku = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const finalWithoutSku = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`\nFinal counts:`);
  console.log(`With SKU: ${finalWithSku[0].count}`);
  console.log(`Without SKU: ${finalWithoutSku[0].count}`);
}

runSlowMatcher().catch(console.error);
