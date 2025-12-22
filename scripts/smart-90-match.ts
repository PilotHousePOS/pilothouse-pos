import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import { abbreviationMappings } from './shared-mappings';

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

const masterUpcs: UpcEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
console.log(`Loaded ${masterUpcs.length} UPCs from master list`);

const brandAbbreviations: Record<string, string> = {
  'zml': 'zoo med', 'zm': 'zoo med', 'zoomed': 'zoo med',
  'et': 'exo terra', 'exoterra': 'exo terra',
  'fl': 'fluval', 'fluv': 'fluval',
  'aq': 'aqueon', 'aqn': 'aqueon',
  'tt': 'tetra', 'tet': 'tetra',
  'hk': 'hikari', 'hik': 'hikari',
  'pp': 'penn plax', 'pennplax': 'penn plax',
  'mar': 'marineland', 'ml': 'marineland',
  'api': 'api', 'sc': 'seachem', 'seach': 'seachem',
  'zil': 'zilla', 'zi': 'zilla',
  'cst': 'coastal', 'coas': 'coastal', 'coast': 'coastal',
  'lp': 'li l pals', 'lilpals': 'li l pals', 'lil pals': 'li l pals',
  'lup': 'lupine', 'lup.': 'lupine',
  'kng': 'kong', 'kg': 'kong',
  'nyla': 'nylabone', 'nyl': 'nylabone',
  'ox': 'oxbow', 'oxb': 'oxbow',
  'ky': 'kaytee', 'kt': 'kaytee', 'kay': 'kaytee',
  'sd': 'science diet', 'hills': 'science diet', 'hill': 'science diet',
  'rc': 'royal canin', 'royalcanin': 'royal canin',
  'ppp': 'purina pro plan', 'pro plan': 'purina pro plan',
  'iam': 'iams', 'iams': 'iams',
  'eb': 'eukanuba', 'euk': 'eukanuba',
  'bb': 'blue buffalo', 'blbuf': 'blue buffalo', 'bl buf': 'blue buffalo', 'buf': 'blue buffalo',
  'well': 'wellness', 'wlns': 'wellness',
  'nut': 'nutro', 'nutr': 'nutro',
  'mer': 'merrick', 'merk': 'merrick',
  'totw': 'taste of the wild', 'tasteofwild': 'taste of the wild',
  'nat bal': 'natural balance', 'natbal': 'natural balance', 'nb': 'natural balance',
  'can': 'canidae', 'cand': 'canidae',
  'frm': 'fromm', 'fro': 'fromm',
  'pmte': 'petmate', 'pm': 'petmate', 'ptmt': 'petmate',
  'prev': 'prevue', 'prv': 'prevue',
  'asp': 'aspen', 'aspn': 'aspen',
  'kar': 'karate', 'kr': 'kordon',
  'kor': 'kordon', 'kord': 'kordon',
  'ware': 'ware', 'war': 'ware',
  'jw': 'jw pet', 'jwp': 'jw pet',
  'van': 'van ness', 'vn': 'van ness', 'vanness': 'van ness',
  'boss': 'boss', 'bos': 'boss',
  'sb': 'super bite', 'superbite': 'super bite',
  'rb': 'redbarn', 'redb': 'redbarn',
  'cdt': 'cadet', 'cad': 'cadet',
  'grn': 'greenies', 'green': 'greenies',
  'vb': 'virbac', 'virb': 'virbac',
  'fur': 'furminator', 'furm': 'furminator',
  'fc': 'fresh n clean', 'fnc': 'fresh n clean', 'freshnclean': 'fresh n clean',
  'tc': 'tropiclean', 'trop': 'tropiclean', 'tropi': 'tropiclean',
  'eb': 'earthbath', 'earth': 'earthbath',
  'bb': 'burt bees', 'burts': 'burt bees',
  'zym': 'zymox', 'zy': 'zymox',
  'ada': 'adams', 'adm': 'adams',
  'adv': 'advantage', 'advant': 'advantage',
  'frt': 'frontline', 'front': 'frontline',
  'wh': 'whimzees', 'whim': 'whimzees',
  'or': 'oravet', 'ora': 'oravet',
  'ped': 'pedigree', 'pdgr': 'pedigree',
  'ces': 'cesar', 'csr': 'cesar',
  'ben': 'beneful', 'bnfl': 'beneful',
  'frsk': 'friskies', 'fris': 'friskies',
  'ff': 'fancy feast', 'fncyfst': 'fancy feast',
  'sheb': 'sheba', 'shb': 'sheba',
  'mm': 'meow mix', 'meowmix': 'meow mix',
  'temp': 'temptations', 'tmpt': 'temptations',
  'whsk': 'whiskas', 'whis': 'whiskas',
  'tiki': 'tiki cat', 'tkct': 'tiki cat',
  'wer': 'weruva', 'weru': 'weruva',
  'lv': 'loving pets', 'lovpet': 'loving pets',
  'pf': 'pet factory', 'petfact': 'pet factory',
  'ln': 'lennox', 'lenx': 'lennox',
  'sh': 'smokehouse', 'smoke': 'smokehouse',
  'jn': 'jones natural', 'jones': 'jones natural',
  'nf': 'natural farm', 'natfarm': 'natural farm',
};

