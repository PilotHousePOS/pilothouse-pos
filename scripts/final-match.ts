import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

async function main() {
  console.log("=== Final Specific Matching ===\n");
  
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  
  const allProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  const usedUpcs = new Set(allProducts.filter(p => p.sku && p.sku.length >= 10).map(p => p.sku!));
  const needsUpc = allProducts.filter(p => !p.sku || p.sku.length < 10);
  
  const specificMatches: [RegExp, RegExp][] = [
    [/exo.*daytime.*heat.*60/i, /exo.*terra.*daytime.*heat.*60/i],
    [/exo.*daytime.*heat.*100/i, /exo.*terra.*daytime.*heat.*100/i],
    [/exo.*daytime.*heat.*150/i, /exo.*terra.*daytime.*heat.*150/i],
    [/exo.*daytime.*heat.*40/i, /exo.*terra.*daytime.*heat.*40/i],
    [/exo.*daytime.*heat.*25/i, /exo.*terra.*daytime.*heat.*25/i],
    [/exo.*ceramic.*150/i, /ceramic.*150/i],
    [/exo.*ceramic.*100/i, /ceramic.*100/i],
    [/exo.*ceramic.*60/i, /ceramic.*60/i],
    [/exo.*ceramic.*40/i, /ceramic.*40/i],
    [/zilla.*day.*blue.*75/i, /zilla.*day.*blue.*75/i],
    [/zilla.*night.*red.*100/i, /zilla.*night.*red.*100/i],
    [/zilla.*heat.*mat.*mini/i, /zilla.*heat.*mat.*mini/i],
    [/zilla.*jungle.*mix/i, /zilla.*jungle.*mix/i],
    [/zilla.*halogen.*50.*red/i, /zilla.*halogen.*50/i],
    [/zilla.*halogen.*25.*white/i, /zilla.*halogen.*25/i],
    [/zilla.*halogen.*25.*blue/i, /zilla.*halogen.*25.*blue/i],
    [/exo.*cricket.*pen/i, /cricket.*pen|cricket.*keeper/i],
    [/exo.*thermometer/i, /thermometer/i],
    [/fluval.*plant.*46/i, /fluval.*plant.*46/i],
    [/fluval.*betta/i, /fluval.*betta/i],
    [/fluval.*biofoam.*206/i, /fluval.*biofoam.*206/i],
    [/fluval.*biomax.*500/i, /fluval.*biomax.*500/i],
    [/oxbow.*hay.*timothy/i, /oxbow.*hay.*timothy/i],
    [/kaytee.*chinchilla/i, /kaytee.*chinchilla/i],
  ];
  
  const matches: { id: number; name: string; upc: string }[] = [];
  
  for (const [productPattern, upcPattern] of specificMatches) {
    const product = needsUpc.find(p => productPattern.test(p.name));
    if (!product) continue;
    if (matches.some(m => m.id === product.id)) continue;
    
    const upc = upcData.find(u => upcPattern.test(u.name) && !usedUpcs.has(u.upc));
    if (!upc) continue;
    
    matches.push({ id: product.id, name: product.name, upc: upc.upc });
    usedUpcs.add(upc.upc);
    console.log(`✓ "${product.name}" → ${upc.upc}`);
  }
  
  console.log(`\nMatches from specific patterns: ${matches.length}`);
  
  for (const p of needsUpc) {
    if (matches.some(m => m.id === p.id)) continue;
    
    const pWords = p.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 5);
    
    for (const upc of upcData) {
      if (usedUpcs.has(upc.upc)) continue;
      
      const uWords = upc.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 5);
      
      let matchCount = 0;
      for (const pw of pWords) {
        if (uWords.includes(pw)) matchCount++;
      }
      
      if (matchCount >= 3 || (matchCount >= 2 && pWords.length <= 3)) {
        matches.push({ id: p.id, name: p.name, upc: upc.upc });
        usedUpcs.add(upc.upc);
        console.log(`✓ "${p.name}" → ${upc.upc} (${matchCount} words)`);
        break;
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
