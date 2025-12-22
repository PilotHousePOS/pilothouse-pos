import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql, inArray } from "drizzle-orm";
import * as fs from "fs";

// Quick abbreviation expansion
const ABBREVS: Record<string, string> = {
  sd: "sciencediet", nutrisou: "nutrisource", bb: "bluebuffalo", frm: "fromm",
  rc: "royalcanin", wlns: "wellness", prina: "purina", sm: "small", lg: "large",
  med: "medium", gf: "grainfree", ck: "chicken", chk: "chicken", slmn: "salmon",
  pup: "puppy", kit: "kitten", adlt: "adult", sr: "senior"
};

// Normalize to canonical form
function canonicalize(text: string): string {
  let s = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Replace # with lb
  s = s.replace(/(\d+)#/g, "$1lb");
  // Expand abbreviations
  for (const [abbr, full] of Object.entries(ABBREVS)) {
    s = s.replace(new RegExp(`\\b${abbr}\\b`, "g"), full);
  }
  return s;
}

// Extract size key for indexing
function sizeKey(text: string): string {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(lb|oz|kg|ct|pk|in|ml|gal|#)/i);
  if (m) {
    const unit = m[2] === "#" ? "lb" : m[2].toLowerCase();
    return `${m[1]}${unit}`;
  }
  return "";
}

// Extract brand key
function brandKey(text: string): string {
  const brands = ["sciencediet", "nutrisource", "bluebuffalo", "fromm", "royalcanin",
    "wellness", "purina", "coastal", "kong", "tetra", "api", "seachem", "zoomed",
    "exoterra", "hikari", "marineland", "aqueon", "fluval", "kaytee", "zilla",
    "nylabone", "pennplax", "oxbow", "prevue", "catit", "petmate", "greenies"];
  const s = canonicalize(text);
  for (const b of brands) {
    if (s.includes(b)) return b;
  }
  return s.slice(0, 6); // First 6 chars as fallback
}

// Token set for similarity
function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length >= 3));
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

async function main() {
  console.time("Total");
  
  // Load catalog
  console.log("Loading catalog...");
  const catalog = JSON.parse(fs.readFileSync("./scripts/upc_catalog.json", "utf-8"));
  
  // Precompute catalog index: Map<canonicalName, {upc, name}>
  console.log("Building catalog index...");
  const exactIndex = new Map<string, { upc: string; name: string }>();
  const brandSizeIndex = new Map<string, Array<{ upc: string; name: string; tokens: Set<string> }>>();
  
  for (const entry of catalog.entries) {
    for (const name of entry.names) {
      const canon = canonicalize(name);
      if (!exactIndex.has(canon)) {
        exactIndex.set(canon, { upc: entry.upc, name });
      }
      
      const key = `${brandKey(name)}|${sizeKey(name)}`;
      if (!brandSizeIndex.has(key)) brandSizeIndex.set(key, []);
      brandSizeIndex.get(key)!.push({ upc: entry.upc, name, tokens: tokens(name) });
    }
  }
  console.log(`Exact index: ${exactIndex.size}, Brand+Size index: ${brandSizeIndex.size}`);
  
  // Load supplies
  console.log("Loading supplies...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    upc: supplies.upc
  }).from(supplies);
  
  const withoutUpc = allSupplies.filter(s => !s.upc);
  console.log(`Without UPC: ${withoutUpc.length}`);
  
  // Match
  console.log("Matching...");
  const matches: Array<{ id: number; upc: string; name: string; catalogName: string; score: number }> = [];
  const usedUpcs = new Set<string>();
  
  for (const supply of withoutUpc) {
    const canon = canonicalize(supply.name);
    
    // 1. Exact match
    if (exactIndex.has(canon)) {
      const match = exactIndex.get(canon)!;
      if (!usedUpcs.has(match.upc)) {
        matches.push({ id: supply.id, upc: match.upc, name: supply.name, catalogName: match.name, score: 1.0 });
        usedUpcs.add(match.upc);
        continue;
      }
    }
    
    // 2. Brand+Size indexed fuzzy match
    const key = `${brandKey(supply.name)}|${sizeKey(supply.name)}`;
    const candidates = brandSizeIndex.get(key) || [];
    
    const supplyTokens = tokens(supply.name);
    let best: { upc: string; name: string; score: number } | null = null;
    
    for (const c of candidates) {
      if (usedUpcs.has(c.upc)) continue;
      const score = jaccardScore(supplyTokens, c.tokens);
      if (score >= 0.6 && (!best || score > best.score)) {
        best = { upc: c.upc, name: c.name, score };
      }
    }
    
    if (best && best.score >= 0.75) {
      matches.push({ id: supply.id, upc: best.upc, name: supply.name, catalogName: best.name, score: best.score });
      usedUpcs.add(best.upc);
    }
  }
  
  console.log(`Found ${matches.length} matches`);
  
  // Categorize
  const highConf = matches.filter(m => m.score >= 0.85);
  console.log(`High confidence (>=85%): ${highConf.length}`);
  
  // Batch apply
  console.log("Applying matches in batches...");
  const BATCH_SIZE = 100;
  let applied = 0;
  
  for (let i = 0; i < highConf.length; i += BATCH_SIZE) {
    const batch = highConf.slice(i, i + BATCH_SIZE);
    for (const m of batch) {
      await db.execute(sql`UPDATE supplies SET upc = ${m.upc} WHERE id = ${m.id}`);
    }
    applied += batch.length;
    console.log(`  Applied ${applied}/${highConf.length}`);
  }
  
  // Save results
  fs.writeFileSync("./scripts/optimized_matches.json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: matches.length,
    highConfidence: highConf.length,
    matches: highConf.map(m => ({ id: m.id, name: m.name, catalogName: m.catalogName, upc: m.upc, score: m.score }))
  }, null, 2));
  
  // Final stats
  const final = await db.select({
    total: sql<number>`count(*)`,
    withUpc: sql<number>`count(upc)`
  }).from(supplies);
  
  console.log(`\n=== FINAL ===`);
  console.log(`Coverage: ${final[0].withUpc}/${final[0].total} = ${((final[0].withUpc / final[0].total) * 100).toFixed(1)}%`);
  
  console.log("\nSample matches:");
  highConf.slice(0, 10).forEach(m => console.log(`  ${m.name} -> ${m.catalogName} (${(m.score*100).toFixed(0)}%)`));
  
  console.timeEnd("Total");
  process.exit(0);
}

main().catch(console.error);
