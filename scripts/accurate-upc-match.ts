import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcRecord { upc: string; name: string; source?: string; }

// Invoice brand prefixes -> full brand names
const INVOICE_BRAND_MAP: Record<string, string> = {
  'AQE': 'Aqueon', 'API': 'API', 'HIK': 'Hikari', 'SLI': 'Seachem',
  'KAY': 'Kaytee', 'ZUP': 'ZuPreem', 'MAR': 'Marina', 'FLU': 'Fluval',
  'TET': 'Tetra', 'ZOO': 'Zoo Med', 'ZML': 'Zoo Med', 'EXO': 'Exo Terra',
  'ZIL': 'Zilla', 'REP': 'Rep-Cal', 'FLK': 'Fluker', 'OSS': 'OSS',
  'JWP': 'JW Pet', 'KNG': 'Kong', 'KONG': 'Kong', 'NUT': 'Nutrisource',
  'SD': 'Science Diet', 'BLUE': 'Blue Buffalo', 'BB': 'Blue Buffalo',
  'VICT': 'VICTOR', 'VIC': 'VICTOR', 'DIAM': 'Diamond', 'TOW': 'Taste of the Wild',
  'FROMM': 'Fromm', 'FRM': 'Fromm', 'ACANA': 'Acana', 'ORIJ': 'Orijen',
  'RC': 'Royal Canin', 'ROY': 'Royal Canin', 'PRO': 'Pro Plan', 'PP': 'Pro Plan',
  'NYLA': 'Nylabone', 'TROPI': 'TropiClean', 'COAST': 'Coastal',
  'COASTAL': 'Coastal', 'LUP': 'Lupine', 'RED': 'Redbarn', 'REDBARN': 'Redbarn',
  'OXB': 'Oxbow', 'OXBOW': 'Oxbow', 'ZIG': 'Zignature', 'CAND': 'Canidae',
  'WELL': 'Wellness', 'MERR': 'Merrick', 'STELL': 'Stella & Chewy',
  'PRIM': 'Primal', 'NUL': 'Nulo', 'INST': 'Instinct', 'EARTH': 'Earthborn',
  'FUSSIE': 'Fussie Cat', 'TIKI': 'Tiki Cat', 'WERUVA': 'Weruva',
  'PEN': 'Penn-Plax', 'PENN': 'Penn-Plax', 'GLO': 'GloFish', 'GLOFISH': 'GloFish',
  'MAG': 'Mag-Float', 'CASC': 'Cascade', 'CASCADE': 'Cascade',
  'PREV': 'Prevue', 'PREVUE': 'Prevue', 'VAN': 'Van Ness',
  'SPOT': 'Spot', 'SPT': 'Spot', 'MAMM': 'Mammoth', 'CIRC': 'Circle T',
  'FOUR': 'Four Paws', '4P': 'Four Paws', 'WEEWEE': 'WeeWee',
  'PET': 'Petmate', 'PETCREST': 'PetCrest', 'MAGIC': 'MagicCoat',
  'NAT': 'Natural Balance', 'NB': 'Natural Balance',
  'TUES': 'Tuesdays', 'TUESDAY': 'Tuesdays', 'HAPPY': 'HappyBeaks',
  'VIT': 'Vital Essentials', 'VITAL': 'Vital Essentials',
};

