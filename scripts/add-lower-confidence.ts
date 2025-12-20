import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcRecord { upc: string; name: string; source: string; }

const upcDatabase: UpcRecord[] = JSON.parse(
  fs.readFileSync('.local/state/memory/complete_upc_database.json', 'utf-8')
);

const BRAND_MAP: Record<string, string> = {
  'sd': 'science diet', 'hills': 'science diet', 'hill': 'science diet',
  'nb': 'natural balance', 'tow': 'taste of the wild', 'toe': 'taste of the wild',
  'diam': 'diamond', 'royal': 'royal canin', 'rc': 'royal canin',
  'blue': 'blue buffalo', 'bb': 'blue buffalo',
  'kong': 'kong', 'kon': 'kong', 'kc': 'kong',
  'kaytee': 'kaytee', 'kay': 'kaytee', 'kmp': 'kaytee', 'kt': 'kaytee',
  'aqueon': 'aqueon', 'aqe': 'aqueon',
  'tetra': 'tetra', 'tet': 'tetra',
  'hikari': 'hikari', 'hik': 'hikari',
  'api': 'api', 'ar': 'api',
  'fluval': 'fluval', 'flu': 'fluval',
  'marina': 'marina', 'mar': 'marina',
  'seachem': 'seachem', 'sli': 'seachem',
  'zoo med': 'zoo med', 'zoo': 'zoo med', 'zml': 'zoo med',
  'exo terra': 'exo terra', 'exo': 'exo terra',
  'zilla': 'zilla', 'zil': 'zilla',
  'flukers': 'flukers', 'flk': 'flukers',
  'zupreem': 'zupreem', 'zup': 'zupreem',
  'coastal': 'coastal', 'coa': 'coastal',
  'penn': 'penn plax', 'pennplax': 'penn plax',
  'oxbow': 'oxbow', 'oxb': 'oxbow',
  'fromm': 'fromm', 'frm': 'fromm',
  'victor': 'victor', 'vict': 'victor',
  'sportmix': 'sportmix', 'spot': 'spot',
  'nutrisource': 'nutrisource', 'nut': 'nutrisource',
  'merrick': 'merrick', 'merr': 'merrick',
  'wellness': 'wellness', 'well': 'wellness',
  'canidae': 'canidae', 'cand': 'canidae',
  'instinct': 'instinct', 'inst': 'instinct',
  'earthborn': 'earthborn', 'earth': 'earthborn',
  'nulo': 'nulo', 'zignature': 'zignature', 'zig': 'zignature',
  'stella': 'stella chewy', 'stell': 'stella chewy',
  'primal': 'primal', 'prim': 'primal',
  'proplan': 'pro plan', 'pro plan': 'pro plan', 'pp': 'pro plan',
  'redbarn': 'redbarn', 'nylabone': 'nylabone', 'nyla': 'nylabone',
  'catit': 'catit', 'voyager': 'catit',
  'prevue': 'prevue', 'jwp': 'jw pet', 'jw': 'jw pet',
  'four paws': 'four paws', 'fou': 'four paws', '4p': 'four paws',
  'ethical': 'ethical', 'eth': 'ethical',
  'mammoth': 'mammoth', 'mamm': 'mammoth',
  'safari': 'safari', 'tropiclean': 'tropiclean', 'tropi': 'tropiclean',
  'circle t': 'circle t', 'circ': 'circle t',
  'titan': 'titan', 'birdlife': 'birdlife',
  'petmate': 'petmate', 'vari': 'petmate', 'barn': 'petmate',
  'li\'l pals': 'lil pals', 'lil pals': 'lil pals',
  'marineland': 'marineland', 'acana': 'acana', 'orijen': 'orijen',
  'weruva': 'weruva', 'tiki': 'tiki cat', 'fussie': 'fussie cat',
  'glofish': 'glofish', 'glo': 'glofish',
};

