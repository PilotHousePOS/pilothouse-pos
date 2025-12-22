import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, isNull, or } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

const masterUpcs: UpcEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
console.log(`Loaded ${masterUpcs.length} UPCs`);

const brandNorm: Record<string, string> = {
  'coa': 'coastal', 'coastal': 'coastal', 'coast': 'coastal', 'cst': 'coastal',
  'zml': 'zoomed', 'zoomed': 'zoomed', 'zoo': 'zoomed', 'zm': 'zoomed',
  'exoterra': 'exoterra', 'et': 'exoterra', 'exo': 'exoterra',
  'kon': 'kong', 'kng': 'kong', 'kong': 'kong',
  'sd': 'sciencediet', 'science': 'sciencediet', 'hills': 'sciencediet',
  'fluval': 'fluval', 'fl': 'fluval', 'fluv': 'fluval',
  'fromm': 'fromm', 'frm': 'fromm',
  'tetra': 'tetra', 'tt': 'tetra', 'tet': 'tetra',
  'nutri': 'nutrisource', 'nutrisource': 'nutrisource',
  'oxb': 'oxbow', 'oxbow': 'oxbow', 'ox': 'oxbow',
  'hikari': 'hikari', 'hk': 'hikari', 'hik': 'hikari',
  'aqueon': 'aqueon', 'aq': 'aqueon', 'aqn': 'aqueon',
  'lilpals': 'lilpals', 'lil': 'lilpals', 'lp': 'lilpals',
  'zil': 'zilla', 'zilla': 'zilla',
  'pro': 'proplan', 'ppp': 'proplan',
  'blue': 'bluebuffalo', 'bb': 'bluebuffalo', 'buf': 'bluebuffalo', 'blbuf': 'bluebuffalo',
  'api': 'api',
  'seachem': 'seachem', 'sc': 'seachem',
  'penn': 'pennplax', 'pp': 'pennplax', 'pennplax': 'pennplax',
  'kaytee': 'kaytee', 'kay': 'kaytee', 'ky': 'kaytee', 'kt': 'kaytee',
  'nylabone': 'nylabone', 'nyla': 'nylabone', 'nyl': 'nylabone',
  'redbarn': 'redbarn', 'rb': 'redbarn',
  'tropiclean': 'tropiclean', 'tc': 'tropiclean', 'tropi': 'tropiclean',
  'spot': 'spot',
  'birdlife': 'birdlife', 'bird': 'birdlife',
  'safari': 'safari', 'saf': 'safari',
  'catit': 'catit', 'cat': 'catit',
  'prevue': 'prevue', 'prev': 'prevue',
  'marina': 'marina', 'mar': 'marina',
  'circle': 'circle', 'circ': 'circle',
  'titan': 'titan', 'ttn': 'titan',
  'aquatop': 'aquatop',
  'marineland': 'marineland', 'ml': 'marineland',
  'lupine': 'lupine', 'lup': 'lupine',
  'valhoma': 'valhoma', 'valh': 'valhoma',
  'petmate': 'petmate', 'pm': 'petmate', 'pmte': 'petmate',
  'aspen': 'aspen', 'asp': 'aspen',
  'greenies': 'greenies', 'grn': 'greenies', 'green': 'greenies',
  'wellness': 'wellness', 'well': 'wellness',
  'nutro': 'nutro', 'nut': 'nutro',
  'merrick': 'merrick', 'mer': 'merrick',
  'canidae': 'canidae', 'can': 'canidae',
  'iams': 'iams', 'iam': 'iams',
  'eukanuba': 'eukanuba', 'eb': 'eukanuba', 'euk': 'eukanuba',
  'royalcanin': 'royalcanin', 'rc': 'royalcanin', 'royal': 'royalcanin',
  'naturalbalance': 'naturalbalance', 'nb': 'naturalbalance', 'natbal': 'naturalbalance', 'natural': 'naturalbalance',
  'tasteofwild': 'tasteofwild', 'totw': 'tasteofwild', 'taste': 'tasteofwild',
  'fancyfeast': 'fancyfeast', 'ff': 'fancyfeast', 'fancy': 'fancyfeast',
  'meowmix': 'meowmix', 'mm': 'meowmix', 'meow': 'meowmix',
  'temptations': 'temptations', 'temp': 'temptations',
  'sheba': 'sheba', 'sheb': 'sheba',
  'friskies': 'friskies', 'frsk': 'friskies', 'fris': 'friskies',
  'pedigree': 'pedigree', 'ped': 'pedigree',
  'cesar': 'cesar', 'ces': 'cesar',
  'beneful': 'beneful', 'ben': 'beneful',
  'weruva': 'weruva', 'wer': 'weruva',
  'tikicat': 'tikicat', 'tiki': 'tikicat',
  'whiskas': 'whiskas', 'whsk': 'whiskas',
  'furminator': 'furminator', 'fur': 'furminator',
  'adams': 'adams', 'ada': 'adams',
  'advantage': 'advantage', 'adv': 'advantage',
  'frontline': 'frontline', 'frt': 'frontline',
  'zymox': 'zymox', 'zym': 'zymox',
  'virbac': 'virbac', 'vb': 'virbac',
  'oravet': 'oravet', 'ora': 'oravet',
  'whimzees': 'whimzees', 'wh': 'whimzees', 'whim': 'whimzees',
  'cadet': 'cadet', 'cdt': 'cadet',
  'jw': 'jwpet', 'jwpet': 'jwpet',
  'vanness': 'vanness', 'van': 'vanness', 'vn': 'vanness',
  'kordon': 'kordon', 'kor': 'kordon',
  'ware': 'ware', 'war': 'ware',
  'superbite': 'superbite', 'sb': 'superbite',
  'carefresh': 'carefresh', 'caref': 'carefresh', 'care': 'carefresh',
  'primal': 'primal', 'prim': 'primal',
  'quiettime': 'quiettime', 'quiet': 'quiettime',
  'replendish': 'replendish', 'repl': 'replendish',
  'weewee': 'weewee',
  'victor': 'victor', 'vic': 'victor',
  'fussiecat': 'fussiecat', 'fussie': 'fussiecat',
  'petag': 'petag',
  'vitakraft': 'vitakraft', 'vita': 'vitakraft',
  'glofish': 'glofish', 'glo': 'glofish',
  'flukers': 'flukers', 'flk': 'flukers', 'fluker': 'flukers',
  'reptology': 'reptology', 'rept': 'reptology',
  'repticare': 'repticare', 'repti': 'repticare',
  'aec': 'alllivingthings', 'all': 'alllivingthings',
  'eth': 'earthbath', 'earthbath': 'earthbath', 'earth': 'earthbath',
  'pts': 'petsafe', 'petsafe': 'petsafe',
  'cp': 'cp',
  'tide': 'tide',
};

