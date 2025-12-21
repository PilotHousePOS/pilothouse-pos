import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

// Brand patterns to detect in UPC names (expanded to catch more entries)
const brandDetectors: { brand: string; patterns: RegExp[] }[] = [
  { brand: 'Penn-Plax', patterns: [/penn[- ]?plax/i, /^pp\s/i, /\bpennplax\b/i] },
  { brand: "Li'l Pals", patterns: [/li'?l\s*pals?/i, /^lp\s/i, /lilpals/i, /lil pals/i] },
  { brand: 'Zoo Med', patterns: [/zoo\s*med/i, /^zml\b/i, /^zm\s/i, /zoomed/i] },
  { brand: 'Fluval', patterns: [/fluval/i, /^flu\s/i, /^flu[v]/i] },
  { brand: 'Exo Terra', patterns: [/exo[- ]?terra/i, /^et\s/i, /^ext\s/i, /exoterra/i] },
  { brand: 'Coastal', patterns: [/coastal/i, /^coa\s/i] },
  { brand: 'Zilla', patterns: [/zilla/i, /^zil?\s/i, /^zl\s/i] },
  { brand: 'Tetra', patterns: [/tetra/i, /^te[t]?\s/i, /^tet\s/i] },
  { brand: 'Hikari', patterns: [/hikari/i, /^hk\s/i] },
  { brand: 'API', patterns: [/\bapi\b/i] },
  { brand: 'Marineland', patterns: [/marineland/i, /marina/i] },
  { brand: 'Aqueon', patterns: [/aqueon/i, /^aq\s/i] },
  { brand: 'Prevue', patterns: [/prevue/i] },
  { brand: 'Ace', patterns: [/^ace\s/i] },
];

// Detect brand from UPC name
function detectBrand(upcName: string): string | null {
  for (const { brand, patterns } of brandDetectors) {
    for (const pattern of patterns) {
      if (pattern.test(upcName)) return brand;
    }
  }
  return null;
}

// Normalize product brand name
function normBrand(brand: string | null): string {
  if (!brand) return '';
  const b = brand.toLowerCase();
  if (b.includes('penn')) return 'Penn-Plax';
  if (b.includes('lil') || b.includes("li'l")) return "Li'l Pals";
  if (b.includes('zoo')) return 'Zoo Med';
  if (b.includes('fluval')) return 'Fluval';
  if (b.includes('exo')) return 'Exo Terra';
  return brand;
}

// Check if brands are compatible (same brand or UPC has no detectable brand)
function brandsCompatible(productBrand: string, upcBrand: string | null): boolean {
  if (!upcBrand) return true; // No detected brand in UPC, allow match
  return productBrand.toLowerCase() === upcBrand.toLowerCase();
}

// Stop words to ignore
const stopWords = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'has', 'have',
  'pet', 'pets', 'animal', 'animals', 'new', 'pro', 'max',
]);

// Extract words
function getWords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

// Check if two words match
function wordsMatch(w1: string, w2: string): number {
  if (w1 === w2) return 1;
  if (w1.length >= 3 && w2.length >= 3) {
    if (w1.includes(w2) || w2.includes(w1)) return 0.9;
    if (w1.length >= 4 && w2.length >= 4 && w1.substring(0, 4) === w2.substring(0, 4)) return 0.8;
  }
  return 0;
}

// Score match
function scoreMatch(productWords: string[], upcWords: string[]): { score: number; matchCount: number } {
  if (productWords.length === 0 || upcWords.length === 0) return { score: 0, matchCount: 0 };
  
  let totalScore = 0;
  let matchCount = 0;
  
  for (const pw of productWords) {
    let bestMatch = 0;
    for (const uw of upcWords) {
      const m = wordsMatch(pw, uw);
      if (m > bestMatch) bestMatch = m;
    }
    if (bestMatch > 0) {
      totalScore += bestMatch;
      matchCount++;
    }
  }
  
  return { score: totalScore / Math.max(productWords.length, 1), matchCount };
}

