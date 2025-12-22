import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

const masterUpcs: UpcEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
console.log(`Total master UPCs: ${masterUpcs.length}`);

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[™®©'"]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

const upcByName = new Map<string, UpcEntry>();
for (const entry of masterUpcs) {
  const norm = normalize(entry.name);
  if (!upcByName.has(norm)) {
    upcByName.set(norm, entry);
  }
}
console.log(`Indexed ${upcByName.size} unique names`);

async function main() {
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku
  }).from(supplies);
  
  console.log(`Total products: ${products.length}`);
  
  const noSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Without SKU: ${noSku.length}`);
  
  const matches: { id: number; dbName: string; srcName: string; upc: string; source: string }[] = [];
  
  for (const product of noSku) {
    const norm = normalize(product.name);
    const entry = upcByName.get(norm);
    if (entry) {
      matches.push({
        id: product.id,
        dbName: product.name,
        srcName: entry.name,
        upc: entry.upc,
        source: entry.source
      });
    }
  }
  
  console.log(`\nDirect matches: ${matches.length}`);
  
  const bySource: Record<string, number> = {};
  for (const m of matches) {
    bySource[m.source] = (bySource[m.source] || 0) + 1;
  }
  console.log('\nBy source:');
  Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([s, c]) => {
    console.log(`  ${s}: ${c}`);
  });
  
  console.log('\nSample:');
  for (const m of matches.slice(0, 15)) {
    console.log(`  "${m.dbName}" => (${m.upc})`);
  }
  
  if (matches.length > 0) {
    console.log('\nApplying...');
    for (const m of matches) {
      await db.update(supplies)
        .set({ sku: m.upc })
        .where(eq(supplies.id, m.id));
    }
    console.log(`Applied ${matches.length}`);
  }
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\nFinal: ${withSku}/${final.length} (${((withSku / final.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
