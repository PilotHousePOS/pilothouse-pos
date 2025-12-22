import ExcelJS from 'exceljs';
import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql, eq } from "drizzle-orm";
import * as fs from "fs";

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(\d+)#/g, "$1lb");
}

async function main() {
  console.log("=== COMPREHENSIVE UPC EXTRACTION AND MATCHING ===\n");

  // Build master UPC index
  const upcIndex = new Map<string, { upc: string; name: string; source: string }>();
  
  // 1. Extract from Maybe inventory Excel
  console.log("1. Extracting from Maybe inventory Excel...");
  const maybeWb = new ExcelJS.Workbook();
  await maybeWb.xlsx.readFile('./attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const maybeSheet = maybeWb.worksheets[0];
  
  let maybeCount = 0;
  maybeSheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // Skip header
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name && upc.length >= 8) {
      const key = normalize(name);
      if (!upcIndex.has(key)) {
        upcIndex.set(key, { upc, name, source: 'maybe_excel' });
        maybeCount++;
      }
    }
  });
  console.log(`   Extracted ${maybeCount} unique entries\n`);

  // 2. Load existing catalog
  console.log("2. Loading existing UPC catalog...");
  const catalog = JSON.parse(fs.readFileSync("./scripts/upc_catalog.json", "utf-8"));
  let catalogCount = 0;
  for (const entry of catalog.entries) {
    for (const name of entry.names) {
      const key = normalize(name);
      if (!upcIndex.has(key)) {
        upcIndex.set(key, { upc: entry.upc, name, source: 'catalog' });
        catalogCount++;
      }
    }
  }
  console.log(`   Added ${catalogCount} from catalog\n`);

  // 3. Load combined UPCs
  console.log("3. Loading combined UPCs...");
  const combined = JSON.parse(fs.readFileSync("./scripts/all_combined_upcs.json", "utf-8"));
  let combinedCount = 0;
  for (const entry of combined) {
    const key = normalize(entry.name);
    if (!upcIndex.has(key)) {
      upcIndex.set(key, { upc: entry.upc, name: entry.name, source: entry.source });
      combinedCount++;
    }
  }
  console.log(`   Added ${combinedCount} from combined\n`);

  console.log(`   TOTAL UNIQUE INDEX ENTRIES: ${upcIndex.size}\n`);

  // 4. Get all supplies
  console.log("4. Fetching supplies from database...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    upc: supplies.upc
  }).from(supplies);
  
  const withoutUpc = allSupplies.filter(s => !s.upc);
  console.log(`   Total: ${allSupplies.length}, Without UPC: ${withoutUpc.length}\n`);

  // 5. Match with exact normalized names
  console.log("5. Matching (exact normalized)...");
  const usedUpcs = new Set<string>();
  const matches: Array<{id: number; name: string; upc: string; catalogName: string}> = [];
  
  for (const supply of withoutUpc) {
    const key = normalize(supply.name);
    const match = upcIndex.get(key);
    if (match && !usedUpcs.has(match.upc)) {
      matches.push({ id: supply.id, name: supply.name, upc: match.upc, catalogName: match.name });
      usedUpcs.add(match.upc);
    }
  }
  console.log(`   Exact matches: ${matches.length}\n`);

  // 6. Fuzzy matching for remaining
  console.log("6. Fuzzy matching remaining...");
  const unmatched = withoutUpc.filter(s => !matches.find(m => m.id === s.id));
  console.log(`   Unmatched supplies: ${unmatched.length}`);
  
  // Build token index for fuzzy matching
  const tokenIndex = new Map<string, Array<{ upc: string; name: string; tokens: Set<string> }>>();
  
  for (const [key, entry] of upcIndex) {
    const tokens = key.match(/[a-z]{3,}|\d+/g) || [];
    for (const token of tokens) {
      if (!tokenIndex.has(token)) tokenIndex.set(token, []);
      tokenIndex.get(token)!.push({ 
        upc: entry.upc, 
        name: entry.name, 
        tokens: new Set(tokens) 
      });
    }
  }
  
  let fuzzyMatches = 0;
  for (const supply of unmatched) {
    const supplyKey = normalize(supply.name);
    const supplyTokens = supplyKey.match(/[a-z]{3,}|\d+/g) || [];
    if (supplyTokens.length < 2) continue;
    
    // Get candidates
    const candidateCounts = new Map<string, { entry: any; count: number }>();
    for (const token of supplyTokens) {
      const candidates = tokenIndex.get(token) || [];
      for (const c of candidates) {
        if (usedUpcs.has(c.upc)) continue;
        const existing = candidateCounts.get(c.upc);
        if (existing) {
          existing.count++;
        } else {
          candidateCounts.set(c.upc, { entry: c, count: 1 });
        }
      }
    }
    
    // Find best match with >70% token overlap
    let best: { upc: string; name: string; score: number } | null = null;
    for (const [upc, { entry, count }] of candidateCounts) {
      const unionSize = new Set([...supplyTokens, ...entry.tokens]).size;
      const score = count / unionSize;
      if (score >= 0.7 && (!best || score > best.score)) {
        best = { upc, name: entry.name, score };
      }
    }
    
    if (best) {
      matches.push({ id: supply.id, name: supply.name, upc: best.upc, catalogName: best.name });
      usedUpcs.add(best.upc);
      fuzzyMatches++;
    }
  }
  console.log(`   Fuzzy matches: ${fuzzyMatches}\n`);

  // 7. Apply all matches
  console.log("7. Applying matches to database...");
  let applied = 0;
  for (const match of matches) {
    await db.update(supplies).set({ upc: match.upc }).where(eq(supplies.id, match.id));
    applied++;
    if (applied % 500 === 0) console.log(`   Applied ${applied}/${matches.length}`);
  }
  console.log(`   Applied ${applied} total\n`);

  // 8. Final stats
  const final = await db.select({
    total: sql<number>`count(*)`,
    withUpc: sql<number>`count(upc)`
  }).from(supplies);
  
  console.log("=== FINAL RESULTS ===");
  console.log(`Total supplies: ${final[0].total}`);
  console.log(`With UPC: ${final[0].withUpc}`);
  console.log(`Coverage: ${((final[0].withUpc / final[0].total) * 100).toFixed(1)}%`);
  
  // Sample matches
  console.log("\nSample new matches:");
  matches.slice(0, 10).forEach(m => console.log(`  ${m.name} -> ${m.catalogName}`));

  process.exit(0);
}

main().catch(console.error);