// Common abbreviations found in invoices
const ABBREV_MAP: Record<string, string> = {
  'COND': 'Conditioner', 'SHMP': 'Shampoo', 'FOOD': 'Food', 'TRT': 'Treat',
  'BULB': 'Bulb', 'FXTR': 'Fixture', 'CLNR': 'Cleaner', 'GRVL': 'Gravel',
  'VAC': 'Vacuum', 'ORNMT': 'Ornament', 'SBSTRT': 'Substrate',
  'FILT': 'Filter', 'CRT': 'Cartridge', 'PLLT': 'Pellet', 'FLK': 'Flake',
  'FRZ': 'Frozen', 'FROZ': 'Frozen', 'HTR': 'Heater', 'THERM': 'Thermometer',
  'PUMP': 'Pump', 'AIRPUMP': 'Air Pump', 'AIRSNE': 'Airstone',
  'TNK': 'Tank', 'AQM': 'Aquarium', 'TRTL': 'Turtle', 'TIEL': 'Cockatiel',
  'PRRT': 'Parrot', 'KEET': 'Parakeet', 'CNRY': 'Canary', 'FNCH': 'Finch',
  'CCHLD': 'Cichlid', 'GLD': 'Gold', 'BETTA': 'Betta', 'TRPCL': 'Tropical',
  'SINK': 'Sinking', 'FLOAT': 'Floating', 'PLNT': 'Plant', 'DECO': 'Decoration',
  'SM': 'Small', 'MD': 'Medium', 'MED': 'Medium', 'LG': 'Large', 'LRG': 'Large',
  'XL': 'Extra Large', 'XS': 'Extra Small', 'JR': 'Junior', 'SR': 'Senior',
  'PUP': 'Puppy', 'PUPP': 'Puppy', 'KIT': 'Kitten', 'KITT': 'Kitten',
  'ADLT': 'Adult', 'AD': 'Adult', 'JUV': 'Juvenile',
  'CHK': 'Chicken', 'CHKN': 'Chicken', 'CK': 'Chicken',
  'BF': 'Beef', 'BEEF': 'Beef', 'LAM': 'Lamb', 'LAMB': 'Lamb',
  'SLMN': 'Salmon', 'SAL': 'Salmon', 'TROUT': 'Trout', 'DUCK': 'Duck',
  'TUR': 'Turkey', 'TURK': 'Turkey', 'VEN': 'Venison',
  'WGHT': 'Weight', 'WT': 'Weight', 'HLTHY': 'Healthy', 'HLTH': 'Health',
  'SENS': 'Sensitive', 'PERF': 'Perfect', 'DIG': 'Digest',
  'GR': 'Grain', 'GRN': 'Grain', 'GRNFR': 'Grain Free', 'GF': 'Grain Free',
  'CLLR': 'Collar', 'COL': 'Collar', 'LSH': 'Leash', 'HRNS': 'Harness',
  'HARN': 'Harness', 'HRNESS': 'Harness',
  'BLK': 'Black', 'BLU': 'Blue', 'RED': 'Red', 'GRY': 'Gray', 'WHT': 'White',
  'PNK': 'Pink', 'PUR': 'Purple', 'GRN': 'Green', 'ORG': 'Orange', 'YLW': 'Yellow',
  'BR': 'Breed', 'BRD': 'Breed', 'SHRD': 'Shredded',
  'PK': 'Pack', 'CT': 'Count', 'OZ': 'oz', 'LB': 'lb',
  'W/': 'with', 'W': 'with', '&': 'and',
};

