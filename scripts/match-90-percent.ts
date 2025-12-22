import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { isNull, eq, sql } from "drizzle-orm";
import * as fs from "fs";

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(t => t.length > 1);
}

function jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  
  let intersection = 0;
  for (const t of set1) {
    if (set2.has(t)) intersection++;
  }
  
  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

async function main() {
  console.log("=== 90%+ ACCURACY UPC MATCHING ===\n");
  
  // First, clear all existing UPCs to start fresh with accurate matches only
  console.log("1. Clearing previous UPC matches...");
  await db.update(supplies).set({ upc: null });
  console.log("   Cleared all UPCs\n");
  
  // Load master index
  console.log("2. Loading master UPC index...");
  const masterData = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));
  console.log(`   Loaded ${masterData.entries.length} entries\n`);
  
  // Build normalized index
  type IndexEntry = { upc: string; name: string; tokens: string[]; isCoastal: boolean };
  const index: IndexEntry[] = masterData.entries.map((e: any) => ({
    upc: e.upc,
    name: e.name,
    tokens: tokenize(e.name),
    isCoastal: e.isCoastal
  }));
  
  // Get all supplies
  console.log("3. Fetching supplies...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies);
  console.log(`   Found ${allSupplies.length} supplies\n`);
  
  // Match with 90%+ threshold
  console.log("4. Matching with 90%+ Jaccard similarity...");
  const matches: Array<{ id: number; upc: string; name: string; catalogName: string; similarity: number }> = [];
  const usedUpcs = new Set<string>();
  
  for (const supply of allSupplies) {
    const supplyTokens = tokenize(supply.name);
    if (supplyTokens.length < 2) continue;
    
    const supplyBrand = (supply.brand || '').toLowerCase().replace(/[^a-z]/g, '');
    
    let bestMatch: { upc: string; name: string; similarity: number } | null = null;
    
    for (const entry of index) {
      // Skip already used UPCs (except for Coastal which can have variants)
      if (usedUpcs.has(entry.upc) && !entry.isCoastal) continue;
      
      // Calculate Jaccard similarity
      const similarity = jaccardSimilarity(supplyTokens, entry.tokens);
      
      // Must be 90%+ similarity
      if (similarity >= 0.90) {
        // Brand validation for extra safety
        const entryNameLower = entry.name.toLowerCase().replace(/[^a-z]/g, '');
        const brandMatch = !supplyBrand || 
          entryNameLower.slice(0, 10).includes(supplyBrand.slice(0, 6)) ||
          supplyBrand.includes(entryNameLower.slice(0, 6));
        
        if (brandMatch && (!bestMatch || similarity > bestMatch.similarity)) {
          bestMatch = { upc: entry.upc, name: entry.name, similarity };
        }
      }
    }
    
    if (bestMatch) {
      matches.push({ 
        id: supply.id, 
        upc: bestMatch.upc, 
        name: supply.name, 
        catalogName: bestMatch.name,
        similarity: bestMatch.similarity 
      });
      usedUpcs.add(bestMatch.upc);
    }
  }
  
  console.log(`   Found ${matches.length} matches with 90%+ similarity\n`);
  
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
  const finalStats = await db.select({
    total: sql`count(*)`,
    withUpc: sql`count(upc)`
  }).from(supplies);
  
  const total = Number(finalStats[0].total);
  const withUpc = Number(finalStats[0].withUpc);
  const coverage = ((withUpc / total) * 100).toFixed(1);
  
  console.log("=== FINAL RESULTS ===");
  console.log(`Total supplies: ${total}`);
  console.log(`With UPC (90%+ match): ${withUpc}`);
  console.log(`Coverage: ${coverage}%`);
  
  console.log("\nSample matches:");
  for (const m of matches.slice(0, 15)) {
    console.log(`  [${(m.similarity * 100).toFixed(0)}%] "${m.name}" -> "${m.catalogName}"`);
  }
  
  // Save match report
  fs.writeFileSync('scripts/upc_match_report.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    threshold: '90%',
    totalSupplies: total,
    matchedSupplies: withUpc,
    coverage: `${coverage}%`,
    sampleMatches: matches.slice(0, 100).map(m => ({
      supply: m.name,
      catalog: m.catalogName,
      similarity: `${(m.similarity * 100).toFixed(0)}%`,
      upc: m.upc
    }))
  }, null, 2));
  
  console.log("\nReport saved to scripts/upc_match_report.json");
  
  process.exit(0);
}

main().catch(console.error);
