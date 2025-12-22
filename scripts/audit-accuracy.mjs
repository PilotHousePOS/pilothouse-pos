import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('=== UPC MATCHING ACCURACY AUDIT ===\n');
  
  // 1. Check for duplicate UPCs assigned to different products
  console.log('=== 1. DUPLICATE UPC CHECK ===');
  const duplicates = await db.execute(sql`
    SELECT upc, COUNT(*) as count, array_agg(name ORDER BY id) as names
    FROM supplies 
    WHERE upc IS NOT NULL
    GROUP BY upc 
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 10
  `);
  
  if (duplicates.rows.length > 0) {
    console.log(`Found ${duplicates.rows.length} UPCs assigned to multiple products:`);
    for (const row of duplicates.rows.slice(0, 5)) {
      console.log(`  ${row.upc}: ${row.count} products`);
      const names = row.names.slice(0, 3);
      names.forEach(n => console.log(`    - ${n}`));
      if (row.names.length > 3) console.log(`    ... and ${row.names.length - 3} more`);
    }
  } else {
    console.log('No duplicate UPCs found - GOOD!');
  }
  
  // 2. Check target brands for mismatches
  console.log('\n=== 2. TARGET BRAND VERIFICATION ===');
  const targetBrands = ['Oxbow', 'Benebone', 'SmartBones', 'Barkworthies'];
  
  for (const brand of targetBrands) {
    const items = await db.execute(sql`
      SELECT name, upc FROM supplies 
      WHERE brand = ${brand} AND upc IS NOT NULL
      ORDER BY name LIMIT 5
    `);
    
    console.log(`\n${brand} (sample matches):`);
    for (const item of items.rows) {
      const upcPrefix = item.upc.substring(0, 6);
      console.log(`  ${item.name} -> UPC ${item.upc.substring(0, 6)}...`);
    }
  }
  
  // 3. Check UPC prefix consistency by brand
  console.log('\n=== 3. UPC PREFIX BY BRAND ===');
  const prefixCheck = await db.execute(sql`
    SELECT brand, SUBSTRING(upc, 1, 3) as prefix, COUNT(*) as cnt
    FROM supplies
    WHERE brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies')
      AND upc IS NOT NULL
    GROUP BY brand, SUBSTRING(upc, 1, 3)
    ORDER BY brand, cnt DESC
  `);
  
  let currentBrand = '';
  for (const row of prefixCheck.rows) {
    if (row.brand !== currentBrand) {
      currentBrand = row.brand;
      console.log(`\n${row.brand}:`);
    }
    console.log(`  Prefix ${row.prefix}xxx: ${row.cnt} items`);
  }
  
  // 4. Spot check for obvious mismatches
  console.log('\n=== 4. SPOT CHECK FOR MISMATCHES ===');
  const spotCheck = await db.execute(sql`
    SELECT name, brand, upc FROM supplies
    WHERE upc IS NOT NULL AND brand IS NOT NULL
    ORDER BY RANDOM() LIMIT 10
  `);
  
  console.log('Random sample of matched items:');
  for (const item of spotCheck.rows) {
    console.log(`  ${item.brand}: ${item.name} -> ${item.upc}`);
  }
  
  // 5. Summary stats
  console.log('\n=== 5. FINAL SUMMARY ===');
  const stats = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      COUNT(upc) as matched,
      COUNT(DISTINCT upc) as unique_upcs,
      COUNT(*) - COUNT(DISTINCT upc) FILTER (WHERE upc IS NOT NULL) as duplicates
    FROM supplies
  `);
  
  const s = stats.rows[0];
  console.log(`Total supplies: ${s.total}`);
  console.log(`Matched with UPC: ${s.matched} (${(parseInt(s.matched)/parseInt(s.total)*100).toFixed(1)}%)`);
  console.log(`Unique UPCs used: ${s.unique_upcs}`);
  console.log(`Duplicate UPC assignments: ${parseInt(s.matched) - parseInt(s.unique_upcs)}`);
  
  // Brand breakdown
  const brandBreak = await db.execute(sql`
    SELECT brand, COUNT(*) as total, COUNT(upc) as matched
    FROM supplies
    WHERE brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies', 'Penn-Plax')
    GROUP BY brand ORDER BY total DESC
  `);
  
  console.log('\nTarget brand coverage:');
  for (const row of brandBreak.rows) {
    const pct = Math.round(parseInt(row.matched) / parseInt(row.total) * 100);
    const status = pct >= 95 ? '✓' : pct >= 80 ? '~' : '✗';
    console.log(`  ${status} ${row.brand}: ${row.matched}/${row.total} (${pct}%)`);
  }
  
  process.exit(0);
}

main().catch(console.error);
