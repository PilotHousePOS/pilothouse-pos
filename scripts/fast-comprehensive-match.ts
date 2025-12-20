import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcRecord { upc: string; name: string; }

const BRAND_MAP: Record<string, string> = {
  'sd': 'science diet', 'hills': 'science diet', 'hill': 'science diet',
  'nb': 'natural balance', 'natural bal': 'natural balance',
  'tow': 'taste of the wild', 'toe': 'taste of the wild',
  'diam': 'diamond', 'diamond': 'diamond',
  'royal': 'royal canin', 'rc': 'royal canin',
  'royal can': 'royal canin',
  'sportmix': 'sportmix', 'sport mix': 'sportmix',
  'barn': 'petmate', 'vari': 'petmate',
  'voyager': 'catit', 'catit': 'catit', 'catiit': 'catit',
  'skudo': 'marchioro',
  'spree': 'petmate',
  'blue': 'blue buffalo', 'bb': 'blue buffalo',
  'pro plan': 'pro plan', 'pp': 'pro plan', 'proplan': 'pro plan',
  'victor': 'victor', 'vict': 'victor',
  'fromm': 'fromm', 'frm': 'fromm',
  'acana': 'acana',
  'orijen': 'orijen', 'orij': 'orijen',
  'nutrisource': 'nutrisource', 'nut': 'nutrisource', 'nutri': 'nutrisource',
  'nulo': 'nulo',
  'wellness': 'wellness', 'well': 'wellness',
  'merrick': 'merrick', 'merr': 'merrick',
  'canidae': 'canidae', 'cand': 'canidae',
  'instinct': 'instinct', 'inst': 'instinct',
  'earthborn': 'earthborn', 'earth': 'earthborn',
  'zignature': 'zignature', 'zig': 'zignature',
  'stella': "stella chewy", 'stell': "stella chewy",
  'primal': 'primal', 'prim': 'primal',
  'weruva': 'weruva',
  'tiki': 'tiki cat', 'tiki cat': 'tiki cat',
  'fussie': 'fussie cat', 'fussie cat': 'fussie cat',
  'oxbow': 'oxbow', 'oxb': 'oxbow',
  'redbarn': 'redbarn', 'red barn': 'redbarn',
  'lupine': 'lupine', 'lup': 'lupine',
  'coastal': 'coastal',
  'kong': 'kong',
  'nylabone': 'nylabone', 'nyla': 'nylabone',
  'aqueon': 'aqueon', 'aqe': 'aqueon',
  'api': 'api',
  'hikari': 'hikari', 'hik': 'hikari',
  'seachem': 'seachem',
  'kaytee': 'kaytee', 'kay': 'kaytee',
  'zupreem': 'zupreem', 'zup': 'zupreem',
  'tetra': 'tetra', 'tet': 'tetra',
  'fluval': 'fluval', 'flu': 'fluval',
  'marina': 'marina', 'mar': 'marina',
  'zoo med': 'zoo med', 'zoomed': 'zoo med', 'zoo': 'zoo med', 'zml': 'zoo med',
  'exo terra': 'exo terra', 'exo': 'exo terra',
  'zilla': 'zilla', 'zil': 'zilla',
  'fluker': 'flukers', 'flk': 'flukers',
  'penn': 'penn plax', 'pennplax': 'penn plax',
  'glofish': 'glofish', 'glo': 'glofish',
  'petmate': 'petmate', 'pet': 'petmate',
  'four paws': 'four paws', '4p': 'four paws',
  'pop': 'petmate', 
  'collapsible': 'petmate',
};

