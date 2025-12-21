import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

// Brand name patterns to detect in UPC entries - STRICT MATCHING
const brandFilters: { brand: string; patterns: RegExp[] }[] = [
  { brand: 'Penn-Plax', patterns: [/penn[- ]?plax/i, /pennplax/i] },
  { brand: "Li'l Pals", patterns: [/li'?l\s*pals?/i, /lil\s*pals?/i, /lilpals/i] },
  { brand: 'Zoo Med', patterns: [/zoo\s*med/i, /^zml\b/i, /^zm\s/i, /zoomed/i] },
  { brand: 'Fluval', patterns: [/fluval/i, /^flu[v\s]/i] },
  { brand: 'Exo Terra', patterns: [/exo[- ]?terra/i, /exoterra/i] },
];

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

// Get UPCs that match a specific brand
function getUpcsByBrand(upcData: UpcEntry[], brand: string): UpcEntry[] {
  const filter = brandFilters.find(f => f.brand === brand);
  if (!filter) return [];
  
  return upcData.filter(e => filter.patterns.some(p => p.test(e.name)));
}

// Extract words for matching
function getWords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

// Score match between product and UPC (word overlap)
function scoreMatch(productWords: string[], upcWords: string[]): { score: number; matchCount: number } {
  let matches = 0;
  for (const pw of productWords) {
    for (const uw of upcWords) {
      if (pw === uw || (pw.length >= 4 && uw.length >= 4 && (pw.includes(uw) || uw.includes(pw)))) {
        matches++;
        break;
      }
    }
  }
  return { score: productWords.length > 0 ? matches / productWords.length : 0, matchCount: matches };
}

async function main() {
  console.log('=== Strict Brand-Only UPC Matching ===\n');
  
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  console.log(`Loaded ${upcData.length} UPCs`);
  
  // Show UPC counts per brand
  for (const filter of brandFilters) {
    const count = upcData.filter(e => filter.patterns.some(p => p.test(e.name))).length;
    console.log(`  ${filter.brand}: ${count} UPCs`);
  }
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  const usedUpcs = new Set(products.filter(p => p.sku?.length >= 10).map(p => p.sku!));
  const targetBrands = brandFilters.map(f => f.brand);
  
  const needsUpc = products.filter(p => 
    (!p.sku || p.sku.length < 10) && 
    targetBrands.includes(normBrand(p.brand))
  );
  
  console.log(`\nProducts needing UPCs: ${needsUpc.length}\n`);
  
  const matches: { id: number; name: string; brand: string; upc: string; upcName: string; score: number }[] = [];
  const assigned = new Set<string>();
  
  for (const p of needsUpc) {
    const productBrand = normBrand(p.brand);
    const brandUpcs = getUpcsByBrand(upcData, productBrand);
    
    if (brandUpcs.length === 0) continue;
    
    const productWords = getWords(p.name);
    if (productWords.length < 2) continue;
    
    let best: { upc: string; name: string; score: number; matchCount: number } | null = null;
    
    for (const entry of brandUpcs) {
      if (usedUpcs.has(entry.upc) || assigned.has(entry.upc)) continue;
      
      const upcWords = getWords(entry.name);
      const { score, matchCount } = scoreMatch(productWords, upcWords);
      
      // Require at least 2 matching words and 50% score
      if (matchCount >= 2 && score >= 0.5) {
        if (!best || score > best.score || (score === best.score && matchCount > best.matchCount)) {
          best = { upc: entry.upc, name: entry.name, score, matchCount };
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
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withUpc = final.filter(p => p.sku?.length >= 10).length;
  console.log(`\n=== Final Coverage: ${withUpc}/${final.length} (${(withUpc/final.length*100).toFixed(1)}%) ===`);
  
  process.exit(0);
}

main().catch(console.error);
