import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

const masterUpcs: UpcEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
const maybeUpcs = masterUpcs.filter(u => u.source === 'maybe_inventory');
console.log(`Maybe Inventory UPCs: ${maybeUpcs.length}`);

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[™®©'"]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

const upcByNormName = new Map<string, UpcEntry>();
const upcByLooseName = new Map<string, UpcEntry>();

for (const entry of maybeUpcs) {
  const exact = normalize(entry.name);
  upcByNormName.set(exact, entry);
  
  const loose = entry.name.toLowerCase().replace(/\s+/g, ' ').trim();
  upcByLooseName.set(loose, entry);
}

console.log(`Indexed: ${upcByNormName.size} exact, ${upcByLooseName.size} loose`);

async function main() {
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku
  }).from(supplies);
  
  console.log(`Total products: ${products.length}`);
  
  const noSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Without SKU: ${noSku.length}`);
  
  const matches: { id: number; name: string; upc: string; upcName: string; matchType: string }[] = [];
  
  for (const product of noSku) {
    const exactNorm = normalize(product.name);
    
    if (upcByNormName.has(exactNorm)) {
      const entry = upcByNormName.get(exactNorm)!;
      matches.push({ id: product.id, name: product.name, upc: entry.upc, upcName: entry.name, matchType: 'exact' });
      continue;
    }
    
    const loose = product.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (upcByLooseName.has(loose)) {
      const entry = upcByLooseName.get(loose)!;
      matches.push({ id: product.id, name: product.name, upc: entry.upc, upcName: entry.name, matchType: 'loose' });
    }
  }
  
  console.log(`\nDirect matches: ${matches.length}`);
  console.log(`  Exact: ${matches.filter(m => m.matchType === 'exact').length}`);
  console.log(`  Loose: ${matches.filter(m => m.matchType === 'loose').length}`);
  
  console.log('\nSample matches:');
  for (const m of matches.slice(0, 20)) {
    console.log(`  [${m.matchType}] "${m.name}" => "${m.upcName}" (${m.upc})`);
  }
  
  if (matches.length > 0) {
    console.log('\nApplying...');
    for (const match of matches) {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.id));
    }
    console.log(`Applied ${matches.length}`);
  }
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\nFinal: ${withSku}/${final.length} (${((withSku / final.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
