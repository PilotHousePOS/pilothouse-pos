import { db } from '../server/db';
import { supplies } from '@shared/schema';
import { isNull, or, eq, asc } from 'drizzle-orm';
import * as fs from 'fs';

async function exportCleanUnbranded() {
  console.log('📋 Exporting truly unbranded products with full names...\n');

  const unbranded = await db
    .select({
      id: supplies.id,
      name: supplies.name,
      category: supplies.category,
      filterType: supplies.filterType,
      price: supplies.price,
    })
    .from(supplies)
    .where(or(isNull(supplies.brand), eq(supplies.brand, '')))
    .orderBy(asc(supplies.category), asc(supplies.name));

  console.log(`Found ${unbranded.length} products without brands\n`);

  // Create CSV with full names (no truncation)
  const csvLines = ['ID,Full Product Name,Category,FilterType,Price'];
  
  for (const product of unbranded) {
    // Escape quotes in name
    const safeName = product.name.replace(/"/g, '""');
    csvLines.push(`${product.id},"${safeName}",${product.category || ''},${product.filterType || ''},${product.price || ''}`);
  }

  const csvContent = csvLines.join('\n');
  fs.writeFileSync('TRULY-UNBRANDED-PRODUCTS.csv', csvContent);
  console.log('✅ Saved to: TRULY-UNBRANDED-PRODUCTS.csv');
  
  // Show category breakdown
  const categories: Record<string, number> = {};
  for (const p of unbranded) {
    const cat = p.category || 'uncategorized';
    categories[cat] = (categories[cat] || 0) + 1;
  }
  
  console.log('\n📊 Breakdown by Category:\n');
  Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      const pct = ((count / unbranded.length) * 100).toFixed(1);
      console.log(`  ${cat.padEnd(30)} → ${String(count).padStart(4)} (${pct.padStart(5)}%)`);
    });
  
  console.log('\n' + '='.repeat(80));
}

exportCleanUnbranded().catch(console.error);
