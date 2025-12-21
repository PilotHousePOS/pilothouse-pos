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
  // Brands
  'sd': 'science diet',
  'hsd': "hill's science diet",
  'bb': 'blue buffalo',
  'rc': 'royal canin',
  'pro': 'purina pro',
  'ff': 'fancy feast',
  'iam': 'iams',
  'nut': 'nutro',
  'nat': 'natural',
  'wel': 'wellness',
  'mer': 'merrick',
  'ori': 'orijen',
  'aca': 'acana',
  'tas': 'taste of the wild',
  'can': 'canidae',
  'zign': 'zignature',
  'inst': 'instinct',
  
  // Size/Type
  'sm': 'small',
  'lg': 'large',
  'med': 'medium',
  'xlg': 'extra large',
  'min': 'miniature',
  'std': 'standard',
  'gnt': 'giant',
  
  // Life Stage
  'pup': 'puppy',
  'kit': 'kitten',
  'ad': 'adult',
  'adt': 'adult',
  'sr': 'senior',
  'mat': 'mature',
  
  // Protein
  'ck': 'chicken',
  'chk': 'chicken',
  'bf': 'beef',
  'lm': 'lamb',
  'slm': 'salmon',
  'sal': 'salmon',
  'tk': 'turkey',
  'trk': 'turkey',
  'dk': 'duck',
  'wf': 'whitefish',
  'ven': 'venison',
  'rb': 'rabbit',
  
  // Food Types
  'cn': 'can',
  'cnd': 'canned',
  'dry': 'dry',
  'wt': 'wet',
  'trt': 'treat',
  'trts': 'treats',
  'bis': 'biscuit',
  
  // Weight abbreviations
  'lb': 'pound',
  'lbs': 'pounds',
  'oz': 'ounce',
  '#': 'pound',
  
  // Species/Breed
  'br': 'breed',
  'dg': 'dog',
  'ct': 'cat',
  'fd': 'food',
  
  // Health
  'sns': 'sensitive',
  'stm': 'stomach',
  'skn': 'skin',
  'wgt': 'weight',
  'mgmt': 'management',
  'hlth': 'health',
  'jnt': 'joint',
  'dgst': 'digestive',
  'idl': 'ideal',
  'perf': 'perfect',
  'ori': 'original',
  'lite': 'light',
  'ind': 'indoor',
};

function expandAbbreviations(text: string): string {
  let expanded = text.toLowerCase();
  
  // Replace abbreviations with full words
  for (const [abbr, full] of Object.entries(abbreviations)) {
    // Match as whole word or at word boundaries
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  
  return expanded;
}

function normalizeText(text: string): string {
  return expandAbbreviations(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMatchScore(productName: string, upcName: string): number {
  const normalizedProduct = normalizeText(productName);
  const normalizedUpc = normalizeText(upcName);
  
  const productWords = new Set(normalizedProduct.split(' ').filter(w => w.length > 2));
  const upcWords = new Set(normalizedUpc.split(' ').filter(w => w.length > 2));
  
  let matchCount = 0;
  for (const word of upcWords) {
    if (productWords.has(word)) {
      matchCount++;
    }
  }
  
  const score = upcWords.size > 0 ? matchCount / upcWords.size : 0;
  return score;
}

async function main() {
  console.log('=== Merging UPC Databases ===\n');
  
  // Load all UPC sources
  const sources: { name: string; data: UpcEntry[] }[] = [];
  
  const files = [
    { path: '.local/state/memory/ocr_unique_upcs.json', name: 'OCR Invoices' },
    { path: '.local/state/memory/combined_upc_database.json', name: 'Excel/Sheet' },
    { path: '.local/state/memory/master_upc_database.json', name: 'Master DB' },
  ];
  
  for (const file of files) {
    if (fs.existsSync(file.path)) {
      try {
        const data = JSON.parse(fs.readFileSync(file.path, 'utf-8'));
        sources.push({ name: file.name, data });
        console.log(`Loaded ${data.length} entries from ${file.name}`);
      } catch (e) {
        console.log(`Error loading ${file.path}`);
      }
    }
  }
  
  // Merge all UPCs, keeping best name for each
  const upcMap = new Map<string, UpcEntry>();
  
  for (const source of sources) {
    for (const entry of source.data) {
      const upc = String(entry.upc).replace(/\D/g, '');
      if (upc.length >= 10 && upc.length <= 14) {
        const existing = upcMap.get(upc);
        if (!existing || entry.name.length > existing.name.length) {
          upcMap.set(upc, { upc, name: entry.name, source: source.name });
        }
      }
    }
  }
  
  console.log(`\nTotal unique UPCs after merge: ${upcMap.size}`);
  
  // Save merged database
  const merged = Array.from(upcMap.values());
  fs.writeFileSync('.local/state/memory/merged_upc_database.json', JSON.stringify(merged, null, 2));
  console.log('Saved merged database to .local/state/memory/merged_upc_database.json');
  
  // Load products from database
  console.log('\n=== Matching to Products ===\n');
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  console.log(`Total products in database: ${products.length}`);
  
  const productsWithUpc = products.filter(p => p.sku && p.sku.length >= 10);
  const productsWithoutUpc = products.filter(p => !p.sku || p.sku.length < 10);
  
  console.log(`Products with UPC: ${productsWithUpc.length} (${(productsWithUpc.length / products.length * 100).toFixed(1)}%)`);
  console.log(`Products without UPC: ${productsWithoutUpc.length}`);
  
  // Match products without UPC
  const matches: { productId: number; productName: string; upc: string; upcName: string; score: number }[] = [];
  const upcEntries = Array.from(upcMap.values());
  
  console.log(`\nMatching ${productsWithoutUpc.length} products against ${upcEntries.length} UPCs...`);
  
  for (const product of productsWithoutUpc) {
    const fullName = `${product.brand || ''} ${product.name}`.trim();
    
    let bestMatch: { upc: string; name: string; score: number } | null = null;
    
    for (const entry of upcEntries) {
      const score = getMatchScore(fullName, entry.name);
      if (score >= 0.6 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { upc: entry.upc, name: entry.name, score };
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
  
  // Apply high-confidence matches (score >= 0.7)
  const highConfidence = matches.filter(m => m.score >= 0.7);
  console.log(`High confidence matches (≥70%): ${highConfidence.length}`);
  
  // Apply matches
  let applied = 0;
  for (const match of highConfidence) {
    try {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(sql`${supplies.id} = ${match.productId}`);
      applied++;
    } catch (e) {
      console.error(`Failed to apply UPC to product ${match.productId}`);
    }
  }
  
  console.log(`Applied ${applied} UPCs to products`);
  
  // Save remaining matches for manual review
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
