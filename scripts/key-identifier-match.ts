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

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[™®©'"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBrand(text: string): string {
  const norm = normalize(text);
  const words = norm.split(/\s+/);
  
  const brandMap: Record<string, string> = {
    'zml': 'zoomed', 'zm': 'zoomed', 'zoo': 'zoomed', 'zoomed': 'zoomed',
    'et': 'exoterra', 'exoterra': 'exoterra', 'exo': 'exoterra',
    'fl': 'fluval', 'fluval': 'fluval', 'fluv': 'fluval',
    'aq': 'aqueon', 'aqueon': 'aqueon', 'aqn': 'aqueon',
    'tt': 'tetra', 'tetra': 'tetra', 'tet': 'tetra',
    'hk': 'hikari', 'hikari': 'hikari', 'hik': 'hikari',
    'pp': 'pennplax', 'penn': 'pennplax', 'pennplax': 'pennplax',
    'mar': 'marineland', 'marineland': 'marineland', 'ml': 'marineland',
    'sc': 'seachem', 'seachem': 'seachem',
    'zil': 'zilla', 'zilla': 'zilla', 'zi': 'zilla',
    'cst': 'coastal', 'coastal': 'coastal', 'coast': 'coastal',
    'lp': 'lilpals', 'lilpals': 'lilpals', 'lil': 'lilpals',
    'lup': 'lupine', 'lupine': 'lupine',
    'kng': 'kong', 'kong': 'kong',
    'nyla': 'nylabone', 'nylabone': 'nylabone', 'nyl': 'nylabone',
    'ox': 'oxbow', 'oxbow': 'oxbow', 'oxb': 'oxbow',
    'ky': 'kaytee', 'kaytee': 'kaytee', 'kt': 'kaytee',
    'sd': 'sciencediet', 'science': 'sciencediet', 'hills': 'sciencediet',
    'rc': 'royalcanin', 'royal': 'royalcanin', 'royalcanin': 'royalcanin',
    'ppp': 'proplan', 'pro': 'proplan', 'purina': 'proplan',
    'iam': 'iams', 'iams': 'iams',
    'eb': 'eukanuba', 'eukanuba': 'eukanuba',
    'bb': 'bluebuffalo', 'blue': 'bluebuffalo', 'buf': 'bluebuffalo', 'blbuf': 'bluebuffalo',
    'well': 'wellness', 'wellness': 'wellness',
    'nut': 'nutro', 'nutro': 'nutro',
    'mer': 'merrick', 'merrick': 'merrick',
    'totw': 'tasteofwild', 'taste': 'tasteofwild',
    'nb': 'naturalbalance', 'natural': 'naturalbalance', 'nat': 'naturalbalance', 'natbal': 'naturalbalance',
    'can': 'canidae', 'canidae': 'canidae',
    'frm': 'fromm', 'fromm': 'fromm',
    'pmte': 'petmate', 'petmate': 'petmate',
    'prev': 'prevue', 'prevue': 'prevue',
    'asp': 'aspen', 'aspen': 'aspen',
    'jw': 'jwpet', 'jwpet': 'jwpet',
    'rb': 'redbarn', 'redbarn': 'redbarn',
    'grn': 'greenies', 'greenies': 'greenies',
    'fur': 'furminator', 'furminator': 'furminator',
    'tc': 'tropiclean', 'tropiclean': 'tropiclean',
    'ada': 'adams', 'adams': 'adams',
    'ff': 'fancyfeast', 'fancy': 'fancyfeast',
    'mm': 'meowmix', 'meow': 'meowmix',
    'temp': 'temptations', 'temptations': 'temptations',
    'tiki': 'tikicat', 'tikicat': 'tikicat',
    'wer': 'weruva', 'weruva': 'weruva',
    'aquatop': 'aquatop', 'birdlife': 'birdlife', 'carefresh': 'carefresh',
    'nutrisource': 'nutrisource', 'nutris': 'nutrisource',
    'primal': 'primal', 'prim': 'primal',
    'valhoma': 'valhoma', 'valh': 'valhoma',
    'cascade': 'cascade', 'casc': 'cascade',
    'petcrest': 'petcrest', 'quiettime': 'quiettime', 'quiet': 'quiettime',
    'replendish': 'replendish', 'repl': 'replendish',
    'weewee': 'weewee', 'victor': 'victor',
    'fussie': 'fussiecat', 'fussiecat': 'fussiecat',
    'petag': 'petag', 'vitakraft': 'vitakraft',
    'bam': 'bambones', 'bambones': 'bambones',
  };
  
  if (words.length > 0) {
    const first = words[0];
    if (brandMap[first]) return brandMap[first];
    
    const twoWord = words.slice(0, 2).join(' ');
    if (twoWord === 'zoo med' || twoWord === 'exo terra' || twoWord === 'penn plax' ||
        twoWord === 'science diet' || twoWord === 'royal canin' || twoWord === 'pro plan' ||
        twoWord === 'blue buffalo' || twoWord === 'natural balance' || twoWord === 'taste of' ||
        twoWord === 'jw pet' || twoWord === 'van ness' || twoWord === 'fresh n' ||
        twoWord === 'fancy feast' || twoWord === 'meow mix' || twoWord === 'tiki cat' ||
        twoWord === 'lil pals') {
      return brandMap[words[0]] || words[0];
    }
  }
  
  return words[0] || '';
}