const ABBREV_MAP: Record<string, string> = {
  'ck': 'chicken', 'chk': 'chicken', 'chkn': 'chicken',
  'bf': 'beef', 'lam': 'lamb', 'slmn': 'salmon', 'sal': 'salmon',
  'duck': 'duck', 'tur': 'turkey', 'turk': 'turkey', 'ven': 'venison',
  'br': 'breed', 'sm': 'small', 'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large', 'xl': 'extra large', 'xs': 'extra small',
  'pup': 'puppy', 'pupp': 'puppy', 'kit': 'kitten', 'sr': 'senior',
  'ad': 'adult', 'adlt': 'adult', 'gr': 'grain', 'fr': 'free',
  'wt': 'weight', 'sens': 'sensitive', 'sensi': 'sensitive',
  'perf': 'perfect', 'dig': 'digest', 'min': 'miniature',
  'anc': 'ancient', 'mount': 'mountain', 'prarie': 'prairie',
  'pacif': 'pacific', 'sierra': 'sierra', 'mainten': 'maintenance',
  'prem': 'premium', 'als': 'all stages', 'orig': 'original',
  'vitality': 'vitality', 'mobility': 'mobility', 'light': 'light',
  'bulb': 'bulb', 'fxtr': 'fixture', 'food': 'food', 'trt': 'treat',
  'clnr': 'cleaner', 'grvl': 'gravel', 'vac': 'vacuum',
  'ornmt': 'ornament', 'sbstrt': 'substrate', 'filt': 'filter',
  'crt': 'cartridge', 'pllt': 'pellet', 'flk': 'flake',
  'htr': 'heater', 'therm': 'thermometer', 'toy': 'toy',
  'cond': 'conditioner', 'shmp': 'shampoo',
  'cchld': 'cichlid', 'gld': 'gold', 'betta': 'betta', 'trpcl': 'tropical',
  'tiel': 'cockatiel', 'prrt': 'parrot', 'keet': 'parakeet',
  'glofsh': 'glofish', 'cllr': 'collar', 'lsh': 'leash', 'hrns': 'harness',
};

