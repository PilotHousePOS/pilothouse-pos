import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, and, isNull, or, sql } from 'drizzle-orm';
import * as fs from 'fs';

// Complete abbreviation map for invoice -> expanded form
const INVOICE_ABBR: Record<string, string> = {
  // Common
  'fd': 'food', 'fod': 'food', 'trt': 'treat', 'trts': 'treats',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'xlarge',
  'reg': 'regular', 'mini': 'mini', 'jr': 'junior',
  'blk': 'black', 'bk': 'black', 'wh': 'white', 'wht': 'white',
  'rd': 'red', 'bl': 'blue', 'grn': 'green', 'yl': 'yellow',
  'pk': 'pack', 'ct': 'count', 'pc': 'piece',
  
  // Aquarium
  'aqe': 'aqueon', 'aq': 'aquarium', 'aquar': 'aquarium',
  'fltr': 'filter', 'flt': 'filter', 'crtrdg': 'cartridge',
  'htr': 'heater', 'htrs': 'heaters', 'thrm': 'thermometer',
  'pmp': 'pump', 'vlv': 'valve', 'air': 'air',
  'cchld': 'cichlid', 'btta': 'betta', 'gldfsh': 'goldfish', 'gld': 'goldfish',
  'trpcl': 'tropical', 'trop': 'tropical', 'marn': 'marine',
  'frsw': 'freshwater', 'fw': 'freshwater', 'sw': 'saltwater',
  'grvl': 'gravel', 'sbstrt': 'substrate', 'sub': 'substrate',
  'plnt': 'plant', 'plnts': 'plants', 'dcor': 'decor',
  'ornmt': 'ornament', 'ornmnt': 'ornament',
  'led': 'led', 'fxtr': 'fixture', 'strp': 'strip', 'strplght': 'striplight',
  'clnr': 'cleaner', 'vac': 'vacuum', 'scrpr': 'scraper',
  'cond': 'conditioner', 'strs': 'stress', 'strt': 'start',
  'tst': 'test', 'mstr': 'master', 'ntrt': 'nitrate', 'ntrit': 'nitrite',
  'ammo': 'ammonia', 'esntl': 'essential', 'accu': 'accu',
  'algae': 'algae', 'algea': 'algae', 'alg': 'algae',
  'ick': 'ick', 'sck': 'sick',
  'melafix': 'melafix', 'pimafix': 'pimafix', 'bettafix': 'bettafix',
  'zyme': 'zyme', 'lock': 'lock',
  'flk': 'flake', 'flks': 'flakes', 'pllt': 'pellet', 'pllts': 'pellets',
  'snk': 'sinking', 'sink': 'sinking', 'flt': 'floating',
  
  // Reptile
  'rptl': 'reptile', 'rept': 'reptile', 'rptls': 'reptiles',
  'terrm': 'terrarium', 'terr': 'terrarium', 'viv': 'vivarium',
  'uvb': 'uvb', 'uva': 'uva', 'bsking': 'basking', 'bask': 'basking',
  'bulb': 'bulb', 'blb': 'bulb', 'spt': 'spot', 'nght': 'night',
  'daylght': 'daylight', 'dayl': 'daylight',
  'htpd': 'heat pad', 'htmt': 'heat mat', 'htlmp': 'heat lamp',
  'splmt': 'supplement', 'cal': 'calcium', 'vit': 'vitamin',
  'bedng': 'bedding', 'liner': 'liner', 'moss': 'moss',
  'crkt': 'cricket', 'mlwrm': 'mealworm', 'worm': 'worm',
  'munchie': 'munchies', 'munch': 'munchies',
  'veg': 'vegetable', 'frt': 'fruit',
  'habba': 'habba', 'hut': 'hut', 'hide': 'hide', 'cave': 'cave',
  'lair': 'lair', 'rock': 'rock', 'rck': 'rock',
  
  // Dog/Cat
  'dg': 'dog', 'pup': 'puppy', 'ct': 'cat', 'ktn': 'kitten',
  'chw': 'chew', 'chws': 'chews', 'bne': 'bone', 'bns': 'bones',
  'lsh': 'leash', 'cllr': 'collar', 'hrns': 'harness',
  'brkwy': 'breakaway', 'brkw': 'breakaway',
  'shmp': 'shampoo', 'cndtnr': 'conditioner',
  'bwl': 'bowl', 'bwls': 'bowls', 'fdr': 'feeder',
  'toy': 'toy', 'tys': 'toys', 'ball': 'ball',
  'knnl': 'kennel', 'crt': 'crate', 'crte': 'crate',
  
  // Bird
  'brd': 'bird', 'prrt': 'parrot', 'prkt': 'parakeet', 'keet': 'parakeet',
  'tiel': 'cockatiel', 'ccktel': 'cockatiel',
  'fnch': 'finch', 'cnry': 'canary', 'lvbr': 'lovebird',
  'prch': 'perch', 'swng': 'swing', 'lddr': 'ladder', 'cage': 'cage',
  'seed': 'seed', 'millet': 'millet', 'spry': 'spray',
  'fdph': 'forti diet', 'blbry': 'blueberry', 'hny': 'honey',
  'saf': 'safflower',
  
  // Small animal
  'hmstr': 'hamster', 'grbl': 'gerbil', 'gnpg': 'guinea pig', 'gp': 'guinea pig',
  'gpig': 'guinea pig', 'rbbt': 'rabbit', 'rbt': 'rabbit',
  'frrt': 'ferret', 'hdghg': 'hedgehog',
  'hay': 'hay', 'tmthy': 'timothy', 'alflf': 'alfalfa', 'orc': 'orchard',
  
  // Brands
  'hik': 'hikari', 'kay': 'kaytee', 'api': 'api', 'tet': 'tetra',
  'zmd': 'zoo med', 'zla': 'zilla', 'exo': 'exo terra',
  'flvl': 'fluval', 'mrln': 'marineland',
  'nyla': 'nylabone', 'kng': 'kong', 'cstl': 'coastal',
  'van': 'van ness', 'wee': 'wee wee', 'eth': 'ethical',
};

