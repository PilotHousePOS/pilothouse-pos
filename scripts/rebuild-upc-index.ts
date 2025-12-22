import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { eq, sql, isNull } from "drizzle-orm";
import * as fs from "fs";

// Import abbreviation expansion mappings
const ABBREVIATION_MAPPINGS: Record<string, string> = {
  'Sd': 'Science Diet', 'Nb': 'Natural Balance', 'Tow': 'Taste of the Wild',
  'Toe': 'Taste of the Wild', 'Diam': 'Diamond', 'Vict': 'VICTOR', 'Euk': 'Eukanuba',
  'Jw': 'JW Pet', 'Spt': 'Spot', 'Zig': 'Zignature', 'Cand': 'Canidae', 'Zila': 'Zilla',
  'Ae': 'A&E', 'Ck': 'Chicken', 'Lam': 'Lamb', 'Br': 'Breed', 'Anc': 'Ancient',
  'Perf': 'Perfect', 'Sensi': 'Sensitive', 'Gr': 'Grain', 'Fr': 'Free',
  'Lg': 'Large', 'Md': 'Medium', 'Sm': 'Small', 'Min': 'Mini', 'Xlg': 'Extra Large',
  'Xl': 'Extra Large', 'Xs': 'Extra Small', 'Jum': 'Jumbo',
  'Hvy': 'Heavy', 'Lt': 'Light', 'Bk': 'Black', 'Blk': 'Black', 'Rd': 'Red',
  'Wht': 'White', 'Blu': 'Blue', 'Grn': 'Green', 'Gry': 'Gray',
  'Cmfrt': 'Comfort', 'Nat': 'Natural', 'Natu': 'Natural',
  'Pk': 'Pack', 'Dbl': 'Double', 'Asst': 'Assorted',
  'Jr': 'Junior', 'Sr': 'Senior', 'Shri': 'Shrimp',
  'Fz': 'Frozen', 'Fd': 'Food', 'Trt': 'Treat', 'Trts': 'Treats',
  'Sham': 'Shampoo', 'Cond': 'Conditioner', 'Flv': 'Flavor',
  'Chk': 'Chicken', 'Bef': 'Beef', 'Sal': 'Salmon', 'Trky': 'Turkey',
  'Pup': 'Puppy', 'Kit': 'Kitten', 'Adlt': 'Adult', 'Adt': 'Adult',
  'Floz': 'fl oz', 'Oz': 'oz', 'Lb': 'lb', 'Lbs': 'lbs'
};

// Brand aliases for matching
const BRAND_ALIASES: Record<string, string[]> = {
  'zoomed': ['zoo med', 'zmed', 'zm'],
  'exoterra': ['exo terra', 'exo-terra'],
  'sciencediet': ['science diet', 'sd', 'hills'],
  'bluebuffalo': ['blue buffalo', 'blue', 'bb'],
  'proplan': ['pro plan', 'purina pro plan', 'pp'],
  'naturalbalance': ['natural balance', 'nb'],
  'tasteofthewild': ['taste of the wild', 'totw', 'tow', 'toe'],
  'nutrisource': ['nutri source', 'ns'],
  'fromm': ['frm'],
  'royalcanin': ['royal canin', 'rc'],
  'eukanuba': ['euk'],
  'kaytee': ['kt'],
  'tetra': ['tet'],
  'fluval': ['flv'],
  'marineland': ['mland'],
  'aqueon': ['aqn'],
  'hikari': ['hik'],
  'coastal': ['cstl', 'cst'],
  'kong': ['kng'],
  'greenies': ['grn', 'grns'],
  'benebone': ['bene']
};

