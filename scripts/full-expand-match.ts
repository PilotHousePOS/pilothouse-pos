import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

const masterUpcs: UpcEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
console.log(`Loaded ${masterUpcs.length} UPCs`);

const expansions: Record<string, string> = {
  'sd': 'science diet', 'rc': 'royal canin', 'ppp': 'purina pro plan',
  'iam': 'iams', 'eb': 'eukanuba', 'bb': 'blue buffalo', 'buf': 'blue buffalo',
  'bl buf': 'blue buffalo', 'blbuf': 'blue buffalo',
  'zml': 'zoo med', 'zm': 'zoo med', 'et': 'exo terra', 'exoterra': 'exo terra',
  'fl': 'fluval', 'aq': 'aqueon', 'aqn': 'aqueon', 'tt': 'tetra', 'tet': 'tetra',
  'hk': 'hikari', 'hik': 'hikari', 'pp': 'penn plax', 'pennplax': 'penn plax',
  'mar': 'marineland', 'ml': 'marineland', 'sc': 'seachem',
  'zil': 'zilla', 'cst': 'coastal', 'coast': 'coastal', 'coas': 'coastal',
  'lp': 'lil pals', 'lilpals': 'lil pals', 'lup': 'lupine',
  'kng': 'kong', 'nyla': 'nylabone', 'ox': 'oxbow', 'oxb': 'oxbow',
  'ky': 'kaytee', 'kt': 'kaytee', 'kay': 'kaytee',
  'well': 'wellness', 'nut': 'nutro', 'mer': 'merrick',
  'totw': 'taste of the wild', 'nb': 'natural balance', 'natbal': 'natural balance',
  'can': 'canidae', 'frm': 'fromm', 'pmte': 'petmate', 'pm': 'petmate',
  'prev': 'prevue', 'asp': 'aspen', 'kor': 'kordon', 'jw': 'jw pet',
  'van': 'van ness', 'vn': 'van ness', 'sb': 'super bite', 'rb': 'redbarn',
  'cdt': 'cadet', 'grn': 'greenies', 'vb': 'virbac', 'fur': 'furminator',
  'fc': 'fresh n clean', 'fnc': 'fresh n clean', 'tc': 'tropiclean',
  'zym': 'zymox', 'ada': 'adams', 'adv': 'advantage', 'frt': 'frontline',
  'wh': 'whimzees', 'ped': 'pedigree', 'ces': 'cesar', 'ben': 'beneful',
  'frsk': 'friskies', 'ff': 'fancy feast', 'sheb': 'sheba', 'mm': 'meow mix',
  'temp': 'temptations', 'whsk': 'whiskas', 'tiki': 'tiki cat', 'wer': 'weruva',
  
  'ck': 'chicken', 'chk': 'chicken', 'bf': 'beef', 'lam': 'lamb', 'salm': 'salmon',
  'tk': 'turkey', 'trk': 'turkey', 'turk': 'turkey', 'duc': 'duck', 'shrim': 'shrimp',
  'whtfsh': 'whitefish', 'wht fsh': 'whitefish', 'tna': 'tuna', 'vnson': 'venison',
  
  'pup': 'puppy', 'jr': 'junior', 'sr': 'senior', 'sen': 'senior',
  'ad': 'adult', 'adt': 'adult', 'kit': 'kitten', 'ktn': 'kitten',
  
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large',
  'xs': 'extra small', 'xxl': 'xx large', 'mini': 'mini', 'jbo': 'jumbo',
  
  'br': 'breed', 'wt': 'weight', 'mgmt': 'management', 'ctrl': 'control',
  'sens': 'sensitive', 'stm': 'stomach', 'skn': 'skin', 'hlth': 'health',
  'hlthy': 'healthy', 'dgt': 'digest', 'dig': 'digestion', 'per': 'perfect',
  'orig': 'original', 'nat': 'natural', 'org': 'organic', 'grf': 'grain free',
  'gf': 'grain free', 'lf': 'low fat', 'hf': 'high fiber', 'hp': 'high protein',
  
  '#': 'lb', 'lbs': 'lb', 'oz': 'oz', 'cnt': 'count', 'ct': 'count', 'pk': 'pack',
  
  'coll': 'collar', 'col': 'collar', 'lsh': 'leash', 'hrns': 'harness', 'harn': 'harness',
  'bwl': 'bowl', 'dsh': 'dish', 'fdr': 'feeder', 'wtr': 'water',
  'bedng': 'bedding', 'beding': 'bedding', 'subst': 'substrate',
  'lnr': 'liner', 'lnrs': 'liners', 'lng': 'long', 'shrt': 'short',
  
  'blk': 'black', 'wh': 'white', 'whi': 'white', 'rd': 'red', 'gre': 'grey',
  'grn': 'green', 'blu': 'blue', 'pnk': 'pink', 'prp': 'purple', 'org': 'orange',
  'brn': 'brown', 'tan': 'tan', 'gld': 'gold', 'slv': 'silver',
};

