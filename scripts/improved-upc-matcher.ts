import ExcelJS from 'exceljs';
import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { isNull, eq } from "drizzle-orm";
import * as fs from "fs";

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(\d+)#/g, "$1lb")
    .replace(/(\d+)oz/g, "$1oz")
    .replace(/(\d+)lb/g, "$1lb");
}

function extractProductCode(text: string): string | null {
  const match = text.match(/([A-Z]{2,5}\d{1,4})/i);
  return match ? match[1].toUpperCase() : null;
}

function extractSize(text: string): string | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(oz|lb|qt|gal|"|in|pk|ct|count)/i);
  return match ? match[0].toLowerCase().replace(/\s+/g, '') : null;
}

function extractBrandFromName(name: string): string | null {
  const brands = ['coastal', 'kong', 'blue buffalo', 'nutrisource', 'science diet', 'fromm', 
    'zoo med', 'zoomed', 'exo terra', 'exoterra', 'nylabone', 'redbar', 'prevue', 'pro plan',
    'penn-plax', 'tetra', 'aquatop', 'fluval', 'marineland', 'api', 'jw pet', 'frisco'];
  const lower = name.toLowerCase();
  for (const brand of brands) {
    if (lower.startsWith(brand + ' ') || lower.includes(' ' + brand + ' ')) {
      return brand;
    }
  }
  return null;
}

