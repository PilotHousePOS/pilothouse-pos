import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

const EXPANSIONS: Record<string, string> = {
  'sd': 'sciencediet', 'zml': 'zoomed', 'zm': 'zoomed', 'zil': 'zilla',
  'gal': 'galapagos', 'ext': 'exoterra', 'exo': 'exoterra',
  'oxb': 'oxbow', 'kay': 'kaytee', 'hik': 'hikari', 'tet': 'tetra',
  'aqu': 'aqueon', 'aquar': 'aquarium', 'mar': 'marineland', 'sec': 'seachem',
  'gre': 'greenies', 'kon': 'kong', 'kng': 'kong', 'nyl': 'nylabone',
  'ben': 'benebone', 'cos': 'coastal', 'lup': 'lupine',
  'rc': 'royalcanin', 'nb': 'naturalbalance', 'bb': 'bluebuffalo',
  'frm': 'fromm', 'prm': 'primal', 'vict': 'victor', 'diam': 'diamond',
  'zig': 'zignature', 'zign': 'zignature', 'cand': 'canidae',
  'nutr': 'nutrisource', 'nutri': 'nutrisource', 'omeg': 'omegaone',
  'oce': 'oceannutrition', 'van': 'vanness', 'vann': 'vanness',
  'pet': 'petmate', 'saf': 'safari', 'furm': 'furminator',
  'trp': 'tropiclean', 'trop': 'tropiclean', 'nat': 'naturvet',
  'zym': 'zymox', 'four': 'fourpaws', 'fourp': 'fourpaws',
  'jw': 'jwpet', 'ae': 'ae', 'vita': 'vitakraft', 'care': 'carefresh',
  'cas': 'cascade', 'penn': 'pennplax', 'aq': 'aquatop',
  'rep': 'reptile', 'reps': 'reptilesystems', 'flu': 'fluval', 'fluk': 'flukers',
  'health': 'healthextension', 'pure': 'purevita', 'pv': 'purevita',
  'blue': 'bluebuffalo', 'pro': 'proplan', 'royal': 'royalcanin',
  'valu': 'valupak', 'sour': 'source', 'exten': 'extension',
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
  'xl': 'extralarge', 'xlg': 'extralarge',
  'pk': 'pack', 'ct': 'count', 'pc': 'piece',
  'oz': 'oz', 'lb': 'lb', 'lbs': 'lb',
  'gr': 'grain', 'grn': 'grain', 'gf': 'grainfree',
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
  'stw': 'stew', 'pron': 'pronto', 'jum': 'jumbo', 'bld': 'blend',
  'qt': 'quart', 'gal': 'gallon', 'ind': 'indoor', 'shin': 'shiny',
  'coat': 'coat', 'bug': 'bug', 'bite': 'bites', 'algae': 'algae',
  'sys': 'systems', 'uv': 'uv', 'uvb': 'uvb',
  'wilder': 'wilderness', 'wild': 'wilderness', 'wldnss': 'wilderness',
  'solut': 'solutions', 'herbal': 'herbal', 'betta': 'betta',
  'sup': 'super', 'perf': 'perfect', 'wght': 'weight', 'jnt': 'joint',
  'cntry': 'country', 'hrvst': 'harvest', 'snck': 'snack',
};

function expandAndNormalize(text: string): string {
  let result = text.toLowerCase()
    .replace(/[™®©'"#&]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = result.split(/[\s\-_]+/);
  const expanded = words.map(w => {
    const clean = w.replace(/[^a-z0-9]/g, '');
    return EXPANSIONS[clean] || clean;
  });
  
  return expanded.join('').replace(/[^a-z0-9]/g, '');
}

async function main() {
  console.log('=== RESETTING ALL SKUs ===\n');
  await db.update(supplies).set({ sku: null });
  
  const products = await db.select({ id: supplies.id, name: supplies.name }).from(supplies);
  console.log(`Total products: ${products.length}`);
  
  const productMap = new Map<string, number>();
  for (const p of products) {
    const key = expandAndNormalize(p.name);
    if (key && !productMap.has(key)) {
      productMap.set(key, p.id);
    }
  }
  console.log(`Unique expanded keys: ${productMap.size}\n`);
  
  console.log('=== STEP 1: Maybe Inventory (3171 entries) ===');
  const allMaybe: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
  const goodMaybe = allMaybe.slice(0, 3171);
  
  let maybeMatched = 0;
  for (const entry of goodMaybe) {
    const key = expandAndNormalize(entry.name);
    const productId = productMap.get(key);
    if (productId) {
      await db.update(supplies).set({ sku: entry.upc }).where(eq(supplies.id, productId));
      maybeMatched++;
      productMap.delete(key);
    }
  }
  console.log(`Matches: ${maybeMatched}`);
  
  let current = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  let withSku = current.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`Coverage: ${withSku}/${current.length} (${((withSku / current.length) * 100).toFixed(1)}%)\n`);
  
  console.log('=== STEP 2: Google Sheet (1412 entries) ===');
  const master: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
  const googleSheet = master.filter(e => e.source === 'google_sheet');
  
  let googleMatched = 0;
  for (const entry of googleSheet) {
    const key = expandAndNormalize(entry.name);
    const productId = productMap.get(key);
    if (productId) {
      await db.update(supplies).set({ sku: entry.upc }).where(eq(supplies.id, productId));
      googleMatched++;
      productMap.delete(key);
    }
  }
  console.log(`Matches: ${googleMatched}`);
  
  current = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  withSku = current.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`Coverage: ${withSku}/${current.length} (${((withSku / current.length) * 100).toFixed(1)}%)\n`);
  
  console.log('=== STEP 3: PDF Invoices (2639 entries) ===');
  const pdfInvoices = master.filter(e => e.source.includes('.txt'));
  
  let pdfMatched = 0;
  for (const entry of pdfInvoices) {
    const key = expandAndNormalize(entry.name);
    const productId = productMap.get(key);
    if (productId) {
      await db.update(supplies).set({ sku: entry.upc }).where(eq(supplies.id, productId));
      pdfMatched++;
      productMap.delete(key);
    }
  }
  console.log(`Matches: ${pdfMatched}`);
  
  current = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  withSku = current.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`Coverage: ${withSku}/${current.length} (${((withSku / current.length) * 100).toFixed(1)}%)\n`);
  
  console.log(`=== FINAL: ${withSku}/${current.length} (${((withSku / current.length) * 100).toFixed(1)}%) ===`);
  console.log(`\nRemaining unmatched: ${productMap.size}`);
}

main().catch(console.error);
