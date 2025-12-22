import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq } from 'drizzle-orm';

async function main() {
  console.log('=== DEEP CLEAN: REMOVING CROSS-BRAND UPC ERRORS ===\n');
  
  // Find UPCs used across different brands (these are wrong)
  const crossBrand = await db.execute(sql`
    SELECT upc, array_agg(DISTINCT brand) as brands, COUNT(*) as product_count
    FROM supplies 
    WHERE upc IS NOT NULL AND brand IS NOT NULL AND brand != ''
    GROUP BY upc 
    HAVING COUNT(DISTINCT brand) > 1
  `);
  
  console.log(`Found ${crossBrand.rows.length} UPCs incorrectly shared across brands\n`);
  
  let cleared = 0;
  for (const row of crossBrand.rows) {
    // Clear this UPC from ALL products (can't trust any of them)
    await db.update(supplies)
      .set({ upc: null })
      .where(sql`upc = ${row.upc}`);
    cleared += parseInt(row.product_count);
  }
  
  console.log(`Cleared ${cleared} products with cross-brand UPC errors\n`);
  
  // Now check for remaining issues - same UPC on different product types
  console.log('=== CHECKING SAME-BRAND SHARED UPCs ===');
  const sameBrandShared = await db.execute(sql`
    SELECT upc, brand, array_agg(name) as names, COUNT(*) as cnt
    FROM supplies 
    WHERE upc IS NOT NULL
    GROUP BY upc, brand
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 10
  `);
  
  console.log(`Top shared UPCs within same brand:`);
  for (const row of sameBrandShared.rows) {
    console.log(`  ${row.brand || 'No brand'}: ${row.cnt} products share ${row.upc}`);
  }
  
  // Final stats
  const final = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      COUNT(upc) as with_upc,
      COUNT(DISTINCT upc) as unique_upcs
    FROM supplies
  `);
  
  console.log(`\n=== FINAL STATS ===`);
  console.log(`Total products: ${final.rows[0].total}`);
  console.log(`With UPC: ${final.rows[0].with_upc}`);
  console.log(`Unique UPCs: ${final.rows[0].unique_upcs}`);
  console.log(`Coverage: ${(parseInt(final.rows[0].with_upc) / parseInt(final.rows[0].total) * 100).toFixed(1)}%`);
  
  // Cross-brand check
  const crossCheck = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM (
      SELECT upc FROM supplies 
      WHERE upc IS NOT NULL AND brand IS NOT NULL AND brand != ''
      GROUP BY upc HAVING COUNT(DISTINCT brand) > 1
    ) t
  `);
  console.log(`Cross-brand UPCs remaining: ${crossCheck.rows[0].cnt}`);
  
  // Target brands
  const targetBrands = await db.execute(sql`
    SELECT brand, COUNT(*) as total, COUNT(upc) as matched
    FROM supplies
    WHERE brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies')
    GROUP BY brand ORDER BY total DESC
  `);
  
  console.log(`\nTarget brands:`);
  for (const row of targetBrands.rows) {
    console.log(`  ${row.brand}: ${row.matched}/${row.total}`);
  }
  
  process.exit(0);
}

main().catch(console.error);
