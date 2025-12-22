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
console.log(`Loaded ${masterUpcs.length} UPCs from master list`);

const brandNormalizations: Record<string, string> = {
  'zml': 'zoomed', 'zm': 'zoomed', 'zoo med': 'zoomed', 'zoo-med': 'zoomed',
  'et': 'exoterra', 'exo terra': 'exoterra', 'exo-terra': 'exoterra',
  'fl': 'fluval', 'fluv': 'fluval',
  'aq': 'aqueon', 'aqn': 'aqueon',
  'tt': 'tetra', 'tet': 'tetra',
  'hk': 'hikari', 'hik': 'hikari',
  'pp': 'pennplax', 'penn plax': 'pennplax', 'penn-plax': 'pennplax',
  'mar': 'marineland', 'ml': 'marineland',
  'sc': 'seachem', 'seach': 'seachem',
  'zil': 'zilla', 'zi': 'zilla',
  'cst': 'coastal', 'coas': 'coastal', 'coast': 'coastal',
  'lp': 'lilpals', 'li l pals': 'lilpals', 'lil pals': 'lilpals', "li'l pals": 'lilpals',
  'lup': 'lupine',
  'kng': 'kong', 'kg': 'kong',
  'nyla': 'nylabone', 'nyl': 'nylabone',
  'ox': 'oxbow', 'oxb': 'oxbow',
  'ky': 'kaytee', 'kt': 'kaytee', 'kay': 'kaytee',
  'sd': 'sciencediet', 'hills': 'sciencediet', 'hill': 'sciencediet', "hill's": 'sciencediet', 'science diet': 'sciencediet',
  'rc': 'royalcanin', 'royal canin': 'royalcanin',
  'ppp': 'proplan', 'pro plan': 'proplan', 'purina pro plan': 'proplan',
  'iam': 'iams',
  'eb': 'eukanuba', 'euk': 'eukanuba',
  'bb': 'bluebuffalo', 'blbuf': 'bluebuffalo', 'bl buf': 'bluebuffalo', 'buf': 'bluebuffalo', 'blue buffalo': 'bluebuffalo', 'blue': 'bluebuffalo',
  'well': 'wellness', 'wlns': 'wellness',
  'nut': 'nutro', 'nutr': 'nutro',
  'mer': 'merrick', 'merk': 'merrick',
  'totw': 'tasteofwild', 'taste of the wild': 'tasteofwild',
  'nat bal': 'naturalbalance', 'natbal': 'naturalbalance', 'nb': 'naturalbalance', 'natural balance': 'naturalbalance',
  'can': 'canidae', 'cand': 'canidae',
  'frm': 'fromm', 'fro': 'fromm',
  'pmte': 'petmate', 'pm': 'petmate', 'ptmt': 'petmate',
  'prev': 'prevue', 'prv': 'prevue',
  'asp': 'aspen', 'aspn': 'aspen',
  'kor': 'kordon', 'kord': 'kordon',
  'jw': 'jwpet', 'jw pet': 'jwpet',
  'van': 'vanness', 'vn': 'vanness', 'van ness': 'vanness',
  'sb': 'superbite', 'super bite': 'superbite',
  'rb': 'redbarn', 'redb': 'redbarn',
  'cdt': 'cadet', 'cad': 'cadet',
  'grn': 'greenies', 'green': 'greenies',
  'vb': 'virbac', 'virb': 'virbac',
  'fur': 'furminator', 'furm': 'furminator',
  'fc': 'freshnclean', 'fnc': 'freshnclean', 'fresh n clean': 'freshnclean',
  'tc': 'tropiclean', 'trop': 'tropiclean', 'tropi': 'tropiclean',
  'earth': 'earthbath',
  'burts': 'burtbees', "burt's bees": 'burtbees', 'burt bees': 'burtbees',
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
  'ff': 'fancyfeast', 'fncyfst': 'fancyfeast', 'fancy feast': 'fancyfeast',
  'sheb': 'sheba', 'shb': 'sheba',
  'mm': 'meowmix', 'meow mix': 'meowmix',
  'temp': 'temptations', 'tmpt': 'temptations',
  'whsk': 'whiskas', 'whis': 'whiskas',
  'tiki': 'tikicat', 'tiki cat': 'tikicat',
  'wer': 'weruva', 'weru': 'weruva',
  'lv': 'lovingpets', 'loving pets': 'lovingpets',
  'pf': 'petfactory', 'pet factory': 'petfactory',
  'ln': 'lennox', 'lenx': 'lennox',
  'sh': 'smokehouse', 'smoke': 'smokehouse',
  'jn': 'jonesnatural', 'jones': 'jonesnatural', 'jones natural': 'jonesnatural',
  'nf': 'naturalfarm', 'nat farm': 'naturalfarm', 'natural farm': 'naturalfarm',
  'glofish': 'glofish', 'glo fish': 'glofish', 'glo': 'glofish',
  'omega': 'omegaone', 'omega one': 'omegaone',
  'ocean': 'oceannutrition', 'ocean nutrition': 'oceannutrition',
  'flk': 'flukers', 'fluker': 'flukers', "fluker's": 'flukers',
  'repti': 'repticare', 'repti care': 'repticare',
  'rept': 'reptology', 'reptology': 'reptology',
  'aq top': 'aquatop', 'aquatop': 'aquatop',
  'vit': 'vitakraft', 'vitakraft': 'vitakraft',
  'caref': 'carefresh', 'carefresh': 'carefresh', 'care fresh': 'carefresh',
  'nutris': 'nutrisource', 'nutrisource': 'nutrisource', 'nutri source': 'nutrisource',
  'prim': 'primal', 'primal': 'primal',
  'valh': 'valhoma', 'valhoma': 'valhoma',
  'cascade': 'cascade', 'casc': 'cascade',
  'titan': 'titan', 'ttn': 'titan',
  'replend': 'replendish', 'replendish': 'replendish',
  'petcrest': 'petcrest', 'pet crest': 'petcrest',
  'zupreem': 'zupreem', 'zup': 'zupreem',
  'skidstop': 'skidstop', 'skid stop': 'skidstop',
};

