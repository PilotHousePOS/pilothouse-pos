import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

function normalizeText(text: string): string {
  return text.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWords(text: string): string[] {
  return normalizeText(text).split(' ').filter(w => w.length >= 2);
}

function matchScore(productWords: string[], upcWords: string[]): number {
  if (productWords.length === 0) return 0;
  
  let matches = 0;
  for (const pw of productWords) {
    for (const uw of upcWords) {
      if (pw === uw) {
        matches++;
        break;
      }
      if (pw.length >= 4 && uw.length >= 4) {
        if (pw.startsWith(uw.slice(0, 4)) || uw.startsWith(pw.slice(0, 4))) {
          matches += 0.5;
          break;
        }
      }
    }
  }
  
  return matches / productWords.length;
}

async function main() {
  console.log("=== Targeted Brand UPC Matching ===\n");
  
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  
  const brands = [
    { name: 'Zilla', pattern: /zilla/i },
    { name: 'Kaytee', pattern: /kaytee/i },
    { name: 'Marineland', pattern: /marineland/i },
    { name: 'Aqueon', pattern: /aqueon/i },
    { name: 'Oxbow', pattern: /oxbow/i },
    { name: 'Flukers', pattern: /fluker/i },
    { name: 'Tetra', pattern: /\btetra\b/i },
    { name: 'Hikari', pattern: /hikari/i },
  ];
  
  const allProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  const usedUpcs = new Set(allProducts.filter(p => p.sku && p.sku.length >= 10).map(p => p.sku!));
  
  const allMatches: { id: number; name: string; upc: string; brand: string }[] = [];
  const THRESHOLD = 0.5;
  
  for (const brand of brands) {
    const brandUpcs = upcData.filter(e => brand.pattern.test(e.name));
    const brandProducts = allProducts.filter(p => 
      (!p.sku || p.sku.length < 10) && 
      (brand.pattern.test(p.brand || '') || brand.pattern.test(p.name))
    );
    
    console.log(`\n${brand.name}: ${brandProducts.length} products, ${brandUpcs.length} UPCs`);
    
    for (const p of brandProducts) {
      const pWords = extractWords(p.name);
      let bestMatch: UpcEntry | null = null;
      let bestScore = 0;
      
      for (const upc of brandUpcs) {
        if (usedUpcs.has(upc.upc)) continue;
        const uWords = extractWords(upc.name);
        const score = matchScore(pWords, uWords);
        if (score > bestScore && score >= THRESHOLD) {
          bestScore = score;
          bestMatch = upc;
        }
      }
      
      if (bestMatch) {
        allMatches.push({
          id: p.id,
          name: p.name,
          upc: bestMatch.upc,
          brand: brand.name
        });
        usedUpcs.add(bestMatch.upc);
        console.log(`  ✓ "${p.name}" → ${bestMatch.upc} (${(bestScore*100).toFixed(0)}%)`);
      }
    }
  }
  
  console.log(`\n=== Total matches: ${allMatches.length} ===`);
  
  if (allMatches.length > 0) {
    console.log('\nApplying matches...');
    for (const m of allMatches) {
      await db.update(supplies).set({ sku: m.upc }).where(eq(supplies.id, m.id));
    }
    console.log('Done!');
  }
  
  const updated = await db.select({ 
    total: sql<number>`COUNT(*)`,
    withUpc: sql<number>`COUNT(CASE WHEN sku IS NOT NULL AND LENGTH(sku) >= 10 THEN 1 END)`
  }).from(supplies);
  
  const total = Number(updated[0].total);
  const withUpc = Number(updated[0].withUpc);
  console.log(`\nCurrent coverage: ${withUpc} / ${total} = ${(withUpc/total*100).toFixed(1)}%`);
  console.log(`Need ${Math.ceil(total * 0.80) - withUpc} more for 80%`);
  
  process.exit(0);
}

main().catch(console.error);
