import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq, and, notLike, like, or, isNull } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

async function main() {
  console.log("=== Fix Li'l Pals UPC Misassignments ===\n");
  
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  
  const codePattern = /\b([A-Z]{2,5}\d{2})\b/i;
  
  const lilpalsUpcs = new Set<string>();
  const upcByCode = new Map<string, UpcEntry>();
  
  for (const entry of upcData) {
    if (/li'?l\s*pals?|lilpals/i.test(entry.name)) {
      lilpalsUpcs.add(entry.upc);
      const match = entry.name.match(codePattern);
      if (match) {
        const code = match[1].toUpperCase();
        if (!upcByCode.has(code)) {
          upcByCode.set(code, entry);
        }
      }
    }
  }
  
  console.log(`Li'l Pals UPCs in database: ${lilpalsUpcs.size}`);
  console.log(`Li'l Pals UPCs with codes: ${upcByCode.size}\n`);
  
  const wronglyAssigned = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies)
    .where(
      and(
        sql`sku IN (${sql.join([...lilpalsUpcs].map(u => sql`${u}`), sql`, `)})`,
        sql`LOWER(name) NOT LIKE '%lilpals%'`,
        sql`LOWER(name) NOT LIKE '%lil pals%'`,
        sql`LOWER(COALESCE(brand, '')) NOT LIKE '%lil%'`
      )
    );
  
  console.log(`Products with Li'l Pals UPCs that aren't Li'l Pals: ${wronglyAssigned.length}`);
  
  for (const p of wronglyAssigned.slice(0, 10)) {
    console.log(`  - "${p.name}" (${p.brand}) has ${p.sku}`);
  }
  if (wronglyAssigned.length > 10) {
    console.log(`  ... and ${wronglyAssigned.length - 10} more`);
  }
  
  if (wronglyAssigned.length > 0) {
    console.log(`\nClearing ${wronglyAssigned.length} wrong assignments...`);
    for (const p of wronglyAssigned) {
      await db.update(supplies).set({ sku: null }).where(eq(supplies.id, p.id));
    }
    console.log('Done clearing.\n');
  }
  
  const allProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  const usedUpcs = new Set(allProducts.filter(p => p.sku && p.sku.length >= 10).map(p => p.sku!));
  
  const needsUpc = allProducts.filter(p => 
    (!p.sku || p.sku.length < 10) && 
    (p.brand?.toLowerCase().includes('lil') || 
     p.name.toLowerCase().includes('lilpals') ||
     p.name.toLowerCase().includes('lil pals'))
  );
  
  console.log(`Li'l Pals products needing UPCs: ${needsUpc.length}`);
  
  const matches: { id: number; name: string; upc: string; code: string }[] = [];
  
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
          code
        });
        usedUpcs.add(upcEntry.upc);
        console.log(`  ✓ "${p.name}" → ${upcEntry.upc} (code: ${code})`);
      }
    }
  }
  
  console.log(`\nMatches found: ${matches.length}`);
  
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
}

main().catch(console.error);
