import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getKeyTerms(s: string): Set<string> {
  const terms = new Set<string>();
  const words = s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  for (const w of words) {
    if (!/^(the|and|for|with|from)$/.test(w)) {
      terms.add(w);
    }
  }
  return terms;
}

async function main() {
  console.log("=== Relaxed UPC Matching ===\n");
  
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
  console.log(`UPCs in database: ${upcData.length}`);
  console.log(`UPCs already used: ${usedUpcs.size}\n`);
  
  const availableUpcs = upcData.filter(u => !usedUpcs.has(u.upc));
  console.log(`Available UPCs: ${availableUpcs.length}\n`);
  
  const upcIndex = new Map<string, UpcEntry[]>();
  for (const upc of availableUpcs) {
    const terms = getKeyTerms(upc.name);
    for (const term of terms) {
      if (!upcIndex.has(term)) upcIndex.set(term, []);
      upcIndex.get(term)!.push(upc);
    }
  }
  
  const matches: { id: number; name: string; upc: string; confidence: number }[] = [];
  
  for (const p of needsUpc) {
    const pTerms = getKeyTerms(p.name);
    const brandTerm = p.brand ? normalize(p.brand) : null;
    
    const candidates = new Map<string, number>();
    
    for (const term of pTerms) {
      const upcMatches = upcIndex.get(term) || [];
      for (const upc of upcMatches) {
        if (usedUpcs.has(upc.upc)) continue;
        const current = candidates.get(upc.upc) || 0;
        candidates.set(upc.upc, current + 1);
      }
    }
    
    let bestUpc: string | null = null;
    let bestScore = 0;
    let bestName = '';
    
    for (const [upc, matchCount] of candidates) {
      const upcEntry = availableUpcs.find(u => u.upc === upc)!;
      const uTerms = getKeyTerms(upcEntry.name);
      
      let hasBrand = false;
      if (brandTerm && uTerms.has(brandTerm)) hasBrand = true;
      
      const overlap = matchCount / Math.min(pTerms.size, uTerms.size);
      const score = hasBrand ? overlap * 1.5 : overlap;
      
      if (score > bestScore && matchCount >= 2) {
        bestScore = score;
        bestUpc = upc;
        bestName = upcEntry.name;
      }
    }
    
    if (bestUpc && bestScore >= 0.5) {
      matches.push({
        id: p.id,
        name: p.name,
        upc: bestUpc,
        confidence: bestScore
      });
      usedUpcs.add(bestUpc);
      if (matches.length <= 50) {
        console.log(`✓ "${p.name}" → ${bestUpc} (${(bestScore*100).toFixed(0)}%)`);
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
