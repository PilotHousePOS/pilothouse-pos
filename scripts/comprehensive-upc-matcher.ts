import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql, eq } from "drizzle-orm";
import * as fs from "fs";

interface CatalogEntry {
  upc: string;
  names: string[];
  primaryName: string;
  sources: Array<{ type: string; count: number }>;
}

interface UpcCatalog {
  totalUniqueUpcs: number;
  entries: CatalogEntry[];
}

interface MatchResult {
  supplyId: number;
  supplyName: string;
  catalogName: string;
  upc: string;
  score: number;
  matchType: string;
}

// Normalize text for matching
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Expand common abbreviations
function expandAbbreviations(text: string): string {
  const abbrevs: Record<string, string> = {
    "sd ": "science diet ",
    "ss ": "super small ",
    "sm ": "small ",
    "lg ": "large ",
    "med ": "medium ",
    "xlg ": "extra large ",
    "gf ": "grain free ",
    "cf ": "cage free ",
    "ckn ": "chicken ",
    "chk ": "chicken ",
    "bflo ": "buffalo ",
    "slmn ": "salmon ",
    "brn ": "brown ",
    "wht ": "white ",
    "adlt ": "adult ",
    "pup ": "puppy ",
    "kit ": "kitten ",
    "sr ": "senior ",
    "hlthy ": "healthy ",
    "wgt ": "weight ",
    "mgmt ": "management ",
    "frm ": "fromm ",
    "nutri sou ": "nutrisource ",
    "nutrisou ": "nutrisource ",
    "blbuf ": "blue buffalo ",
    "bb ": "blue buffalo ",
    "prina ": "purina ",
    "roy can ": "royal canin ",
    "rc ": "royal canin ",
    "wlns ": "wellness ",
    "ntrsc ": "nutrisource ",
    "orjn ": "orijen ",
    "acan ": "acana ",
    "cndy ": "canidae ",
    "evo ": "evo ",
    "prml ": "primal ",
    "instct ": "instinct ",
    "zgntr ": "zignature ",
    "4hlth ": "4health ",
    "# ": "lb ",
    "oz ": "oz ",
    "lb ": "lb ",
  };
  
  let result = " " + text.toLowerCase() + " ";
  for (const [abbrev, full] of Object.entries(abbrevs)) {
    result = result.split(abbrev).join(full);
  }
  return result.trim();
}

// Calculate similarity score between two strings
function similarity(a: string, b: string): number {
  const tokensA = new Set(normalize(a).split(" ").filter(t => t.length > 1));
  const tokensB = new Set(normalize(b).split(" ").filter(t => t.length > 1));
  
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  
  return intersection.size / union.size;
}

// Find best match for a supply in the catalog
function findBestMatch(supply: { id: number; name: string; brand: string | null }, catalog: CatalogEntry[]): MatchResult | null {
  const supplyNorm = normalize(supply.name);
  const supplyExpanded = expandAbbreviations(supply.name);
  
  let bestMatch: MatchResult | null = null;
  let bestScore = 0;
  
  for (const entry of catalog) {
    for (const catalogName of entry.names) {
      const catalogNorm = normalize(catalogName);
      const catalogExpanded = expandAbbreviations(catalogName);
      
      // Try different matching strategies
      let score = 0;
      let matchType = "";
      
      // 1. Exact match after normalization
      if (supplyNorm === catalogNorm) {
        score = 1.0;
        matchType = "exact";
      }
      // 2. Expanded abbreviation match
      else if (normalize(supplyExpanded) === normalize(catalogExpanded)) {
        score = 0.98;
        matchType = "expanded-exact";
      }
      // 3. High token similarity
      else {
        const sim = similarity(supplyExpanded, catalogExpanded);
        if (sim >= 0.85) {
          score = sim * 0.95;
          matchType = `similarity-${sim.toFixed(2)}`;
        }
      }
      
      // Brand boost: if brand matches, increase score
      if (supply.brand && score > 0) {
        const brandNorm = normalize(supply.brand);
        if (catalogNorm.includes(brandNorm) || supplyNorm.includes(brandNorm)) {
          score = Math.min(1, score + 0.02);
        }
      }
      
      if (score > bestScore && score >= 0.80) {
        bestScore = score;
        bestMatch = {
          supplyId: supply.id,
          supplyName: supply.name,
          catalogName: catalogName,
          upc: entry.upc,
          score: score,
          matchType: matchType
        };
      }
    }
  }
  
  return bestMatch;
}

