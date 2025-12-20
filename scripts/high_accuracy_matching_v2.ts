import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, and, isNull, or, sql } from 'drizzle-orm';
import * as fs from 'fs';

// UPC prefix to brand mapping for faster lookup
const PREFIX_TO_BRAND: Record<string, string[]> = {
  '015561': ['Fluval', 'Exo Terra', 'Marina', 'Hagen'],
  '015905': ['Aqueon'],
  '317163': ['API'],
  '017163': ['API'],
  '042055': ['Hikari'],
  '046798': ['Tetra', 'GloFish'],
  '071859': ['Kaytee'],
  '035585': ['Kong'],
  '096316': ['Zilla'],
  '097612': ['Zoo Med'],
  '091197': ["Fluker's"],
  '076484': ['Coastal', "Li'l Pals"],
  '744845': ['Coastal', "Li'l Pals", 'Oxbow'],
  '660204': ['Fromm'],
  '797801': ['Science Diet', 'NaturVet'],
  '066380': ['Nutrisource'],
  '842982': ['Blue Buffalo'],
  '879213': ['Catit'],
  '785184': ['RedBarn'],
  '073893': ['Petmate'],
  '073725': ['Prevue'],
  '030172': ['Penn-Plax'],
  '047431': ['Marineland'],
  '018214': ['Nylabone'],
  '645095': ['TropiClean'],
  '077234': ['Spot', 'Ethical'],
  '076158': ['Titan'],
  '759834': ['Pangea', 'Galapagos'],
  '784369': ['Multipet'],
  '000116': ['SeaChem'],
  '045663': ['Four Paws', 'MidWest'],
  '730582': ['Higgins'],
  '669125': ['Nutri-Vet'],
  '045125': ['SodaPup', 'Kaytee'],
  '029904': ['World Wide Imports'],
  '079441': ['Van Ness', 'Taste of the Wild'],
  '736990': ['Veterinary Formula'],
};

// Abbreviation expansions
const ABBR: Record<string, string> = {
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large',
  'oz': 'ounce', 'lb': 'pound', 'lbs': 'pound', 'gal': 'gallon',
  'pk': 'pack', 'ct': 'count', 'pc': 'piece', 'in': 'inch', 'ft': 'foot',
  'w': 'with', 'w/': 'with', 'adj': 'adjustable',
  'fd': 'food', 'trt': 'treat', 'trts': 'treats',
  'ckn': 'chicken', 'chkn': 'chicken', 'bf': 'beef', 'slmn': 'salmon',
  'trky': 'turkey', 'lmb': 'lamb', 'fsh': 'fish', 'dck': 'duck',
  'aqe': 'aqueon', 'fltr': 'filter', 'htr': 'heater', 'pmp': 'pump',
  'cchld': 'cichlid', 'btta': 'betta', 'gldfish': 'goldfish', 'gldfsh': 'goldfish',
  'trpcl': 'tropical', 'marn': 'marine', 'fw': 'freshwater', 'sw': 'saltwater',
  'grvl': 'gravel', 'plnt': 'plant', 'dcor': 'decor', 'led': 'led',
  'rptl': 'reptile', 'terrm': 'terrarium', 'uvb': 'uvb', 'bulb': 'bulb',
  'bsking': 'basking', 'splmt': 'supplement', 'cal': 'calcium',
  'dg': 'dog', 'ct': 'cat', 'pup': 'puppy', 'ktn': 'kitten',
  'chw': 'chew', 'bne': 'bone', 'lsh': 'leash', 'cllr': 'collar',
  'shmp': 'shampoo', 'bwl': 'bowl', 'fdr': 'feeder', 'toy': 'toy',
  'brd': 'bird', 'prch': 'perch', 'cage': 'cage',
  'hmstr': 'hamster', 'gnpg': 'guinea pig', 'rbbt': 'rabbit',
  'hay': 'hay', 'tmthy': 'timothy', 'hik': 'hikari', 'api': 'api',
  'cond': 'conditioner', 'strs': 'stress', 'tst': 'test', 'clnr': 'cleaner',
  'crtrdg': 'cartridge', 'liner': 'liner', 'bedng': 'bedding',
  'flvl': 'fluval', 'zmd': 'zoo med', 'zla': 'zilla', 'exo': 'exo terra',
  'nyla': 'nylabone', 'kng': 'kong', 'cstl': 'coastal',
};

