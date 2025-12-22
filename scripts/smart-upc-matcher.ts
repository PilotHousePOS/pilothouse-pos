import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

// Brand name normalizations - handles spacing and common variations
const BRAND_NORMALIZATIONS: Record<string, string> = {
  'zoomed': 'zoo med', 'zoo med': 'zoo med', 'zm': 'zoo med',
  'exoterra': 'exo terra', 'exo terra': 'exo terra', 'ext': 'exo terra',
  'bluebuffalo': 'blue buffalo', 'blue buffalo': 'blue buffalo', 'bb': 'blue buffalo',
  'royalcanin': 'royal canin', 'royal canin': 'royal canin', 'rc': 'royal canin',
  'sciencediet': 'science diet', 'science diet': 'science diet', 'sd': 'science diet',
  'naturalbalance': 'natural balance', 'natural balance': 'natural balance', 'nb': 'natural balance',
  'nutrisource': 'nutri source', 'nutri source': 'nutri source', 'ns': 'nutri source',
  'pennplax': 'penn plax', 'penn plax': 'penn plax',
  'fourpaws': 'four paws', 'four paws': 'four paws',
  'jwpet': 'jw pet', 'jw pet': 'jw pet',
  'oceannutrition': 'ocean nutrition', 'ocean nutrition': 'ocean nutrition',
  'omegaone': 'omega one', 'omega one': 'omega one',
  'healthextension': 'health extension', 'health extension': 'health extension',
  'purevita': 'pure vita', 'pure vita': 'pure vita', 'pv': 'pure vita',
};

// Word abbreviation expansions
const WORD_EXPANSIONS: Record<string, string> = {
  'sm': 'small', 'sml': 'small',
  'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large',
  'xl': 'extra large', 'xlg': 'extra large',
  'sub': 'substrate', 'substr': 'substrate',
  'qt': 'quart', 'qts': 'quart',
  'lbs': 'lb', 'lb': 'lb',
  'oz': 'oz', 'ozs': 'oz',
  'pk': 'pack', 'pck': 'pack',
  'ct': 'count',
  'hyrdo': 'hydro', // common typo
  'repti': 'repti', 'repta': 'repta',
  'eco': 'eco', 'bio': 'bio',
  'galap': 'galapagos',
  'juv': 'juvenile', 'adult': 'adult', 'adlt': 'adult',
  'envi': 'environment', 'enviro': 'environment', 'enviroment': 'environment',
  'sup': 'supplement', 'supp': 'supplement',
  'vit': 'vitamin', 'vitam': 'vitamin',
  'main': 'maintenance', 'maint': 'maintenance',
  'gourment': 'gourmet', // common typo
  '10g': '10 gallon', '20g': '20 gallon', '30g': '30 gallon', '40g': '40 gallon', '55g': '55 gallon', '60g': '60 gallon',
  '10lbs': '10 lb', '20lbs': '20 lb', '4qt': '4 quart', '8qt': '8 quart', '24qt': '24 quart',
  'ecoearth': 'eco earth',
  'biothane': 'bio drain', // mapping variation
  'flukers': 'flukers', 'flu': 'flukers', 'fluk': 'flukers',
  'fluval': 'fluval', 'fluv': 'fluval',
  'hikari': 'hikari', 'hik': 'hikari',
  'tetra': 'tetra', 'tet': 'tetra',
  'aqueon': 'aqueon', 'aqu': 'aqueon',
  'marineland': 'marineland', 'mar': 'marineland',
  'seachem': 'seachem', 'sec': 'seachem',
  'kaytee': 'kaytee', 'kay': 'kaytee',
  'oxbow': 'oxbow', 'oxb': 'oxbow',
  'zilla': 'zilla', 'zil': 'zilla',
  'kong': 'kong', 'kng': 'kong',
  'nylabone': 'nylabone', 'nyl': 'nylabone',
  'benebone': 'benebone', 'ben': 'benebone',
  'coastal': 'coastal', 'cos': 'coastal',
  'greenies': 'greenies', 'gre': 'greenies',
  'fromm': 'fromm', 'frm': 'fromm',
  'victor': 'victor', 'vict': 'victor',
  'diamond': 'diamond', 'diam': 'diamond',
  'canidae': 'canidae', 'cand': 'canidae',
  'primal': 'primal', 'prm': 'primal',
  'zignature': 'zignature', 'zig': 'zignature', 'zign': 'zignature',
};