async function main() {
  console.log("=== IMPROVED UPC MATCHING ===\n");

  // Build UPC index from all sources
  const upcIndex = new Map<string, { upc: string; name: string; code: string | null; size: string | null }>();
  
  // 1. Load Maybe inventory
  console.log("1. Loading Maybe inventory...");
  const maybeWb = new ExcelJS.Workbook();
  await maybeWb.xlsx.readFile('./attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const maybeSheet = maybeWb.worksheets[0];
  
  let maybeCount = 0;
  maybeSheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name && upc.length >= 8) {
      const key = normalize(name);
      const code = extractProductCode(name);
      const size = extractSize(name);
      if (!upcIndex.has(key)) {
        upcIndex.set(key, { upc, name, code, size });
        maybeCount++;
      }
    }
  });
  console.log(`   Loaded ${maybeCount} from Maybe\n`);

  // 2. Load catalog
  console.log("2. Loading catalog...");
  const catalog = JSON.parse(fs.readFileSync("./scripts/upc_catalog.json", "utf-8"));
  let catalogCount = 0;
  for (const entry of catalog.entries) {
    for (const name of entry.names) {
      const key = normalize(name);
      const code = extractProductCode(name);
      const size = extractSize(name);
      if (!upcIndex.has(key)) {
        upcIndex.set(key, { upc: entry.upc, name, code, size });
        catalogCount++;
      }
    }
  }
  console.log(`   Loaded ${catalogCount} from catalog\n`);

  // 3. Load combined
  console.log("3. Loading combined...");
  const combined = JSON.parse(fs.readFileSync("./scripts/all_combined_upcs.json", "utf-8"));
  let combinedCount = 0;
  for (const entry of combined) {
    const key = normalize(entry.name);
    const code = extractProductCode(entry.name);
    const size = extractSize(entry.name);
    if (!upcIndex.has(key)) {
      upcIndex.set(key, { upc: entry.upc, name: entry.name, code, size });
      combinedCount++;
    }
  }
  console.log(`   Loaded ${combinedCount} from combined\n`);

  console.log(`   TOTAL INDEX: ${upcIndex.size} entries\n`);

  // Build additional indexes
  const codeIndex = new Map<string, Array<{ upc: string; name: string; size: string | null }>>();
  for (const [, entry] of upcIndex) {
    if (entry.code) {
      if (!codeIndex.has(entry.code)) codeIndex.set(entry.code, []);
      codeIndex.get(entry.code)!.push({ upc: entry.upc, name: entry.name, size: entry.size });
    }
  }
  console.log(`   Product code index: ${codeIndex.size} unique codes\n`);

  // 4. Get unmatched supplies
  console.log("4. Fetching unmatched supplies...");
  const unmatched = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.upc));
  console.log(`   Found ${unmatched.length} without UPC\n`);

  // Track matches
  const matches: Array<{ id: number; name: string; upc: string; matchType: string; catalogName: string }> = [];
  const usedUpcs = new Set<string>();

  // Strategy 1: Exact normalized match
  console.log("5. Strategy 1: Exact normalized match...");
  for (const supply of unmatched) {
    const key = normalize(supply.name);
    const match = upcIndex.get(key);
    if (match && !usedUpcs.has(match.upc)) {
      matches.push({ id: supply.id, name: supply.name, upc: match.upc, matchType: 'exact', catalogName: match.name });
      usedUpcs.add(match.upc);
    }
  }
  console.log(`   Exact matches: ${matches.length}\n`);

  // Strategy 2: Product code + brand matching
  console.log("6. Strategy 2: Product code + brand matching...");
  const unmatched2 = unmatched.filter(s => !matches.find(m => m.id === s.id));
  let codeMatches = 0;
  
  for (const supply of unmatched2) {
    const code = extractProductCode(supply.name);
    if (code && codeIndex.has(code)) {
      const candidates = codeIndex.get(code)!;
      // Find best match - prefer same brand or size
      const supplySize = extractSize(supply.name);
      const supplyBrand = supply.brand?.toLowerCase() || extractBrandFromName(supply.name);
      
      for (const candidate of candidates) {
        if (usedUpcs.has(candidate.upc)) continue;
        
        const candBrand = extractBrandFromName(candidate.name);
        const brandMatch = supplyBrand && candBrand && supplyBrand.includes(candBrand);
        const sizeMatch = supplySize && candidate.size && supplySize === candidate.size;
        
        if (brandMatch || (supplySize === candidate.size)) {
          matches.push({ id: supply.id, name: supply.name, upc: candidate.upc, matchType: 'code+brand', catalogName: candidate.name });
          usedUpcs.add(candidate.upc);
          codeMatches++;
          break;
        }
      }
    }
  }
  console.log(`   Code+brand matches: ${codeMatches}\n`);

  // Strategy 3: Token-based fuzzy with brand validation
  console.log("7. Strategy 3: Token-based fuzzy matching...");
  const unmatched3 = unmatched.filter(s => !matches.find(m => m.id === s.id));
  
  // Build token index
  const tokenIndex = new Map<string, Array<{ upc: string; name: string; tokens: Set<string> }>>();
  for (const [key, entry] of upcIndex) {
    const tokens = key.match(/[a-z]{3,}|\d+[a-z]*|\d+/g) || [];
    for (const token of tokens) {
      if (!tokenIndex.has(token)) tokenIndex.set(token, []);
      tokenIndex.get(token)!.push({ upc: entry.upc, name: entry.name, tokens: new Set(tokens) });
    }
  }

  let fuzzyMatches = 0;
  for (const supply of unmatched3) {
    const supplyKey = normalize(supply.name);
    const supplyTokens = supplyKey.match(/[a-z]{3,}|\d+[a-z]*|\d+/g) || [];
    if (supplyTokens.length < 2) continue;

    const candidateScores = new Map<string, { entry: any; score: number }>();
    
    for (const token of supplyTokens) {
      const candidates = tokenIndex.get(token) || [];
      for (const cand of candidates) {
        if (usedUpcs.has(cand.upc)) continue;
        
        const existing = candidateScores.get(cand.upc);
        if (!existing) {
          candidateScores.set(cand.upc, { entry: cand, score: 1 });
        } else {
          existing.score++;
        }
      }
    }

    // Find best match with 70%+ overlap
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [upc, data] of candidateScores) {
      const overlap = data.score / Math.max(supplyTokens.length, data.entry.tokens.size);
      if (overlap >= 0.7 && data.score > bestScore) {
        // Validate brand if available
        const supplyBrand = supply.brand?.toLowerCase();
        const candBrand = extractBrandFromName(data.entry.name);
        
        if (supplyBrand && candBrand) {
          if (!supplyBrand.includes(candBrand) && !candBrand.includes(supplyBrand)) {
            continue; // Brand mismatch
          }
        }
        
        bestScore = data.score;
        bestMatch = { upc, name: data.entry.name };
      }
    }

    if (bestMatch) {
      matches.push({ id: supply.id, name: supply.name, upc: bestMatch.upc, matchType: 'fuzzy', catalogName: bestMatch.name });
      usedUpcs.add(bestMatch.upc);
      fuzzyMatches++;
    }
  }
  console.log(`   Fuzzy matches: ${fuzzyMatches}\n`);

  // Apply matches
  console.log("8. Applying matches to database...");
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
  
  console.log("\nSample matches by type:");
  const byType: Record<string, typeof matches> = {};
  for (const m of matches) {
    if (!byType[m.matchType]) byType[m.matchType] = [];
    if (byType[m.matchType].length < 5) byType[m.matchType].push(m);
  }
  for (const [type, samples] of Object.entries(byType)) {
    console.log(`\n${type}:`);
    for (const s of samples) {
      console.log(`  "${s.name}" -> "${s.catalogName}"`);
    }
  }

  process.exit(0);
}

main().catch(console.error);
