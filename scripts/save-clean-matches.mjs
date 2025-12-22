import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('=== SAVING CLEAN VERIFIED MATCHES ===\n');
  
  // Get all matches
  const allMatches = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    upc: supplies.upc
  }).from(supplies).where(sql`upc IS NOT NULL`);
  
  console.log(`Total items with UPC: ${allMatches.length}`);
  
  // Verify no duplicate UPCs (each UPC should appear only once in verified matches)
  const upcCounts = {};
  for (const m of allMatches) {
    upcCounts[m.upc] = (upcCounts[m.upc] || 0) + 1;
  }
  
  const dupes = Object.entries(upcCounts).filter(([_, count]) => count > 1);
  console.log(`Duplicate UPCs: ${dupes.length}`);
  
  // Show duplicate stats
  if (dupes.length > 0) {
    const counts = dupes.map(([_, c]) => c);
    const max = Math.max(...counts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    console.log(`  Max items per UPC: ${max}`);
    console.log(`  Avg items per UPC: ${avg.toFixed(1)}`);
  }
  
  // Get unique UPC count
  const uniqueUpcs = new Set(allMatches.map(m => m.upc));
  console.log(`Unique UPCs: ${uniqueUpcs.size}`);
  
  // Target brand breakdown
  console.log('\n=== TARGET BRAND FINAL STATS ===');
  const targetBrands = ['Oxbow', 'Benebone', 'SmartBones', 'Barkworthies'];
  
  for (const brand of targetBrands) {
    const items = allMatches.filter(m => m.brand === brand);
    const totalBrand = await db.select({ count: sql<number>`count(*)::int` })
      .from(supplies).where(sql`brand = ${brand}`);
    
    const upcs = new Set(items.map(i => i.upc));
    console.log(`${brand}: ${items.length}/${totalBrand[0].count} (${upcs.size} unique UPCs)`);
    
    // Show sample matches
    items.slice(0, 3).forEach(i => {
      console.log(`  ${i.name} -> ${i.upc}`);
    });
  }
  
  // Save to file
  const output = {
    generatedAt: new Date().toISOString(),
    totalMatches: allMatches.length,
    uniqueUpcs: uniqueUpcs.size,
    matches: allMatches.map(m => ({
      supplyId: m.id,
      upc: m.upc,
      name: m.name,
      brand: m.brand || ''
    }))
  };
  
  fs.writeFileSync('scripts/confirmed_upc_matches.json', JSON.stringify(output, null, 2));
  console.log(`\nSaved ${allMatches.length} matches to scripts/confirmed_upc_matches.json`);
  
  // Overall stats
  const totalSupplies = await db.select({ count: sql<number>`count(*)::int` }).from(supplies);
  console.log(`\n=== OVERALL COVERAGE ===`);
  console.log(`${allMatches.length}/${totalSupplies[0].count} (${(allMatches.length / totalSupplies[0].count * 100).toFixed(1)}%)`);
  
  process.exit(0);
}

main().catch(console.error);
