import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { isNull, sql } from 'drizzle-orm';
import * as fs from 'fs';

const ABBR: Record<string, string> = {
  'fd': 'food', 'fod': 'food', 'trt': 'treat', 'trts': 'treats',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'cchld': 'cichlid',
  'btta': 'betta', 'gld': 'goldfish', 'gldfsh': 'goldfish', 'trpcl': 'tropical',
  'grvl': 'gravel', 'fltr': 'filter', 'flt': 'filter', 'htr': 'heater',
  'pmp': 'pump', 'clnr': 'cleaner', 'cond': 'conditioner', 'ornmt': 'ornament',
  'fxtr': 'fixture', 'led': 'led', 'strp': 'strip', 'pllt': 'pellet',
  'flk': 'flake', 'flks': 'flakes', 'pllts': 'pellets', 'snk': 'sinking',
  'rptl': 'reptile', 'uvb': 'uvb', 'bsking': 'basking', 'bulb': 'bulb',
  'splmt': 'supplement', 'cal': 'calcium', 'vit': 'vitamin',
  'crkt': 'cricket', 'mlwrm': 'mealworm', 'dg': 'dog', 'pup': 'puppy',
  'chw': 'chew', 'bne': 'bone', 'toy': 'toy', 'brd': 'bird', 'prrt': 'parrot',
  'keet': 'parakeet', 'tiel': 'cockatiel', 'seed': 'seed', 'hay': 'hay',
  'hik': 'hikari', 'kay': 'kaytee', 'tet': 'tetra', 'zmd': 'zoo med',
  'kng': 'kong', 'eth': 'ethical', 'blbry': 'blueberry', 'hny': 'honey',
  'ckn': 'chicken', 'bf': 'beef', 'slmn': 'salmon', 'shrmp': 'shrimp',
  'sbstrt': 'substrate', 'algae': 'algae', 'strs': 'stress', 'strt': 'start',
  'tst': 'test', 'mstr': 'master', 'ammo': 'ammonia', 'ntrt': 'nitrate',
};

function expand(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  const result = new Set<string>();
  for (const w of words) {
    result.add(w);
    if (ABBR[w]) result.add(ABBR[w]);
  }
  return result;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

async function main() {
  const cleanUpcs: Record<string, string> = JSON.parse(fs.readFileSync('/tmp/clean_upcs.json', 'utf-8'));
  
  const upcs = Object.entries(cleanUpcs)
    .filter(([_, name]) => name.length > 5)
    .map(([upc, name]) => ({ upc, name, words: expand(name) }));
  
  console.log(`Loaded ${upcs.length} UPCs`);

  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Found ${products.length} products without SKU`);

  const matches: { id: number; sku: string; score: number }[] = [];
  let processed = 0;

  for (const product of products) {
    const productWords = expand(product.name);
    let best: { sku: string; score: number } | null = null;

    for (const upc of upcs) {
      const score = jaccard(productWords, upc.words);
      if (score >= 0.4 && (!best || score > best.score)) {
        best = { sku: upc.upc, score };
      }
    }

    if (best && best.score >= 0.5) {
      matches.push({ id: product.id, ...best });
    }
    
    processed++;
    if (processed % 1000 === 0) console.log(`Processed ${processed}/${products.length}`);
  }

  const highConf = matches.filter(m => m.score >= 0.6);
  console.log(`\nHigh confidence matches (60%+): ${highConf.length}`);

  if (highConf.length > 0) {
    console.log('Applying matches...');
    for (const m of highConf) {
      await db.update(supplies).set({ sku: m.sku }).where(sql`id = ${m.id}`);
    }
  }

  const count = await db.select({ c: sql<number>`count(*)` }).from(supplies).where(sql`sku IS NOT NULL`);
  console.log(`\nFinal coverage: ${count[0].c}/7225 = ${(count[0].c / 7225 * 100).toFixed(1)}%`);
}

main().catch(console.error);
