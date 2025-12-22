import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { eq, sql } from "drizzle-orm";
import { expandAbbreviations } from "../server/abbreviationExpansion";
import * as fs from "fs";

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/(\d+)#/g, '$1lb')         // Convert weight symbol: "3.5#" -> "3.5lb"
    .replace(/#(\d+)/g, 'lb$1')         // Handle "#5" -> "lb5"
    .replace(/([a-z])(\d)/gi, '$1 $2')  // Split letters from digits: "Black14" -> "Black 14"
    .replace(/(\d)([a-z])/gi, '$1 $2')  // Split digits from letters: "14inch" -> "14 inch"
    .replace(/['']s\b/g, 's')           // Handle possessives: "Elsey's" -> "Elseys"
    .replace(/['']/g, '')               // Remove remaining apostrophes: "n't" -> "nt"
    .replace(/\./g, '')                 // Remove periods: "Dr." -> "Dr"
    .replace(/&/g, ' and ')             // Normalize ampersand
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
  for (const t of set1) if (set2.has(t)) intersection++;
  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function extractBrand(name: string): string {
  const brandPatterns = [
    { pattern: /^(science\s?diet|sd)\b/i, brand: 'sciencediet' },
    { pattern: /^(blue\s?buffalo|bb|blue)\b/i, brand: 'bluebuffalo' },
    { pattern: /^(pro\s?plan|pp|purina)\b/i, brand: 'proplan' },
    { pattern: /^(natural\s?balance|nb)\b/i, brand: 'naturalbalance' },
    { pattern: /^(taste\s?of\s?the\s?wild|totw|tow)\b/i, brand: 'tasteofthewild' },
    { pattern: /^(nutri\s?source|ns)\b/i, brand: 'nutrisource' },
    { pattern: /^(royal\s?canin|rc)\b/i, brand: 'royalcanin' },
    { pattern: /^(zoo\s?med|zm)\b/i, brand: 'zoomed' },
    { pattern: /^(exo\s?terra)\b/i, brand: 'exoterra' },
    { pattern: /^(zilla)\b/i, brand: 'zilla' },
    { pattern: /^(fluker)/i, brand: 'fluker' },
    { pattern: /^(kaytee)\b/i, brand: 'kaytee' },
    { pattern: /^(fromm)\b/i, brand: 'fromm' },
    { pattern: /^(coastal)\b/i, brand: 'coastal' },
    { pattern: /^(kong)\b/i, brand: 'kong' },
    { pattern: /^(greenies)/i, brand: 'greenies' },
    { pattern: /^(benebone)/i, brand: 'benebone' },
    { pattern: /^(oxbow)/i, brand: 'oxbow' },
    { pattern: /^(tetra)\b/i, brand: 'tetra' },
    { pattern: /^(fluval)\b/i, brand: 'fluval' },
    { pattern: /^(hikari)/i, brand: 'hikari' },
    { pattern: /^(marineland)/i, brand: 'marineland' },
    { pattern: /^(aqueon)/i, brand: 'aqueon' },
    { pattern: /^(api)\b/i, brand: 'api' },
    { pattern: /^(penn[\s-]?plax)/i, brand: 'pennplax' },
    { pattern: /^(eukanuba)\b/i, brand: 'eukanuba' },
    { pattern: /^(adams)\b/i, brand: 'adams' },
    { pattern: /^(tropiclean)/i, brand: 'tropiclean' },
    { pattern: /^(dogswell)/i, brand: 'dogswell' },
    { pattern: /^(jw\s?pet|jw)\b/i, brand: 'jwpet' },
    { pattern: /^(victor)\b/i, brand: 'victor' },
    { pattern: /^(diamond)\b/i, brand: 'diamond' },
    { pattern: /^(canidae)\b/i, brand: 'canidae' },
    { pattern: /^(merrick)/i, brand: 'merrick' },
    { pattern: /^(wellness)/i, brand: 'wellness' },
    { pattern: /^(orijen)/i, brand: 'orijen' },
    { pattern: /^(acana)/i, brand: 'acana' },
    { pattern: /^(natures\s?variety|nv)\b/i, brand: 'naturesvariety' },
    { pattern: /^(instinct)/i, brand: 'instinct' },
    { pattern: /^(hills)\b/i, brand: 'hills' },
  ];
  
  for (const { pattern, brand } of brandPatterns) {
    if (pattern.test(name)) return brand;
  }
  return '';
}

async function main() {
  console.log("=== EXPAND ABBREVIATIONS AND MATCH UPCs ===\n");
  
  // Load confirmed matches first (so we don't start over)
  console.log("0. Loading confirmed matches...");
  let confirmedMatches: Map<number, string> = new Map();
  const confirmedFile = 'scripts/confirmed_upc_matches.json';
  if (fs.existsSync(confirmedFile)) {
    const confirmed = JSON.parse(fs.readFileSync(confirmedFile, 'utf-8'));
    for (const m of confirmed.matches) {
      confirmedMatches.set(m.supplyId, m.upc);
    }
    console.log(`   Loaded ${confirmedMatches.size} confirmed matches\n`);
  } else {
    console.log("   No confirmed matches file found, starting fresh\n");
  }
  
  // Load master UPC index (enriched index has data quality issues)
  console.log("1. Loading master UPC index...");
  const masterData = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));
  console.log(`   Loaded ${masterData.entries.length} entries\n`);
  
  // Expand all catalog names using the abbreviation system
  console.log("2. Expanding abbreviations in catalog names...");
  type IndexEntry = {
    upc: string;
    originalName: string;
    expandedName: string;
    tokens: string[];
    brand: string;
    upcBrand: string; // Brand inferred from UPC prefix
    isCoastal: boolean;
  };
  
  // UPC prefix to brand mapping - helps match when invoice names don't include brand
  const upcPrefixBrands: Record<string, string> = {
    // Pet food brands
    '052742': 'sciencediet',   // Hill's Science Diet
    '073893': 'nutrisource',   // NutriSource
    '840243': 'bluebuffalo',   // Blue Buffalo
    '023100': 'royalcanin',    // Royal Canin
    '038100': 'proplan',       // Purina Pro Plan
    '723633': 'tasteofthewild', // Taste of the Wild
    '072705': 'fromm',         // Fromm
    '769949': 'victor',        // Victor
    '074198': 'diamond',       // Diamond
    '884308': 'canidae',       // Canidae
    '022808': 'merrick',       // Merrick
    '076344': 'wellness',      // Wellness
    '064992': 'orijen',        // Orijen
    '064992': 'acana',         // Acana (shared with Orijen)
    '769949': 'naturalbalance', // Natural Balance
    '079105': 'primal',        // Primal
    
    // Aquatics/Reptile brands
    '030172': 'pennplax',
    '097612': 'zoomed',
    '015561': 'fluval',
    '046798': 'tetra',
    '042055': 'hikari',
    '077234': 'api',
    '015905': 'marineland',
    '090653': 'exoterra',
    '017800': 'zilla',
    
    // Accessories brands
    '076484': 'coastal',
    '045663': 'fourpaws',
    '785184': 'redbarn',
    '071860': 'arknaturals',
    '030027': 'acme',
    '071859': 'kaytee',
    '018065': 'tropiclean',
    '013227': 'kong',
    '018214': 'nylabone',
    '642863': 'greenies',
    '875854': 'benebone'
  };
  
  const index: IndexEntry[] = [];
  let expanded = 0;
  
  for (const entry of masterData.entries) {
    const originalName = entry.name;
    // Pre-process Coastal color codes followed by dimensions (e.g., "AWN06'" -> "AWN 06'")
    const preSplit = originalName
      .replace(/\b(AWN|LWO|NPK|HNT|PUR|BLK|GRY|PNK|RED|GRN|BLU|ORG|YLW|TAN|BRN|WHT|SLV|GLD)(\d)/gi, '$1 $2');
    const expandedName = expandAbbreviations(preSplit);
    
    if (expandedName !== originalName) expanded++;
    
    // Get brand from UPC prefix
    const upcPrefix = entry.upc.slice(0, 6);
    const upcBrand = upcPrefixBrands[upcPrefix] || '';
    
    index.push({
      upc: entry.upc,
      originalName,
      expandedName,
      tokens: tokenize(expandedName),
      brand: extractBrand(expandedName),
      upcBrand,
      isCoastal: entry.isCoastal || originalName.toLowerCase().includes('coastal')
    });
  }
  
  console.log(`   Expanded ${expanded} names\n`);
  
  // Show sample expansions
  console.log("   Sample expansions:");
  const sampleExpansions = index.filter(e => e.originalName !== e.expandedName).slice(0, 10);
  sampleExpansions.forEach(e => {
    console.log(`     "${e.originalName}" -> "${e.expandedName}"`);
  });
  
  // Get all supplies
  console.log("\n3. Fetching supplies...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies);
  console.log(`   Found ${allSupplies.length} supplies\n`);
  
  // Match with expanded names
  console.log("4. Matching with expanded names...");
  const matches: Array<{
    id: number;
    upc: string;
    supplyName: string;
    catalogOriginal: string;
    catalogExpanded: string;
    similarity: number;
    method: string;
  }> = [];
  const usedUpcs = new Set<string>();
  
  // Build exact match index for fast lookups
  const exactMatchIndex = new Map<string, IndexEntry>();
  for (const entry of index) {
    const normalizedName = normalize(entry.expandedName);
    if (!exactMatchIndex.has(normalizedName)) {
      exactMatchIndex.set(normalizedName, entry);
    }
  }
  console.log(`   Built exact match index with ${exactMatchIndex.size} entries`);
  
  let exactMatches = 0;
  let fuzzyMatches = 0;
  
  for (const supply of allSupplies) {
    // CRITICAL: Expand abbreviations in supply names too!
    const expandedSupplyName = expandAbbreviations(supply.name);
    const normalizedSupplyName = normalize(expandedSupplyName);
    const supplyTokens = tokenize(expandedSupplyName);
    if (supplyTokens.length < 2) continue;
    
    const supplyBrand = extractBrand(expandedSupplyName) || (supply.brand || '').toLowerCase().replace(/[^a-z]/g, '');
    
    let bestMatch: { 
      upc: string; 
      originalName: string; 
      expandedName: string; 
      similarity: number; 
      method: string 
    } | null = null;
    
    // FAST PATH: Check exact match first
    const exactEntry = exactMatchIndex.get(normalizedSupplyName);
    if (exactEntry && (!usedUpcs.has(exactEntry.upc) || exactEntry.isCoastal)) {
      bestMatch = {
        upc: exactEntry.upc,
        originalName: exactEntry.originalName,
        expandedName: exactEntry.expandedName,
        similarity: 1.0,
        method: 'exact'
      };
      exactMatches++;
    }
    
    // SLOW PATH: Fuzzy matching if no exact match
    if (!bestMatch) {
      // PASS 1: Brand-filtered matching with UPC prefix confirmation
      // When supply has a brand AND we find entries with matching UPC prefix brand,
      // we can use smarter matching because the UPC prefix confirms the brand
      if (supplyBrand) {
        const brandCandidates = index.filter(e => 
          e.upcBrand === supplyBrand && 
          (!usedUpcs.has(e.upc) || e.isCoastal)
        );
        
        for (const entry of brandCandidates) {
          const similarity = jaccardSimilarity(supplyTokens, entry.tokens);
          const supplySet = new Set(supplyTokens);
          const matchingTokens = entry.tokens.filter(t => supplySet.has(t));
          const significantMatching = matchingTokens.filter(t => t.length > 2);
          
          // Check for containment: if almost all master tokens are in supply, it's likely the same product
          // This handles cases where master is abbreviated (e.g., "NUTRI SOU lg br 26#") 
          // and supply is verbose (e.g., "Nutrisource Large Breed Puppy Chicken & Rice Recipe 26lb")
          const containmentRatio = matchingTokens.length / entry.tokens.length;
          
          // MATCH if:
          // 1. 65%+ Jaccard AND 3+ significant tokens match, OR
          // 2. 90%+ of master tokens are contained in supply AND brand+weight match (containment match)
          if (similarity >= 0.65 && (significantMatching.length >= 3 || (significantMatching.length >= 2 && supplyTokens.length <= 4))) {
            if (!bestMatch || similarity > bestMatch.similarity) {
              bestMatch = { 
                upc: entry.upc, 
                originalName: entry.originalName,
                expandedName: entry.expandedName,
                similarity, 
                method: '65%_upc_verified' 
              };
            }
          } else if (containmentRatio >= 0.90 && significantMatching.length >= 3) {
            // Containment match: master tokens are a subset of supply tokens
            // This is safe when brand is verified by UPC prefix
            if (!bestMatch || containmentRatio > (bestMatch.similarity || 0)) {
              bestMatch = { 
                upc: entry.upc, 
                originalName: entry.originalName,
                expandedName: entry.expandedName,
                similarity: containmentRatio, 
                method: 'containment_upc_verified' 
              };
            }
          }
        }
      }
      
      // PASS 2: Standard fuzzy matching if brand-filtered didn't find a match
      if (!bestMatch) {
        for (const entry of index) {
          if (usedUpcs.has(entry.upc) && !entry.isCoastal) continue;
          
          const similarity = jaccardSimilarity(supplyTokens, entry.tokens);
        
          // 90%+ threshold
          if (similarity >= 0.90) {
            if (!bestMatch || similarity > bestMatch.similarity) {
              bestMatch = { 
                upc: entry.upc, 
                originalName: entry.originalName,
                expandedName: entry.expandedName,
                similarity, 
                method: '90%_jaccard' 
              };
            }
          }
          // 75%+ with brand match (from name OR UPC prefix)
          else if (similarity >= 0.75 && supplyBrand && 
                   (entry.brand === supplyBrand || entry.upcBrand === supplyBrand)) {
            if (!bestMatch || similarity > bestMatch.similarity) {
              bestMatch = { 
                upc: entry.upc, 
                originalName: entry.originalName,
                expandedName: entry.expandedName,
                similarity, 
                method: entry.upcBrand === supplyBrand ? '75%_upc_brand' : '75%_brand' 
              };
            }
          }
          // 75%+ with high token overlap
          else if (similarity >= 0.75) {
            const supplySet = new Set(supplyTokens);
            const overlap = entry.tokens.filter(t => supplySet.has(t)).length;
            if (overlap >= supplyTokens.length * 0.85 && (!bestMatch || similarity > bestMatch.similarity)) {
              bestMatch = { 
                upc: entry.upc, 
                originalName: entry.originalName,
                expandedName: entry.expandedName,
                similarity, 
                method: '75%_overlap' 
              };
            }
          }
        }
      }
      if (bestMatch) fuzzyMatches++;
    }
    
    if (bestMatch) {
      matches.push({
        id: supply.id,
        upc: bestMatch.upc,
        supplyName: supply.name,
        catalogOriginal: bestMatch.originalName,
        catalogExpanded: bestMatch.expandedName,
        similarity: bestMatch.similarity,
        method: bestMatch.method
      });
      usedUpcs.add(bestMatch.upc);
    }
  }
  
  console.log(`\n   Found ${matches.length} matches`);
  console.log(`   Exact matches: ${exactMatches}`);
  console.log(`   Fuzzy matches: ${fuzzyMatches}`);
  
  // Stats by method
  const byMethod: Record<string, number> = {};
  matches.forEach(m => byMethod[m.method] = (byMethod[m.method] || 0) + 1);
  console.log("\n   By method:");
  Object.entries(byMethod).forEach(([k, v]) => console.log(`     ${k}: ${v}`));
  
  // Apply matches
  console.log("\n5. Applying matches to database...");
  await db.update(supplies).set({ upc: null });
  
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
  fs.writeFileSync('scripts/expanded_match_report.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    indexEntries: index.length,
    expandedNames: expanded,
    totalSupplies: allSupplies.length,
    matchedSupplies: finalCount[0].count,
    coverage: ((finalCount[0].count / allSupplies.length) * 100).toFixed(1) + '%',
    byMethod,
    sampleMatches: matches.slice(0, 30).map(m => ({
      supply: m.supplyName,
      catalogOriginal: m.catalogOriginal,
      catalogExpanded: m.catalogExpanded,
      similarity: (m.similarity * 100).toFixed(0) + '%',
      method: m.method
    }))
  }, null, 2));
  
  console.log("\nSaved report to scripts/expanded_match_report.json");
  process.exit(0);
}

main().catch(console.error);