const abbrevExpand: Record<string, string> = {
  'ck': 'chicken', 'chk': 'chicken', 'bf': 'beef', 'lam': 'lamb', 'salm': 'salmon',
  'tk': 'turkey', 'trk': 'turkey', 'turk': 'turkey', 'duc': 'duck', 'shrim': 'shrimp',
  'pup': 'puppy', 'ad': 'adult', 'adt': 'adult', 'sr': 'senior', 'sen': 'senior',
  'kit': 'kitten', 'ktn': 'kitten', 'jr': 'junior',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'xlarge', 'xs': 'xsmall',
  'br': 'breed', 'wt': 'weight', 'sens': 'sensitive', 'hlth': 'health',
  'orig': 'original', 'nat': 'natural', 'grf': 'grainfree', 'gf': 'grainfree',
  'coll': 'collar', 'col': 'collar', 'lsh': 'leash', 'hrns': 'harness',
  'bwl': 'bowl', 'dsh': 'dish', 'fdr': 'feeder', 'wtr': 'water',
  'bedng': 'bedding', 'subst': 'substrate',
  'blk': 'black', 'wh': 'white', 'whi': 'white', 'rd': 'red', 'blu': 'blue',
  'grn': 'green', 'pnk': 'pink', 'prp': 'purple', 'org': 'orange', 'brn': 'brown',
  '#': 'lb', 'lbs': 'lb', 'cnt': 'count', 'ct': 'count', 'pk': 'pack',
};

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[™®©'"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getBrand(text: string): string {
  const norm = normalize(text);
  const first = norm.split(/\s+/)[0];
  return brandNorm[first] || first;
}