function expand(text: string): string {
  let r = text.toLowerCase();
  for (const [a, e] of Object.entries(ABBR)) {
    r = r.replace(new RegExp(`\\b${a}\\b`, 'g'), e);
  }
  return r.replace(/[™®©]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getWords(s: string): string[] {
  return expand(s).split(' ').filter(w => w.length > 1);
}

function score(inv: string, db: string): number {
  // Filter garbage
  const garbage = ['est ship', 'item number', 'date number', 'qty ba or', 'type qty', 'type'];
  if (garbage.some(g => inv.toLowerCase().includes(g))) return 0;
  if (inv.length < 5) return 0;
  
  const iw = getWords(inv);
  const dw = getWords(db);
  if (iw.length < 2 || dw.length < 2) return 0;
  
  let exact = 0, partial = 0;
  const used = new Set<number>();
  
  for (const i of iw) {
    if (i.length < 2) continue;
    for (let j = 0; j < dw.length; j++) {
      if (used.has(j)) continue;
      if (i === dw[j]) { exact++; used.add(j); break; }
      if (i.length >= 4 && dw[j].length >= 4 && (i.includes(dw[j]) || dw[j].includes(i))) {
        partial += 0.75; used.add(j); break;
      }
    }
  }
  
  return (exact + partial) / Math.max(iw.length, dw.length);
}

async function main() {
  console.log('=== HIGH ACCURACY MATCHING v2 (80%+) ===\n');
  
  // Load UPCs
  const upcs = new Map<string, string>();
  const files = ['/tmp/clean_upcs.json', '/tmp/phillips_upcs_v3.json', '/tmp/pennplax_upcs.json', '/tmp/upc_mapping.json'];
  
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf-8'));
      if (Array.isArray(d)) {
        for (const i of d) if (i.upc && i.productName?.length > 3) upcs.set(i.upc, i.productName);
      } else {
        for (const [u, n] of Object.entries(d)) if (typeof n === 'string' && n.length > 3) upcs.set(u, n);
      }
    } catch {}
  }
  console.log(`Loaded ${upcs.size} UPCs`);
  
  // Get products and used SKUs
  const products = await db.select().from(supplies).where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  const existing = await db.select({ sku: supplies.sku }).from(supplies).where(and(sql`sku IS NOT NULL`, sql`sku != ''`));
  const used = new Set(existing.map(s => s.sku).filter(Boolean));
  
  console.log(`Products without SKU: ${products.length}`);
  console.log(`Already used: ${used.size}`);
  
  // Index UPCs by prefix
  const byPrefix = new Map<string, Array<[string, string]>>();
  for (const [upc, name] of upcs.entries()) {
    if (used.has(upc)) continue;
    const prefix = upc.substring(0, 6);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix)!.push([upc, name]);
  }
  
  const matches: Array<{id: number; name: string; upc: string; inv: string; sc: number}> = [];
  const matched = new Set<string>();
  
  console.log('\nMatching...');
  let processed = 0;
  
  for (const p of products) {
    processed++;
    if (processed % 500 === 0) console.log(`  Processed ${processed}/${products.length}`);
    
    // Get candidate UPCs based on brand
    const brand = (p.brand || '').toLowerCase();
    let candidates: Array<[string, string]> = [];
    
    // Find prefixes for this brand
    for (const [prefix, brands] of Object.entries(PREFIX_TO_BRAND)) {
      if (brands.some(b => b.toLowerCase() === brand || brand.includes(b.toLowerCase()))) {
        const prefixUpcs = byPrefix.get(prefix) || [];
        candidates.push(...prefixUpcs.filter(([u]) => !matched.has(u)));
      }
    }
    
    // If no brand match, try all (limited)
    if (candidates.length === 0) {
      for (const [_, arr] of byPrefix.entries()) {
        candidates.push(...arr.filter(([u]) => !matched.has(u)).slice(0, 50));
      }
    }
    
    let best: {upc: string; name: string; sc: number} | null = null;
    
    for (const [upc, inv] of candidates) {
      if (matched.has(upc)) continue;
      const s = score(inv, p.name);
      if (s >= 0.80 && (!best || s > best.sc)) {
        best = { upc, name: inv, sc: s };
      }
    }
    
    if (best) {
      matches.push({ id: p.id, name: p.name, upc: best.upc, inv: best.name, sc: best.sc });
      matched.add(best.upc);
    }
  }
  
  console.log(`\nFound ${matches.length} matches at 80%+\n`);
  
  if (matches.length > 0) {
    matches.sort((a, b) => b.sc - a.sc);
    console.log('Top matches:');
    for (const m of matches.slice(0, 15)) {
      console.log(`  [${(m.sc * 100).toFixed(0)}%] "${m.name}" -> "${m.inv}"`);
    }
    
    console.log(`\nApplying ${matches.length} matches...`);
    for (const m of matches) {
      await db.update(supplies).set({ sku: m.upc }).where(eq(supplies.id, m.id));
    }
  }
  
  const stats = await db.select({
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(case when sku is not null and sku != '' then 1 end)`
  }).from(supplies);
  
  console.log(`\n=== COVERAGE: ${stats[0].withSku}/${stats[0].total} (${(stats[0].withSku/stats[0].total*100).toFixed(2)}%) ===`);
}

main().catch(console.error);
