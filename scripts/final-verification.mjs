import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq } from 'drizzle-orm';

async function main() {
  console.log('=== FINAL VERIFICATION & CLEANUP ===\n');
  
  // Check for obvious mismatches in target brands
  console.log('1. Checking Oxbow for mismatches...');
  const oxbowItems = await db.select().from(supplies)
    .where(sql`brand = 'Oxbow' AND upc IS NOT NULL`);
  
  let oxbowBad = 0;
  for (const item of oxbowItems) {
    // Oxbow UPCs should start with 744845
    if (!item.upc.startsWith('744845')) {
      console.log(`   BAD: ${item.name} -> ${item.upc}`);
      await db.update(supplies).set({ upc: null }).where(eq(supplies.id, item.id));
      oxbowBad++;
    }
  }
  console.log(`   Removed ${oxbowBad} bad Oxbow UPCs\n`);
  
  // 2. Check duplicate UPCs within target brands - same UPC shouldn't be on 2+ items
  console.log('2. Checking for duplicate UPCs within target brands...');
  const dupes = await db.execute(sql`
    SELECT upc, COUNT(*) as cnt, array_agg(name) as names
    FROM supplies
    WHERE brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies') 
      AND upc IS NOT NULL
    GROUP BY upc HAVING COUNT(*) > 1
  `);
  
  console.log(`   Found ${dupes.rows.length} duplicate UPCs`);
  for (const dupe of dupes.rows) {
    console.log(`   ${dupe.upc}: ${dupe.names.join(', ')}`);
    // Keep first, remove rest
    const items = await db.select().from(supplies)
      .where(sql`upc = ${dupe.upc} AND brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies')`)
      .orderBy(supplies.id);
    
    for (let i = 1; i < items.length; i++) {
      await db.update(supplies).set({ upc: null }).where(eq(supplies.id, items[i].id));
      console.log(`     Cleared duplicate from: ${items[i].name}`);
    }
  }
  
  // 3. Final stats
  console.log('\n3. Final target brand stats:');
  const brandStats = await db.execute(sql`
    SELECT brand, COUNT(*) as total, COUNT(upc) as matched,
      COUNT(DISTINCT upc) as unique_upcs
    FROM supplies
    WHERE brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies')
    GROUP BY brand ORDER BY total DESC
  `);
  
  for (const row of brandStats.rows) {
    const pct = Math.round(parseInt(row.matched) / parseInt(row.total) * 100);
    console.log(`   ${row.brand}: ${row.matched}/${row.total} (${pct}%) - ${row.unique_upcs} unique`);
  }
  
  // Overall coverage
  const overall = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(upc) as matched, COUNT(DISTINCT upc) as unique_upcs
    FROM supplies
  `);
  
  console.log(`\n   Overall: ${overall.rows[0].matched}/${overall.rows[0].total} (${(parseInt(overall.rows[0].matched) / parseInt(overall.rows[0].total) * 100).toFixed(1)}%)`);
  console.log(`   Unique UPCs: ${overall.rows[0].unique_upcs}`);
  
  process.exit(0);
}

main().catch(console.error);
