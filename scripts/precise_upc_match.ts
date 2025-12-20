import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { isNull, sql } from 'drizzle-orm';
import * as fs from 'fs';

const PRODUCT_ABBR: Record<string, string[]> = {
  'algaefix': ['algaefix', 'algae fix', 'alg fix'],
  'stress coat': ['strs coat', 'strscoat', 'stress coat', 'stresscoat'],
  'stress zyme': ['strs zyme', 'stress zyme', 'stresszyme'],
  'melafix': ['melafix', 'mela fix'],
  'pimafix': ['pimafix', 'pima fix'],
  'bettafix': ['bettafix', 'btta fix', 'betta fix'],
  'quick start': ['quickstart', 'quick start', 'qck strt', 'qck start'],
  'aqua essential': ['aqua esntl', 'esntl', 'aqua essential'],
  'prime': ['prime'],
  'flourite': ['flourite', 'flrte'],
  'cichlid gold': ['cchld gld', 'cichlid gold', 'cichlid gld'],
  'cichlid pellet': ['cchld pllt', 'cichlid pellet'],
  'betta food': ['btta food', 'betta food', 'btta fd'],
  'goldfish food': ['gldfsh food', 'goldfish food', 'gld food'],
  'tropical flake': ['trpcl flk', 'tropical flake'],
  'algae wafer': ['algae wfr', 'algae wafer', 'algae wfrs'],
  'filter cartridge': ['fltr crtrdg', 'filter cartridge', 'flt cart'],
  'heater': ['htr', 'heater', 'htrs'],
  'gravel vacuum': ['grvl vac', 'gravel vac', 'gravel vacuum'],
  'air pump': ['air pmp', 'air pump'],
  'led': ['led'],
  'striplight': ['strplght', 'strip light', 'striplight'],
  'test kit': ['test kit', 'tst kit'],
  'nitrite': ['nitrite', 'ntrit'],
  'nitrate': ['nitrate', 'ntrt'],
  'ammonia': ['ammonia', 'ammo'],
  'master': ['master', 'mstr'],
  'forti diet': ['fdph', 'forti diet', 'fortidiet'],
  'timothy hay': ['tmthy hay', 'timothy hay', 'timothy'],
  'millet spray': ['millet spry', 'millet spray'],
  'run about ball': ['run about', 'runabout'],
  'igloo': ['igloo'],
  'kong': ['kong', 'kng'],
  'cozie': ['cozie', 'cozy'],
  'extreme': ['xtrm', 'extreme'],
  'puppy': ['pup', 'puppy'],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractSize(text: string): { value: number; unit: string } | null {
  const patterns = [
    { regex: /(\d+\.?\d*)\s*oz/i, unit: 'oz' },
    { regex: /(\d+\.?\d*)\s*lb/i, unit: 'lb' },
    { regex: /(\d+\.?\d*)\s*#/i, unit: 'lb' },
    { regex: /(\d+\.?\d*)\s*gal/i, unit: 'gal' },
    { regex: /(\d+\.?\d*)\s*in/i, unit: 'in' },
    { regex: /(\d+\.?\d*)\s*ml/i, unit: 'ml' },
    { regex: /(\d+\.?\d*)\s*gm/i, unit: 'g' },
    { regex: /(\d+\.?\d*)\s*g(?![a-z])/i, unit: 'g' },
  ];
  for (const { regex, unit } of patterns) {
    const m = text.match(regex);
    if (m) return { value: parseFloat(m[1]), unit };
  }
  return null;
}

function findProductMatch(productName: string, invoiceName: string): number {
  const pNorm = normalize(productName);
  const iNorm = normalize(invoiceName);
  
  let score = 0;
  let keyMatches = 0;
  
  for (const [product, abbrs] of Object.entries(PRODUCT_ABBR)) {
    const pHas = pNorm.includes(product.toLowerCase()) || abbrs.some(a => pNorm.includes(a));
    const iHas = abbrs.some(a => iNorm.includes(a)) || iNorm.includes(product.toLowerCase());
    
    if (pHas && iHas) {
      score += 30;
      keyMatches++;
    } else if (pHas && !iHas) {
      score -= 20;
    }
  }
  
  const pSize = extractSize(pNorm);
  const iSize = extractSize(iNorm);
  
  if (pSize && iSize) {
    if (pSize.value === iSize.value && pSize.unit === iSize.unit) {
      score += 20;
    } else if (Math.abs(pSize.value - iSize.value) < 0.5 && pSize.unit === iSize.unit) {
      score += 10;
    } else {
      score -= 30;
    }
  }
  
  return keyMatches > 0 ? score : 0;
}

async function main() {
  const cleanUpcs: Record<string, string> = JSON.parse(fs.readFileSync('/tmp/clean_upcs.json', 'utf-8'));
  const upcs = Object.entries(cleanUpcs).filter(([_, n]) => n.length > 5).map(([upc, name]) => ({ upc, name }));
  
  console.log(`Loaded ${upcs.length} UPCs`);

  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Found ${products.length} products without SKU`);

  const matches: { id: number; sku: string; score: number; pName: string; uName: string }[] = [];

  for (const product of products) {
    let best: typeof matches[0] | null = null;

    for (const upc of upcs) {
      const score = findProductMatch(product.name, upc.name);
      if (score >= 40 && (!best || score > best.score)) {
        best = { id: product.id, sku: upc.upc, score, pName: product.name, uName: upc.name };
      }
    }

    if (best) matches.push(best);
  }

  console.log(`\nMatches found: ${matches.length}`);
  
  matches.sort((a, b) => b.score - a.score);
  
  console.log('\nTop matches:');
  matches.slice(0, 20).forEach(m => {
    console.log(`  [${m.score}] ${m.pName.substring(0, 45)}`);
    console.log(`       -> ${m.uName}`);
  });

  const highConf = matches.filter(m => m.score >= 50);
  console.log(`\nHigh confidence (score >= 50): ${highConf.length}`);

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
