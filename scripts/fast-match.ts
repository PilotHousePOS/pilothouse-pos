import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

interface UpcEntry {
  upc: string;
  name: string;
  source?: string;
}

// Comprehensive abbreviation expansion mapping
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
  'lb': 'pound', 'lbs': 'pounds', 'oz': 'ounce', '#': 'pound',
  'br': 'breed', 'dg': 'dog', 'ct': 'cat', 'fd': 'food',
  'sns': 'sensitive', 'stm': 'stomach', 'skn': 'skin', 'wgt': 'weight',
  'mgmt': 'management', 'hlth': 'health', 'jnt': 'joint', 'dgst': 'digestive',
  'idl': 'ideal', 'perf': 'perfect', 'lite': 'light', 'ind': 'indoor',
};

function expandAndNormalize(text: string): Set<string> {
  let expanded = text.toLowerCase();
  for (const [abbr, full] of Object.entries(abbreviations)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  const words = expanded.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  return new Set(words);
}

async function main() {
  console.log('=== Fast UPC Matching ===\n');
  
  // Load merged UPC database
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  console.log(`Loaded ${upcData.length} UPCs from merged database`);
  
  // Build word index for fast lookup
  const wordIndex = new Map<string, UpcEntry[]>();
  for (const entry of upcData) {
    const words = expandAndNormalize(entry.name);
    for (const word of words) {
      if (!wordIndex.has(word)) {
        wordIndex.set(word, []);
      }
      wordIndex.get(word)!.push(entry);
    }
  }
  console.log(`Built index with ${wordIndex.size} unique words`);
  
  // Load products without SKU
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  const productsWithoutUpc = products.filter(p => !p.sku || p.sku.length < 10);
  console.log(`Products without UPC: ${productsWithoutUpc.length}`);
  
  // Match using word index
  const matches: { productId: number; productName: string; upc: string; upcName: string; score: number }[] = [];
  
  for (const product of productsWithoutUpc) {
    const fullName = `${product.brand || ''} ${product.name}`.trim();
    const productWords = expandAndNormalize(fullName);
    
    // Find candidate UPCs that share at least 2 words
    const candidateScores = new Map<string, { entry: UpcEntry; count: number }>();
    
    for (const word of productWords) {
      const candidates = wordIndex.get(word) || [];
      for (const entry of candidates) {
        const key = entry.upc;
        if (!candidateScores.has(key)) {
          candidateScores.set(key, { entry, count: 0 });
        }
        candidateScores.get(key)!.count++;
      }
    }
    
    // Score candidates
    let bestMatch: { upc: string; name: string; score: number } | null = null;
    
    for (const [upc, { entry, count }] of candidateScores) {
      if (count < 2) continue; // Need at least 2 matching words
      
      const upcWords = expandAndNormalize(entry.name);
      const score = upcWords.size > 0 ? count / upcWords.size : 0;
      
      if (score >= 0.6 && (!bestMatch || score > bestMatch.score)) {
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
    }
  }
  
  console.log(`Found ${matches.length} potential matches`);
  
  // Apply high-confidence matches
  const highConfidence = matches.filter(m => m.score >= 0.7);
  console.log(`High confidence matches (≥70%): ${highConfidence.length}`);
  
  let applied = 0;
  for (const match of highConfidence) {
    try {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(sql`${supplies.id} = ${match.productId}`);
      applied++;
      if (applied % 50 === 0) console.log(`Applied ${applied}...`);
    } catch (e) {
      console.error(`Failed to apply UPC to product ${match.productId}`);
    }
  }
  
  console.log(`Applied ${applied} UPCs to products`);
  
  // Save medium confidence for review
  const mediumConfidence = matches.filter(m => m.score >= 0.6 && m.score < 0.7);
  fs.writeFileSync('.local/state/memory/medium_confidence_matches.json', JSON.stringify(mediumConfidence, null, 2));
  console.log(`Saved ${mediumConfidence.length} medium-confidence matches for review`);
  
  // Final stats
  const finalProducts = await db.select({
    id: supplies.id,
    sku: supplies.sku,
  }).from(supplies);
  
  const finalWithUpc = finalProducts.filter(p => p.sku && p.sku.length >= 10);
  console.log(`\n=== Final Results ===`);
  console.log(`Products with UPC: ${finalWithUpc.length} / ${finalProducts.length} (${(finalWithUpc.length / finalProducts.length * 100).toFixed(1)}%)`);
}

main().catch(console.error);
