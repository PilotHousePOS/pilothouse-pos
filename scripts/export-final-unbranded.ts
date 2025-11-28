import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import { writeFileSync } from 'fs';

async function exportFinalUnbranded() {
  console.log('📋 Exporting FINAL list of products without brands...\n');
  
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
  writeFileSync('FINAL-UNBRANDED-PRODUCTS-UPDATED.csv', csvContent);
  
  console.log('✅ Export complete!');
  console.log('📄 File saved: FINAL-UNBRANDED-PRODUCTS-UPDATED.csv\n');
  
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
  
  console.log('\n' + '='.repeat(80));
}

exportFinalUnbranded().catch(console.error).finally(() => process.exit(0));
