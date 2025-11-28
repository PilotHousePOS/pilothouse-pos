/**
 * Brand Backfill Migration Script
 * Systematically assigns brands to products with missing brand fields
 * using the enhanced extractBrand() function from server/brandCatalog.ts
 * 
 * Usage: tsx scripts/backfill-brands.ts [--dry-run]
 */

import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, or, isNull } from 'drizzle-orm';
import { extractBrand } from '../server/brandCatalog';
import * as fs from 'fs';

// Parse command line arguments
const isDryRun = process.argv.includes('--dry-run');

interface BrandAssignment {
  id: number;
  name: string;
  currentBrand: string | null;
  detectedBrand: string | null;
}

async function backfillBrands() {
  console.log('🔍 Brand Backfill Migration Script');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE UPDATE'}\n`);
  
  // Get supplies with empty brand field
  const emptyBrandSupplies = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.brand), eq(supplies.brand, '')));
  
  console.log(`Found ${emptyBrandSupplies.length} products with empty brand field\n`);
  
  const assignments: BrandAssignment[] = [];
  const brandCounts: Record<string, number> = {};
  const uncertainProducts: Array<{id: number, name: string}> = [];
  
  // Process each product
  for (const supply of emptyBrandSupplies) {
    const productName = supply.name || '';
    const detectedBrand = extractBrand(productName);
    
    assignments.push({
      id: supply.id,
      name: productName,
      currentBrand: supply.brand || null,
      detectedBrand: detectedBrand
    });
    
    if (detectedBrand) {
      brandCounts[detectedBrand] = (brandCounts[detectedBrand] || 0) + 1;
    } else {
      uncertainProducts.push({ id: supply.id, name: productName });
    }
  }
  
  // Report detected brands
  console.log('=== Detected Brands ===');
  const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]);
  const totalDetected = sortedBrands.reduce((sum, [_, count]) => sum + count, 0);
  
  console.log(`✅ Successfully detected: ${totalDetected} products`);
  console.log(`❓ Uncertain (no match): ${uncertainProducts.length} products\n`);
  
  if (sortedBrands.length > 0) {
    console.log('Top brands detected:');
    sortedBrands.slice(0, 20).forEach(([brand, count]) => {
      console.log(`  ${brand}: ${count} products`);
    });
    if (sortedBrands.length > 20) {
      console.log(`  ... and ${sortedBrands.length - 20} more brands`);
    }
  }
  
  // Export uncertain products to CSV for manual review
  if (uncertainProducts.length > 0) {
    console.log(`\n📋 Exporting ${uncertainProducts.length} uncertain products to CSV...`);
    const csvContent = 'ID,Product Name\n' + 
      uncertainProducts.map(p => `${p.id},"${p.name.replace(/"/g, '""')}"`).join('\n');
    fs.writeFileSync('uncertain-brands.csv', csvContent);
    console.log('   Saved to: uncertain-brands.csv');
  }
  
  // Apply updates if not dry run
  if (!isDryRun) {
    console.log(`\n🔄 Applying brand assignments...`);
    let updated = 0;
    
    for (const assignment of assignments) {
      if (assignment.detectedBrand) {
        await db.update(supplies)
          .set({ brand: assignment.detectedBrand })
          .where(eq(supplies.id, assignment.id));
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`   Updated ${updated} products...`);
        }
      }
    }
    
    console.log(`\n✅ Successfully updated ${updated} products with brands`);
  } else {
    console.log(`\n📊 DRY RUN - No changes made`);
    console.log(`   Would update ${totalDetected} products`);
  }
  
  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total products processed: ${emptyBrandSupplies.length}`);
  console.log(`Brands detected: ${totalDetected} (${Math.round(totalDetected / emptyBrandSupplies.length * 100)}%)`);
  console.log(`Uncertain: ${uncertainProducts.length} (${Math.round(uncertainProducts.length / emptyBrandSupplies.length * 100)}%)`);
  
  if (isDryRun) {
    console.log('\n💡 Run without --dry-run flag to apply changes');
  }
  
  console.log('\n✨ Brand backfill complete!');
}

backfillBrands()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
