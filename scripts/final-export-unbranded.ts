import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { writeFileSync } from 'fs';

async function exportFinalUnbranded() {
  console.log('📋 Exporting final list of products without brands...\n');
  
  const unbrandedProducts = await db.execute(sql`
    SELECT 
      id,
      name,
      category,
      filter_type,
      price,
      description
    FROM supplies
    WHERE brand IS NULL OR brand = ''
    ORDER BY category, name
  `);
  
  console.log(`Found ${unbrandedProducts.rows.length} products without brands\n`);
  
  // Create CSV content
  let csvContent = 'ID,Product Name,Category,Filter Type,Price,Description\n';
  
  unbrandedProducts.rows.forEach((row: any) => {
    const escapeCSV = (str: string | null) => {
      if (!str) return '';
      const escaped = str.replace(/"/g, '""');
      if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
        return `"${escaped}"`;
      }
      return escaped;
    };
    
    csvContent += `${row.id},${escapeCSV(row.name)},${escapeCSV(row.category)},${escapeCSV(row.filter_type)},${row.price},${escapeCSV(row.description)}\n`;
  });
  
  // Write to file
  writeFileSync('FINAL-UNBRANDED-PRODUCTS.csv', csvContent);
  
  console.log('✅ Export complete!');
  console.log('📄 File saved: FINAL-UNBRANDED-PRODUCTS.csv\n');
  
  // Detailed breakdown
  console.log('📊 Breakdown by Category:\n');
  
  const categoryBreakdown = await db.execute(sql`
    SELECT 
      category,
      COUNT(*) as count
    FROM supplies
    WHERE brand IS NULL OR brand = ''
    GROUP BY category
    ORDER BY count DESC
  `);
  
  categoryBreakdown.rows.forEach((row: any) => {
    const percentage = ((row.count / unbrandedProducts.rows.length) * 100).toFixed(1);
    console.log(`  ${(row.category || 'None').padEnd(30)} → ${row.count.toString().padStart(4)} (${percentage.padStart(5)}%)`);
  });
  
  // Analysis: Types of products
  console.log('\n\n🔍 PRODUCT TYPE ANALYSIS:\n');
  
  // Generic containers
  const containers = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM supplies 
    WHERE (brand IS NULL OR brand = '')
    AND (LOWER(name) LIKE '%container%' OR LOWER(name) LIKE '%storage%')
  `);
  console.log(`  Pet Food Containers: ${containers.rows[0].count}`);
  
  // Stainless dishes
  const dishes = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM supplies 
    WHERE (brand IS NULL OR brand = '')
    AND (LOWER(name) LIKE '%stainless%' OR LOWER(name) LIKE '%dish%' OR LOWER(name) LIKE '%bowl%')
  `);
  console.log(`  Stainless/Generic Dishes: ${dishes.rows[0].count}`);
  
  // Betta tanks
  const bettaTanks = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM supplies 
    WHERE (brand IS NULL OR brand = '')
    AND (LOWER(name) LIKE '%betta%tank%' OR LOWER(name) LIKE '%dory%' OR LOWER(name) LIKE '%spongebob%')
  `);
  console.log(`  Betta Tanks (Dory/Spongebob): ${bettaTanks.rows[0].count}`);
  
  // Collagen products
  const collagen = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM supplies 
    WHERE (brand IS NULL OR brand = '')
    AND LOWER(name) LIKE '%collagen%'
  `);
  console.log(`  Collagen Sticks/Chews: ${collagen.rows[0].count}`);
  
  // Aquarium decorations
  const decor = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM supplies 
    WHERE (brand IS NULL OR brand = '')
    AND (LOWER(name) LIKE '%rock%plant%' OR LOWER(name) LIKE '%tank decor%' OR LOWER(name) LIKE '%aquarium%')
  `);
  console.log(`  Aquarium Decorations: ${decor.rows[0].count}`);
  
  // Licensed products (LSU, Barbie, etc)
  const licensed = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM supplies 
    WHERE (brand IS NULL OR brand = '')
    AND (LOWER(name) LIKE '%lsu%' OR LOWER(name) LIKE '%barbie%' OR LOWER(name) LIKE '%kfc%')
  `);
  console.log(`  Licensed Products (LSU/Barbie/KFC): ${licensed.rows[0].count}`);
  
  console.log('\n' + '='.repeat(80));
}

exportFinalUnbranded().catch(console.error).finally(() => process.exit(0));
