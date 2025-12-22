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

function containsAllTokens(supplyTokens: string[], catalogTokens: string[]): boolean {
  const catalogSet = new Set(catalogTokens);
  let matched = 0;
  for (const t of supplyTokens) {
    if (catalogSet.has(t)) matched++;
  }
  return matched >= supplyTokens.length * 0.85;
}

function extractBrandFromName(name: string): string {
  const brands = ['zoomed', 'exoterra', 'zilla', 'fluker', 'kaytee', 'coastal', 'tetra', 
    'hikari', 'fluval', 'api', 'aqueon', 'marineland', 'fromm', 'proplan', 'bluebuffalo',
    'science diet', 'hills', 'royal canin', 'nutrisource', 'benebone', 'greenies', 
    'oxbow', 'tropican', 'tropiclean', 'adams', 'dogswell', 'naturesmiracle', 'petcrest'];
  
  const normalizedName = name.toLowerCase().replace(/[^a-z]/g, '');
  for (const brand of brands) {
    if (normalizedName.includes(brand.replace(/\s/g, ''))) return brand;
  }
  return '';
}

async function main() {
  console.log("=== IMPROVED UPC MATCHING ===\n");
  
  console.log("1. Loading master UPC index...");
  const masterData = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));
  console.log(`   Loaded ${masterData.entries.length} entries\n`);
  
  type IndexEntry = { upc: string; name: string; tokens: string[]; isCoastal: boolean; normalizedName: string; brand: string };
  const index: IndexEntry[] = masterData.entries.map((e: any) => ({
    upc: e.upc,
    name: e.name,
    tokens: tokenize(e.name),
    isCoastal: e.isCoastal,
    normalizedName: normalize(e.name),
    brand: extractBrandFromName(e.name)
  }));
  
  console.log("2. Fetching supplies...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    upc: supplies.upc
  }).from(supplies);
  console.log(`   Found ${allSupplies.length} supplies\n`);
  
  const suppliesWithUpc = allSupplies.filter(s => s.upc).length;
  console.log(`   Already have UPCs: ${suppliesWithUpc}\n`);
  
  const matches: Array<{ id: number; upc: string; name: string; catalogName: string; similarity: number; method: string }> = [];
  const usedUpcs = new Set<string>();
  
  console.log("3. Matching with multiple strategies...");
  
  for (const supply of allSupplies) {
    if (supply.upc) {
      usedUpcs.add(supply.upc);
      continue;
    }
    
    const supplyTokens = tokenize(supply.name);
    if (supplyTokens.length < 2) continue;
    
    const supplyNormalized = normalize(supply.name);
    const supplyBrand = extractBrandFromName(supply.name) || (supply.brand || '').toLowerCase().replace(/[^a-z]/g, '');
    
    let bestMatch: { upc: string; name: string; similarity: number; method: string } | null = null;
    
    for (const entry of index) {
      if (usedUpcs.has(entry.upc) && !entry.isCoastal) continue;
      
      const jaccard = jaccardSimilarity(supplyTokens, entry.tokens);
      
      if (jaccard >= 0.90) {
        if (!bestMatch || jaccard > bestMatch.similarity) {
          bestMatch = { upc: entry.upc, name: entry.name, similarity: jaccard, method: '90%_jaccard' };
        }
      }
      else if (jaccard >= 0.75 && supplyBrand && entry.brand && supplyBrand === entry.brand) {
        if (!bestMatch || jaccard > bestMatch.similarity) {
          bestMatch = { upc: entry.upc, name: entry.name, similarity: jaccard, method: '75%_brand_match' };
        }
      }
      else if (jaccard >= 0.70 && containsAllTokens(supplyTokens, entry.tokens)) {
        if (!bestMatch || jaccard > bestMatch.similarity) {
          bestMatch = { upc: entry.upc, name: entry.name, similarity: jaccard, method: '70%_all_tokens' };
        }
      }
    }
    
    if (bestMatch) {
      matches.push({ 
        id: supply.id, 
        upc: bestMatch.upc, 
        name: supply.name, 
        catalogName: bestMatch.name,
        similarity: bestMatch.similarity,
        method: bestMatch.method
      });
      usedUpcs.add(bestMatch.upc);
    }
  }
  
  console.log(`\n4. Found ${matches.length} new matches\n`);
  
  const byMethod: Record<string, number> = {};
  matches.forEach(m => {
    byMethod[m.method] = (byMethod[m.method] || 0) + 1;
  });
  console.log("   By method:");
  Object.entries(byMethod).forEach(([k, v]) => console.log(`     ${k}: ${v}`));
  
  console.log("\n5. Applying matches...");
  let applied = 0;
  for (const match of matches) {
    await db.update(supplies).set({ upc: match.upc }).where(eq(supplies.id, match.id));
    applied++;
    if (applied % 500 === 0) console.log(`   Applied ${applied}...`);
  }
  
  const finalCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(supplies).where(sql`${supplies.upc} IS NOT NULL`);
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Total supplies: ${allSupplies.length}`);
  console.log(`Supplies with UPC: ${finalCount[0].count}`);
  console.log(`Coverage: ${((finalCount[0].count / allSupplies.length) * 100).toFixed(1)}%`);
  
  fs.writeFileSync('scripts/improved_match_report.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalSupplies: allSupplies.length,
    previouslyMatched: suppliesWithUpc,
    newMatches: matches.length,
    byMethod,
    finalCoverage: ((finalCount[0].count / allSupplies.length) * 100).toFixed(1) + '%'
  }, null, 2));
  
  console.log("\nSaved report to scripts/improved_match_report.json");
  process.exit(0);
}

main().catch(console.error);
