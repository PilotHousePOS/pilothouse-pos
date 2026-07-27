// @ts-nocheck
import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, sql, isNull, or } from 'drizzle-orm';
import ExcelJS from 'exceljs';

// Comprehensive abbreviation expansion
const ABBREVIATIONS: Record<string, string[]> = {
  // Brands
  'sd': ['science diet', 'hills science diet'],
  'bb': ['blue buffalo'],
  'pp': ['pro plan', 'purina pro plan'],
  'ns': ['nutrisource'],
  'totw': ['taste of the wild'],
  'rc': ['royal canin'],
  'diam': ['diamond'],
  'vict': ['victor'],
  'zign': ['zignature'],
  
  // Breed sizes
  'sm': ['small'],
  'sm br': ['small breed'],
  'lg': ['large'],
  'lg br': ['large breed'],
  'med': ['medium'],
  'xlg': ['extra large'],
  'xsm': ['extra small'],
  'xs': ['extra small'],
  
  // Proteins
  'ck': ['chicken'],
  'chk': ['chicken'],
  'lam': ['lamb'],
  'sal': ['salmon'],
  'bf': ['beef'],
  'trk': ['turkey'],
  'turk': ['turkey'],
  'whf': ['whitefish'],
  'dck': ['duck'],
  
  // Life stages
  'pup': ['puppy'],
  'kit': ['kitten'],
  'sr': ['senior'],
  'mat': ['mature'],
  'adt': ['adult'],
  
  // Special formulas
  'sensi': ['sensitive'],
  'sens': ['sensitive'],
  'hlthy': ['healthy'],
  'wt': ['weight'],
  'perf wt': ['perfect weight'],
  'hb': ['hairball'],
  'ind': ['indoor'],
  'act': ['active'],
  'lite': ['light'],
  
  // Units
  '#': ['lb', 'lbs', 'pound'],
  'oz': ['oz', 'ounce'],
  
  // Other common abbreviations
  'froz': ['frozen'],
  'fro': ['frozen'],
  'cnd': ['canned'],
  'can': ['canned'],
  'dry': ['dry'],
  'wet': ['wet'],
  'grn fr': ['grain free'],
  'gr fr': ['grain free'],
  'gf': ['grain free'],
  'stm': ['stomach'],
  'skn': ['skin'],
  'jnt': ['joint'],
  'hrt': ['heart'],
  'dgst': ['digestive'],
  'imm': ['immune'],
  'enr': ['enriched'],
  'vita': ['vitality'],
  'hlth': ['health', 'healthy'],
  'cui': ['cuisine'],
  'stw': ['stew'],
  'ent': ['entree'],
  'ptr': ['pate'],
  'slc': ['slices'],
  'chk': ['chunks'],
  'gvy': ['gravy'],
  'brth': ['broth'],
};

function expandAbbreviations(text: string): string {
  let expanded = text.toLowerCase();
  
  // Replace # with lb
  expanded = expanded.replace(/(\d+\.?\d*)\s*#/g, '$1lb');
  
  // Sort by length descending to match longer abbreviations first
  const sortedAbbrevs = Object.entries(ABBREVIATIONS).sort((a, b) => b[0].length - a[0].length);
  
  for (const [abbrev, expansions] of sortedAbbrevs) {
    const regex = new RegExp(`\\b${abbrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(expanded)) {
      expanded = expanded.replace(regex, expansions[0]);
    }
  }
  
  return expanded;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[™®©\-'"&,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeyTokens(text: string): Set<string> {
  const normalized = normalize(text);
  const tokens = normalized.split(' ').filter(t => t.length > 1);
  return new Set(tokens);
}

function calculateMatchScore(supplyTokens: Set<string>, invTokens: Set<string>): number {
  let matches = 0;
  for (const t of supplyTokens) {
    if (invTokens.has(t)) matches++;
  }
  
  const minSize = Math.min(supplyTokens.size, invTokens.size);
  if (minSize === 0) return 0;
  
  return matches / minSize;
}

function extractWeight(text: string): string | null {
  const match = text.toLowerCase().match(/(\d+\.?\d*)\s*(lb|oz|#)/);
  if (match) {
    return match[1] + (match[2] === 'oz' ? 'oz' : 'lb');
  }
  return null;
}

async function run() {
  console.log('=== Abbreviation-Based UPC Matching ===\n');
  
  // Load inventory Excel
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const sheet = workbook.worksheets[0];
  
  // Build inventory with expanded names
  interface InvItem {
    upc: string;
    original: string;
    expanded: string;
    tokens: Set<string>;
    weight: string | null;
  }
  
  const inventory: InvItem[] = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name && upc.length >= 10) {
      const expanded = expandAbbreviations(name);
      inventory.push({
        upc,
        original: name,
        expanded,
        tokens: extractKeyTokens(expanded),
        weight: extractWeight(expanded)
      });
    }
  });
  
  console.log(`Loaded ${inventory.length} items from Excel\n`);
  
  // Sample expanded names
  console.log('Sample expansions:');
  for (const item of inventory.slice(0, 10)) {
    if (item.original !== item.expanded) {
      console.log(`  "${item.original}" -> "${item.expanded}"`);
    }
  }
  
  // Get unmatched supplies
  const unmatched = await db.select({ id: supplies.id, name: supplies.name, brand: supplies.brand })
    .from(supplies)
    .where(or(isNull(supplies.sku), sql`sku = ''`));
  
  console.log(`\nFound ${unmatched.length} unmatched supplies\n`);
  
  // Get used UPCs
  const existing = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const usedUpcs = new Set(existing.map(s => s.sku!));
  
  let matchCount = 0;
  const matches: { supply: string; inv: string; expanded: string; score: number }[] = [];
  
  for (const supply of unmatched) {
    const supplyNorm = normalize(supply.name);
    const supplyTokens = extractKeyTokens(supplyNorm);
    const supplyWeight = extractWeight(supply.name);
    
    let bestMatch: { item: InvItem; score: number } | null = null;
    
    for (const item of inventory) {
      if (usedUpcs.has(item.upc)) continue;
      
      let score = calculateMatchScore(supplyTokens, item.tokens);
      
      // Weight matching bonus/penalty
      if (supplyWeight && item.weight) {
        if (supplyWeight === item.weight) {
          score += 0.15;
        } else {
          score -= 0.25; // Strong penalty for weight mismatch
        }
      }
      
      if (score >= 0.65 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { item, score };
      }
    }
    
    if (bestMatch) {
      await db.update(supplies)
        .set({ sku: bestMatch.item.upc })
        .where(eq(supplies.id, supply.id));
      usedUpcs.add(bestMatch.item.upc);
      matchCount++;
      matches.push({
        supply: supply.name,
        inv: bestMatch.item.original,
        expanded: bestMatch.item.expanded,
        score: bestMatch.score
      });
    }
  }
  
  console.log('=== Sample Matches ===');
  for (const m of matches.slice(0, 60)) {
    console.log(`(${m.score.toFixed(2)}): "${m.supply}" -> "${m.inv}" [expanded: "${m.expanded}"]`);
  }
  
  // Final stats
  const final = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const total = await db.select({ count: sql<number>`count(*)` })
    .from(supplies);
  
  const coverage = (Number(final[0].count) / Number(total[0].count) * 100).toFixed(1);
  
  console.log(`\n=== RESULTS ===`);
  console.log(`New matches: ${matchCount}`);
  console.log(`Total with SKU: ${final[0].count}/${total[0].count} (${coverage}%)`);
}

run().catch(console.error);
