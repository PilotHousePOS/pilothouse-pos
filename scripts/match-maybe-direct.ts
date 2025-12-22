import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface MaybeEntry {
  upc: string;
  name: string;
  source: string;
}

const allMaybe: MaybeEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
console.log(`Total Maybe entries: ${allMaybe.length}`);

const uniqueMaybe = allMaybe.slice(0, 3171);
console.log(`Using first 3171 unique entries`);

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[™®©'"]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

const upcByName = new Map<string, MaybeEntry>();
for (const entry of uniqueMaybe) {
  const norm = normalize(entry.name);
  if (!upcByName.has(norm)) {
    upcByName.set(norm, entry);
  }
}
console.log(`Indexed ${upcByName.size} unique normalized names`);

async function main() {
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku
  }).from(supplies);
  
  console.log(`Total products: ${products.length}`);
  
  const noSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Without SKU: ${noSku.length}`);
  
  const matches: { id: number; dbName: string; maybeName: string; upc: string }[] = [];
  
  for (const product of noSku) {
    const norm = normalize(product.name);
    const entry = upcByName.get(norm);
    if (entry) {
      matches.push({
        id: product.id,
        dbName: product.name,
        maybeName: entry.name,
        upc: entry.upc
      });
    }
  }
  
  console.log(`\nDirect matches: ${matches.length}`);
  
  console.log('\nSample:');
  for (const m of matches.slice(0, 20)) {
    console.log(`  "${m.dbName}" => "${m.maybeName}" (${m.upc})`);
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
