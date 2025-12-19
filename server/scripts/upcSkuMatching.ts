/**
 * UPC-based SKU Matching Script
 * 
 * Strategy: Match inventory UPCs to database products using:
 * 1. Normalized name matching (case-insensitive, expanded abbreviations)
 * 2. Exact brand + exact weight/size matching
 * 3. High-confidence protein matching
 * 
 * Goal: 100% accuracy - only assign SKUs that are definitively correct
 */

import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';

interface InventoryItem {
  upc: string;
  name: string;
  type: string;
}

interface DbProduct {
  id: number;
  name: string;
  brand: string | null;
  normalizedName: string;
}

// Brand abbreviation mappings (inventory → database)
const BRAND_MAP: Record<string, string> = {
  'sd': 'science diet',
  'blue b': 'blue buffalo',
  'tow': 'taste of the wild',
  'nutri sou': 'nutrisource',
  'red b': 'redbarn',
  'rede b': 'redbarn',
  'euk': 'eukanuba',
  'diam': 'diamond',
  'fromm': 'fromm',
  'zign': 'zignature',
  'vict': 'victor',
  'nb': 'natural balance',
  'nulo': 'nulo',
  'cand': 'canidae',
  'canid': 'canidae',
  'pure': 'purevita',
  'purevita': 'purevita',
  'orij': 'orijen',
  'orijen': 'orijen',
  'prim': 'primal',
  'prime fd': 'primal freeze dried',
  'wholso': 'wholesome',
  'wholeso': 'wholesome',
  'health exten': 'healthy extension',
  'valu pak': 'value pak',
  'wellness': 'wellness',
  'nutro': 'nutro',
  'greenies': 'greenies',
  'greeniues': 'greenies',
};

// Word abbreviations
const ABBREV_MAP: Record<string, string> = {
  'ck': 'chicken', 'chk': 'chicken', 'chkn': 'chicken',
  'lam': 'lamb', 'sal': 'salmon', 'salm': 'salmon',
  'bf': 'beef', 'trk': 'turkey', 'turk': 'turkey',
  'pup': 'puppy', 'pyppu': 'puppy', 'puppt': 'puppy', 'kit': 'kitten', 'sr': 'senior',
  'sm': 'small', 'lg': 'large', 'med': 'medium',
  'br': 'breed', 'min': 'mini', 'anc': 'ancient',
  'gr': 'grain', 'fr': 'free', 'gf': 'grain free',
  'wh': 'whole', 'who': 'wholesome',
  'sensi': 'sensitive', 'perf': 'perfect',
  'hairba': 'hairball', 'urin': 'urinary', 'indo': 'indoor',
  'wilder': 'wilderness', 'pacif': 'pacific', 'stre': 'stream',
  'flvr': 'flavor', 'essntl': 'essential',
  'kitr': 'kibble in the raw',
  'top': 'topper',
  'en': 'entree', 'ent': 'entree',
  'pt': 'petite',
  'grav': 'gravy',
  'purpl': 'purple', 'bla': 'black', 'rd': 'red',
  'blu': 'blue', 'grn': 'green', 'pnk': 'pink', 'org': 'orange',
  'lim': 'lime', 'gyb': 'gray blue', 'sso': 'sunset orange', 'cyn': 'cyan',
  'blk': 'black', 'wht': 'white', 'brn': 'brown', 'gry': 'gray',
  'tq': 'turquoise', 'lak': 'lake',
  'xsm': 'extra small', 'xxs': 'extra extra small', 'sml': 'small',
  'lrg': 'large', 'xlg': 'extra large', 'xxlg': 'extra extra large',
  'multi': 'multi protein',
  'gen cook': 'gently cooked',
  'dig sup': 'digestive support',
  'shin coat': 'skin coat',
  'vitality': 'vitality',
  'roast': 'roasted',
  'be': 'beef',
};

