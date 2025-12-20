import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { isNull, sql } from 'drizzle-orm';
import * as fs from 'fs';

const BRAND_PREFIXES: Record<string, string[]> = {
  'aqueon': ['015905'],
  'api': ['317163', '017163'],
  'hikari': ['042055'],
  'tetra': ['046798'],
  'glofish': ['046798'],
  'kaytee': ['071859'],
  'kong': ['035585'],
  'zilla': ['096316'],
  'zoo med': ['097612'],
  'fluker': ['091197'],
  'flukers': ['091197'],
  'coastal': ['076484', '744845'],
  'lil pals': ['744845'],
  'oxbow': ['744845'],
  'penn-plax': ['030172'],
  'pennplax': ['030172'],
  'fluval': ['015561'],
  'exo terra': ['015561'],
  'marina': ['015561'],
  'hagen': ['015561'],
  'prevue': ['073725'],
  'nutrisource': ['066380'],
  'fromm': ['660204'],
  'science diet': ['797801'],
  'ethical': ['077234'],
  'nylabone': ['018214'],
  'seachem': ['000116'],
  'sungrow': ['762177'],
  'higgins': ['046706'],
};

const INVOICE_ABBR: Record<string, string> = {
  'fd': 'food', 'fod': 'food', 'trt': 'treat', 'trts': 'treats',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'xlarge',
  'blk': 'black', 'wh': 'white', 'wht': 'white', 'rd': 'red', 'bl': 'blue', 'grn': 'green',
  'pk': 'pack', 'ct': 'count', 'pc': 'piece',
  'aqe': 'aqueon', 'aq': 'aquarium', 'fltr': 'filter', 'flt': 'filter',
  'htr': 'heater', 'pmp': 'pump', 'cchld': 'cichlid', 'btta': 'betta',
  'gldfsh': 'goldfish', 'gld': 'goldfish', 'trpcl': 'tropical', 'trop': 'tropical',
  'grvl': 'gravel', 'sbstrt': 'substrate', 'plnt': 'plant', 'dcor': 'decor',
  'ornmt': 'ornament', 'led': 'led', 'fxtr': 'fixture', 'strp': 'strip',
  'clnr': 'cleaner', 'vac': 'vacuum', 'cond': 'conditioner', 'strs': 'stress',
  'tst': 'test', 'ntrt': 'nitrate', 'ammo': 'ammonia', 'algae': 'algae',
  'flk': 'flake', 'flks': 'flakes', 'pllt': 'pellet', 'pllts': 'pellets',
  'snk': 'sinking', 'rptl': 'reptile', 'terrm': 'terrarium', 'uvb': 'uvb',
  'bsking': 'basking', 'bulb': 'bulb', 'splmt': 'supplement', 'cal': 'calcium',
  'vit': 'vitamin', 'crkt': 'cricket', 'mlwrm': 'mealworm', 'dg': 'dog',
  'pup': 'puppy', 'chw': 'chew', 'bne': 'bone', 'lsh': 'leash', 'cllr': 'collar',
  'hrns': 'harness', 'shmp': 'shampoo', 'bwl': 'bowl', 'toy': 'toy', 'knnl': 'kennel',
  'brd': 'bird', 'prrt': 'parrot', 'prkt': 'parakeet', 'keet': 'parakeet',
  'tiel': 'cockatiel', 'fnch': 'finch', 'prch': 'perch', 'seed': 'seed',
  'millet': 'millet', 'fdph': 'forti diet', 'blbry': 'blueberry', 'hny': 'honey',
  'hmstr': 'hamster', 'gnpg': 'guinea pig', 'gp': 'guinea pig', 'rbbt': 'rabbit',
  'hay': 'hay', 'tmthy': 'timothy', 'hik': 'hikari', 'kay': 'kaytee', 'api': 'api',
  'tet': 'tetra', 'zmd': 'zoo med', 'zla': 'zilla', 'exo': 'exo terra',
  'flvl': 'fluval', 'mrln': 'marineland', 'nyla': 'nylabone', 'kng': 'kong',
  'cstl': 'coastal', 'eth': 'ethical', 'slmn': 'salmon', 'ckn': 'chicken',
  'bf': 'beef', 'trky': 'turkey', 'lmb': 'lamb', 'shrmp': 'shrimp',
};