function normalizeText(text: string): string {
  let result = text.toLowerCase()
    .replace(/[™®©'"#&]/g, '')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Normalize brand names (handle no-space versions)
  for (const [pattern, replacement] of Object.entries(BRAND_NORMALIZATIONS)) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
    result = result.replace(regex, replacement);
  }
  
  // Also handle concatenated brand names without word boundaries
  result = result.replace(/zoomed/gi, 'zoo med');
  result = result.replace(/exoterra/gi, 'exo terra');
  result = result.replace(/bluebuffalo/gi, 'blue buffalo');
  
  return result;
}

function getTokens(text: string): string[] {
  const normalized = normalizeText(text);
  const words = normalized.split(/[\s\-_]+/);
  
  const tokens: string[] = [];
  for (const word of words) {
    const clean = word.replace(/[^a-z0-9]/g, '');
    if (!clean) continue;
    
    const expanded = WORD_EXPANSIONS[clean] || clean;
    tokens.push(...expanded.split(' '));
  }
  
  return tokens.filter(t => t.length > 0);
}

function getTokenSet(text: string): Set<string> {
  return new Set(getTokens(text));
}

function getSortedKey(text: string): string {
  const tokens = getTokens(text);
  return [...new Set(tokens)].sort().join('');
}

function tokenOverlap(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0;
  
  let matches = 0;
  for (const t of set1) {
    if (set2.has(t)) matches++;
  }
  
  // Use Jaccard similarity
  const union = new Set([...set1, ...set2]);
  return matches / union.size;
}

function tokenContainment(source: Set<string>, target: Set<string>): number {
  if (source.size === 0) return 0;
  
  let matches = 0;
  for (const t of source) {
    if (target.has(t)) matches++;
  }
  
  return matches / source.size;
}

async function main() {
  console.log('=== SMART UPC MATCHER ===');
  console.log('This matcher corrects wrong UPCs and fills gaps.\n');
  
  // Load all sources
  const allMaybe: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
  const goodMaybe = allMaybe.slice(0, 3171);
  
  const master: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
  const googleSheet = master.filter(e => e.source === 'google_sheet');
  const camscanner = master.filter(e => e.source === 'camscanner');
  
  console.log('Maybe Inventory entries:', goodMaybe.length);
  console.log('Google Sheet entries:', googleSheet.length);
  console.log('Camscanner entries:', camscanner.length);
  
  // Get all products
  const products = await db.select({ 
    id: supplies.id, 
    name: supplies.name, 
    sku: supplies.sku 
  }).from(supplies);
  
  console.log('Total products:', products.length);
  
  // Build product lookup maps
  const productsByKey = new Map<string, typeof products[0]>();
  const productTokens = new Map<number, { product: typeof products[0], tokens: Set<string> }>();
  
  for (const p of products) {
    const key = getSortedKey(p.name);
    if (!productsByKey.has(key)) {
      productsByKey.set(key, p);
    }
    productTokens.set(p.id, { product: p, tokens: getTokenSet(p.name) });
  }
  
  console.log('Unique product keys:', productsByKey.size);
  
  let updated = 0;
  let added = 0;
  let corrected = 0;
  const usedUPCs = new Set<string>();
  const matchLog: string[] = [];
  
  // Process Maybe Inventory first (highest quality)
  console.log('\n=== Processing Maybe Inventory ===');
  
  for (const entry of goodMaybe) {
    const entryKey = getSortedKey(entry.name);
    const entryTokens = getTokenSet(entry.name);
    
    // Try exact key match first
    let matchedProduct = productsByKey.get(entryKey);
    
    // If no exact match, try token overlap
    if (!matchedProduct) {
      let bestScore = 0;
      let bestProduct: typeof products[0] | null = null;
      
      for (const [id, { product, tokens }] of productTokens) {
        const score = tokenOverlap(entryTokens, tokens);
        if (score > bestScore && score >= 0.65) {
          bestScore = score;
          bestProduct = product;
        }
      }
      
      if (bestProduct && bestScore >= 0.65) {
        matchedProduct = bestProduct;
      }
    }
    
    if (matchedProduct && !usedUPCs.has(entry.upc)) {
      const currentSku = matchedProduct.sku?.trim() || '';
      
      if (!currentSku) {
        // No UPC - add it
        await db.update(supplies).set({ sku: entry.upc }).where(eq(supplies.id, matchedProduct.id));
        added++;
        usedUPCs.add(entry.upc);
        matchLog.push(`ADD: "${entry.name}" -> "${matchedProduct.name}" = ${entry.upc}`);
      } else if (currentSku !== entry.upc) {
        // Different UPC - maybe_inventory is more trusted, so update
        await db.update(supplies).set({ sku: entry.upc }).where(eq(supplies.id, matchedProduct.id));
        corrected++;
        usedUPCs.add(entry.upc);
        matchLog.push(`CORRECT: "${matchedProduct.name}" ${currentSku} -> ${entry.upc}`);
      }
      
      updated++;
    }
  }
  
  console.log(`Maybe Inventory: ${updated} matches (${added} added, ${corrected} corrected)`);
  
  // Process Google Sheet
  console.log('\n=== Processing Google Sheet ===');
  let googleUpdated = 0;
  let googleAdded = 0;
  
  for (const entry of googleSheet) {
    const entryTokens = getTokenSet(entry.name);
    
    let bestScore = 0;
    let bestProduct: typeof products[0] | null = null;
    
    for (const [id, { product, tokens }] of productTokens) {
      // Skip if already has a UPC from maybe_inventory
      if (usedUPCs.has(product.sku || '')) continue;
      
      const score = tokenOverlap(entryTokens, tokens);
      if (score > bestScore && score >= 0.65) {
        bestScore = score;
        bestProduct = product;
      }
    }
    
    if (bestProduct && !usedUPCs.has(entry.upc)) {
      const currentSku = bestProduct.sku?.trim() || '';
      
      if (!currentSku) {
        await db.update(supplies).set({ sku: entry.upc }).where(eq(supplies.id, bestProduct.id));
        googleAdded++;
        usedUPCs.add(entry.upc);
      }
      googleUpdated++;
    }
  }
  
  console.log(`Google Sheet: ${googleUpdated} matches (${googleAdded} added)`);
  
  // Process Camscanner
  console.log('\n=== Processing Camscanner ===');
  let camUpdated = 0;
  let camAdded = 0;
  
  for (const entry of camscanner) {
    const entryKey = getSortedKey(entry.name);
    const entryTokens = getTokenSet(entry.name);
    
    let matchedProduct = productsByKey.get(entryKey);
    
    if (!matchedProduct) {
      let bestScore = 0;
      
      for (const [id, { product, tokens }] of productTokens) {
        if (usedUPCs.has(product.sku || '')) continue;
        
        const score = tokenOverlap(entryTokens, tokens);
        if (score > bestScore && score >= 0.7) {
          bestScore = score;
          matchedProduct = product;
        }
      }
    }
    
    if (matchedProduct && !usedUPCs.has(entry.upc)) {
      const currentSku = matchedProduct.sku?.trim() || '';
      
      if (!currentSku) {
        await db.update(supplies).set({ sku: entry.upc }).where(eq(supplies.id, matchedProduct.id));
        camAdded++;
        usedUPCs.add(entry.upc);
      }
      camUpdated++;
    }
  }
  
  console.log(`Camscanner: ${camUpdated} matches (${camAdded} added)`);
  
  // Final count
  const finalProducts = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const finalWithSku = finalProducts.filter(p => p.sku && p.sku.trim() !== '');
  
  console.log('\n=== FINAL RESULTS ===');
  console.log(`Total with UPC: ${finalWithSku.length}/${finalProducts.length} (${((finalWithSku.length / finalProducts.length) * 100).toFixed(1)}%)`);
  console.log(`Added: ${added + googleAdded + camAdded}`);
  console.log(`Corrected: ${corrected}`);
  
  // Save match log
  fs.writeFileSync('scripts/match_log.txt', matchLog.join('\n'));
  console.log('\nMatch log saved to scripts/match_log.txt');
  
  process.exit(0);
}

main().catch(console.error);
