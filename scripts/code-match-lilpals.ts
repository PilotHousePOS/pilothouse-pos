import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

async function main() {
  console.log("=== Li'l Pals Direct Code Matching ===\n");
  
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  
  // Build index of Li'l Pals UPCs by product code
  const codePattern = /\b([A-Z]{2,4}\d{2})\b/i;
  const upcByCode = new Map<string, UpcEntry>();
  
  for (const entry of upcData) {
    if (/li'?l\s*pals?|lilpals/i.test(entry.name)) {
      const match = entry.name.match(codePattern);
      if (match) {
        const code = match[1].toUpperCase();
        if (!upcByCode.has(code)) {
          upcByCode.set(code, entry);
        }
      }
    }
  }
  
  console.log(`Li'l Pals UPCs indexed by code: ${upcByCode.size}`);
  
  // Get all products
  const allProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  // Track used UPCs
  const usedUpcs = new Set(allProducts.filter(p => p.sku && p.sku.length >= 10).map(p => p.sku!));
  
  // Get Li'l Pals products needing UPCs
  const needsUpc = allProducts.filter(p => 
    (!p.sku || p.sku.length < 10) && 
    (p.brand?.toLowerCase().includes('lil') || p.name.toLowerCase().includes('lilpals'))
  );
  
  console.log(`Li'l Pals products needing UPCs: ${needsUpc.length}`);
  
  const matches: { id: number; name: string; upc: string; upcName: string; code: string }[] = [];
  
  for (const p of needsUpc) {
    const match = p.name.match(codePattern);
    if (match) {
      const code = match[1].toUpperCase();
      const upcEntry = upcByCode.get(code);
      
      if (upcEntry && !usedUpcs.has(upcEntry.upc)) {
        matches.push({
          id: p.id,
          name: p.name,
          upc: upcEntry.upc,
          upcName: upcEntry.name,
          code
        });
        usedUpcs.add(upcEntry.upc);
        console.log(`  ✓ "${p.name}" → ${upcEntry.upc} (code: ${code})`);
      }
    }
  }
  
  console.log(`\nTotal matches: ${matches.length}`);
  
  // Apply matches
  if (matches.length > 0) {
    console.log('\nApplying to database...');
    for (const m of matches) {
      await db.update(supplies).set({ sku: m.upc }).where(eq(supplies.id, m.id));
    }
    
    // Check new coverage
    const updated = await db.select({ 
      total: sql<number>`COUNT(*)`,
      withUpc: sql<number>`COUNT(CASE WHEN sku IS NOT NULL AND LENGTH(sku) >= 10 THEN 1 END)`
    }).from(supplies);
    
    const total = Number(updated[0].total);
    const withUpc = Number(updated[0].withUpc);
    console.log(`\nNew coverage: ${withUpc} / ${total} = ${(withUpc/total*100).toFixed(1)}%`);
    console.log(`Need ${Math.ceil(total * 0.80) - withUpc} more for 80%`);
  }
}

main().catch(console.error);
