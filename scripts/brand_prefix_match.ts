import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { isNull, sql, and, eq, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';

const BRAND_TO_PREFIX: Record<string, string[]> = {
  'api': ['317163', '017163'],
  'aqueon': ['015905'],
  'coastal': ['076484'],
  'ethical pet': ['077234'],
  'exo terra': ['015561'],
  'flukers': ['091197'],
  'fluval': ['015561', '155611'],
  'glofish': ['046798'],
  'hikari': ['042055'],
  'kaytee': ['071859', '045125'],
  'kong': ['035585'],
  'lil pals': ['076484', '744845'],
  'marina': ['015561'],
  'marineland': ['046798'],
  'nylabone': ['018214'],
  'oxbow': ['744845'],
  'penn-plax': ['030172', '048081'],
  'seachem': ['000116'],
  'spot': ['077234'],
  'tetra': ['046798'],
  'zilla': ['096316'],
  'zoo med': ['097612'],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractKeywords(text: string): string[] {
  const norm = normalize(text);
  return norm.split(' ').filter(w => w.length > 2);
}

function matchScore(productWords: string[], invoiceText: string): number {
  const invNorm = normalize(invoiceText);
  let matches = 0;
  for (const word of productWords) {
    if (invNorm.includes(word)) matches++;
  }
  return productWords.length > 0 ? matches / productWords.length : 0;
}

async function main() {
  const cleanUpcs: Record<string, string> = JSON.parse(fs.readFileSync('/tmp/clean_upcs.json', 'utf-8'));
  
  const upcsByPrefix: Record<string, { upc: string; name: string }[]> = {};
  for (const [upc, name] of Object.entries(cleanUpcs)) {
    if (name.length < 5) continue;
    const prefix = upc.substring(0, 6);
    if (!upcsByPrefix[prefix]) upcsByPrefix[prefix] = [];
    upcsByPrefix[prefix].push({ upc, name });
  }
  
  console.log('UPC prefixes available:', Object.keys(upcsByPrefix).length);

  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Found ${products.length} products without SKU`);

  const matches: { id: number; sku: string; score: number; pName: string; uName: string }[] = [];
  let checked = 0;

  for (const product of products) {
    if (!product.brand) continue;
    
    const brandKey = normalize(product.brand);
    const prefixes = BRAND_TO_PREFIX[brandKey];
    if (!prefixes) continue;
    
    const candidateUpcs = prefixes.flatMap(p => upcsByPrefix[p] || []);
    if (candidateUpcs.length === 0) continue;

    const productWords = extractKeywords(product.name);
    let best: typeof matches[0] | null = null;

    for (const upc of candidateUpcs) {
      const score = matchScore(productWords, upc.name);
      if (score >= 0.5 && (!best || score > best.score)) {
        best = { id: product.id, sku: upc.upc, score, pName: product.name, uName: upc.name };
      }
    }

    if (best) matches.push(best);
    checked++;
  }

  console.log(`\nChecked ${checked} products with known brand prefixes`);
  console.log(`Matches found: ${matches.length}`);
  
  const highConf = matches.filter(m => m.score >= 0.6);
  console.log(`High confidence (60%+): ${highConf.length}`);
  
  highConf.slice(0, 15).forEach(m => {
    console.log(`  ${m.pName.substring(0, 50)}`);
    console.log(`    -> ${m.uName} (${(m.score * 100).toFixed(0)}%)`);
  });

  if (highConf.length > 0) {
    console.log('\nApplying matches...');
    for (const m of highConf) {
      await db.update(supplies).set({ sku: m.sku }).where(sql`id = ${m.id}`);
    }
  }

  const count = await db.select({ c: sql<number>`count(*)` }).from(supplies).where(sql`sku IS NOT NULL`);
  console.log(`\nFinal coverage: ${count[0].c}/7225 = ${(count[0].c / 7225 * 100).toFixed(1)}%`);
}

main().catch(console.error);
