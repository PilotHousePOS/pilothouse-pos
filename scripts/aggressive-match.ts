import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

function extractSignificantWords(s: string): Set<string> {
  const words = s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  const stopWords = new Set(['with', 'from', 'that', 'this', 'have', 'pack', 'size', 'small', 'medium', 'large', 'extra', 'mini', 'super', 'item', 'product', 'pcs', 'piece']);
  return new Set(words.filter(w => !stopWords.has(w)));
}

async function main() {
  console.log("=== Aggressive Single-Word Matching ===\n");
  
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
  
  const wordToUpcs = new Map<string, UpcEntry[]>();
  for (const upc of upcData) {
    if (usedUpcs.has(upc.upc)) continue;
    const words = extractSignificantWords(upc.name);
    for (const w of words) {
      if (!wordToUpcs.has(w)) wordToUpcs.set(w, []);
      wordToUpcs.get(w)!.push(upc);
    }
  }
  
  console.log(`Indexed ${wordToUpcs.size} unique words\n`);
  
  const matches: { id: number; name: string; upc: string }[] = [];
  const TARGET = 50;
  
  for (const p of needsUpc) {
    if (matches.length >= TARGET) break;
    
    const pWords = extractSignificantWords(p.name);
    const brandWord = p.brand ? extractSignificantWords(p.brand).values().next().value : null;
    
    const candidates = new Map<string, { upc: UpcEntry, score: number }>();
    
    for (const pw of pWords) {
      const upcs = wordToUpcs.get(pw) || [];
      for (const upc of upcs) {
        if (usedUpcs.has(upc.upc)) continue;
        
        const uWords = extractSignificantWords(upc.name);
        const hasBrand = brandWord && uWords.has(brandWord);
        
        let matchCount = 0;
        for (const pw2 of pWords) {
          if (uWords.has(pw2)) matchCount++;
        }
        
        const score = hasBrand ? matchCount + 0.5 : matchCount;
        
        if (!candidates.has(upc.upc) || candidates.get(upc.upc)!.score < score) {
          candidates.set(upc.upc, { upc, score });
        }
      }
    }
    
    let best: { upc: UpcEntry, score: number } | null = null;
    for (const c of candidates.values()) {
      if (!best || c.score > best.score) best = c;
    }
    
    if (best && best.score >= 1) {
      matches.push({ id: p.id, name: p.name, upc: best.upc.upc });
      usedUpcs.add(best.upc.upc);
      if (matches.length <= 30) {
        console.log(`✓ "${p.name}" → ${best.upc.upc} (score: ${best.score})`);
      }
    }
  }
  
  if (matches.length > 30) {
    console.log(`... and ${matches.length - 30} more`);
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
