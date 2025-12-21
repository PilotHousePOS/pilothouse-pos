import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

// Build word index once
function buildIndex(entries: UpcEntry[]): Map<string, UpcEntry[]> {
  const index = new Map<string, UpcEntry[]>();
  for (const e of entries) {
    const words = e.name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    for (const w of words) {
      if (!index.has(w)) index.set(w, []);
      index.get(w)!.push(e);
    }
  }
  return index;
}

async function main() {
  console.log('=== Quick Match ===');
  
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  const index = buildIndex(upcData);
  console.log(`Built index from ${upcData.length} UPCs`);
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  const usedUpcs = new Set(products.filter(p => p.sku?.length >= 10).map(p => p.sku!));
  const needsUpc = products.filter(p => !p.sku || p.sku.length < 10);
  console.log(`Need UPC: ${needsUpc.length}`);
  
  const matches: { id: number; upc: string; score: number }[] = [];
  const assigned = new Set<string>();
  
  for (const p of needsUpc) {
    const text = `${p.brand || ''} ${p.name}`.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const words = text.split(/\s+/).filter(w => w.length > 2);
    
    // Find candidates with word overlap
    const scores = new Map<string, number>();
    for (const w of words) {
      for (const e of (index.get(w) || [])) {
        if (usedUpcs.has(e.upc) || assigned.has(e.upc)) continue;
        scores.set(e.upc, (scores.get(e.upc) || 0) + 1);
      }
    }
    
    // Find best match with 3+ words and 70%+ coverage
    let best: { upc: string; score: number } | null = null;
    for (const [upc, count] of scores) {
      if (count < 3) continue;
      const entry = upcData.find(e => e.upc === upc);
      if (!entry) continue;
      const upcWords = entry.name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
      const score = upcWords.length > 0 ? count / upcWords.length : 0;
      if (score >= 0.7 && (!best || score > best.score)) {
        best = { upc, score };
      }
    }
    
    if (best) {
      matches.push({ id: p.id, upc: best.upc, score: best.score });
      assigned.add(best.upc);
    }
  }
  
  console.log(`Found ${matches.length} matches`);
  
  // Apply in batches
  for (let i = 0; i < matches.length; i += 50) {
    const batch = matches.slice(i, i + 50);
    for (const m of batch) {
      await db.update(supplies).set({ sku: m.upc }).where(sql`${supplies.id} = ${m.id}`);
    }
    console.log(`Applied ${Math.min(i + 50, matches.length)}/${matches.length}`);
  }
  
  // Stats
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withUpc = final.filter(p => p.sku?.length >= 10).length;
  console.log(`\nCoverage: ${withUpc}/${final.length} (${(withUpc/final.length*100).toFixed(1)}%)`);
}

main().catch(console.error);
