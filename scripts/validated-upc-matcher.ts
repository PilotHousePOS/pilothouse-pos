import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql, eq } from "drizzle-orm";
import * as fs from "fs";

// Brand aliases map
const BRAND_ALIASES: Record<string, string[]> = {
  "science diet": ["sd", "hills science diet", "hill's science diet", "hills"],
  "nutrisource": ["nutri sou", "nutrisou", "ntrsc", "nutri source"],
  "blue buffalo": ["bb", "blbuf", "blue buf", "blue"],
  "fromm": ["frm", "fromms"],
  "royal canin": ["rc", "roy can", "roycan"],
  "wellness": ["wlns", "well"],
  "purina": ["prina", "pur"],
  "iams": ["iams"],
  "orijen": ["orjn"],
  "acana": ["acan"],
  "canidae": ["cndy", "cndae"],
  "primal": ["prml"],
  "instinct": ["instct"],
  "zignature": ["zgntr"],
  "4health": ["4hlth"],
  "merrick": ["mrck"],
  "taste of the wild": ["totw"],
  "coastal": ["cstl"],
  "kong": ["kong"],
  "nylabone": ["nyla"],
  "tetra": ["tetra"],
  "api": ["api"],
  "seachem": ["seachem"],
  "zoo med": ["zoomed", "zm"],
  "fluker": ["flukers", "flukr"],
  "exo terra": ["exoterra", "exo"],
  "hikari": ["hkr"],
  "marineland": ["mrnlnd"],
  "aqueon": ["aqn"],
};

// Size/weight patterns
const SIZE_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*(?:lb|lbs|#|pound)/i,
  /(\d+(?:\.\d+)?)\s*(?:oz|ounce)/i,
  /(\d+(?:\.\d+)?)\s*(?:kg|kilogram)/i,
  /(\d+(?:\.\d+)?)\s*(?:g|gram)/i,
  /(\d+)\s*(?:ct|count|pk|pack)/i,
  /(\d+(?:\.\d+)?)\s*(?:in|inch|")/i,
];

// Normalize brand name
function normalizeBrand(text: string): string {
  const lower = text.toLowerCase().trim();
  
  // Check if it's an alias
  for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
    if (lower === canonical) return canonical;
    if (aliases.some(a => lower === a || lower.startsWith(a + " "))) {
      return canonical;
    }
  }
  return lower;
}

// Extract brand from product name
function extractBrandFromName(name: string): string | null {
  const lower = name.toLowerCase();
  
  // Try to match known brands first (longest first)
  const sortedBrands = Object.keys(BRAND_ALIASES).sort((a, b) => b.length - a.length);
  
  for (const brand of sortedBrands) {
    if (lower.includes(brand)) return brand;
    // Check aliases
    for (const alias of BRAND_ALIASES[brand]) {
      // Must be at word boundary
      const regex = new RegExp(`(^|\\s)${alias}(\\s|$)`, 'i');
      if (regex.test(lower)) return brand;
    }
  }
  return null;
}

// Extract size from product name  
function extractSize(name: string): { value: number; unit: string } | null {
  for (const pattern of SIZE_PATTERNS) {
    const match = name.match(pattern);
    if (match) {
      let unit = match[0].toLowerCase();
      unit = unit.replace(/[\d.]/g, "").trim();
      // Normalize units
      if (unit === "#" || unit === "lbs" || unit === "pound") unit = "lb";
      if (unit === "ounce") unit = "oz";
      if (unit === "count" || unit === "pk" || unit === "pack") unit = "ct";
      if (unit === "inch" || unit === '"') unit = "in";
      
      return { value: parseFloat(match[1]), unit };
    }
  }
  return null;
}

// Normalize text for token comparison
function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

// Calculate Jaccard similarity
function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

interface CatalogEntry {
  upc: string;
  names: string[];
  primaryName: string;
}

interface Match {
  supplyId: number;
  supplyName: string;
  supplyBrand: string | null;
  catalogName: string;
  upc: string;
  score: number;
  matchType: string;
  brandMatch: boolean;
  sizeMatch: boolean;
}

