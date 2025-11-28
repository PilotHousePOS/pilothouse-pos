import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { writeFileSync } from 'fs';

async function exportUnbrandedProducts() {
  console.log('📋 Exporting all products without brands...\n');
  
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
    ORDER BY name
  `);
  
  console.log(`Found ${unbrandedProducts.rows.length} products without brands\n`);
  
  // Create CSV content
  let csvContent = 'ID,Product Name,Category,Filter Type,Price,Description\n';
  
  unbrandedProducts.rows.forEach((row: any) => {
    const escapeCSV = (str: string | null) => {
      if (!str) return '';
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const escaped = str.replace(/"/g, '""');
      if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
        return `"${escaped}"`;
      }
      return escaped;
    };
    
    csvContent += `${row.id},${escapeCSV(row.name)},${escapeCSV(row.category)},${escapeCSV(row.filter_type)},${row.price},${escapeCSV(row.description)}\n`;
  });
  
  // Write to file
  writeFileSync('unbranded-products-full-list.csv', csvContent);
  
  console.log('✅ Export complete!');
  console.log('📄 File saved: unbranded-products-full-list.csv');
  console.log(`\n📊 Summary by Category:\n`);
  
  // Show summary by category
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
    console.log(`  ${row.category.padEnd(25)} → ${row.count.toString().padStart(4)} (${percentage.padStart(5)}%)`);
  });
  
  console.log(`\n📊 Summary by Filter Type:\n`);
  
  const filterBreakdown = await db.execute(sql`
    SELECT 
      filter_type,
      COUNT(*) as count
    FROM supplies
    WHERE brand IS NULL OR brand = ''
    GROUP BY filter_type
    ORDER BY count DESC
  `);
  
  filterBreakdown.rows.forEach((row: any) => {
    const filterName = row.filter_type || 'None (General)';
    const percentage = ((row.count / unbrandedProducts.rows.length) * 100).toFixed(1);
    console.log(`  ${filterName.padEnd(25)} → ${row.count.toString().padStart(4)} (${percentage.padStart(5)}%)`);
  });
}

exportUnbrandedProducts().catch(console.error).finally(() => process.exit(0));
