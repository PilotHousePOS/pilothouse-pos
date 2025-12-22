import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq } from 'drizzle-orm';

async function main() {
  console.log('=== TARGETED UPC CLEANUP ===\n');
  
  // 1. Remove invalid format UPCs
  console.log('1. Checking UPC format validity...');
  const invalid = await db.execute(sql`
    SELECT id, name, upc FROM supplies
    WHERE upc IS NOT NULL AND (
      LENGTH(upc) < 10 OR LENGTH(upc) > 14 
      OR upc !~ '^[0-9]+$'
    )
  `);
  console.log(`   Found ${invalid.rows.length} invalid format UPCs`);
  
  if (invalid.rows.length > 0) {
    for (const row of invalid.rows) {
      console.log(`   Removing: ${row.name} -> ${row.upc}`);
      await db.update(supplies).set({ upc: null }).where(eq(supplies.id, row.id));
    }
  }
  
  // 2. Check for target brand UPC validity
  console.log('\n2. Verifying target brand UPCs...');
  
  // Oxbow UPCs should start with 744845
  const oxbowCheck = await db.execute(sql`
    SELECT id, name, upc FROM supplies
    WHERE brand = 'Oxbow' AND upc IS NOT NULL
      AND NOT upc LIKE '744845%'
  `);
  console.log(`   Oxbow with wrong prefix: ${oxbowCheck.rows.length}`);
  
  // Show what we're removing
  for (const row of oxbowCheck.rows) {
    console.log(`   Clearing Oxbow mismatch: ${row.name} (${row.upc})`);
    await db.update(supplies).set({ upc: null }).where(eq(supplies.id, row.id));
  }
  
  // Benebone UPCs should start with 854111 or 810054
  const beneboneCheck = await db.execute(sql`
    SELECT id, name, upc FROM supplies
    WHERE brand = 'Benebone' AND upc IS NOT NULL
      AND NOT (upc LIKE '854111%' OR upc LIKE '810054%')
  `);
  console.log(`   Benebone with wrong prefix: ${beneboneCheck.rows.length}`);
  
  for (const row of beneboneCheck.rows) {
    console.log(`   Clearing Benebone mismatch: ${row.name} (${row.upc})`);
    await db.update(supplies).set({ upc: null }).where(eq(supplies.id, row.id));
  }
  
  // SmartBones UPCs should start with 892383 or 810833
  const smartbonesCheck = await db.execute(sql`
    SELECT id, name, upc FROM supplies
    WHERE brand = 'SmartBones' AND upc IS NOT NULL
      AND NOT (upc LIKE '892383%' OR upc LIKE '810833%')
  `);
  console.log(`   SmartBones with wrong prefix: ${smartbonesCheck.rows.length}`);
  
  for (const row of smartbonesCheck.rows) {
    console.log(`   Clearing SmartBones mismatch: ${row.name} (${row.upc})`);
    await db.update(supplies).set({ upc: null }).where(eq(supplies.id, row.id));
  }
  
  // 3. Final verification
  console.log('\n3. Final verification...');
  
  const finalStats = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(upc) as with_upc FROM supplies
  `);
  
  console.log(`   Total: ${finalStats.rows[0].total}`);
  console.log(`   With UPC: ${finalStats.rows[0].with_upc}`);
  console.log(`   Coverage: ${(parseInt(finalStats.rows[0].with_upc) / parseInt(finalStats.rows[0].total) * 100).toFixed(1)}%`);
  
  // Target brand check
  const brandStats = await db.execute(sql`
    SELECT brand, COUNT(*) as total, COUNT(upc) as matched
    FROM supplies
    WHERE brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies')
    GROUP BY brand ORDER BY total DESC
  `);
  
  console.log('\n   Target brands:');
  for (const row of brandStats.rows) {
    const pct = Math.round(parseInt(row.matched) / parseInt(row.total) * 100);
    console.log(`   ${row.brand}: ${row.matched}/${row.total} (${pct}%)`);
  }
  
  process.exit(0);
}

main().catch(console.error);
