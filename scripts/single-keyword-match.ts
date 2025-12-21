import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

function getUniqueTerms(s: string): string[] {
  const words = s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  const stopWords = new Set(['with', 'from', 'that', 'this', 'have', 'pack', 'size', 'small', 'medium', 'large', 'extra', 'mini', 'super']);
  return words.filter(w => !stopWords.has(w));
}

async function main() {
  console.log("=== Single Keyword Brand Matching ===\n");
  
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  
  const allProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  const usedUpcs = new Set(allProducts.filter(p => p.sku && p.sku.length >= 10).map(p => p.sku!));
  const needsUpc = allProducts.filter(p => !p.sku || p.sku.length < 10);
  
  console.log(`Products needing UPCs: ${needsUpc.length}`);
  
  const brands = ['coastal', 'exo terra', 'exoterra', 'fluval', 'zilla', 'kaytee', 'tetra', 'marineland', 'hikari', 'aqueon', 'penn-plax', 'pennplax', 'zoo med', 'zoomed'];
  
  const matches: { id: number; name: string; upc: string }[] = [];
  
  for (const brandKey of brands) {
    const brandPattern = new RegExp(brandKey.replace('-', '.').replace(' ', '\\s*'), 'i');
    
    const brandUpcs = upcData.filter(e => 
      brandPattern.test(e.name) && !usedUpcs.has(e.upc)
    );
    
    const brandProducts = needsUpc.filter(p => 
      (p.brand && brandPattern.test(p.brand)) || brandPattern.test(p.name)
    );
    
    if (brandProducts.length === 0 || brandUpcs.length === 0) continue;
    
    console.log(`\n${brandKey.toUpperCase()}: ${brandProducts.length} products, ${brandUpcs.length} available UPCs`);
    
    for (const p of brandProducts) {
      if (matches.some(m => m.id === p.id)) continue;
      
      const pTerms = getUniqueTerms(p.name);
      
      let bestMatch: UpcEntry | null = null;
      let bestMatchCount = 0;
      
      for (const upc of brandUpcs) {
        if (usedUpcs.has(upc.upc)) continue;
        
        const uTerms = getUniqueTerms(upc.name);
        
        let matchCount = 0;
        for (const pt of pTerms) {
          for (const ut of uTerms) {
            if (pt === ut || 
                (pt.length >= 5 && ut.includes(pt)) || 
                (ut.length >= 5 && pt.includes(ut))) {
              matchCount++;
              break;
            }
          }
        }
        
        if (matchCount > bestMatchCount) {
          bestMatchCount = matchCount;
          bestMatch = upc;
        }
      }
      
      if (bestMatch && bestMatchCount >= 1) {
        matches.push({ id: p.id, name: p.name, upc: bestMatch.upc });
        usedUpcs.add(bestMatch.upc);
        if (matches.length <= 30) {
          console.log(`  ✓ "${p.name}" → ${bestMatch.upc} (${bestMatchCount} keywords)`);
        }
      }
    }
  }
  
  console.log(`\n=== Total matches: ${matches.length} ===`);
  
  if (matches.length > 0) {
    console.log('\nApplying matches...');
    for (const m of matches) {
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
