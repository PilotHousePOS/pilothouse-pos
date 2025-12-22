import ExcelJS from 'exceljs';
import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { isNull, eq } from "drizzle-orm";
import * as fs from "fs";

const abbrevExpansions: Record<string, string[]> = {
  'sm': ['small', 'sm'],
  'md': ['medium', 'med', 'md'],
  'lg': ['large', 'lrg', 'lg'],
  'lrg': ['large', 'lg', 'lrg'],
  'xl': ['xlarge', 'extra large', 'xl'],
  'xs': ['xsmall', 'extra small', 'xs'],
  'oz': ['oz', 'ounce'],
  'lb': ['lb', 'lbs', 'pound', 'pounds'],
  'qt': ['qt', 'quart'],
  'gal': ['gal', 'gallon'],
  'pk': ['pk', 'pack'],
  'ct': ['ct', 'count'],
  'chkn': ['chicken', 'chkn', 'chick'],
  'chick': ['chicken', 'chkn', 'chick'],
  'bcn': ['bacon', 'bcn'],
  'org': ['original', 'org'],
  'blk': ['black', 'blk'],
  'wht': ['white', 'wht'],
  'gry': ['gray', 'grey', 'gry'],
  'blu': ['blue', 'blu'],
  'grn': ['green', 'grn'],
  'prpl': ['purple', 'prpl'],
  'purp': ['purple', 'prpl', 'purp'],
  'bne': ['bone', 'bne'],
  'cllr': ['collar', 'cllr'],
  'lsh': ['leash', 'lsh'],
  'hrns': ['harness', 'hrns'],
  'jely': ['jelly', 'jely', 'jly', 'jlly'],
  'jelly': ['jelly', 'jely', 'jly', 'jlly'],
  'jlly': ['jelly', 'jely', 'jly', 'jlly'],
  'turt': ['turtle', 'turt', 'trtl'],
  'trtl': ['turtle', 'turt', 'trtl'],
  'dapp': ['dapple', 'dapp'],
  'pupluv': ['puppy love', 'pupluv'],
  'zoomed': ['zoo med', 'zoomed', 'zoo-med'],
  'exoterra': ['exo terra', 'exoterra', 'exo-terra'],
  'bkd': ['baked', 'bkd'],
  'flvr': ['flavor', 'flvr'],
  'plnt': ['plant', 'plnt'],
  'vibt': ['vibrant', 'vibt', 'vib'],
  'vib': ['vibrant', 'vibt', 'vib'],
  'gar': ['garden', 'gar'],
  'gard': ['garden', 'gar', 'gard'],
  'aqua': ['aquatic', 'aqua'],
  'ptts': ['patties', 'ptts'],
  'patty': ['patties', 'patty', 'ptts'],
  'slmn': ['salmon', 'slmn', 'sal'],
  'sal': ['salmon', 'slmn', 'sal'],
  'bf': ['beef', 'bf'],
  'trk': ['turkey', 'trk', 'turk'],
  'turk': ['turkey', 'trk', 'turk'],
  'ckn': ['chicken', 'ckn', 'chkn'],
  'fsh': ['fish', 'fsh'],
  'cat': ['cat', 'feline', 'ct'],
  'dog': ['dog', 'canine', 'dg'],
  'pup': ['puppy', 'pup'],
  'kit': ['kitten', 'kit'],
  'trng': ['training', 'trng', 'train'],
  'train': ['training', 'trng', 'train'],
  'hd': ['hood', 'hd'],
  'flt': ['filter', 'flt', 'fltr'],
  'fltr': ['filter', 'flt', 'fltr'],
  'crtr': ['cart', 'cartridge', 'crtr', 'crt'],
  'cart': ['cartridge', 'cart', 'crtr', 'crt'],
  'pltfrm': ['platform', 'pltfrm', 'platf'],
  'platf': ['platform', 'pltfrm', 'platf'],
  'wzbone': ['wishbone', 'wzbone', 'wshbn'],
  'wshbn': ['wishbone', 'wzbone', 'wshbn'],
  'zaggler': ['zaggler', 'zaglr'],
  'tripe': ['tripe', 'trp'],
  'stick': ['stick', 'stk'],
  'stk': ['stick', 'stk'],
  'buc': ['buckle', 'buc', 'buck'],
  'buck': ['buckle', 'buc', 'buck'],
};

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStrict(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(t => t.length > 0);
}

function expandTokens(tokens: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const token of tokens) {
    expanded.add(token);
    const expansions = abbrevExpansions[token];
    if (expansions) {
      for (const exp of expansions) {
        expanded.add(exp.replace(/\s+/g, ''));
      }
    }
  }
  return expanded;
}