function expandName(name: string): string {
  let expanded = name.toLowerCase();
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb');
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*z\b/gi, '$1oz');
  
  for (const [abbr, full] of Object.entries(ABBREV_MAP)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  
  return expanded.replace(/\s+/g, ' ').trim();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getWords(s: string): Set<string> {
  const words = normalize(s).split(' ').filter(w => w.length >= 2);
  const noise = new Set(['the', 'and', 'for', 'with', 'oz', 'lb', 'ea', 'pk', 'in', 'ct']);
  return new Set(words.filter(w => !noise.has(w)));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  return intersection / new Set([...a, ...b]).size;
}

function getBrand(name: string): string {
  const lower = name.toLowerCase().trim();
  const words = lower.split(/\s+/);
  
  for (let i = Math.min(3, words.length); i >= 1; i--) {
    const prefix = words.slice(0, i).join(' ');
    if (BRAND_MAP[prefix]) return BRAND_MAP[prefix];
  }
  
  return words[0] || 'unknown';
}

function calculateScore(upcName: string, productName: string, productBrand: string | null): number {
  const upcExpanded = expandName(upcName);
  const productLower = productName.toLowerCase();
  
  const upcWords = getWords(upcExpanded);
  const productWords = getWords(productLower);
  
  let score = jaccardSimilarity(upcWords, productWords);
  
  const upcBrand = getBrand(upcName);
  const prodBrand = productBrand?.toLowerCase().replace(/['']/g, '') || '';
  
  if (upcBrand && prodBrand) {
    const normalizedProdBrand = BRAND_MAP[prodBrand] || prodBrand;
    if (upcBrand === normalizedProdBrand || 
        normalizedProdBrand.includes(upcBrand) || 
        upcBrand.includes(normalizedProdBrand)) {
      score += 0.15;
    }
  }
  
  const upcWeight = upcName.match(/(\d+(?:\.\d+)?)\s*(?:lb|#|oz)/i)?.[1];
  const prodWeight = productName.match(/(\d+(?:\.\d+)?)\s*(?:lb|oz)/i)?.[1];
  if (upcWeight && prodWeight && upcWeight === prodWeight) {
    score += 0.20;
  }
  
  const keywords = ['puppy', 'kitten', 'senior', 'adult', 'small', 'large', 'medium',
                    'chicken', 'beef', 'lamb', 'salmon', 'turkey', 'duck'];
  for (const kw of keywords) {
    if (upcExpanded.includes(kw) && productLower.includes(kw)) {
      score += 0.05;
    }
  }
  
  return Math.min(score, 1.0);
}

async function main() {
  console.log('=== Adding Lower Confidence Matches (50-70%) ===\n');
  
  console.log(`UPC database size: ${upcDatabase.length}`);
  
  const products = await db.select().from(supplies).where(isNull(supplies.sku));
  console.log(`Products still needing SKU: ${products.length}`);
  
  const productsByBrand = new Map<string, typeof products>();
  for (const product of products) {
    const brand = (product.brand || '').toLowerCase().replace(/['']/g, '');
    const normalizedBrand = BRAND_MAP[brand] || brand || 'unknown';
    if (!productsByBrand.has(normalizedBrand)) productsByBrand.set(normalizedBrand, []);
    productsByBrand.get(normalizedBrand)!.push(product);
  }
  
  const upcsByBrand = new Map<string, UpcRecord[]>();
  for (const upc of upcDatabase) {
    const brand = getBrand(upc.name);
    if (!upcsByBrand.has(brand)) upcsByBrand.set(brand, []);
    upcsByBrand.get(brand)!.push(upc);
  }
  
  const LOW_MIN = 0.50;
  const LOW_MAX = 0.70;
  
  const lowMatches: Array<{
    productId: number;
    productName: string;
    upc: string;
    upcName: string;
    score: number;
  }> = [];
  
  for (const [brand, brandProducts] of productsByBrand) {
    const brandUpcs = upcsByBrand.get(brand) || [];
    if (brandUpcs.length === 0) continue;
    
    for (const product of brandProducts) {
      let bestMatch: { upc: string; name: string; score: number } | null = null;
      
      for (const upc of brandUpcs) {
        const score = calculateScore(upc.name, product.name, product.brand);
        if (score >= LOW_MIN && score < LOW_MAX && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { upc: upc.upc, name: upc.name, score };
        }
      }
      
      if (bestMatch) {
        lowMatches.push({
          productId: product.id,
          productName: product.name,
          upc: bestMatch.upc,
          upcName: bestMatch.name,
          score: bestMatch.score
        });
      }
    }
  }
  
  console.log(`Lower confidence matches (50-70%): ${lowMatches.length}`);
  
  let applied = 0;
  for (const match of lowMatches) {
    try {
      await db.execute(sql`UPDATE supplies SET sku = ${match.upc} WHERE id = ${match.productId}`);
      applied++;
    } catch (e: any) {
    }
  }
  console.log(`Applied ${applied} lower-confidence SKUs`);
  
  const existingMatches = JSON.parse(
    fs.readFileSync('.local/state/memory/permanent_upc_matches.json', 'utf-8')
  );
  
  const newMatches = lowMatches.map(m => ({
    productId: m.productId,
    productName: m.productName,
    upc: m.upc,
    upcName: m.upcName,
    score: m.score.toFixed(3),
    status: 'PERMANENT',
    confidence: 'LOW'
  }));
  
  const allMatches = [...existingMatches, ...newMatches];
  fs.writeFileSync('.local/state/memory/permanent_upc_matches.json',
    JSON.stringify(allMatches, null, 2));
  
  const finalProducts = await db.select().from(supplies);
  const withSku = finalProducts.filter(p => p.sku).length;
  const total = finalProducts.length;
  const coverage = ((withSku / total) * 100).toFixed(1);
  
  console.log(`\n=== UPDATED BASELINE ===`);
  console.log(`Products with SKU: ${withSku} / ${total}`);
  console.log(`Coverage: ${coverage}%`);
  console.log(`Total permanent matches: ${allMatches.length}`);
  
  console.log('\nSample lower-confidence matches:');
  lowMatches.slice(0, 15).forEach(m => {
    console.log(`  ${(m.score * 100).toFixed(0)}%: "${m.upcName.substring(0, 40)}" -> "${m.productName.substring(0, 40)}"`);
  });
}

main().catch(console.error);