function expandAbbreviations(text: string): string {
  let result = text;
  for (const [abbr, full] of Object.entries(ABBREVIATION_MAPPINGS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  return result;
}

function normalizeForMatching(text: string): string {
  let normalized = text.toLowerCase();
  normalized = expandAbbreviations(normalized);
  normalized = normalized.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized;
}

function extractBrand(text: string): string {
  const normalizedText = text.toLowerCase().replace(/[^a-z]/g, '');
  for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
    if (normalizedText.startsWith(canonical)) return canonical;
    for (const alias of aliases) {
      const aliasNorm = alias.replace(/[^a-z]/g, '');
      if (normalizedText.startsWith(aliasNorm)) return canonical;
    }
  }
  // Extract first word as brand
  const firstWord = text.toLowerCase().split(/\s+/)[0]?.replace(/[^a-z]/g, '');
  return firstWord || '';
}

function tokenize(text: string): string[] {
  return normalizeForMatching(text).split(' ').filter(t => t.length > 1);
}

function jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  let intersection = 0;
  for (const t of set1) if (set2.has(t)) intersection++;
  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

async function main() {
  console.log("=== REBUILD UPC INDEX WITH NORMALIZATION ===\n");
  
  // Load upc_catalog.json (higher quality source)
  console.log("1. Loading UPC catalog...");
  const catalog = JSON.parse(fs.readFileSync('scripts/upc_catalog.json', 'utf-8'));
  console.log(`   Loaded ${catalog.entries.length} catalog entries\n`);
  
  // Build normalized index
  type IndexEntry = { 
    upc: string; 
    originalName: string; 
    normalizedName: string; 
    tokens: string[]; 
    brand: string;
    isCoastal: boolean;
  };
  
  const index: IndexEntry[] = [];
  for (const entry of catalog.entries) {
    const name = entry.primaryName || entry.names?.[0] || '';
    if (!name || name.length < 3) continue;
    
    index.push({
      upc: entry.upc,
      originalName: name,
      normalizedName: normalizeForMatching(name),
      tokens: tokenize(name),
      brand: extractBrand(name),
      isCoastal: name.toLowerCase().includes('coastal')
    });
  }
  console.log(`   Built index with ${index.length} entries\n`);
  
  // Also load master_upc_index for additional entries
  console.log("2. Adding entries from master index...");
  const masterData = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));
  const existingUpcs = new Set(index.map(e => e.upc));
  let added = 0;
  
  for (const entry of masterData.entries) {
    if (!existingUpcs.has(entry.upc)) {
      index.push({
        upc: entry.upc,
        originalName: entry.name,
        normalizedName: normalizeForMatching(entry.name),
        tokens: tokenize(entry.name),
        brand: extractBrand(entry.name),
        isCoastal: entry.isCoastal || entry.name.toLowerCase().includes('coastal')
      });
      existingUpcs.add(entry.upc);
      added++;
    }
  }
  console.log(`   Added ${added} unique entries from master index\n`);
  console.log(`   Total index entries: ${index.length}\n`);
  
  // Get all supplies
  console.log("3. Fetching supplies...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies);
  console.log(`   Found ${allSupplies.length} supplies\n`);
  
  // Match with normalized names
  console.log("4. Matching with normalized names...");
  const matches: Array<{ 
    id: number; 
    upc: string; 
    supplyName: string;
    catalogName: string;
    similarity: number;
    method: string;
  }> = [];
  const usedUpcs = new Set<string>();
  
  for (const supply of allSupplies) {
    const supplyNormalized = normalizeForMatching(supply.name);
    const supplyTokens = tokenize(supply.name);
    const supplyBrand = extractBrand(supply.name) || (supply.brand || '').toLowerCase().replace(/[^a-z]/g, '');
    
    if (supplyTokens.length < 2) continue;
    
    let bestMatch: { upc: string; name: string; similarity: number; method: string } | null = null;
    
    for (const entry of index) {
      if (usedUpcs.has(entry.upc) && !entry.isCoastal) continue;
      
      // Exact normalized match
      if (supplyNormalized === entry.normalizedName) {
        bestMatch = { upc: entry.upc, name: entry.originalName, similarity: 1.0, method: 'exact_normalized' };
        break;
      }
      
      const jaccard = jaccardSimilarity(supplyTokens, entry.tokens);
      
      // High similarity match (90%+)
      if (jaccard >= 0.90) {
        if (!bestMatch || jaccard > bestMatch.similarity) {
          bestMatch = { upc: entry.upc, name: entry.originalName, similarity: jaccard, method: '90%_jaccard' };
        }
      }
      // Brand-validated match (80%+)
      else if (jaccard >= 0.80 && supplyBrand && entry.brand === supplyBrand) {
        if (!bestMatch || jaccard > bestMatch.similarity) {
          bestMatch = { upc: entry.upc, name: entry.originalName, similarity: jaccard, method: '80%_brand' };
        }
      }
      // Token containment match (75%+)
      else if (jaccard >= 0.75) {
        const containsAll = supplyTokens.filter(t => entry.tokens.includes(t)).length >= supplyTokens.length * 0.9;
        if (containsAll && (!bestMatch || jaccard > bestMatch.similarity)) {
          bestMatch = { upc: entry.upc, name: entry.originalName, similarity: jaccard, method: '75%_tokens' };
        }
      }
    }
    
    if (bestMatch) {
      matches.push({
        id: supply.id,
        upc: bestMatch.upc,
        supplyName: supply.name,
        catalogName: bestMatch.name,
        similarity: bestMatch.similarity,
        method: bestMatch.method
      });
      usedUpcs.add(bestMatch.upc);
    }
  }
  
  console.log(`   Found ${matches.length} matches\n`);
  
  // Report by method
  const byMethod: Record<string, number> = {};
  matches.forEach(m => byMethod[m.method] = (byMethod[m.method] || 0) + 1);
  console.log("   By method:");
  Object.entries(byMethod).forEach(([k, v]) => console.log(`     ${k}: ${v}`));
  
  // Apply matches
  console.log("\n5. Applying matches to database...");
  await db.update(supplies).set({ upc: null }); // Clear first
  
  let applied = 0;
  for (const match of matches) {
    await db.update(supplies).set({ upc: match.upc }).where(eq(supplies.id, match.id));
    applied++;
    if (applied % 500 === 0) console.log(`   Applied ${applied}...`);
  }
  
  // Final count
  const finalCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(supplies).where(sql`${supplies.upc} IS NOT NULL`);
  
  console.log(`\n=== FINAL RESULTS ===`);
  console.log(`Total supplies: ${allSupplies.length}`);
  console.log(`Supplies with UPC: ${finalCount[0].count}`);
  console.log(`Coverage: ${((finalCount[0].count / allSupplies.length) * 100).toFixed(1)}%`);
  
  // Save report
  fs.writeFileSync('scripts/normalized_match_report.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    indexEntries: index.length,
    totalSupplies: allSupplies.length,
    matchedSupplies: finalCount[0].count,
    coverage: ((finalCount[0].count / allSupplies.length) * 100).toFixed(1) + '%',
    byMethod,
    sampleMatches: matches.slice(0, 20).map(m => ({
      supply: m.supplyName,
      catalog: m.catalogName,
      similarity: (m.similarity * 100).toFixed(0) + '%',
      method: m.method
    }))
  }, null, 2));
  
  console.log("\nSaved report to scripts/normalized_match_report.json");
  process.exit(0);
}

main().catch(console.error);