async function main() {
  console.log("Loading UPC catalog...");
  const catalog: { entries: CatalogEntry[] } = JSON.parse(
    fs.readFileSync("./scripts/upc_catalog.json", "utf-8")
  );
  console.log(`Loaded ${catalog.entries.length} catalog entries`);

  // Index catalog by normalized name and brand
  const catalogIndex = new Map<string, CatalogEntry[]>();
  for (const entry of catalog.entries) {
    for (const name of entry.names) {
      const brand = extractBrandFromName(name);
      if (brand) {
        if (!catalogIndex.has(brand)) catalogIndex.set(brand, []);
        catalogIndex.get(brand)!.push(entry);
      }
    }
  }
  console.log(`Indexed by ${catalogIndex.size} brands`);

  console.log("\nFetching supplies...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies);
  console.log(`Total supplies: ${allSupplies.length}`);

  const matches: Match[] = [];
  const usedUpcs = new Set<string>();
  let processed = 0;

  for (const supply of allSupplies) {
    // Determine supply brand
    const supplyBrand = supply.brand 
      ? normalizeBrand(supply.brand) 
      : extractBrandFromName(supply.name);
    
    if (!supplyBrand) {
      processed++;
      continue; // Skip items without identifiable brand
    }

    const supplySize = extractSize(supply.name);
    const supplyTokens = tokenize(supply.name);

    // Get candidates from same brand
    const candidates = catalogIndex.get(supplyBrand) || [];
    
    let bestMatch: Match | null = null;
    let bestScore = 0;

    for (const entry of candidates) {
      if (usedUpcs.has(entry.upc)) continue;

      for (const catalogName of entry.names) {
        const catalogBrand = extractBrandFromName(catalogName);
        const brandMatch = catalogBrand === supplyBrand;
        
        if (!brandMatch) continue; // Brand must match
        
        const catalogSize = extractSize(catalogName);
        const sizeMatch = !supplySize || !catalogSize || 
          (supplySize.unit === catalogSize.unit && 
           Math.abs(supplySize.value - catalogSize.value) < 0.5);
        
        if (!sizeMatch) continue; // Size must match if both have sizes
        
        const catalogTokens = tokenize(catalogName);
        const similarity = jaccard(supplyTokens, catalogTokens);
        
        // Require minimum 60% token overlap for brand-matched items
        if (similarity >= 0.6 && similarity > bestScore) {
          bestScore = similarity;
          bestMatch = {
            supplyId: supply.id,
            supplyName: supply.name,
            supplyBrand: supplyBrand,
            catalogName,
            upc: entry.upc,
            score: similarity,
            matchType: similarity >= 0.9 ? "high" : similarity >= 0.75 ? "medium" : "low",
            brandMatch: true,
            sizeMatch: sizeMatch && !!supplySize && !!catalogSize
          };
        }
      }
    }

    if (bestMatch && bestScore >= 0.7) {
      matches.push(bestMatch);
      usedUpcs.add(bestMatch.upc);
    }

    processed++;
    if (processed % 1000 === 0) {
      console.log(`Processed ${processed}/${allSupplies.length}, found ${matches.length} matches`);
    }
  }

  console.log(`\nTotal validated matches: ${matches.length}`);
  
  // Categorize
  const highConf = matches.filter(m => m.score >= 0.85);
  const medConf = matches.filter(m => m.score >= 0.7 && m.score < 0.85);
  
  console.log(`High confidence (>=85%): ${highConf.length}`);
  console.log(`Medium confidence (70-85%): ${medConf.length}`);

  // Save results
  fs.writeFileSync("./scripts/validated_matches.json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalMatches: matches.length,
    highConfidence: highConf.length,
    mediumConfidence: medConf.length,
    matches: matches.sort((a, b) => b.score - a.score)
  }, null, 2));
  console.log("Results saved to scripts/validated_matches.json");

  // Apply high confidence matches
  console.log("\nApplying high confidence matches...");
  let applied = 0;
  for (const match of highConf) {
    await db.update(supplies)
      .set({ upc: match.upc })
      .where(eq(supplies.id, match.supplyId));
    applied++;
    if (applied % 100 === 0) console.log(`  Applied ${applied}/${highConf.length}`);
  }
  console.log(`Applied ${applied} UPC codes`);

  // Final stats
  const final = await db.select({
    total: sql<number>`count(*)`,
    withUpc: sql<number>`count(upc)`
  }).from(supplies);
  
  console.log(`\n=== COVERAGE ===`);
  console.log(`With UPC: ${final[0].withUpc} / ${final[0].total}`);
  console.log(`Coverage: ${((final[0].withUpc / final[0].total) * 100).toFixed(1)}%`);

  // Show sample matches
  console.log("\nSample matches:");
  highConf.slice(0, 10).forEach(m => {
    console.log(`  ${m.supplyName} -> ${m.catalogName} (${(m.score*100).toFixed(0)}%)`);
  });

  process.exit(0);
}

main().catch(console.error);