function expandAbbreviations(text: string): string {
  let result = text.toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  for (const [abbr, full] of Object.entries(brandAbbreviations)) {
    const regex = new RegExp(`^${abbr}\\b|\\b${abbr}$|\\b${abbr}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  
  for (const [abbr, full] of Object.entries(abbreviationMappings)) {
    const regex = new RegExp(`\\b${abbr.toLowerCase()}\\b`, 'gi');
    result = result.replace(regex, full.toLowerCase());
  }
  
  return result.replace(/\s+/g, ' ').trim();
}

function getSignificantWords(text: string): string[] {
  const expanded = expandAbbreviations(text);
  const stop = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'to', 'of', 'is', 'by']);
  return expanded.split(/\s+/)
    .filter(w => w.length >= 2 && !stop.has(w) && !/^\d+$/.test(w));
}

function extractBrand(text: string): string {
  const expanded = expandAbbreviations(text);
  const brands = [
    'zoo med', 'exo terra', 'fluval', 'aqueon', 'tetra', 'hikari', 'penn plax',
    'marineland', 'api', 'seachem', 'zilla', 'coastal', 'li l pals', 'lupine',
    'kong', 'nylabone', 'oxbow', 'kaytee', 'science diet', 'royal canin',
    'purina pro plan', 'iams', 'eukanuba', 'blue buffalo', 'wellness', 'nutro',
    'merrick', 'taste of the wild', 'natural balance', 'canidae', 'fromm',
    'petmate', 'prevue', 'aspen', 'kordon', 'ware', 'jw pet', 'van ness',
    'boss', 'super bite', 'redbarn', 'cadet', 'greenies', 'virbac', 'furminator',
    'fresh n clean', 'tropiclean', 'earthbath', 'burt bees', 'zymox', 'adams',
    'advantage', 'frontline', 'whimzees', 'oravet', 'pedigree', 'cesar',
    'beneful', 'friskies', 'fancy feast', 'sheba', 'meow mix', 'temptations',
    'whiskas', 'tiki cat', 'weruva', 'loving pets', 'pet factory', 'lennox',
    'smokehouse', 'jones natural', 'natural farm', 'vittle vault', 'living world',
    'glofish', 'omega one', 'ocean nutrition', 'fluker', 'repti care', 'reptology'
  ];
  
  for (const brand of brands) {
    if (expanded.includes(brand)) return brand;
  }
  
  const words = expanded.split(/\s+/);
  if (words.length > 0 && words[0].length >= 3) return words[0];
  
  return '';
}

const upcIndex = new Map<string, UpcEntry[]>();
const brandIndex = new Map<string, UpcEntry[]>();
const exactIndex = new Map<string, UpcEntry>();

console.log('Building indexes with abbreviation expansion...');

for (const entry of masterUpcs) {
  const expanded = expandAbbreviations(entry.name);
  exactIndex.set(expanded, entry);
  
  const brand = extractBrand(entry.name);
  if (brand) {
    if (!brandIndex.has(brand)) brandIndex.set(brand, []);
    brandIndex.get(brand)!.push(entry);
  }
  
  const words = getSignificantWords(entry.name);
  for (const word of words) {
    if (!upcIndex.has(word)) upcIndex.set(word, []);
    upcIndex.get(word)!.push(entry);
  }
}

console.log(`Indexes: ${exactIndex.size} exact, ${brandIndex.size} brands, ${upcIndex.size} words`);

function calculateScore(prodWords: string[], upcWords: string[]): number {
  const prodSet = new Set(prodWords);
  const upcSet = new Set(upcWords);
  
  let matching = 0;
  for (const w of prodSet) {
    if (upcSet.has(w)) matching++;
  }
  
  if (matching === 0) return 0;
  
  const prodCov = matching / prodSet.size;
  const upcCov = matching / upcSet.size;
  
  let score = Math.min(prodCov, upcCov) * 100;
  
  if (prodCov >= 0.95 && upcCov >= 0.85) score += 5;
  if (matching >= 5 && prodCov >= 0.85) score += 5;
  if (matching >= 3 && prodCov >= 0.9 && upcCov >= 0.9) score += 5;
  
  return Math.min(100, Math.round(score));
}

function findMatch(productName: string): { upc: string; name: string; score: number } | null {
  const expanded = expandAbbreviations(productName);
  
  const exact = exactIndex.get(expanded);
  if (exact) return { upc: exact.upc, name: exact.name, score: 100 };
  
  const prodWords = getSignificantWords(productName);
  if (prodWords.length === 0) return null;
  
  const prodBrand = extractBrand(productName);
  
  let candidates: UpcEntry[] = [];
  
  if (prodBrand && brandIndex.has(prodBrand)) {
    candidates = brandIndex.get(prodBrand)!;
  }
  
  if (candidates.length === 0) {
    const candidateMap = new Map<string, { entry: UpcEntry; hits: number }>();
    for (const word of prodWords) {
      const matches = upcIndex.get(word) || [];
      for (const entry of matches) {
        const key = entry.upc;
        if (!candidateMap.has(key)) {
          candidateMap.set(key, { entry, hits: 0 });
        }
        candidateMap.get(key)!.hits++;
      }
    }
    
    const sorted = Array.from(candidateMap.values())
      .filter(c => c.hits >= 2)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 100);
    
    candidates = sorted.map(c => c.entry);
  }
  
  let best: { upc: string; name: string; score: number } | null = null;
  
  for (const entry of candidates) {
    const upcWords = getSignificantWords(entry.name);
    const score = calculateScore(prodWords, upcWords);
    
    if (score >= 90 && (!best || score > best.score)) {
      best = { upc: entry.upc, name: entry.name, score };
    }
  }
  
  return best;
}

async function main() {
  console.log('Loading products from database...');
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku
  }).from(supplies);
  
  console.log(`Loaded ${products.length} products`);
  
  const noSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Products without SKU: ${noSku.length}`);
  
  const matches: { id: number; name: string; upc: string; upcName: string; score: number }[] = [];
  const noMatch: { id: number; name: string }[] = [];
  
  const start = Date.now();
  
  for (let i = 0; i < noSku.length; i++) {
    if ((i + 1) % 1000 === 0) {
      const elapsed = (Date.now() - start) / 1000;
      console.log(`Processed ${i + 1}/${noSku.length} (${(i / elapsed).toFixed(0)}/sec)...`);
    }
    
    const product = noSku[i];
    const match = findMatch(product.name);
    
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
  
  const elapsed = (Date.now() - start) / 1000;
  console.log(`\nMatching completed in ${elapsed.toFixed(1)}s`);
  
  console.log('\n=== RESULTS ===');
  console.log(`Total products: ${noSku.length}`);
  console.log(`Matched (90%+): ${matches.length}`);
  console.log(`No match: ${noMatch.length}`);
  console.log(`Match rate: ${((matches.length / noSku.length) * 100).toFixed(1)}%`);
  
  console.log('\nSample matches:');
  for (const m of matches.slice(0, 20)) {
    console.log(`  [${m.score}%] "${m.name}" => "${m.upcName}"`);
  }
  
  console.log('\nApplying matches to database...');
  
  let applied = 0;
  for (const match of matches) {
    await db.update(supplies)
      .set({ sku: match.upc })
      .where(eq(supplies.id, match.id));
    applied++;
    
    if (applied % 500 === 0) {
      console.log(`Applied ${applied}/${matches.length}...`);
    }
  }
  
  console.log(`Applied ${applied} UPCs`);
  
  fs.writeFileSync('scripts/unmatched_smart_90.json', JSON.stringify(noMatch, null, 2));
  console.log(`Saved ${noMatch.length} unmatched to scripts/unmatched_smart_90.json`);
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\nFinal: ${withSku}/${final.length} products have UPCs (${((withSku / final.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
