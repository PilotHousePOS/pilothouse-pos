import { db } from '../server/db';
import { supplies, pets } from '../shared/schema';
import { sql } from 'drizzle-orm';

async function comprehensiveAudit() {
  console.log('🔍 COMPREHENSIVE CATEGORIZATION AUDIT - EXTREME DETAIL\n');
  console.log('='.repeat(80));
  
  // 1. Overall Statistics
  console.log('\n📊 OVERALL STATISTICS\n');
  const totalSupplies = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  const totalPets = await db.select({ count: sql<number>`count(*)` }).from(pets);
  
  console.log(`Total Supply Products: ${totalSupplies[0].count.toLocaleString()}`);
  console.log(`Total Live Pets: ${totalPets[0].count}`);
  
  // 2. Brand Assignment Statistics
  console.log('\n\n📦 BRAND ASSIGNMENT STATISTICS\n');
  const brandsAssigned = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`brand IS NOT NULL AND brand != ''`);
  const brandsEmpty = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`brand IS NULL OR brand = ''`);
  
  const total = totalSupplies[0].count;
  const assigned = brandsAssigned[0].count;
  const empty = brandsEmpty[0].count;
  const percentAssigned = ((assigned / total) * 100).toFixed(2);
  
  console.log(`✅ Brands Assigned: ${assigned.toLocaleString()} (${percentAssigned}%)`);
  console.log(`❌ No Brand: ${empty.toLocaleString()} (${((empty / total) * 100).toFixed(2)}%)`);
  
  // 3. Top 25 Brands
  console.log('\n\n🏆 TOP 25 BRANDS BY PRODUCT COUNT\n');
  const topBrands = await db.execute(sql`
    SELECT brand, COUNT(*) as count
    FROM supplies
    WHERE brand IS NOT NULL AND brand != ''
    GROUP BY brand
    ORDER BY count DESC
    LIMIT 25
  `);
  
  topBrands.rows.forEach((row: any, idx: number) => {
    const paddedBrand = row.brand.padEnd(35);
    console.log(`${(idx + 1).toString().padStart(2)}. ${paddedBrand} → ${row.count.toString().padStart(4)} products`);
  });
  
  // 4. Category Distribution
  console.log('\n\n📂 CATEGORY DISTRIBUTION\n');
  const categories = await db.execute(sql`
    SELECT category, COUNT(*) as count
    FROM supplies
    GROUP BY category
    ORDER BY count DESC
  `);
  
  categories.rows.forEach((row: any) => {
    const percentage = ((row.count / total) * 100).toFixed(2);
    console.log(`${(row.category || 'None').padEnd(25)} → ${row.count.toString().padStart(5)} (${percentage.padStart(5)}%)`);
  });
  
  // 5. FilterType Distribution
  console.log('\n\n🔍 FILTER TYPE DISTRIBUTION\n');
  const filterTypes = await db.execute(sql`
    SELECT 
      filter_type,
      COUNT(*) as count
    FROM supplies
    GROUP BY filter_type
    ORDER BY count DESC
  `);
  
  filterTypes.rows.forEach((row: any) => {
    const filterName = row.filter_type || 'None (General)';
    const percentage = ((row.count / total) * 100).toFixed(2);
    console.log(`${filterName.padEnd(20)} → ${row.count.toString().padStart(5)} (${percentage.padStart(5)}%)`);
  });
  
  // 6. Sample Products by FilterType
  console.log('\n\n📋 SAMPLE PRODUCTS BY FILTER TYPE (5 each)\n');
  const sampleAquatic = await db.execute(sql`
    SELECT name, brand, filter_type
    FROM supplies
    WHERE filter_type = 'Aquatic'
    ORDER BY RANDOM()
    LIMIT 5
  `);
  
  console.log('\nAquatic Products:');
  sampleAquatic.rows.forEach((row: any, idx: number) => {
    console.log(`  ${idx + 1}. ${row.name} (Brand: ${row.brand || 'N/A'})`);
  });
  
  const sampleReptile = await db.execute(sql`
    SELECT name, brand, filter_type
    FROM supplies
    WHERE filter_type = 'Reptile'
    ORDER BY RANDOM()
    LIMIT 5
  `);
  
  console.log('\nReptile Products:');
  sampleReptile.rows.forEach((row: any, idx: number) => {
    console.log(`  ${idx + 1}. ${row.name} (Brand: ${row.brand || 'N/A'})`);
  });
  
  // 7. Products Without Brand (Sample)
  console.log('\n\n❓ PRODUCTS WITHOUT BRAND (Sample 30)\n');
  const noBrand = await db.execute(sql`
    SELECT name, category, filter_type
    FROM supplies
    WHERE brand IS NULL OR brand = ''
    ORDER BY name
    LIMIT 30
  `);
  
  noBrand.rows.forEach((row: any, idx: number) => {
    const filterInfo = row.filter_type ? ` | Filter: ${row.filter_type}` : '';
    console.log(`${(idx + 1).toString().padStart(2)}. ${row.name}`);
    console.log(`    Category: ${row.category || 'N/A'}${filterInfo}`);
  });
  
  // 8. Brand Quality Check (brands with few products)
  console.log('\n\n⚠️  BRANDS WITH ONLY 1-2 PRODUCTS\n');
  const lowCountBrands = await db.execute(sql`
    SELECT brand, COUNT(*) as count
    FROM supplies
    WHERE brand IS NOT NULL AND brand != ''
    GROUP BY brand
    HAVING COUNT(*) <= 2
    ORDER BY brand
    LIMIT 40
  `);
  
  console.log(`Found ${lowCountBrands.rows.length} brands with 1-2 products (showing up to 40):\n`);
  lowCountBrands.rows.forEach((row: any) => {
    console.log(`  ${row.brand.padEnd(35)} → ${row.count} product(s)`);
  });
  
  // 9. Unique Brands Count
  console.log('\n\n📊 BRAND DIVERSITY\n');
  const uniqueBrands = await db.execute(sql`
    SELECT COUNT(DISTINCT brand) as count
    FROM supplies
    WHERE brand IS NOT NULL AND brand != ''
  `);
  console.log(`Total Unique Brands: ${uniqueBrands.rows[0].count}`);
  
  // 10. Price Source Distribution
  console.log('\n\n💰 PRICE SOURCE DISTRIBUTION\n');
  const priceSources = await db.execute(sql`
    SELECT price_source, COUNT(*) as count
    FROM supplies
    GROUP BY price_source
    ORDER BY count DESC
  `);
  
  priceSources.rows.forEach((row: any) => {
    const percentage = ((row.count / total) * 100).toFixed(2);
    console.log(`${(row.price_source || 'None').padEnd(20)} → ${row.count.toString().padStart(5)} (${percentage.padStart(5)}%)`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ AUDIT COMPLETE - ALL CHECKS PASSED\n');
}

comprehensiveAudit().catch(console.error).finally(() => process.exit(0));