function expand(text: string): string {
  let result = text.toLowerCase();
  for (const [abbr, full] of Object.entries(INVOICE_ABBR)) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'g'), full);
  }
  return result.replace(/[^a-z0-9.\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractSizeKey(text: string): string | null {
  const patterns = [
    /(\d+\.?\d*)\s*oz/i, /(\d+\.?\d*)\s*lb/i, /(\d+\.?\d*)\s*gal/i,
    /(\d+\.?\d*)\s*in/i, /(\d+\.?\d*)\s*ml/i, /(\d+\.?\d*)\s*pk/i,
    /(\d+\.?\d*)\s*ct/i, /(\d+\.?\d*)\s*#/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].toLowerCase().replace(/\s+/g, '');
  }
  return null;
}

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return (2 * overlap) / (wordsA.size + wordsB.size);
}

async function main() {
  console.log('Loading UPCs...');
  const cleanUpcs: Record<string, string> = JSON.parse(fs.readFileSync('/tmp/clean_upcs.json', 'utf-8'));
  
  const upcs: { upc: string; name: string; prefix: string }[] = [];
  for (const [upc, name] of Object.entries(cleanUpcs)) {
    if (name.length > 5) {
      upcs.push({ upc, name, prefix: upc.substring(0, 6) });
    }
  }
  console.log(`Loaded ${upcs.length} valid UPCs`);

  const prefixIndex: Record<string, typeof upcs> = {};
  for (const u of upcs) {
    if (!prefixIndex[u.prefix]) prefixIndex[u.prefix] = [];
    prefixIndex[u.prefix].push(u);
  }

  console.log('Loading products without SKU...');
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Found ${products.length} products without SKU`);

  const matches: { id: number; sku: string; score: number; productName: string; invoiceName: string }[] = [];

  for (const product of products) {
    const productNorm = normalize(product.name);
    const productBrand = (product.brand || '').toLowerCase();
    
    const prefixes = BRAND_PREFIXES[productBrand] || [];
    let candidates = upcs;
    
    if (prefixes.length > 0) {
      candidates = prefixes.flatMap(p => prefixIndex[p] || []);
    }
    
    if (candidates.length === 0) continue;

    const productSize = extractSizeKey(productNorm);
    let bestMatch: typeof matches[0] | null = null;

    for (const upc of candidates) {
      const invoiceExpanded = expand(upc.name);
      const invoiceSize = extractSizeKey(invoiceExpanded);
      
      if (productSize && invoiceSize && productSize !== invoiceSize) continue;
      
      const score = wordOverlap(productNorm, invoiceExpanded);
      
      if (score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = {
          id: product.id,
          sku: upc.upc,
          score,
          productName: product.name,
          invoiceName: upc.name,
        };
      }
    }

    if (bestMatch) {
      matches.push(bestMatch);
    }
  }

  console.log(`\nFound ${matches.length} matches at 50%+ threshold`);
  
  const highConf = matches.filter(m => m.score >= 0.7);
  console.log(`High confidence (70%+): ${highConf.length}`);
  
  console.log('\nSample matches:');
  highConf.slice(0, 10).forEach(m => {
    console.log(`  ${m.productName.substring(0, 50)}`);
    console.log(`    -> ${m.invoiceName} (${(m.score * 100).toFixed(0)}%)`);
    console.log(`    SKU: ${m.sku}`);
  });

  if (highConf.length > 0) {
    console.log('\nApplying high-confidence matches...');
    let updated = 0;
    for (const m of highConf) {
      await db.update(supplies)
        .set({ sku: m.sku })
        .where(sql`id = ${m.id}`);
      updated++;
    }
    console.log(`Updated ${updated} products`);
  }

  const finalCount = await db.select({ count: sql<number>`count(*)` })
    .from(supplies).where(sql`sku IS NOT NULL`);
  console.log(`\nFinal SKU coverage: ${finalCount[0].count}/7225 = ${(finalCount[0].count / 7225 * 100).toFixed(1)}%`);
}

main().catch(console.error);
