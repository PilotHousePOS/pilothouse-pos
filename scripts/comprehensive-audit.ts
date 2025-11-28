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
  
  const fishCount = await db.select({ count: sql<number>`count(*)` })
    .from(pets)
    .where(sql`species = 'fish'`);
  const reptileCount = await db.select({ count: sql<number>`count(*)` })
    .from(pets)
    .where(sql`species = 'reptile'`);
  
  console.log(`Total Supply Products: ${totalSupplies[0].count}`);
  console.log(`Total Pets: ${totalPets[0].count}`);
  console.log(`  - Fish: ${fishCount[0].count}`);
  console.log(`  - Reptiles: ${reptileCount[0].count}`);
  
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
  
  console.log(`✅ Brands Assigned: ${assigned} (${percentAssigned}%)`);
  console.log(`❌ No Brand: ${empty} (${((empty / total) * 100).toFixed(2)}%)`);
  
  // 3. Top Brands
  console.log('\n\n🏆 TOP 20 BRANDS BY PRODUCT COUNT\n');
  const topBrands = await db.execute(sql`
    SELECT brand, COUNT(*) as count
    FROM supplies
    WHERE brand IS NOT NULL AND brand != ''
    GROUP BY brand
    ORDER BY count DESC
    LIMIT 20
  `);
  
  topBrands.rows.forEach((row: any, idx: number) => {
    console.log(`${(idx + 1).toString().padStart(2)}. ${row.brand.padEnd(30)} → ${row.count} products`);
  });
  
  // 4. Specialty Section Distribution
  console.log('\n\n🎯 SPECIALTY SECTION DISTRIBUTION\n');
  const specialtySections = await db.execute(sql`
    SELECT specialty_section, COUNT(*) as count
    FROM supplies
    WHERE specialty_section IS NOT NULL AND specialty_section != ''
    GROUP BY specialty_section
    ORDER BY count DESC
  `);
  
  specialtySections.rows.forEach((row: any) => {
    const percentage = ((row.count / total) * 100).toFixed(2);
    console.log(`${row.specialty_section || 'None'}: ${row.count} (${percentage}%)`);
  });
  
  // 5. Product Type Distribution
  console.log('\n\n📂 PRODUCT TYPE DISTRIBUTION\n');
  const productTypes = await db.execute(sql`
    SELECT product_type, COUNT(*) as count
    FROM supplies
    GROUP BY product_type
    ORDER BY count DESC
    LIMIT 15
  `);
  
  productTypes.rows.forEach((row: any) => {
    const percentage = ((row.count / total) * 100).toFixed(2);
    console.log(`${(row.product_type || 'None').padEnd(25)} → ${row.count.toString().padStart(5)} (${percentage}%)`);
  });
  
  // 6. FilterType Distribution for Specialty Sections
  console.log('\n\n🔍 FILTER TYPE DISTRIBUTION (AQUATIC & REPTILE)\n');
  const filterTypes = await db.execute(sql`
    SELECT 
      specialty_section,
      "filterType",
      COUNT(*) as count
    FROM supplies
    WHERE specialty_section IN ('Aquatic', 'Exotic Reptiles')
    GROUP BY specialty_section, "filterType"
    ORDER BY specialty_section, count DESC
  `);
  
  let currentSection = '';
  filterTypes.rows.forEach((row: any) => {
    if (row.specialty_section !== currentSection) {
      currentSection = row.specialty_section;
      console.log(`\n${currentSection}:`);
    }
    console.log(`  ${(row.filterType || 'None').padEnd(20)} → ${row.count} products`);
  });
  
  // 7. Aquatic Subcategory Distribution
  console.log('\n\n🐠 AQUATIC SUBCATEGORY DISTRIBUTION\n');
  const aquaticSubcats = await db.execute(sql`
    SELECT 
      aquatic_category,
      COUNT(*) as count
    FROM supplies
    WHERE "filterType" = 'Aquatic'
    GROUP BY aquatic_category
    ORDER BY count DESC
  `);
  
  const totalAquatic = aquaticSubcats.rows.reduce((sum: number, row: any) => sum + row.count, 0);
  aquaticSubcats.rows.forEach((row: any) => {
    const percentage = ((row.count / totalAquatic) * 100).toFixed(2);
    console.log(`${(row.aquatic_category || 'None').padEnd(20)} → ${row.count.toString().padStart(4)} (${percentage}%)`);
  });
  
  // 8. Sample Products by FilterType
  console.log('\n\n📋 SAMPLE PRODUCTS BY FILTER TYPE (5 each)\n');
  const sampleAquatic = await db.execute(sql`
    SELECT name, brand, "filterType", aquatic_category
    FROM supplies
    WHERE "filterType" = 'Aquatic'
    ORDER BY RANDOM()
    LIMIT 5
  `);
  
  console.log('\nAquatic Products:');
  sampleAquatic.rows.forEach((row: any, idx: number) => {
    console.log(`  ${idx + 1}. ${row.name}`);
    console.log(`     Brand: ${row.brand || 'N/A'} | Category: ${row.aquatic_category || 'N/A'}`);
  });
  
  const sampleReptile = await db.execute(sql`
    SELECT name, brand, "filterType"
    FROM supplies
    WHERE "filterType" = 'Reptile'
    ORDER BY RANDOM()
    LIMIT 5
  `);
  
  console.log('\nReptile Products:');
  sampleReptile.rows.forEach((row: any, idx: number) => {
    console.log(`  ${idx + 1}. ${row.name} (${row.brand || 'N/A'})`);
  });
  
  // 9. Products Without Brand (Sample)
  console.log('\n\n❓ PRODUCTS WITHOUT BRAND (Sample 20)\n');
  const noBrand = await db.execute(sql`
    SELECT name, product_type, specialty_section
    FROM supplies
    WHERE brand IS NULL OR brand = ''
    ORDER BY name
    LIMIT 20
  `);
  
  noBrand.rows.forEach((row: any, idx: number) => {
    console.log(`${(idx + 1).toString().padStart(2)}. ${row.name}`);
    console.log(`    Type: ${row.product_type || 'N/A'} | Section: ${row.specialty_section || 'N/A'}`);
  });
  
  // 10. Brand Quality Check (brands with few products)
  console.log('\n\n⚠️  BRANDS WITH ONLY 1-2 PRODUCTS (potential errors)\n');
  const lowCountBrands = await db.execute(sql`
    SELECT brand, COUNT(*) as count
    FROM supplies
    WHERE brand IS NOT NULL AND brand != ''
    GROUP BY brand
    HAVING COUNT(*) <= 2
    ORDER BY brand
    LIMIT 30
  `);
  
  lowCountBrands.rows.forEach((row: any) => {
    console.log(`${row.brand}: ${row.count} product(s)`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ AUDIT COMPLETE\n');
}

comprehensiveAudit().catch(console.error).finally(() => process.exit(0));