function normalize(text: string): string {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[™®©'\"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBrand(text: string): string {
  const norm = normalize(text);
  
  const sortedBrands = Object.entries(brandNormalizations)
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [pattern, replacement] of sortedBrands) {
    if (norm.startsWith(pattern + ' ') || norm === pattern) {
      return replacement;
    }
  }
  
  const firstWord = norm.split(/\s+/)[0];
  if (firstWord && brandNormalizations[firstWord]) {
    return brandNormalizations[firstWord];
  }
  
  return firstWord || '';
}

function getProductSignature(text: string): string {
  const norm = normalize(text);
  
  const tokens = norm.split(/\s+/).filter(t => t.length >= 2);
  
  const sizePattern = /(\d+(?:\.\d+)?)\s*(lb|lbs|oz|kg|g|ct|pk|ml|l|gal|in|ft|w)/i;
  const sizeMatch = norm.match(sizePattern);
  const size = sizeMatch ? sizeMatch[0].replace(/\s+/g, '') : '';
  
  const meaningfulTokens = tokens
    .filter(t => !/^\d+$/.test(t))
    .filter(t => !['the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'to', 'of'].includes(t))
    .slice(0, 6);
  
  return meaningfulTokens.join(' ') + (size ? ' ' + size : '');
}

function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length >= 2));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length >= 2));
  
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }
  
  const covA = matches / wordsA.size;
  const covB = matches / wordsB.size;
  
  return (covA + covB) / 2;
}

interface IndexedUpc {
  entry: UpcEntry;
  brand: string;
  signature: string;
}

const brandIndex = new Map<string, IndexedUpc[]>();

console.log('Building brand-based index...');

for (const entry of masterUpcs) {
  const brand = normalizeBrand(entry.name);
  const signature = getProductSignature(entry.name);
  
  const indexed: IndexedUpc = { entry, brand, signature };
  
  if (!brandIndex.has(brand)) {
    brandIndex.set(brand, []);
  }
  brandIndex.get(brand)!.push(indexed);
}

console.log(`Indexed ${brandIndex.size} brands`);

function findMatch(productName: string): { upc: string; name: string; score: number } | null {
  const brand = normalizeBrand(productName);
  const signature = getProductSignature(productName);
  
  const candidates = brandIndex.get(brand) || [];
  
  if (candidates.length === 0) {
    return null;
  }
  
  let best: { upc: string; name: string; score: number } | null = null;
  
  for (const candidate of candidates) {
    const sim = calculateSimilarity(signature, candidate.signature);
    const score = Math.round(sim * 100);
    
    if (score >= 90 && (!best || score > best.score)) {
      best = { upc: candidate.entry.upc, name: candidate.entry.name, score };
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
      console.log(`Processed ${i + 1}/${noSku.length}...`);
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
  console.log(`\nCompleted in ${elapsed.toFixed(1)}s`);
  
  console.log('\n=== RESULTS ===');
  console.log(`Products without SKU: ${noSku.length}`);
  console.log(`Matched (90%+): ${matches.length}`);
  console.log(`No match: ${noMatch.length}`);
  console.log(`Match rate: ${((matches.length / noSku.length) * 100).toFixed(1)}%`);
  
  console.log('\nSample matches:');
  for (const m of matches.slice(0, 20)) {
    console.log(`  [${m.score}%] "${m.name}" => "${m.upcName}"`);
  }
  
  console.log('\nApplying matches...');
  
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
  
  fs.writeFileSync('scripts/unmatched_brand.json', JSON.stringify(noMatch, null, 2));
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\nFinal: ${withSku}/${final.length} products have UPCs (${((withSku / final.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