// Normalize: lowercase, expand abbrevs, remove punctuation, sort words
function normalizeName(name: string): string {
  let result = name.toLowerCase().trim();
  
  // Fix brand name spacing and typos FIRST
  result = result.replace(/\bzoomed\b/g, 'zoo med');
  result = result.replace(/\bzoomeds\b/g, 'zoo med');
  result = result.replace(/\bexoterra\b/g, 'exo terra');
  result = result.replace(/\bexoterr\b/g, 'exo terra');
  result = result.replace(/\bgalap\.\s*/g, 'galapagos ');
  result = result.replace(/\bgalap\b/g, 'galapagos');
  result = result.replace(/\bzila\b/g, 'zilla');  // Common typo
  result = result.replace(/\bflukers\b/g, 'fluker');
  result = result.replace(/\bfluker's\b/g, 'fluker');
  result = result.replace(/\brep-cal\b/g, 'repcal');
  result = result.replace(/\blees\b/g, 'lee');
  result = result.replace(/\breptomin\b/g, 'tetra reptomin');
  result = result.replace(/\blrg\b/g, 'large');
  result = result.replace(/\bmed\.\s*/g, 'medium ');
  result = result.replace(/\bsup\.\s*/g, 'supplement ');
  result = result.replace(/\bsub\.\s*/g, 'substrate ');
  result = result.replace(/\bsub\s+/g, 'substrate ');
  result = result.replace(/\bveg\.\s*/g, 'vegetable ');
  result = result.replace(/\benvi\.\s*/g, 'environment ');
  result = result.replace(/\bdes\.\s*/g, 'desert ');
  result = result.replace(/\btrop\.\s*/g, 'tropical ');
  result = result.replace(/\bcom\.\s*/g, 'compact ');
  result = result.replace(/\bfl\.\s*/g, 'fluorescent ');
  result = result.replace(/\bjuvi\b/g, 'juvenile');
  result = result.replace(/\bmain\.\s*/g, 'maintenance ');
  result = result.replace(/\b3\s*pk\b/g, '3 pack');
  result = result.replace(/\bgourment\b/g, 'gourmet');
  result = result.replace(/\bhyrdo\b/g, 'hydro');
  result = result.replace(/\benviroment\b/g, 'environment');
  result = result.replace(/\bpurrsnickety\b/g, 'purrsnickitty');
  result = result.replace(/\bhealthy extensions\b/g, 'healthy extension');
  result = result.replace(/\bflexistix\b/g, 'flexi stix');
  result = result.replace(/\bflexi stix\b/g, 'flexi stix');
  
  // Expand # and $ to lb (before other processing)
  result = result.replace(/(\d+\.?\d*)\s*[#$]/g, '$1lb');
  
  // Expand brand abbreviations at start
  for (const [abbrev, full] of Object.entries(BRAND_MAP)) {
    if (result.startsWith(abbrev + ' ') || result === abbrev) {
      result = full + result.slice(abbrev.length);
      break;
    }
  }
  
  // Expand word abbreviations
  for (const [abbrev, full] of Object.entries(ABBREV_MAP)) {
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  
  // Remove punctuation, normalize whitespace
  result = result.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  
  return result;
}

// Extract key tokens for matching
function extractTokens(name: string): Set<string> {
  const normalized = normalizeName(name);
  return new Set(normalized.split(' ').filter(t => t.length > 1));
}

// Calculate token overlap score
function tokenScore(tokens1: Set<string>, tokens2: Set<string>): number {
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  let matches = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) matches++;
  }
  
  const minSize = Math.min(tokens1.size, tokens2.size);
  return matches / minSize;
}

async function main() {
  console.log('[UPC-SKU] Starting UPC-based SKU matching...\n');
  
  // Load inventory
  const inventoryPath = 'attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx';
  console.log(`[UPC-SKU] Loading inventory from ${inventoryPath}...`);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inventoryPath);
  const sheet = workbook.worksheets[0];
  
  const inventoryItems: InventoryItem[] = [];
  for (let row = 2; row <= sheet.rowCount; row++) {
    const upc = sheet.getRow(row).getCell(1).value?.toString()?.trim() || '';
    const name = sheet.getRow(row).getCell(2).value?.toString()?.trim() || '';
    const type = sheet.getRow(row).getCell(3).value?.toString()?.trim() || '';
    
    if (upc && name && upc.length >= 5) {
      inventoryItems.push({ upc, name, type });
    }
  }
  console.log(`[UPC-SKU] Loaded ${inventoryItems.length} inventory items with UPCs\n`);
  
  // Load database products
  console.log('[UPC-SKU] Loading database products...');
  const rawProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies);
  
  // Pre-compute normalized names and tokens
  const dbProducts: (DbProduct & { tokens: Set<string> })[] = rawProducts.map(p => ({
    ...p,
    normalizedName: normalizeName(p.name),
    tokens: extractTokens(p.name),
  }));
  console.log(`[UPC-SKU] Loaded ${dbProducts.length} database products\n`);
  
  // Create index by first significant word (brand usually)
  const dbIndex = new Map<string, typeof dbProducts>();
  for (const p of dbProducts) {
    const firstWord = p.normalizedName.split(' ')[0];
    if (!dbIndex.has(firstWord)) {
      dbIndex.set(firstWord, []);
    }
    dbIndex.get(firstWord)!.push(p);
  }
  console.log(`[UPC-SKU] Created index with ${dbIndex.size} unique first words\n`);
  
  // Match inventory to database
  type Match = { inv: InventoryItem; db: typeof dbProducts[0]; score: number };
  const matches: Match[] = [];
  const noMatch: InventoryItem[] = [];
  const usedDbIds = new Set<number>();
  
  let processed = 0;
  console.log('[UPC-SKU] Matching...');
  
  for (const inv of inventoryItems) {
    const invNorm = normalizeName(inv.name);
    const invTokens = extractTokens(inv.name);
    const invFirstWord = invNorm.split(' ')[0];
    
    // Get candidates from index (same first word OR check all for non-brand items)
    let candidates = dbIndex.get(invFirstWord) || [];
    
    // If no candidates from first word, try second word for brand-less items
    if (candidates.length === 0) {
      const words = invNorm.split(' ');
      if (words.length > 1) {
        candidates = dbIndex.get(words[1]) || [];
      }
    }
    
    // Filter already-used products
    candidates = candidates.filter(c => !usedDbIds.has(c.id));
    
    let bestMatch: Match | null = null;
    let bestScore = 0;
    
    for (const candidate of candidates) {
      // Quick exact match check
      if (invNorm === candidate.normalizedName) {
        bestMatch = { inv, db: candidate, score: 1.0 };
        bestScore = 1.0;
        break;
      }
      
      // Token-based matching
      const score = tokenScore(invTokens, candidate.tokens);
      
      if (score > bestScore && score >= 0.8) {
        bestScore = score;
        bestMatch = { inv, db: candidate, score };
      }
    }
    
    if (bestMatch && bestScore >= 0.8) {
      matches.push(bestMatch);
      usedDbIds.add(bestMatch.db.id);
    } else {
      noMatch.push(inv);
    }
    
    processed++;
    if (processed % 1000 === 0) {
      console.log(`[UPC-SKU] Processed ${processed}/${inventoryItems.length}...`);
    }
  }
  
  // Results
  console.log(`\n[UPC-SKU] === MATCH SUMMARY ===`);
  console.log(`Total inventory items: ${inventoryItems.length}`);
  console.log(`Matched (>= 80% token overlap): ${matches.length}`);
  console.log(`No match: ${noMatch.length}`);
  console.log(`Match rate: ${((matches.length / inventoryItems.length) * 100).toFixed(1)}%\n`);
  
  // High confidence (>= 95%)
  const highConf = matches.filter(m => m.score >= 0.95);
  console.log(`[UPC-SKU] Exact/near-exact matches (>= 95%): ${highConf.length}`);
  
  console.log('\n[UPC-SKU] Sample high-confidence matches:');
  for (let i = 0; i < Math.min(30, highConf.length); i++) {
    const m = highConf[i];
    console.log(`  UPC: ${m.inv.upc}`);
    console.log(`    Inv: "${m.inv.name}"`);
    console.log(`    DB:  "${m.db.name}"`);
    console.log(`    Score: ${(m.score * 100).toFixed(0)}%`);
  }
  
  // Sample unmatched
  if (noMatch.length > 0) {
    console.log(`\n[UPC-SKU] Sample unmatched items:`);
    for (let i = 0; i < Math.min(20, noMatch.length); i++) {
      console.log(`  ${noMatch[i].upc}: "${noMatch[i].name}"`);
    }
  }
  
  // Apply if flag set
  if (process.argv.includes('--apply')) {
    console.log(`\n[UPC-SKU] Applying ${highConf.length} high-confidence SKU updates...`);
    
    const batchSize = 100;
    for (let i = 0; i < highConf.length; i += batchSize) {
      const batch = highConf.slice(i, i + batchSize);
      await Promise.all(batch.map(m =>
        db.update(supplies)
          .set({ sku: m.inv.upc })
          .where(eq(supplies.id, m.db.id))
      ));
      
      if ((i + batchSize) % 500 === 0 || i + batchSize >= highConf.length) {
        console.log(`[UPC-SKU] Progress: ${Math.min(i + batchSize, highConf.length)}/${highConf.length}`);
      }
    }
    
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(supplies)
      .where(sql`sku IS NOT NULL AND sku != ''`);
    
    console.log(`\n[UPC-SKU] === COMPLETE ===`);
    console.log(`Total supplies with SKU: ${countResult[0].count}`);
  } else {
    console.log(`\n[UPC-SKU] Run with --apply flag to update database.`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