function expandInvoice(text: string): string {
  let result = text.toLowerCase();
  
  // Replace abbreviations
  for (const [abbr, full] of Object.entries(INVOICE_ABBR)) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'g'), full);
  }
  
  return result.replace(/[^a-z0-9.\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeProduct(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNumbers(text: string): string[] {
  const matches = text.match(/\d+\.?\d*/g) || [];
  return matches;
}

function extractSizes(text: string): string[] {
  const sizes: string[] = [];
  const sizePatterns = [
    /(\d+\.?\d*)\s*oz/gi,
    /(\d+\.?\d*)\s*lb/gi,
    /(\d+\.?\d*)\s*gal/gi,
    /(\d+\.?\d*)\s*in/gi,
    /(\d+\.?\d*)\s*ml/gi,
    /(\d+\.?\d*)\s*pk/gi,
    /(\d+\.?\d*)\s*ct/gi,
  ];
  
  for (const pattern of sizePatterns) {
    const matches = text.matchAll(pattern);
    for (const m of matches) {
      sizes.push(m[0].toLowerCase().replace(/\s/g, ''));
    }
  }
  
  return sizes;
}

function getKeyWords(text: string): string[] {
  const expanded = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'of', 'to', 'in', 'with', 'size', 'color']);
  return expanded.split(' ').filter(w => w.length > 2 && !stopWords.has(w));
}

function calculateMatch(invoiceName: string, productName: string, brand: string): number {
  const invExpanded = expandInvoice(invoiceName);
  const prodNorm = normalizeProduct(productName);
  const brandNorm = brand.toLowerCase();
  
  // Extract sizes - these must match if present
  const invSizes = extractSizes(invoiceName);
  const prodSizes = extractSizes(productName);
  
  // Size match check
  let sizeMatch = true;
  if (invSizes.length > 0 && prodSizes.length > 0) {
    sizeMatch = invSizes.some(is => prodSizes.some(ps => is === ps || is.includes(ps) || ps.includes(is)));
  }
  if (!sizeMatch) return 0;
  
  // Get key words
  const invWords = getKeyWords(invExpanded);
  const prodWords = getKeyWords(prodNorm);
  
  if (invWords.length < 2 || prodWords.length < 2) return 0;
  
  // Check for garbage invoice data
  const garbage = ['est ship', 'item number', 'date number', 'type qty'];
  if (garbage.some(g => invoiceName.toLowerCase().includes(g))) return 0;
  
  // Calculate word overlap
  let exactMatches = 0;
  let partialMatches = 0;
  const usedProd = new Set<number>();
  
  for (const invWord of invWords) {
    if (invWord.length < 2) continue;
    
    for (let j = 0; j < prodWords.length; j++) {
      if (usedProd.has(j)) continue;
      const prodWord = prodWords[j];
      
      // Exact match
      if (invWord === prodWord) {
        exactMatches++;
        usedProd.add(j);
        break;
      }
      // Substring match (min 4 chars)
      else if (invWord.length >= 4 && prodWord.length >= 4) {
        if (invWord.includes(prodWord) || prodWord.includes(invWord)) {
          partialMatches += 0.8;
          usedProd.add(j);
          break;
        }
      }
      // First 4 chars match
      else if (invWord.length >= 4 && prodWord.length >= 4 && invWord.substring(0, 4) === prodWord.substring(0, 4)) {
        partialMatches += 0.6;
        usedProd.add(j);
        break;
      }
    }
  }
  
  // Brand match bonus
  let brandBonus = 0;
  if (brandNorm.length > 2) {
    if (invExpanded.includes(brandNorm)) brandBonus = 0.15;
    else if (invoiceName.toLowerCase().includes(brandNorm.substring(0, 3))) brandBonus = 0.1;
  }
  
  const baseScore = (exactMatches + partialMatches) / Math.max(invWords.length, prodWords.length);
  return Math.min(baseScore + brandBonus, 1.0);
}

async function main() {
  console.log('=== SMART UPC MATCHING ===\n');
  
  // Load UPCs
  const upcs = new Map<string, string>();
  const files = ['/tmp/clean_upcs.json', '/tmp/phillips_upcs_v3.json', '/tmp/pennplax_upcs.json', '/tmp/upc_mapping.json'];
  
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf-8'));
      if (Array.isArray(d)) {
        for (const i of d) if (i.upc && i.productName?.length > 3) upcs.set(i.upc, i.productName);
      } else {
        for (const [u, n] of Object.entries(d)) if (typeof n === 'string' && n.length > 3) upcs.set(u, n);
      }
    } catch {}
  }
  console.log(`Loaded ${upcs.size} UPCs`);
  
  // Get products and used SKUs
  const products = await db.select().from(supplies).where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  const existing = await db.select({ sku: supplies.sku }).from(supplies).where(and(sql`sku IS NOT NULL`, sql`sku != ''`));
  const used = new Set(existing.map(s => s.sku).filter(Boolean));
  
  console.log(`Products without SKU: ${products.length}`);
  console.log(`Already used SKUs: ${used.size}`);
  
  // Available UPCs
  const available = Array.from(upcs.entries()).filter(([upc]) => !used.has(upc));
  console.log(`Available UPCs: ${available.length}\n`);
  
  // Match at 80%+ threshold
  const matches: Array<{id: number; name: string; brand: string; upc: string; inv: string; score: number}> = [];
  const matched = new Set<string>();
  
  console.log('Matching products...');
  let checked = 0;
  
  for (const p of products) {
    checked++;
    if (checked % 500 === 0) console.log(`  Checked ${checked}/${products.length}`);
    
    let best: {upc: string; name: string; score: number} | null = null;
    
    for (const [upc, invName] of available) {
      if (matched.has(upc)) continue;
      
      const score = calculateMatch(invName, p.name, p.brand || '');
      
      if (score >= 0.80 && (!best || score > best.score)) {
        best = { upc, name: invName, score };
      }
    }
    
    if (best) {
      matches.push({
        id: p.id,
        name: p.name,
        brand: p.brand || '',
        upc: best.upc,
        inv: best.name,
        score: best.score
      });
      matched.add(best.upc);
    }
  }
  
  console.log(`\nFound ${matches.length} matches at 80%+ accuracy\n`);
  
  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score);
    
    console.log('Top 25 matches:');
    for (const m of matches.slice(0, 25)) {
      console.log(`  [${(m.score * 100).toFixed(0)}%] "${m.name}" -> "${m.inv}"`);
    }
    
    console.log(`\nApplying ${matches.length} high-accuracy matches...`);
    for (const m of matches) {
      await db.update(supplies).set({ sku: m.upc }).where(eq(supplies.id, m.id));
    }
  }
  
  // Save matches for review
  fs.writeFileSync('/tmp/applied_matches.json', JSON.stringify(matches, null, 2));
  
  const stats = await db.select({
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(case when sku is not null and sku != '' then 1 end)`
  }).from(supplies);
  
  console.log(`\n=== COVERAGE: ${stats[0].withSku}/${stats[0].total} (${(stats[0].withSku/stats[0].total*100).toFixed(2)}%) ===`);
}

main().catch(console.error);