const ABBREV_MAP: Record<string, string> = {
  'ck': 'chicken', 'chk': 'chicken', 'chkn': 'chicken',
  'bf': 'beef',
  'lam': 'lamb',
  'slmn': 'salmon', 'sal': 'salmon', 'salm': 'salmon',
  'duck': 'duck',
  'tur': 'turkey', 'turk': 'turkey',
  'ven': 'venison', 'venisin': 'venison',
  'br': 'breed', 'brd': 'breed',
  'sm': 'small', 'sml': 'small',
  'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large',
  'xl': 'extra large',
  'xs': 'extra small', 'xsm': 'extra small',
  'pup': 'puppy', 'pupp': 'puppy',
  'kit': 'kitten', 'kitt': 'kitten',
  'sr': 'senior',
  'ad': 'adult', 'adlt': 'adult',
  'gr': 'grain', 'grn': 'grain',
  'fr': 'free',
  'wt': 'weight', 'wght': 'weight',
  'sens': 'sensitive', 'sensi': 'sensitive',
  'perf': 'perfect',
  'dig': 'digest',
  'min': 'miniature',
  'anc': 'ancient',
  'mount': 'mountain',
  'prarie': 'prairie', 'prairie': 'prairie',
  'pacif': 'pacific', 'pacific': 'pacific',
  'sierra': 'sierra',
  'mainten': 'maintenance',
  'prem': 'premium',
  'als': 'all stages',
  'orig': 'original',
  'vitality': 'vitality',
  'mobility': 'mobility',
  'skin': 'skin coat',
  'light': 'light',
  'rice': 'rice',
};

function getBrandFromUpc(name: string): string {
  const lower = name.toLowerCase().trim();
  const words = lower.split(/\s+/);
  
  // Check first word or two against brand map
  for (let i = Math.min(3, words.length); i >= 1; i--) {
    const prefix = words.slice(0, i).join(' ');
    if (BRAND_MAP[prefix]) {
      return BRAND_MAP[prefix];
    }
  }
  
  return words[0] || 'unknown';
}

function getBrandFromProduct(product: { brand?: string | null; name: string }): string {
  if (product.brand) {
    const brand = product.brand.toLowerCase().replace(/['']/g, '').trim();
    // Normalize known brands
    for (const [abbr, full] of Object.entries(BRAND_MAP)) {
      if (brand.includes(full) || full.includes(brand)) {
        return full;
      }
    }
    return brand;
  }
  return 'unknown';
}

function expandName(name: string): string {
  let expanded = name.toLowerCase();
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb');
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*\$/g, '$1');
  
  for (const [abbr, full] of Object.entries(ABBREV_MAP)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  
  expanded = expanded.replace(/\b7\+\b/g, '7 years');
  expanded = expanded.replace(/\b11\+\b/g, '11 years');
  expanded = expanded.replace(/\b6\+\b/g, '6 years');
  
  return expanded.replace(/\s+/g, ' ').trim();
}

function getWords(s: string): Set<string> {
  const normalized = s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ').filter(w => w.length >= 2);
  const noise = new Set(['the', 'and', 'for', 'with', 'oz', 'lb', 'ea', 'pk', 'ct', 'in', 'dog', 'cat', 'food']);
  return new Set(words.filter(w => !noise.has(w)));
}

function calculateScore(upcName: string, productName: string): number {
  const upcExpanded = expandName(upcName);
  const productLower = productName.toLowerCase();
  
  const upcWords = getWords(upcExpanded);
  const productWords = getWords(productLower);
  
  if (upcWords.size === 0 || productWords.size === 0) return 0;
  
  let intersection = 0;
  for (const w of upcWords) if (productWords.has(w)) intersection++;
  const union = new Set([...upcWords, ...productWords]).size;
  let score = intersection / union;
  
  // Weight match
  const upcWeightMatch = upcName.match(/(\d+(?:\.\d+)?)\s*(?:lb|#|oz)/i);
  const prodWeightMatch = productName.match(/(\d+(?:\.\d+)?)\s*(?:lb|oz)/i);
  if (upcWeightMatch && prodWeightMatch && upcWeightMatch[1] === prodWeightMatch[1]) {
    score += 0.2;
  }
  
  // Key word bonuses
  const keywords = ['puppy', 'kitten', 'senior', 'adult', 'small', 'large', 'chicken', 'beef', 'lamb', 'salmon', 'turkey'];
  for (const kw of keywords) {
    if (upcExpanded.includes(kw) && productLower.includes(kw)) {
      score += 0.05;
    }
  }
  
  return Math.min(score, 1.0);
}

async function loadGoogleSheetUpcs(): Promise<UpcRecord[]> {
  const records: UpcRecord[] = [];
  const csvPath = 'scripts/google_sheet_upcs.csv';
  
  if (!fs.existsSync(csvPath)) return records;
  
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { parts.push(current.trim()); current = ''; }
      else current += char;
    }
    parts.push(current.trim());
    
    const [upc, name] = parts;
    if (upc && name && upc.length >= 8 && /^\d+$/.test(upc)) {
      records.push({ upc, name });
    }
  }
  
  return records;
}