function expand(text: string): string {
  let result = normalize(text);
  
  const sorted = Object.entries(abbrevExpand).sort((a, b) => b[0].length - a[0].length);
  for (const [abbr, full] of sorted) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'g');
    result = result.replace(regex, full);
  }
  
  return result;
}

function getTokens(text: string): string[] {
  const exp = expand(text);
  const stop = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'to', 'of']);
  return exp.split(/\s+/)
    .filter(t => t.length >= 2 && !stop.has(t));
}

function extractSize(text: string): string {
  const norm = normalize(text);
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(lb|lbs|#)/,
    /(\d+(?:\.\d+)?)\s*(oz)/,
    /(\d+(?:\.\d+)?)\s*(ct|pk|pack|count)/,
    /(\d+(?:\.\d+)?)\s*(ml|l|gal)/,
    /(\d+(?:\.\d+)?)\s*(in|ft)/,
    /(\d+(?:\.\d+)?)\s*(w)/,
    /(\d+(?:\.\d+)?)\s*(qt)/,
  ];
  
  for (const pat of patterns) {
    const match = norm.match(pat);
    if (match) return match[0].replace(/\s+/g, '').replace('#', 'lb');
  }
  return '';
}

interface IndexedUpc {
  entry: UpcEntry;
  brand: string;
  tokens: Set<string>;
  size: string;
  normalized: string;
}

const exactIndex = new Map<string, UpcEntry>();
const brandIndex = new Map<string, IndexedUpc[]>();

console.log('Building indexes...');

for (const entry of masterUpcs) {
  const norm = expand(entry.name);
  exactIndex.set(norm, entry);
  
  const indexed: IndexedUpc = {
    entry,
    brand: getBrand(entry.name),
    tokens: new Set(getTokens(entry.name)),
    size: extractSize(entry.name),
    normalized: norm,
  };
  
  if (!brandIndex.has(indexed.brand)) brandIndex.set(indexed.brand, []);
  brandIndex.get(indexed.brand)!.push(indexed);
}

console.log(`Exact index: ${exactIndex.size}, Brand index: ${brandIndex.size} brands`);

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  
  const union = a.size + b.size - intersection;
  return intersection / union;
}

function findMatch(productName: string): { upc: string; name: string; score: number } | null {
  const norm = expand(productName);
  
  const exact = exactIndex.get(norm);
  if (exact) return { upc: exact.upc, name: exact.name, score: 100 };
  
  const brand = getBrand(productName);
  const tokens = new Set(getTokens(productName));
  const size = extractSize(productName);
  
  const candidates = brandIndex.get(brand) || [];
  if (candidates.length === 0) return null;
  
  let best: { upc: string; name: string; score: number } | null = null;
  
  for (const cand of candidates) {
    const jaccard = jaccardSimilarity(tokens, cand.tokens);
    
    let score = jaccard * 100;
    
    if (size && cand.size && size === cand.size) {
      score = Math.min(100, score + 10);
    }
    
    score = Math.round(score);
    
    if (score >= 90 && (!best || score > best.score)) {
      best = { upc: cand.entry.upc, name: cand.entry.name, score };
    }
  }
  
  return best;
}

async function main() {
  console.log('\nLoading products...');
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku
  }).from(supplies);
  
  console.log(`Total products: ${products.length}`);
  
  const noSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Without SKU: ${noSku.length}`);
  
  const matches: { id: number; name: string; upc: string; upcName: string; score: number }[] = [];
  
  for (const product of noSku) {
    const match = findMatch(product.name);
    if (match) {
      matches.push({
        id: product.id,
        name: product.name,
        upc: match.upc,
        upcName: match.name,
        score: match.score
      });
    }
  }
  
  console.log(`\nMatched (90%+): ${matches.length}`);
  
  console.log('\nSample matches:');
  for (const m of matches.slice(0, 25)) {
    console.log(`  [${m.score}%] "${m.name}" => "${m.upcName}"`);
  }
  
  if (matches.length > 0) {
    console.log('\nApplying to database...');
    for (const match of matches) {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.id));
    }
    console.log(`Applied ${matches.length}`);
  }
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\nFinal: ${withSku}/${final.length} (${((withSku / final.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