async function main() {
  console.log('=== Brand-Validated UPC Matching ===\n');
  
  // Load UPC database
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  console.log(`Loaded ${upcData.length} UPCs`);
  
  // Detect brands in UPC database
  const upcWithBrand: { entry: UpcEntry; brand: string | null; words: string[] }[] = [];
  for (const entry of upcData) {
    const brand = detectBrand(entry.name);
    const words = getWords(entry.name);
    upcWithBrand.push({ entry, brand, words });
  }
  
  const brandCounts = new Map<string, number>();
  for (const u of upcWithBrand) {
    if (u.brand) {
      brandCounts.set(u.brand, (brandCounts.get(u.brand) || 0) + 1);
    }
  }
  console.log('UPCs with detected brands:');
  for (const [b, c] of brandCounts) {
    console.log(`  ${b}: ${c}`);
  }
  
  // Build word index
  const wordIndex = new Map<string, number[]>();
  for (let i = 0; i < upcWithBrand.length; i++) {
    for (const w of upcWithBrand[i].words) {
      const key = w.substring(0, 3);
      if (!wordIndex.has(key)) wordIndex.set(key, []);
      wordIndex.get(key)!.push(i);
    }
  }
  
  // Get products
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  const usedUpcs = new Set(products.filter(p => p.sku?.length >= 10).map(p => p.sku!));
  const targetBrands = ['Penn-Plax', "Li'l Pals", 'Zoo Med', 'Fluval', 'Exo Terra'];
  
  const needsUpc = products.filter(p => 
    (!p.sku || p.sku.length < 10) && 
    targetBrands.includes(normBrand(p.brand))
  );
  
  console.log(`\nProducts needing UPCs: ${needsUpc.length}\n`);
  
  const matches: { id: number; name: string; brand: string; upc: string; upcName: string; score: number }[] = [];
  const assigned = new Set<string>();
  
  for (const p of needsUpc) {
    const productBrand = normBrand(p.brand);
    const productWords = getWords(p.name);
    
    if (productWords.length < 2) continue;
    
    // Find candidates
    const candidateIndices = new Set<number>();
    for (const w of productWords) {
      const key = w.substring(0, 3);
      for (const idx of (wordIndex.get(key) || [])) {
        candidateIndices.add(idx);
      }
    }
    
    let best: { upc: string; name: string; score: number; matchCount: number } | null = null;
    
    for (const idx of candidateIndices) {
      const upcInfo = upcWithBrand[idx];
      if (usedUpcs.has(upcInfo.entry.upc) || assigned.has(upcInfo.entry.upc)) continue;
      
      // CRITICAL: Check brand compatibility
      if (!brandsCompatible(productBrand, upcInfo.brand)) continue;
      
      const { score, matchCount } = scoreMatch(productWords, upcInfo.words);
      
      if (matchCount >= 2 && score >= 0.55) {
        if (!best || score > best.score || (score === best.score && matchCount > best.matchCount)) {
          best = { upc: upcInfo.entry.upc, name: upcInfo.entry.name, score, matchCount };
        }
      }
    }
    
    if (best) {
      matches.push({ 
        id: p.id, 
        name: p.name, 
        brand: productBrand, 
        upc: best.upc, 
        upcName: best.name,
        score: best.score 
      });
      assigned.add(best.upc);
    }
  }
  
  console.log(`Found ${matches.length} matches\n`);
  
  // Show matches by brand
  const byBrand = new Map<string, typeof matches>();
  for (const m of matches) {
    if (!byBrand.has(m.brand)) byBrand.set(m.brand, []);
    byBrand.get(m.brand)!.push(m);
  }
  
  for (const [brand, brandMatches] of byBrand) {
    console.log(`\n=== ${brand}: ${brandMatches.length} matches ===`);
    for (const m of brandMatches.slice(0, 10)) {
      console.log(`  "${m.name}" -> "${m.upcName}" (${(m.score * 100).toFixed(0)}%)`);
    }
    if (brandMatches.length > 10) console.log(`  ... and ${brandMatches.length - 10} more`);
  }
  
  // Apply matches
  if (matches.length > 0) {
    console.log(`\n\nApplying ${matches.length} matches...`);
    
    for (let i = 0; i < matches.length; i += 50) {
      const batch = matches.slice(i, i + 50);
      for (const m of batch) {
        await db.update(supplies).set({ sku: m.upc }).where(sql`${supplies.id} = ${m.id}`);
      }
      console.log(`Applied ${Math.min(i + 50, matches.length)}/${matches.length}`);
    }
  }
  
  // Final stats
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withUpc = final.filter(p => p.sku?.length >= 10).length;
  console.log(`\n=== Final Coverage: ${withUpc}/${final.length} (${(withUpc/final.length*100).toFixed(1)}%) ===`);
  
  process.exit(0);
}

main().catch(console.error);
