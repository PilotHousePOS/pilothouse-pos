import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql, eq } from "drizzle-orm";
import * as fs from "fs";

interface CatalogEntry {
  upc: string;
  names: string[];
  primaryName: string;
}

// Normalize for indexing
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Create tokens for matching
function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

// Build index from catalog
function buildIndex(entries: CatalogEntry[]): { 
  exactIndex: Map<string, CatalogEntry>;
  tokenIndex: Map<string, Set<CatalogEntry>>;
} {
  const exactIndex = new Map<string, CatalogEntry>();
  const tokenIndex = new Map<string, Set<CatalogEntry>>();
  
  for (const entry of entries) {
    for (const name of entry.names) {
      // Exact normalized index
      const normalized = normalize(name);
      if (!exactIndex.has(normalized)) {
        exactIndex.set(normalized, entry);
      }
      
      // Token index for fuzzy matching
      const tokens = tokenize(name);
      for (const token of tokens) {
        if (!tokenIndex.has(token)) {
          tokenIndex.set(token, new Set());
        }
        tokenIndex.get(token)!.add(entry);
      }
    }
  }
  
  return { exactIndex, tokenIndex };
}

// Apply abbreviation expansions
function expandAbbrevs(text: string): string {
  const abbrevs: Record<string, string> = {
    " sd ": " science diet ",
    " ss ": " super small ",
    " sm ": " small ",
    " lg ": " large ",
    " med ": " medium ",
    " gf ": " grain free ",
    " ckn ": " chicken ",
    " chk ": " chicken ",
    " slmn ": " salmon ",
    " adlt ": " adult ",
    " pup ": " puppy ",
    " kit ": " kitten ",
    " sr ": " senior ",
    " frm ": " fromm ",
    " nutri sou ": " nutrisource ",
    " nutrisou ": " nutrisource ",
    " bb ": " blue buffalo ",
    " prina ": " purina ",
    " rc ": " royal canin ",
    " wlns ": " wellness ",
    " prml ": " primal ",
  };
  
  let result = " " + text.toLowerCase() + " ";
  for (const [abbrev, full] of Object.entries(abbrevs)) {
    result = result.split(abbrev).join(full);
  }
  // Handle # = lb
  result = result.replace(/(\d+)#/g, "$1lb");
  return result.trim();
}

// Find match using index
function findMatch(
  supply: { id: number; name: string; brand: string | null },
  exactIndex: Map<string, CatalogEntry>,
  tokenIndex: Map<string, Set<CatalogEntry>>
): { upc: string; catalogName: string; score: number; matchType: string } | null {
  
  const supplyNorm = normalize(supply.name);
  const supplyExpanded = normalize(expandAbbrevs(supply.name));
  
  // 1. Try exact match
  if (exactIndex.has(supplyNorm)) {
    const entry = exactIndex.get(supplyNorm)!;
    return { upc: entry.upc, catalogName: entry.primaryName, score: 1.0, matchType: "exact" };
  }
  
  // 2. Try expanded exact match
  if (exactIndex.has(supplyExpanded)) {
    const entry = exactIndex.get(supplyExpanded)!;
    return { upc: entry.upc, catalogName: entry.primaryName, score: 0.98, matchType: "expanded" };
  }
  
  // 3. Token-based fuzzy match
  const supplyTokens = tokenize(expandAbbrevs(supply.name));
  if (supplyTokens.length === 0) return null;
  
  const candidateCounts = new Map<CatalogEntry, number>();
  for (const token of supplyTokens) {
    const candidates = tokenIndex.get(token);
    if (candidates) {
      for (const candidate of candidates) {
        candidateCounts.set(candidate, (candidateCounts.get(candidate) || 0) + 1);
      }
    }
  }
  
  // Find best candidate by Jaccard similarity
  let bestEntry: CatalogEntry | null = null;
  let bestScore = 0;
  let bestCatalogName = "";
  
  for (const [entry, matchCount] of candidateCounts) {
    for (const catalogName of entry.names) {
      const catalogTokens = tokenize(expandAbbrevs(catalogName));
      const union = new Set([...supplyTokens, ...catalogTokens]).size;
      const intersection = matchCount; // approximation
      const score = intersection / union;
      
      if (score > bestScore && score >= 0.7) {
        bestScore = score;
        bestEntry = entry;
        bestCatalogName = catalogName;
      }
    }
  }
  
  if (bestEntry && bestScore >= 0.85) {
    return { upc: bestEntry.upc, catalogName: bestCatalogName, score: bestScore, matchType: "fuzzy" };
  }
  
  return null;
}

async function main() {
  console.log("Loading UPC catalog...");
  const catalog = JSON.parse(fs.readFileSync("./scripts/upc_catalog.json", "utf-8"));
  console.log(`Loaded ${catalog.entries.length} catalog entries`);
  
  console.log("Building search index...");
  const { exactIndex, tokenIndex } = buildIndex(catalog.entries);
  console.log(`Index: ${exactIndex.size} exact, ${tokenIndex.size} tokens`);
  
  console.log("\nFetching supplies...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    upc: supplies.upc
  }).from(supplies);
  
  const withoutUpc = allSupplies.filter(s => !s.upc);
  console.log(`Total: ${allSupplies.length}, Without UPC: ${withoutUpc.length}`);
  
  console.log("\nMatching...");
  const matches: { supplyId: number; supplyName: string; upc: string; catalogName: string; score: number; matchType: string }[] = [];
  const usedUpcs = new Set<string>();
  
  // Sort by name length (shorter names are more specific)
  const sorted = [...withoutUpc].sort((a, b) => a.name.length - b.name.length);
  
  let processed = 0;
  for (const supply of sorted) {
    const match = findMatch(supply, exactIndex, tokenIndex);
    if (match && !usedUpcs.has(match.upc)) {
      matches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        ...match
      });
      usedUpcs.add(match.upc);
    }
    
    processed++;
    if (processed % 1000 === 0) {
      console.log(`  Processed ${processed}/${withoutUpc.length}, found ${matches.length} matches`);
    }
  }
  
  console.log(`\nTotal matches found: ${matches.length}`);
  
  // Categorize by confidence
  const highConf = matches.filter(m => m.score >= 0.95);
  const medConf = matches.filter(m => m.score >= 0.85 && m.score < 0.95);
  
  console.log(`High confidence (>=95%): ${highConf.length}`);
  console.log(`Medium confidence (85-95%): ${medConf.length}`);
  
  // Save results
  fs.writeFileSync("./scripts/upc_match_results.json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalSupplies: allSupplies.length,
    matchCount: matches.length,
    highConfidence: highConf.length,
    mediumConfidence: medConf.length,
    matches: matches
  }, null, 2));
  console.log("Results saved to scripts/upc_match_results.json");
  
  // Apply high confidence matches to database
  console.log("\nApplying high confidence matches...");
  let applied = 0;
  for (const match of highConf) {
    await db.update(supplies)
      .set({ upc: match.upc })
      .where(eq(supplies.id, match.supplyId));
    applied++;
    if (applied % 100 === 0) {
      console.log(`  Applied ${applied}/${highConf.length}`);
    }
  }
  console.log(`Applied ${applied} UPC codes`);
  
  // Final stats
  const final = await db.select({
    total: sql<number>`count(*)`,
    withUpc: sql<number>`count(upc)`
  }).from(supplies);
  
  console.log(`\n=== FINAL COVERAGE ===`);
  console.log(`With UPC: ${final[0].withUpc} / ${final[0].total}`);
  console.log(`Coverage: ${((final[0].withUpc / final[0].total) * 100).toFixed(1)}%`);
  
  process.exit(0);
}

main().catch(console.error);