async function main() {
  console.log('=== Fast Comprehensive UPC Matching ===\n');
  
  const upcRecords = await loadGoogleSheetUpcs();
  console.log(`Loaded ${upcRecords.length} UPCs from Google Sheet`);
  
  // Group UPCs by brand
  const upcsByBrand = new Map<string, UpcRecord[]>();
  for (const upc of upcRecords) {
    const brand = getBrandFromUpc(upc.name);
    if (!upcsByBrand.has(brand)) upcsByBrand.set(brand, []);
    upcsByBrand.get(brand)!.push(upc);
  }
  console.log(`UPCs grouped into ${upcsByBrand.size} brands`);
  
  // Get products without SKU
  const products = await db.select().from(supplies).where(isNull(supplies.sku));
  console.log(`Products needing SKU: ${products.length}`);
  
  const allProducts = await db.select().from(supplies);
  const alreadyHasSku = allProducts.filter(p => p.sku).length;
  console.log(`Products already with SKU: ${alreadyHasSku}\n`);
  
  // Group products by brand
  const productsByBrand = new Map<string, typeof products>();
  for (const product of products) {
    const brand = getBrandFromProduct(product);
    if (!productsByBrand.has(brand)) productsByBrand.set(brand, []);
    productsByBrand.get(brand)!.push(product);
  }
  console.log(`Products grouped into ${productsByBrand.size} brands`);
  
  const matches: Array<{ productId: number; productName: string; upc: string; upcName: string; score: number }> = [];
  const THRESHOLD = 0.45;
  let comparisons = 0;
  
  // Match within brands only
  for (const [brand, brandUpcs] of upcsByBrand) {
    const brandProducts = productsByBrand.get(brand) || [];
    if (brandProducts.length === 0) continue;
    
    for (const product of brandProducts) {
      let bestMatch: { upc: string; name: string; score: number } | null = null;
      
      for (const upc of brandUpcs) {
        comparisons++;
        const score = calculateScore(upc.name, product.name);
        if (score >= THRESHOLD && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { upc: upc.upc, name: upc.name, score };
        }
      }
      
      if (bestMatch) {
        matches.push({
          productId: product.id,
          productName: product.name,
          upc: bestMatch.upc,
          upcName: bestMatch.name,
          score: bestMatch.score
        });
      }
    }
  }
  
  console.log(`\nComparisons made: ${comparisons}`);
  console.log(`Matches found: ${matches.length}`);
  
  // Apply matches
  let applied = 0;
  for (const match of matches) {
    try {
      await db.execute(sql`UPDATE supplies SET sku = ${match.upc} WHERE id = ${match.productId}`);
      applied++;
    } catch (e: any) {
      console.log(`Failed: ${e.message}`);
    }
  }
  
  console.log(`Applied ${applied} SKUs`);
  
  // Final stats
  const finalProducts = await db.select().from(supplies);
  const withSku = finalProducts.filter(p => p.sku).length;
  const total = finalProducts.length;
  const coverage = ((withSku / total) * 100).toFixed(1);
  
  console.log(`\n=== Final Results ===`);
  console.log(`Products with SKU: ${withSku} / ${total}`);
  console.log(`Coverage: ${coverage}%`);
  
  // Save samples
  const samples = matches.slice(0, 30).map(m => ({
    product: m.productName.substring(0, 60),
    upcName: m.upcName,
    score: m.score.toFixed(2)
  }));
  console.log('\nSample matches:');
  samples.forEach(s => console.log(`  ${s.score}: "${s.upcName}" -> "${s.product}"`));
}

main().catch(console.error);