async function main() {
  console.log("Loading UPC catalog...");
  const catalogPath = "./scripts/upc_catalog.json";
  const catalog: UpcCatalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
  console.log(`Loaded ${catalog.entries.length} catalog entries`);
  
  console.log("\nFetching supplies from database...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    upc: supplies.upc
  }).from(supplies);
  
  console.log(`Total supplies: ${allSupplies.length}`);
  
  const withoutUpc = allSupplies.filter(s => !s.upc);
  console.log(`Without UPC: ${withoutUpc.length}`);
  
  console.log("\nMatching supplies to catalog...");
  const matches: MatchResult[] = [];
  const errors: { supply: any; reason: string }[] = [];
  
  for (const supply of withoutUpc) {
    const match = findBestMatch(supply, catalog.entries);
    if (match) {
      // Check for duplicate UPC matches
      const existingMatch = matches.find(m => m.upc === match.upc);
      if (existingMatch) {
        if (match.score > existingMatch.score) {
          // Remove existing, add new
          const idx = matches.indexOf(existingMatch);
          matches.splice(idx, 1);
          matches.push(match);
          errors.push({ 
            supply: existingMatch, 
            reason: `UPC ${match.upc} reassigned to higher scoring match` 
          });
        } else {
          errors.push({ 
            supply: match, 
            reason: `UPC ${match.upc} already assigned to ${existingMatch.supplyName}` 
          });
        }
      } else {
        matches.push(match);
      }
    }
  }
  
  // Categorize matches by confidence
  const highConf = matches.filter(m => m.score >= 0.95);
  const medConf = matches.filter(m => m.score >= 0.85 && m.score < 0.95);
  const lowConf = matches.filter(m => m.score < 0.85);
  
  console.log("\n=== MATCH RESULTS ===");
  console.log(`High confidence (>=95%): ${highConf.length}`);
  console.log(`Medium confidence (85-95%): ${medConf.length}`);
  console.log(`Low confidence (<85%): ${lowConf.length}`);
  console.log(`Total matches: ${matches.length}`);
  console.log(`Errors/conflicts: ${errors.length}`);
  
  // Save results
  const results = {
    generatedAt: new Date().toISOString(),
    totalSupplies: allSupplies.length,
    withoutUpc: withoutUpc.length,
    matchSummary: {
      highConfidence: highConf.length,
      mediumConfidence: medConf.length,
      lowConfidence: lowConf.length,
      total: matches.length
    },
    highConfidenceMatches: highConf,
    mediumConfidenceMatches: medConf,
    lowConfidenceMatches: lowConf,
    errors: errors
  };
  
  fs.writeFileSync("./scripts/upc_match_results.json", JSON.stringify(results, null, 2));
  console.log("\nResults saved to scripts/upc_match_results.json");
  
  // Apply high confidence matches
  console.log("\n=== APPLYING HIGH CONFIDENCE MATCHES ===");
  let applied = 0;
  for (const match of highConf) {
    try {
      await db.update(supplies)
        .set({ upc: match.upc })
        .where(eq(supplies.id, match.supplyId));
      applied++;
    } catch (e: any) {
      console.error(`Error applying UPC to supply ${match.supplyId}: ${e.message}`);
    }
  }
  console.log(`Applied ${applied} high confidence matches`);
  
  // Get final stats
  const finalStats = await db.select({
    total: sql<number>`count(*)`,
    withUpc: sql<number>`count(upc)`
  }).from(supplies);
  
  console.log("\n=== FINAL STATS ===");
  console.log(`Total supplies: ${finalStats[0].total}`);
  console.log(`With UPC: ${finalStats[0].withUpc}`);
  console.log(`Coverage: ${((finalStats[0].withUpc / finalStats[0].total) * 100).toFixed(1)}%`);
  
  process.exit(0);
}

main().catch(console.error);