function expandInvoiceName(name: string): string {
  let expanded = name.toUpperCase();
  
  // Extract and expand brand prefix
  const brandMatch = expanded.match(/^([A-Z]{2,6})\s+/);
  if (brandMatch) {
    const prefix = brandMatch[1];
    if (INVOICE_BRAND_MAP[prefix]) {
      expanded = INVOICE_BRAND_MAP[prefix] + ' ' + expanded.slice(brandMatch[0].length);
    }
  }
  
  // Expand abbreviations
  for (const [abbr, full] of Object.entries(ABBREV_MAP)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  
  // Normalize weight format
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb');
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*Z\b/g, '$1oz');
  
  return expanded.replace(/\s+/g, ' ').trim();
}

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(s: string): Set<string> {
  const words = normalize(s).split(' ').filter(w => w.length >= 2);
  // Filter out common noise words
  const noise = new Set(['the', 'and', 'for', 'with', 'oz', 'lb', 'ea', 'pk']);
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
  const match = s.match(/(\d+(?:\.\d+)?)\s*(?:lb|oz|#)/i);
  return match ? match[1] : null;
}

function extractBrand(s: string): string | null {
  const words = s.split(/\s+/);
  if (words.length > 0) {
    return words[0].toLowerCase();
  }
  return null;
}

async function run() {
  // Load and expand UPC data
  const excelUpcs: UpcRecord[] = JSON.parse(fs.readFileSync('excel_upcs.json', 'utf8'));
  const invoiceUpcs: UpcRecord[] = JSON.parse(fs.readFileSync('invoice_upcs.json', 'utf8'));
  
  console.log(`Excel UPCs: ${excelUpcs.length}, Invoice UPCs: ${invoiceUpcs.length}`);
  
  // Expand invoice names
  const expandedInvoiceUpcs = invoiceUpcs.map(u => ({
    upc: u.upc,
    name: expandInvoiceName(u.name),
    originalName: u.name
  }));
  
  // Combine - prefer Excel names (cleaner), add expanded invoice names
  const upcMap = new Map<string, { upc: string; name: string; expanded?: string }>();
  for (const u of excelUpcs) {
    upcMap.set(u.upc, { upc: u.upc, name: u.name });
  }
  for (const u of expandedInvoiceUpcs) {
    if (!upcMap.has(u.upc)) {
      upcMap.set(u.upc, { upc: u.upc, name: u.name, expanded: u.name });
    }
  }
  
  const allUpcs = [...upcMap.values()];
  console.log(`Combined unique UPCs: ${allUpcs.length}`);
  
  // Build word index
  const wordIndex = new Map<string, typeof allUpcs>();
  for (const u of allUpcs) {
    const words = getWords(u.name);
    for (const w of words) {
      if (!wordIndex.has(w)) wordIndex.set(w, []);
      wordIndex.get(w)!.push(u);
    }
  }
  
  // Clear existing SKUs and match fresh
  await db.execute(sql`UPDATE supplies SET sku = NULL`);
  
  const products = await db.select().from(supplies);
  console.log(`Total products: ${products.length}`);
  
  const matches: { id: number; sku: string; score: number; pName: string; uName: string }[] = [];
  
  for (const product of products) {
    const pName = product.name;
    const pWords = getWords(pName);
    const pWeight = extractWeight(pName);
    const pBrand = extractBrand(pName);
    
    // Find candidates sharing words
    const candidates = new Map<string, typeof allUpcs[0]>();
    for (const w of pWords) {
      for (const u of (wordIndex.get(w) || [])) {
        candidates.set(u.upc, u);
      }
    }
    
    let bestMatch: { upc: typeof allUpcs[0]; score: number } | null = null;
    
    for (const upc of candidates.values()) {
      const uWords = getWords(upc.name);
      let score = jaccardSimilarity(pWords, uWords);
      
      // Bonus for matching weight
      const uWeight = extractWeight(upc.name);
      if (pWeight && uWeight && pWeight === uWeight) {
        score += 0.15;
      }
      
      // Bonus for matching brand (first word)
      const uBrand = extractBrand(upc.name);
      if (pBrand && uBrand && pBrand === uBrand) {
        score += 0.1;
      }
      
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { upc, score };
      }
    }
    
    // Require 55% similarity for accurate matches
    if (bestMatch && bestMatch.score >= 0.55) {
      matches.push({
        id: product.id,
        sku: bestMatch.upc.upc,
        score: bestMatch.score,
        pName: pName,
        uName: bestMatch.upc.name
      });
    }
  }
  
  console.log(`\nMatches with ≥55% similarity: ${matches.length}`);
  
  // Apply matches
  for (let i = 0; i < matches.length; i += 50) {
    await Promise.all(matches.slice(i, i + 50).map(m =>
      db.execute(sql`UPDATE supplies SET sku = ${m.sku} WHERE id = ${m.id}`)
    ));
    if ((i + 50) % 500 === 0) console.log(`Applied ${Math.min(i + 50, matches.length)}...`);
  }
  
  // Report
  const final = await db.select().from(supplies);
  const withSku = final.filter(p => p.sku).length;
  console.log(`\n=== FINAL COVERAGE ===`);
  console.log(`${withSku}/${final.length} = ${((withSku/final.length)*100).toFixed(1)}%`);
  
  // Accuracy sample
  console.log(`\n=== HIGH CONFIDENCE SAMPLES (>75%) ===`);
  const highConf = matches.filter(m => m.score >= 0.75).slice(0, 15);
  for (const m of highConf) {
    console.log(`✓ ${m.pName} → ${m.uName} (${(m.score*100).toFixed(0)}%)`);
  }
  
  console.log(`\n=== BORDERLINE SAMPLES (55-65%) ===`);
  const borderline = matches.filter(m => m.score >= 0.55 && m.score < 0.65).slice(0, 15);
  for (const m of borderline) {
    console.log(`? ${m.pName} → ${m.uName} (${(m.score*100).toFixed(0)}%)`);
  }
  
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
