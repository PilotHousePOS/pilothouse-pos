import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcRecord { upc: string; name: string; source?: string; }

const BRAND_MAP: Record<string, string> = {
  'sd': 'Science Diet', 'hill': 'Science Diet', 'hills': 'Science Diet',
  'nb': 'Natural Balance', 'nat bal': 'Natural Balance', 'natural bal': 'Natural Balance',
  'tow': 'Taste of the Wild', 'taste': 'Taste of the Wild',
  'diam': 'Diamond', 'diamond': 'Diamond',
  'royal': 'Royal Canin', 'rc': 'Royal Canin', 'royal can': 'Royal Canin',
  'barn': 'Petmate', 'vari': 'Petmate', 'voyager': 'Catit',
  'catit': 'Catit', 'cat it': 'Catit',
  'skudo': 'Marchioro',
  'spree': 'Petmate',
  'sportmix': 'Sportmix', 'sport mix': 'Sportmix',
  'blue': 'Blue Buffalo', 'bb': 'Blue Buffalo', 'blue buff': 'Blue Buffalo',
  'pro plan': 'Purina Pro Plan', 'pp': 'Purina Pro Plan', 'proplan': 'Purina Pro Plan',
  'victor': 'Victor', 'vict': 'Victor',
  'fromm': 'Fromm', 'frm': 'Fromm',
  'acana': 'Acana',
  'orijen': 'Orijen', 'orij': 'Orijen',
  'nutrisource': 'NutriSource', 'nut': 'NutriSource', 'nutri': 'NutriSource',
  'nulo': 'Nulo',
  'wellness': 'Wellness', 'well': 'Wellness',
  'merrick': 'Merrick', 'merr': 'Merrick',
  'canidae': 'Canidae', 'cand': 'Canidae',
  'instinct': 'Instinct', 'inst': 'Instinct',
  'earthborn': 'Earthborn', 'earth': 'Earthborn',
  'zignature': 'Zignature', 'zig': 'Zignature',
  'stella': 'Stella & Chewy', 'stell': "Stella & Chewy's",
  'primal': 'Primal', 'prim': 'Primal',
  'weruva': 'Weruva',
  'tiki': 'Tiki Cat', 'tiki cat': 'Tiki Cat',
  'fussie': 'Fussie Cat', 'fussie cat': 'Fussie Cat',
  'oxbow': 'Oxbow', 'oxb': 'Oxbow',
  'redbarn': 'Redbarn', 'red barn': 'Redbarn',
  'lupine': 'Lupine', 'lup': 'Lupine',
  'coastal': 'Coastal',
  'kong': 'Kong',
  'nylabone': 'Nylabone', 'nyla': 'Nylabone',
  'aqueon': 'Aqueon', 'aqe': 'Aqueon',
  'api': 'API',
  'hikari': 'Hikari', 'hik': 'Hikari',
  'seachem': 'Seachem',
  'kaytee': 'Kaytee', 'kay': 'Kaytee',
  'zupreem': 'ZuPreem', 'zup': 'ZuPreem',
  'tetra': 'Tetra', 'tet': 'Tetra',
  'fluval': 'Fluval', 'flu': 'Fluval',
  'marina': 'Marina', 'mar': 'Marina',
  'zoo med': 'Zoo Med', 'zoomed': 'Zoo Med', 'zoo': 'Zoo Med', 'zml': 'Zoo Med',
  'exo terra': 'Exo Terra', 'exo': 'Exo Terra',
  'zilla': 'Zilla', 'zil': 'Zilla',
  'fluker': "Fluker's", 'flk': "Fluker's",
  'penn': 'Penn-Plax', 'pennplax': 'Penn-Plax',
  'glofish': 'GloFish', 'glo': 'GloFish',
  'petmate': 'Petmate', 'pet': 'Petmate',
  'four paws': 'Four Paws', '4p': 'Four Paws',
  'spot': 'Spot', 'spt': 'Spot',
  'mammoth': 'Mammoth', 'mamm': 'Mammoth',
};