function extractSize(text: string): string {
  const norm = normalize(text);
  
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(lb|lbs|#)/i,
    /(\d+(?:\.\d+)?)\s*(oz)/i,
    /(\d+(?:\.\d+)?)\s*(ct|pk|pack|count)/i,
    /(\d+(?:\.\d+)?)\s*(ml|l|gal|gallon)/i,
    /(\d+(?:\.\d+)?)\s*(in|inch|ft|foot|feet)/i,
    /(\d+(?:\.\d+)?)\s*(w|watt)/i,
    /(\d+(?:\.\d+)?)\s*(qt|quart)/i,
    /(\d+)\s*x\s*(\d+)/i,
  ];
  
  for (const pat of patterns) {
    const match = norm.match(pat);
    if (match) {
      return match[0].replace(/\s+/g, '').replace('#', 'lb');
    }
  }
  
  return '';
}

function extractProductType(text: string): string {
  const norm = normalize(text);
  
  const types = [
    'collar', 'leash', 'harness', 'lead',
    'food', 'treat', 'treats', 'chew', 'chews',
    'bowl', 'dish', 'feeder', 'waterer',
    'bed', 'crate', 'cage', 'carrier', 'kennel',
    'shampoo', 'conditioner', 'spray',
    'toy', 'ball', 'rope', 'bone',
    'filter', 'pump', 'heater', 'light', 'bulb', 'lamp', 'hood',
    'substrate', 'bedding', 'litter', 'sand',
    'plant', 'decor', 'decoration', 'ornament',
    'tank', 'aquarium', 'terrarium', 'habitat',
    'medicine', 'supplement', 'vitamin',
    'brush', 'comb', 'clipper', 'scissors',
  ];
  
  for (const type of types) {
    if (norm.includes(type)) return type;
  }
  
  return '';
}

function extractKeywords(text: string): Set<string> {
  const norm = normalize(text);
  const words = norm.split(/\s+/).filter(w => w.length >= 3);
  
  const stop = new Set(['the', 'and', 'for', 'with']);
  const keywords = new Set<string>();
  
  for (const word of words) {
    if (!stop.has(word)) {
      keywords.add(word);
    }
  }
  
  return keywords;
}

interface IndexedUpc {
  entry: UpcEntry;
  brand: string;
  size: string;
  type: string;
  keywords: Set<string>;
}

const brandIndex = new Map<string, IndexedUpc[]>();

console.log('Building index...');

for (const entry of masterUpcs) {
  const indexed: IndexedUpc = {
    entry,
    brand: extractBrand(entry.name),
    size: extractSize(entry.name),
    type: extractProductType(entry.name),
    keywords: extractKeywords(entry.name),
  };
  
  if (!brandIndex.has(indexed.brand)) {
    brandIndex.set(indexed.brand, []);
  }
  brandIndex.get(indexed.brand)!.push(indexed);
}

console.log(`Indexed ${brandIndex.size} brands`);

function findMatch(productName: string): { upc: string; name: string; score: number } | null {
  const brand = extractBrand(productName);
  const size = extractSize(productName);
  const type = extractProductType(productName);
  const keywords = extractKeywords(productName);
  
  const candidates = brandIndex.get(brand) || [];
  if (candidates.length === 0) return null;
  
  let best: { upc: string; name: string; score: number } | null = null;
  
  for (const cand of candidates) {
    let score = 40;
    
    if (size && cand.size) {
      if (size === cand.size) score += 25;
      else score -= 20;
    }
    
    if (type && cand.type) {
      if (type === cand.type) score += 20;
    }
    
    let kwMatch = 0;
    for (const kw of keywords) {
      if (cand.keywords.has(kw)) kwMatch++;
    }
    
    const kwScore = keywords.size > 0 ? (kwMatch / keywords.size) * 30 : 0;
    score += kwScore;
    
    score = Math.round(Math.min(100, Math.max(0, score)));
    
    if (score >= 90 && (!best || score > best.score)) {
      best = { upc: cand.entry.upc, name: cand.entry.name, score };
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
  
  console.log(`\nMatched: ${matches.length}`);
  
  console.log('\nSample matches:');
  for (const m of matches.slice(0, 30)) {
    console.log(`  [${m.score}%] "${m.name}" => "${m.upcName}"`);
  }
  
  if (matches.length > 0) {
    console.log('\nApplying to database...');
    for (const match of matches) {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.id));
    }
    console.log(`Applied ${matches.length} UPCs`);
  }
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\nFinal: ${withSku}/${final.length} (${((withSku / final.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
