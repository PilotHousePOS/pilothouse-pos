import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, isNull, or } from 'drizzle-orm';
import * as fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

const EXPANSIONS: Record<string, string> = {
  'sd': 'science diet', 'zml': 'zoo med', 'zm': 'zoo med', 'zil': 'zilla',
  'gal': 'galapagos', 'ext': 'exo terra', 'exo': 'exo terra',
  'oxb': 'oxbow', 'kay': 'kaytee', 'hik': 'hikari', 'tet': 'tetra',
  'aqu': 'aqueon', 'aquar': 'aquarium', 'mar': 'marineland', 'sec': 'seachem',
  'gre': 'greenies', 'kon': 'kong', 'kng': 'kong', 'nyl': 'nylabone',
  'ben': 'benebone', 'cos': 'coastal', 'lup': 'lupine',
  'rc': 'royal canin', 'nb': 'natural balance', 'bb': 'blue buffalo',
  'frm': 'fromm', 'prm': 'primal', 'vict': 'victor', 'diam': 'diamond',
  'zig': 'zignature', 'zign': 'zignature', 'cand': 'canidae',
  'nutr': 'nutrisource', 'nutri': 'nutrisource', 'omeg': 'omega one',
  'oce': 'ocean nutrition', 'van': 'vanness', 'vann': 'vanness',
  'pet': 'petmate', 'saf': 'safari', 'furm': 'furminator',
  'trp': 'tropiclean', 'trop': 'tropiclean', 'nat': 'naturvet',
  'zym': 'zymox', 'four': 'four paws', 'fourp': 'four paws',
  'jw': 'jw pet', 'vita': 'vitakraft', 'care': 'carefresh',
  'cas': 'cascade', 'penn': 'penn plax', 'aq': 'aquatop',
  'flu': 'flukers', 'fluk': 'flukers', 'fluv': 'fluval',
  'health': 'health extension', 'pure': 'pure vita', 'pv': 'pure vita',
  'blue': 'blue buffalo', 'pro': 'pro plan', 'royal': 'royal canin',
  'froz': 'frozen', 'fro': 'frozen', 'frz': 'frozen',
  'bedng': 'bedding', 'bedg': 'bedding',
  'ck': 'chicken', 'chk': 'chicken', 'chkn': 'chicken',
  'bf': 'beef', 'lam': 'lamb', 'lmb': 'lamb',
  'slm': 'salmon', 'sal': 'salmon', 'salm': 'salmon',
  'trk': 'turkey', 'turk': 'turkey', 'dck': 'duck',
  'veg': 'vegetable', 'vegg': 'vegetable',
  'sm': 'small', 'sml': 'small',
  'med': 'medium', 'md': 'medium',
  'lg': 'large', 'lrg': 'large',
  'xl': 'extra large', 'xlg': 'extra large',
  'pk': 'pack', 'ct': 'count', 'pc': 'piece',
  'gr': 'grain', 'grn': 'grain', 'gf': 'grain free',
  'fr': 'free', 'sens': 'sensitive', 'sensi': 'sensitive',
  'pup': 'puppy', 'kit': 'kitten', 'sr': 'senior', 'adlt': 'adult',
  'col': 'collar', 'cllr': 'collar', 'lsh': 'leash', 'hrn': 'harness',
  'bwl': 'bowl', 'fdr': 'feeder', 'trt': 'treat', 'trts': 'treats',
  'dntl': 'dental', 'orig': 'original', 'prem': 'premium', 'asst': 'assorted',
  'shri': 'shrimp', 'shrim': 'shrimp', 'brin': 'brine',
  'cnut': 'coconut', 'cich': 'cichlid', 'pel': 'pellet', 'pell': 'pellet',
  'waf': 'wafer', 'enhan': 'enhancing', 'terrm': 'terrarium', 'terr': 'terrarium',
  'bkgd': 'background', 'des': 'desert', 'sil': 'screen',
  'bulb': 'bulb', 'fixt': 'fixture', 'fix': 'fixture',
  'nght': 'night', 'bk': 'black', 'wht': 'white', 'blu': 'blue', 'rd': 'red',
  'inc': 'incandescent', 'cerm': 'ceramic', 'slvr': 'silver',
  'jum': 'jumbo', 'jmb': 'jumbo', 'bld': 'blend',
  'uvb': 'uvb', 'uva': 'uva', 't5': 't5', 't8': 't8',
  'fxtr': 'fixture', 'lght': 'light', 'lmp': 'lamp', 'cmb': 'combo',
  'dsrt': 'desert', 'hood': 'hood', 'dome': 'dome',
  'grmt': 'gourmet', 'insct': 'insect', 'omni': 'omnivore',
  'brd': 'bearded', 'drgn': 'dragon', 'crstd': 'crested', 'trpcl': 'tropical',
  'tortse': 'tortoise', 'trtl': 'turtle', 'grslnd': 'grassland',
  'wtr': 'water', 'crnr': 'corner', 'gy': 'gray', 'gn': 'green', 'br': 'brown',
  'repti': 'repti', 'repta': 'repta',
};