const ABBREV_MAP: Record<string, string> = {
  'ck': 'Chicken', 'chk': 'Chicken', 'chkn': 'Chicken',
  'bf': 'Beef', 'bf/bf': 'Beef',
  'lam': 'Lamb', 'lamb': 'Lamb',
  'slmn': 'Salmon', 'sal': 'Salmon', 'salm': 'Salmon',
  'trout': 'Trout',
  'duck': 'Duck',
  'tur': 'Turkey', 'turk': 'Turkey',
  'ven': 'Venison', 'venisin': 'Venison',
  'br': 'Breed', 'brd': 'Breed',
  'sm': 'Small', 'sml': 'Small',
  'md': 'Medium', 'med': 'Medium',
  'lg': 'Large', 'lrg': 'Large',
  'xl': 'Extra Large',
  'xs': 'Extra Small', 'xsm': 'Extra Small',
  'pup': 'Puppy', 'pupp': 'Puppy',
  'kit': 'Kitten', 'kitt': 'Kitten',
  'sr': 'Senior',
  'ad': 'Adult', 'adlt': 'Adult',
  'gr': 'Grain', 'grn': 'Grain',
  'fr': 'Free',
  'wt': 'Weight', 'wght': 'Weight',
  'sens': 'Sensitive', 'sensi': 'Sensitive',
  'perf': 'Perfect',
  'dig': 'Digest', 'digest': 'Digest',
  'min': 'Miniature',
  'anc': 'Ancient',
  'mount': 'Mountain',
  'prarie': 'Prairie', 'prairie': 'Prairie',
  'stream': 'Stream',
  'wetland': 'Wetlands', 'wetlands': 'Wetlands',
  'appal': 'Appalachian',
  'pacif': 'Pacific', 'pacific': 'Pacific',
  'sierra': 'Sierra',
  'mainten': 'Maintenance',
  'prem': 'Premium',
  'als': 'All Stages',
  'orig': 'Original',
  'plus': 'Plus',
  'home': 'House',
  'kennel': 'Kennel',
  'crate': 'Crate',
  'carrier': 'Carrier',
  'playpen': 'Playpen',
  'collapsible': 'Collapsible',
  'vitality': 'Vitality',
  'mobility': 'Mobility',
  'skin': 'Skin & Coat',
  'light': 'Light',
  'rice': 'Rice',
  'plant': 'Plant Based',
  'savories': 'Savory',
  'soft': 'Soft',
  'jerky': 'Jerky',
  'crunch': 'Crunchies',
};

