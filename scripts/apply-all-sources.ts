import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql, eq } from "drizzle-orm";
import * as fs from "fs";

async function main() {
  console.log("=== APPLYING ALL UPC SOURCES ===\n");
  
  // Get current state
  const initial = await db.select({
    total: sql<number>`count(*)`,
    withUpc: sql<number>`count(upc)`
  }).from(supplies);
  console.log(`Initial: ${initial[0].withUpc}/${initial[0].total} (${((initial[0].withUpc / initial[0].total) * 100).toFixed(1)}%)\n`);

  // 1. Apply smart_matches.json - these have direct supply IDs
  console.log("1. Applying smart_matches.json...");
  const smartMatches = JSON.parse(fs.readFileSync("./scripts/smart_matches.json", "utf-8"));
  
  // Filter to high-quality matches (score >= 0.75 for brand-matched items)
  const highQuality = smartMatches.filter((m: any) => m.score >= 0.75);
  console.log(`   High quality matches (>=75%): ${highQuality.length}`);
  
  let applied1 = 0;
  const usedUpcs = new Set<string>();
  const usedIds = new Set<number>();
  
  for (const match of highQuality) {
    if (usedUpcs.has(match.upc) || usedIds.has(match.supplyId)) continue;
    
    // Check if supply already has UPC
    const [existing] = await db.select({ upc: supplies.upc }).from(supplies).where(eq(supplies.id, match.supplyId));
    if (existing?.upc) continue;
    
    await db.update(supplies).set({ upc: match.upc }).where(eq(supplies.id, match.supplyId));
    usedUpcs.add(match.upc);
    usedIds.add(match.supplyId);
    applied1++;
  }
  console.log(`   Applied: ${applied1}\n`);

  // 2. Apply verified_food_matches.json
  console.log("2. Applying verified_food_matches.json...");
  const verifiedMatches = JSON.parse(fs.readFileSync("./scripts/verified_food_matches.json", "utf-8"));
  
  let applied2 = 0;
  for (const match of verifiedMatches) {
    if (usedUpcs.has(match.upc) || usedIds.has(match.supplyId)) continue;
    
    const [existing] = await db.select({ upc: supplies.upc }).from(supplies).where(eq(supplies.id, match.supplyId));
    if (existing?.upc) continue;
    
    await db.update(supplies).set({ upc: match.upc }).where(eq(supplies.id, match.supplyId));
    usedUpcs.add(match.upc);
    usedIds.add(match.supplyId);
    applied2++;
  }
  console.log(`   Applied: ${applied2}\n`);

  // 3. Load all UPC data and build comprehensive index
  console.log("3. Building comprehensive UPC catalog...");
  
  // Load all sources
  const catalog = JSON.parse(fs.readFileSync("./scripts/upc_catalog.json", "utf-8"));
  const combined = JSON.parse(fs.readFileSync("./scripts/all_combined_upcs.json", "utf-8"));
  
  // Build unified index: normalized name -> UPC
  const upcIndex = new Map<string, { upc: string; name: string; source: string }>();
  
  function normalize(text: string): string {
    return text.toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/(\d+)#/g, "$1lb");
  }
  
  // Add from catalog
  for (const entry of catalog.entries) {
    for (const name of entry.names) {
      const key = normalize(name);
      if (!upcIndex.has(key)) {
        upcIndex.set(key, { upc: entry.upc, name, source: "catalog" });
      }
    }
  }
  
  // Add from combined (maybe + google_sheet)
  for (const entry of combined) {
    const key = normalize(entry.name);
    if (!upcIndex.has(key)) {
      upcIndex.set(key, { upc: entry.upc, name: entry.name, source: entry.source });
    }
  }
  
  console.log(`   Total indexed entries: ${upcIndex.size}\n`);

  // 4. Match remaining supplies using exact normalized matching
  console.log("4. Matching remaining supplies (exact normalized)...");
  
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    upc: supplies.upc
  }).from(supplies);
  
  const withoutUpc = allSupplies.filter(s => !s.upc && !usedIds.has(s.id));
  console.log(`   Supplies without UPC: ${withoutUpc.length}`);
  
  let applied3 = 0;
  for (const supply of withoutUpc) {
    const key = normalize(supply.name);
    const match = upcIndex.get(key);
    
    if (match && !usedUpcs.has(match.upc)) {
      await db.update(supplies).set({ upc: match.upc }).where(eq(supplies.id, supply.id));
      usedUpcs.add(match.upc);
      usedIds.add(supply.id);
      applied3++;
    }
  }
  console.log(`   Applied: ${applied3}\n`);

  // Final stats
  const final = await db.select({
    total: sql<number>`count(*)`,
    withUpc: sql<number>`count(upc)`
  }).from(supplies);
  
  console.log("=== FINAL RESULTS ===");
  console.log(`Total supplies: ${final[0].total}`);
  console.log(`With UPC: ${final[0].withUpc}`);
  console.log(`Coverage: ${((final[0].withUpc / final[0].total) * 100).toFixed(1)}%`);
  console.log(`\nTotal applied this run: ${applied1 + applied2 + applied3}`);
  
  process.exit(0);
}

main().catch(console.error);