function fullyExpand(text: string): string {
  if (!text) return '';
  let result = text.toLowerCase()
    .replace(/[™®©'"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const sorted = Object.entries(expansions).sort((a, b) => b[0].length - a[0].length);
  
  for (const [abbr, full] of sorted) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  
  return result.replace(/\s+/g, ' ').trim();
}

function getTokens(text: string): string[] {
  const expanded = fullyExpand(text);
  return expanded.split(/\s+/)
    .filter(t => t.length >= 2)
    .filter(t => !['the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'to', 'of'].includes(t));
}

function getTokenSet(text: string): Set<string> {
  return new Set(getTokens(text));
}

console.log('Building token index...');

const tokenIndex = new Map<string, UpcEntry[]>();
const exactIndex = new Map<string, UpcEntry>();

for (const entry of masterUpcs) {
  const expanded = fullyExpand(entry.name);
  exactIndex.set(expanded, entry);
  
  const tokens = getTokens(entry.name);
  for (const token of tokens) {
    if (!tokenIndex.has(token)) tokenIndex.set(token, []);
    tokenIndex.get(token)!.push(entry);
  }
}

console.log(`Token index: ${tokenIndex.size} tokens, ${exactIndex.size} exact`);

function calculateMatchScore(prodTokens: Set<string>, upcTokens: Set<string>): number {
  if (prodTokens.size === 0 || upcTokens.size === 0) return 0;
  
  let matches = 0;
  for (const t of prodTokens) {
    if (upcTokens.has(t)) matches++;
  }
  
  const prodCov = matches / prodTokens.size;
  const upcCov = matches / upcTokens.size;
  
  return (prodCov * 0.6 + upcCov * 0.4) * 100;
}

function findMatch(productName: string, threshold: number): { upc: string; name: string; score: number } | null {
  const expanded = fullyExpand(productName);
  
  const exact = exactIndex.get(expanded);
  if (exact) return { upc: exact.upc, name: exact.name, score: 100 };
  
  const prodTokens = getTokenSet(productName);
  if (prodTokens.size === 0) return null;
  
  const candidates = new Map<string, { entry: UpcEntry; hits: number }>();
  for (const token of prodTokens) {
    const entries = tokenIndex.get(token) || [];
    for (const entry of entries) {
      if (!candidates.has(entry.upc)) {
        candidates.set(entry.upc, { entry, hits: 0 });
      }
      candidates.get(entry.upc)!.hits++;
    }
  }
  
  const sorted = Array.from(candidates.values())
    .filter(c => c.hits >= Math.min(2, prodTokens.size))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 50);
  
  let best: { upc: string; name: string; score: number } | null = null;
  
  for (const cand of sorted) {
    const upcTokens = getTokenSet(cand.entry.name);
    const score = calculateMatchScore(prodTokens, upcTokens);
    
    if (score >= threshold && (!best || score > best.score)) {
      best = { upc: cand.entry.upc, name: cand.entry.name, score: Math.round(score) };
    }
  }
  
  return best;
}

async function main() {
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku
  }).from(supplies);
  
  console.log(`Loaded ${products.length} products`);
  
  const noSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Products without SKU: ${noSku.length}`);
  
  console.log('\n=== Testing different thresholds ===');
  
  for (const threshold of [95, 90, 85, 80, 75, 70]) {
    let matched = 0;
    for (const product of noSku) {
      const match = findMatch(product.name, threshold);
      if (match) matched++;
    }
    console.log(`Threshold ${threshold}%: ${matched} matches (${((matched / noSku.length) * 100).toFixed(1)}%)`);
  }
  
  console.log('\n=== Applying 90% threshold matches ===');
  
  const matches: { id: number; name: string; upc: string; upcName: string; score: number }[] = [];
  const noMatch: { id: number; name: string }[] = [];
  
  for (const product of noSku) {
    const match = findMatch(product.name, 90);
    if (match) {
      matches.push({
        id: product.id,
        name: product.name,
        upc: match.upc,
        upcName: match.name,
        score: match.score
      });
    } else {
      noMatch.push({ id: product.id, name: product.name });
    }
  }
  
  console.log(`\nMatched: ${matches.length}`);
  console.log(`Unmatched: ${noMatch.length}`);
  
  console.log('\nSample matches:');
  for (const m of matches.slice(0, 25)) {
    console.log(`  [${m.score}%] "${m.name}" => "${m.upcName}"`);
  }
  
  console.log('\nApplying to database...');
  
  for (const match of matches) {
    await db.update(supplies)
      .set({ sku: match.upc })
      .where(eq(supplies.id, match.id));
  }
  
  console.log(`Applied ${matches.length} UPCs`);
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\nFinal: ${withSku}/${final.length} (${((withSku / final.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