function expandName(name: string): string {
  let expanded = name.toLowerCase();
  
  // Normalize weight (# -> lb)
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb');
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*\$/g, '$1');
  
  // Expand brand prefixes at start
  for (const [abbr, full] of Object.entries(BRAND_MAP)) {
    const regex = new RegExp(`^${abbr}\\b`, 'i');
    if (regex.test(expanded)) {
      expanded = expanded.replace(regex, full.toLowerCase());
      break;
    }
  }
  
  // Expand common abbreviations
  for (const [abbr, full] of Object.entries(ABBREV_MAP)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full.toLowerCase());
  }
  
  // Add "7+" -> "7+ Years" expansion
  expanded = expanded.replace(/\b7\+\b/g, 'mature adult 7+');
  expanded = expanded.replace(/\b11\+\b/g, 'senior 11+');
  expanded = expanded.replace(/\b6\+\b/g, 'adult 6+');
  
  return expanded.replace(/\s+/g, ' ').trim();
}

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(s: string): Set<string> {
  const normalized = normalize(s);
  const words = normalized.split(' ').filter(w => w.length >= 2);
  const noise = new Set(['the', 'and', 'for', 'with', 'oz', 'lb', 'ea', 'pk', 'ct', 'in']);
  return new Set(words.filter(w => !noise.has(w)));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

function extractWeight(s: string): string | null {
  const match = s.match(/(\d+(?:\.\d+)?)\s*(?:lb|#|oz)/i);
  return match ? match[1] : null;
}

function extractBrand(s: string): string | null {
  const normalized = s.toLowerCase();
  for (const [abbr, full] of Object.entries(BRAND_MAP)) {
    if (normalized.startsWith(abbr + ' ') || normalized.startsWith(abbr + '\t')) {
      return full.toLowerCase();
    }
  }
  return normalized.split(/\s+/)[0] || null;
}

function calculateScore(upcRecord: UpcRecord, product: { name: string; brand?: string | null }): number {
  const expandedUpc = expandName(upcRecord.name);
  const productName = product.name.toLowerCase();
  
  const upcWords = getWords(expandedUpc);
  const productWords = getWords(productName);
  
  let score = jaccardSimilarity(upcWords, productWords);
  
  // Brand match bonus
  const upcBrand = extractBrand(upcRecord.name);
  const productBrand = product.brand?.toLowerCase();
  if (upcBrand && productBrand && 
      (productBrand.includes(upcBrand) || upcBrand.includes(productBrand) ||
       BRAND_MAP[upcBrand]?.toLowerCase() === productBrand)) {
    score += 0.15;
  }
  
  // Weight match bonus  
  const upcWeight = extractWeight(upcRecord.name);
  const productWeight = extractWeight(product.name);
  if (upcWeight && productWeight && upcWeight === productWeight) {
    score += 0.15;
  }
  
  // Protein match bonus
  const proteins = ['chicken', 'beef', 'lamb', 'salmon', 'turkey', 'duck', 'venison', 'fish', 'trout'];
  for (const protein of proteins) {
    const inUpc = expandedUpc.includes(protein);
    const inProduct = productName.includes(protein);
    if (inUpc && inProduct) {
      score += 0.1;
      break;
    } else if ((inUpc && !inProduct) || (!inUpc && inProduct)) {
      score -= 0.05;
    }
  }
  
  // Size match bonus
  const sizes = ['small', 'medium', 'large', 'puppy', 'kitten', 'senior', 'adult'];
  for (const size of sizes) {
    const inUpc = expandedUpc.includes(size);
    const inProduct = productName.includes(size);
    if (inUpc && inProduct) {
      score += 0.05;
      break;
    }
  }
  
  return Math.min(score, 1.0);
}

async function loadGoogleSheetUpcs(): Promise<UpcRecord[]> {
  const records: UpcRecord[] = [];
  const csvPath = 'scripts/google_sheet_upcs.csv';
  
  if (!fs.existsSync(csvPath)) {
    console.log('Google Sheet CSV not found');
    return records;
  }
  
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  
  for (let i = 1; i < lines.length; i++) {  // Skip header
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV (handle quoted fields)
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());
    
    const [upc, name] = parts;
    if (upc && name && upc.length >= 8 && /^\d+$/.test(upc)) {
      records.push({ upc, name, source: 'google_sheet' });
    }
  }
  
  return records;
}

async function loadExistingUpcs(): Promise<UpcRecord[]> {
  const records: UpcRecord[] = [];
  
  // Load combined_upcs.json
  try {
    const combined = JSON.parse(fs.readFileSync('scripts/combined_upcs.json', 'utf-8'));
    for (const item of combined) {
      if (item.upc && item.name) {
        records.push({ upc: item.upc, name: item.name, source: 'combined' });
      }
    }
  } catch (e) {
    console.log('No combined_upcs.json found');
  }
  
  return records;
}

async function main() {
  console.log('=== Comprehensive UPC Matching ===\n');
  
  // Load all UPC sources
  const googleUpcs = await loadGoogleSheetUpcs();
  console.log(`Loaded ${googleUpcs.length} UPCs from Google Sheet`);
  
  const existingUpcs = await loadExistingUpcs();
  console.log(`Loaded ${existingUpcs.length} UPCs from existing sources`);
  
  // Combine and deduplicate by UPC
  const allUpcs = new Map<string, UpcRecord>();
  for (const record of [...googleUpcs, ...existingUpcs]) {
    if (!allUpcs.has(record.upc)) {
      allUpcs.set(record.upc, record);
    }
  }
  const upcRecords = Array.from(allUpcs.values());
  console.log(`Total unique UPCs: ${upcRecords.length}\n`);
  
  // Get products without SKU
  const products = await db.select().from(supplies).where(isNull(supplies.sku));
  console.log(`Products needing SKU: ${products.length}`);
  
  // Get all products for statistics
  const allProducts = await db.select().from(supplies);
  const alreadyHasSku = allProducts.filter(p => p.sku).length;
  console.log(`Products already with SKU: ${alreadyHasSku}\n`);
  
  const matches: Array<{ productId: number; productName: string; upc: string; upcName: string; score: number }> = [];
  const THRESHOLD = 0.50;
  
  for (const product of products) {
    let bestMatch: { upc: string; name: string; score: number } | null = null;
    
    for (const upcRecord of upcRecords) {
      const score = calculateScore(upcRecord, product);
      if (score >= THRESHOLD && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { upc: upcRecord.upc, name: upcRecord.name, score };
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
  
  console.log(`\nMatches found: ${matches.length}`);
  
  // Apply matches to database
  let applied = 0;
  for (const match of matches) {
    try {
      await db.execute(sql`UPDATE supplies SET sku = ${match.upc} WHERE id = ${match.productId}`);
      applied++;
    } catch (e: any) {
      console.log(`Failed to update ${match.productId}: ${e.message}`);
    }
  }
  
  console.log(`Applied ${applied} SKUs to database`);
  
  // Final statistics
  const finalProducts = await db.select().from(supplies);
  const withSku = finalProducts.filter(p => p.sku).length;
  const total = finalProducts.length;
  const coverage = ((withSku / total) * 100).toFixed(1);
  
  console.log(`\n=== Final Results ===`);
  console.log(`Products with SKU: ${withSku} / ${total}`);
  console.log(`Coverage: ${coverage}%`);
  
  // Save sample matches for review
  const sampleMatches = matches.slice(0, 50).map(m => ({
    product: m.productName,
    upc: m.upc,
    upcName: m.upcName,
    score: m.score.toFixed(3)
  }));
  fs.writeFileSync('scripts/match_samples.json', JSON.stringify(sampleMatches, null, 2));
  console.log('\nSample matches saved to scripts/match_samples.json');
}

main().catch(console.error);
