import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

interface UpcEntry {
  upc: string;
  name: string;
  source?: string;
}

const abbreviations: Record<string, string> = {
  'sd': 'science diet', 'hsd': "hills science diet", 'bb': 'blue buffalo',
  'rc': 'royal canin', 'pro': 'purina pro', 'ff': 'fancy feast',
  'iam': 'iams', 'nut': 'nutro', 'nat': 'natural', 'wel': 'wellness',
  'mer': 'merrick', 'ori': 'orijen', 'aca': 'acana', 'tas': 'taste of the wild',
  'can': 'canidae', 'zign': 'zignature', 'inst': 'instinct',
  'sm': 'small', 'lg': 'large', 'med': 'medium', 'xlg': 'extra large',
  'min': 'miniature', 'std': 'standard', 'gnt': 'giant',
  'pup': 'puppy', 'kit': 'kitten', 'ad': 'adult', 'adt': 'adult',
  'sr': 'senior', 'mat': 'mature',
  'ck': 'chicken', 'chk': 'chicken', 'bf': 'beef', 'lm': 'lamb',
  'slm': 'salmon', 'sal': 'salmon', 'tk': 'turkey', 'trk': 'turkey',
  'dk': 'duck', 'wf': 'whitefish', 'ven': 'venison', 'rb': 'rabbit',
  'cn': 'can', 'cnd': 'canned', 'dry': 'dry', 'wt': 'wet',
  'trt': 'treat', 'trts': 'treats', 'bis': 'biscuit',
  'lb': 'pound', 'lbs': 'pounds', 'oz': 'ounce',
  'br': 'breed', 'dg': 'dog', 'ct': 'cat', 'fd': 'food',
  'sns': 'sensitive', 'stm': 'stomach', 'skn': 'skin', 'wgt': 'weight',
  'mgmt': 'management', 'hlth': 'health', 'jnt': 'joint', 'dgst': 'digestive',
};

function expandAndNormalize(text: string): string[] {
  let expanded = text.toLowerCase();
  for (const [abbr, full] of Object.entries(abbreviations)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  return expanded.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function calculateScore(productWords: string[], upcWords: string[]): number {
  if (upcWords.length === 0) return 0;
  
  const productSet = new Set(productWords);
  let matchCount = 0;
  
  for (const word of upcWords) {
    if (productSet.has(word)) {
      matchCount++;
    }
  }
  
  // Require at least 3 matching words for high confidence
  if (matchCount < 3) return 0;
  
  return matchCount / upcWords.length;
}

async function main() {
  console.log('=== Safe UPC Matching (No Duplicates) ===\n');
  
  // Load merged UPC database
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  console.log(`Loaded ${upcData.length} UPCs from database`);
  
  // Get current products
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    category: supplies.category,
    sku: supplies.sku,
  }).from(supplies);
  
  // Track which UPCs are already used
  const usedUpcs = new Set<string>();
  for (const p of products) {
    if (p.sku && p.sku.length >= 10) {
      usedUpcs.add(p.sku);
    }
  }
  
  console.log(`Products with UPC: ${usedUpcs.size}`);
  
  // Products that need UPCs
  const needsUpc = products.filter(p => !p.sku || p.sku.length < 10);
  console.log(`Products needing UPC: ${needsUpc.length}`);
  
  // Available UPCs (not already used)
  const availableUpcs = upcData.filter(u => !usedUpcs.has(u.upc));
  console.log(`Available UPCs: ${availableUpcs.length}`);
  
  // Build word index for fast lookup
  const wordIndex = new Map<string, UpcEntry[]>();
  for (const entry of availableUpcs) {
    const words = expandAndNormalize(entry.name);
    for (const word of words) {
      if (!wordIndex.has(word)) {
        wordIndex.set(word, []);
      }
      wordIndex.get(word)!.push(entry);
    }
  }
  
  console.log(`\nMatching products...`);
  
  const matches: { productId: number; productName: string; upc: string; upcName: string; score: number }[] = [];
  const assignedUpcs = new Set<string>();
  
  for (const product of needsUpc) {
    const fullName = `${product.brand || ''} ${product.name}`.trim();
    const productWords = expandAndNormalize(fullName);
    
    // Find candidate UPCs
    const candidateScores = new Map<string, { entry: UpcEntry; count: number }>();
    
    for (const word of productWords) {
      const candidates = wordIndex.get(word) || [];
      for (const entry of candidates) {
        if (assignedUpcs.has(entry.upc)) continue; // Skip already assigned
        
        const key = entry.upc;
        if (!candidateScores.has(key)) {
          candidateScores.set(key, { entry, count: 0 });
        }
        candidateScores.get(key)!.count++;
      }
    }
    
    // Score and find best match
    let bestMatch: { upc: string; name: string; score: number } | null = null;
    
    for (const [upc, { entry, count }] of candidateScores) {
      if (count < 3) continue; // Need at least 3 matching words
      
      const upcWords = expandAndNormalize(entry.name);
      const score = calculateScore(productWords, upcWords);
      
      // High threshold: 80% match required
      if (score >= 0.8 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { upc, name: entry.name, score };
      }
    }
    
    if (bestMatch) {
      matches.push({
        productId: product.id,
        productName: fullName,
        upc: bestMatch.upc,
        upcName: bestMatch.name,
        score: bestMatch.score,
      });
      assignedUpcs.add(bestMatch.upc); // Mark as used
    }
  }
  
  console.log(`Found ${matches.length} high-confidence matches (80%+ with 3+ words)`);
  
  // Apply matches
  let applied = 0;
  for (const match of matches) {
    try {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(sql`${supplies.id} = ${match.productId}`);
      applied++;
    } catch (e) {
      console.error(`Failed: ${match.productId}`);
    }
  }
  
  console.log(`Applied ${applied} UPCs`);
  
  // Save matches for review
  fs.writeFileSync('.local/state/memory/safe_matches_applied.json', JSON.stringify(matches, null, 2));
  
  // Final stats
  const finalProducts = await db.select({
    id: supplies.id,
    sku: supplies.sku,
  }).from(supplies);
  
  const finalWithUpc = finalProducts.filter(p => p.sku && p.sku.length >= 10);
  
  // Count duplicates
  const skuCount = new Map<string, number>();
  for (const p of finalProducts) {
    if (p.sku && p.sku.length >= 10) {
      skuCount.set(p.sku, (skuCount.get(p.sku) || 0) + 1);
    }
  }
  const dupes = Array.from(skuCount.values()).filter(c => c > 1).length;
  
  console.log(`\n=== Final Results ===`);
  console.log(`Products with UPC: ${finalWithUpc.length} / ${finalProducts.length} (${(finalWithUpc.length / finalProducts.length * 100).toFixed(1)}%)`);
  console.log(`Duplicate SKUs: ${dupes}`);
}

main().catch(console.error);