function expandTokens(text: string): string[] {
  const cleaned = text.toLowerCase()
    .replace(/[™®©'"#&\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = cleaned.split(' ');
  const expanded: string[] = [];
  
  for (const word of words) {
    const clean = word.replace(/[^a-z0-9.]/g, '');
    if (!clean) continue;
    
    const expansion = EXPANSIONS[clean];
    if (expansion) {
      expanded.push(...expansion.split(' '));
    } else {
      expanded.push(clean);
    }
  }
  
  return expanded;
}

function getTokenSet(text: string): Set<string> {
  return new Set(expandTokens(text));
}

function tokenSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0;
  
  let matches = 0;
  for (const token of set1) {
    if (set2.has(token)) matches++;
  }
  
  const minSize = Math.min(set1.size, set2.size);
  return matches / minSize;
}

function normalizeKey(text: string): string {
  return expandTokens(text).sort().join('');
}

async function main() {
  console.log('=== INCREMENTAL UPC MATCHING ===');
  console.log('This script PRESERVES existing UPCs and only fills gaps.\n');
  
  const allProducts = await db.select({ 
    id: supplies.id, 
    name: supplies.name, 
    sku: supplies.sku 
  }).from(supplies);
  
  const withSku = allProducts.filter(p => p.sku && p.sku.trim() !== '');
  const withoutSku = allProducts.filter(p => !p.sku || p.sku.trim() === '');
  
  console.log(`Total products: ${allProducts.length}`);
  console.log(`Already have UPC: ${withSku.length} (${((withSku.length / allProducts.length) * 100).toFixed(1)}%)`);
  console.log(`Need UPC: ${withoutSku.length}\n`);
  
  const productsByKey = new Map<string, typeof withoutSku[0]>();
  const productsByTokens = new Map<number, { product: typeof withoutSku[0], tokens: Set<string> }>();
  
  for (const p of withoutSku) {
    const key = normalizeKey(p.name);
    if (!productsByKey.has(key)) {
      productsByKey.set(key, p);
    }
    productsByTokens.set(p.id, { product: p, tokens: getTokenSet(p.name) });
  }
  
  console.log(`Unique normalized keys: ${productsByKey.size}`);
  
  const allMaybe: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
  const goodMaybe = allMaybe.slice(0, 3171);
  
  const master: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
  const googleSheet = master.filter(e => e.source === 'google_sheet');
  const pdfEntries = master.filter(e => 
    e.source !== 'maybe_inventory' && 
    e.source !== 'google_sheet' && 
    e.source !== 'camscanner'
  );
  const camscanner = master.filter(e => e.source === 'camscanner');
  
  let totalMatched = 0;
  const usedUPCs = new Set<string>();
  
  console.log('\n=== STEP 1: Maybe Inventory (exact key match) ===');
  let maybeMatched = 0;
  for (const entry of goodMaybe) {
    const key = normalizeKey(entry.name);
    const product = productsByKey.get(key);
    if (product && !usedUPCs.has(entry.upc)) {
      await db.update(supplies).set({ sku: entry.upc }).where(eq(supplies.id, product.id));
      maybeMatched++;
      usedUPCs.add(entry.upc);
      productsByKey.delete(key);
      productsByTokens.delete(product.id);
    }
  }
  totalMatched += maybeMatched;
  console.log(`Matched: ${maybeMatched}`);
  
  console.log('\n=== STEP 2: Camscanner (exact key match) ===');
  let camMatched = 0;
  for (const entry of camscanner) {
    const key = normalizeKey(entry.name);
    const product = productsByKey.get(key);
    if (product && !usedUPCs.has(entry.upc)) {
      await db.update(supplies).set({ sku: entry.upc }).where(eq(supplies.id, product.id));
      camMatched++;
      usedUPCs.add(entry.upc);
      productsByKey.delete(key);
      productsByTokens.delete(product.id);
    }
  }
  totalMatched += camMatched;
  console.log(`Matched: ${camMatched}`);
  
  console.log('\n=== STEP 3: Google Sheet (exact key match) ===');
  let googleMatched = 0;
  for (const entry of googleSheet) {
    const key = normalizeKey(entry.name);
    const product = productsByKey.get(key);
    if (product && !usedUPCs.has(entry.upc)) {
      await db.update(supplies).set({ sku: entry.upc }).where(eq(supplies.id, product.id));
      googleMatched++;
      usedUPCs.add(entry.upc);
      productsByKey.delete(key);
      productsByTokens.delete(product.id);
    }
  }
  totalMatched += googleMatched;
  console.log(`Matched: ${googleMatched}`);
  
  console.log('\n=== STEP 4: PDF Invoices (token overlap >= 80%) ===');
  let pdfMatched = 0;
  for (const entry of pdfEntries) {
    if (usedUPCs.has(entry.upc)) continue;
    
    const entryTokens = getTokenSet(entry.name);
    if (entryTokens.size < 2) continue;
    
    let bestMatch: typeof withoutSku[0] | null = null;
    let bestScore = 0;
    
    for (const [id, { product, tokens }] of productsByTokens) {
      const score = tokenSimilarity(entryTokens, tokens);
      if (score >= 0.8 && score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }
    
    if (bestMatch) {
      await db.update(supplies).set({ sku: entry.upc }).where(eq(supplies.id, bestMatch.id));
      pdfMatched++;
      usedUPCs.add(entry.upc);
      productsByTokens.delete(bestMatch.id);
      const key = normalizeKey(bestMatch.name);
      productsByKey.delete(key);
    }
  }
  totalMatched += pdfMatched;
  console.log(`Matched: ${pdfMatched}`);
  
  const finalProducts = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const finalWithSku = finalProducts.filter(p => p.sku && p.sku.trim() !== '');
  
  console.log('\n=== FINAL RESULTS ===');
  console.log(`Started with: ${withSku.length} UPCs`);
  console.log(`Added: ${totalMatched} new UPCs`);
  console.log(`Total: ${finalWithSku.length}/${finalProducts.length} (${((finalWithSku.length / finalProducts.length) * 100).toFixed(1)}%)`);
  
  process.exit(0);
}

main().catch(console.error);