function tokenOverlap(tokens1: Set<string>, tokens2: Set<string>): number {
  let overlap = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) overlap++;
  }
  return overlap / Math.max(tokens1.size, tokens2.size);
}

async function main() {
  console.log("=== TARGETED UPC MATCHING WITH ABBREVIATION EXPANSION ===\n");

  // Build UPC index from all sources
  type IndexEntry = { upc: string; name: string; tokens: Set<string>; expandedTokens: Set<string> };
  const upcIndex: IndexEntry[] = [];
  
  // 1. Load Maybe inventory
  console.log("1. Loading Maybe inventory...");
  const maybeWb = new ExcelJS.Workbook();
  await maybeWb.xlsx.readFile('./attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const maybeSheet = maybeWb.worksheets[0];
  
  maybeSheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name && upc.length >= 8) {
      const tokens = new Set(tokenize(name));
      upcIndex.push({ upc, name, tokens, expandedTokens: expandTokens([...tokens]) });
    }
  });
  console.log(`   Loaded ${upcIndex.length} from Maybe\n`);

  // 2. Load catalog
  console.log("2. Loading catalog...");
  const catalog = JSON.parse(fs.readFileSync("./scripts/upc_catalog.json", "utf-8"));
  for (const entry of catalog.entries) {
    for (const name of entry.names) {
      const tokens = new Set(tokenize(name));
      upcIndex.push({ upc: entry.upc, name, tokens, expandedTokens: expandTokens([...tokens]) });
    }
  }
  console.log(`   Total index: ${upcIndex.length}\n`);

  // 3. Get unmatched supplies
  console.log("3. Fetching unmatched supplies...");
  const unmatched = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.upc));
  console.log(`   Found ${unmatched.length} without UPC\n`);

  // Track matches
  const matches: Array<{ id: number; name: string; upc: string; catalogName: string; score: number }> = [];
  const usedUpcs = new Set<string>();

  // Strategy: Expanded token matching with brand validation
  console.log("4. Matching with expanded tokens...");
  
  for (const supply of unmatched) {
    const supplyTokens = new Set(tokenize(supply.name));
    const supplyExpanded = expandTokens([...supplyTokens]);
    const supplyBrand = supply.brand?.toLowerCase().replace(/[^a-z]/g, '') || '';
    
    let bestMatch: { upc: string; name: string; score: number } | null = null;
    
    for (const entry of upcIndex) {
      if (usedUpcs.has(entry.upc)) continue;
      
      // Calculate overlap using expanded tokens
      const overlap = tokenOverlap(supplyExpanded, entry.expandedTokens);
      
      if (overlap >= 0.6) {
        // Brand validation - check if brands match
        const entryBrand = entry.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 15);
        const brandMatch = !supplyBrand || entryBrand.includes(supplyBrand.slice(0, 8)) || 
                          supplyBrand.includes(entryBrand.slice(0, 8));
        
        if (brandMatch && (!bestMatch || overlap > bestMatch.score)) {
          bestMatch = { upc: entry.upc, name: entry.name, score: overlap };
        }
      }
    }
    
    if (bestMatch && bestMatch.score >= 0.65) {
      matches.push({ id: supply.id, name: supply.name, upc: bestMatch.upc, catalogName: bestMatch.name, score: bestMatch.score });
      usedUpcs.add(bestMatch.upc);
    }
  }
  
  console.log(`   Found ${matches.length} matches\n`);

  // Apply matches
  console.log("5. Applying matches to database...");
  let applied = 0;
  for (const match of matches) {
    await db.update(supplies)
      .set({ upc: match.upc })
      .where(eq(supplies.id, match.id));
    applied++;
  }
  console.log(`   Applied ${applied} matches\n`);

  // Final stats
  const allSupplies = await db.select({ id: supplies.id, upc: supplies.upc }).from(supplies);
  const withUpc = allSupplies.filter(s => s.upc).length;
  
  console.log("=== FINAL RESULTS ===");
  console.log(`Total supplies: ${allSupplies.length}`);
  console.log(`With UPC: ${withUpc}`);
  console.log(`Coverage: ${((withUpc / allSupplies.length) * 100).toFixed(1)}%`);
  
  console.log("\nSample matches:");
  for (const m of matches.slice(0, 20)) {
    console.log(`  [${(m.score * 100).toFixed(0)}%] "${m.name}" -> "${m.catalogName}"`);
  }

  process.exit(0);
}

main().catch(console.error);
