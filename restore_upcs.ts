import { db } from './server/db';
import { supplies } from './shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcBackup {
  id: number;
  name: string;
  brand: string;
  upc: string | null;
  sku: string | null;
}

async function restoreUpcs() {
  console.log('Loading UPC/SKU backup...');
  
  const backup: UpcBackup[] = JSON.parse(fs.readFileSync('upc_sku_backup.json', 'utf-8'));
  console.log(`Loaded ${backup.length} UPC/SKU records from backup`);
  
  // Get current products
  const currentProducts = await db.select().from(supplies);
  console.log(`Found ${currentProducts.length} products in database`);
  
  // Create name->product map for matching
  const nameToProduct = new Map<string, typeof currentProducts[0]>();
  for (const p of currentProducts) {
    const key = `${p.name?.toLowerCase().trim()}|${(p.brand || '').toLowerCase().trim()}`;
    nameToProduct.set(key, p);
  }
  
  let matched = 0;
  let updated = 0;
  let notFound = 0;
  
  for (const record of backup) {
    const key = `${record.name?.toLowerCase().trim()}|${(record.brand || '').toLowerCase().trim()}`;
    const product = nameToProduct.get(key);
    
    if (product) {
      matched++;
      // Only update if product doesn't already have a UPC/SKU
      if (!product.upc && !product.sku && (record.upc || record.sku)) {
        await db.update(supplies)
          .set({
            upc: record.upc,
            sku: record.sku
          })
          .where(eq(supplies.id, product.id));
        updated++;
        
        if (updated % 500 === 0) {
          console.log(`Updated ${updated} products...`);
        }
      }
    } else {
      notFound++;
    }
  }
  
  console.log('\n=== Restore Complete ===');
  console.log(`Matched: ${matched}`);
  console.log(`Updated: ${updated}`);
  console.log(`Not found in new inventory: ${notFound}`);
  
  // Verify final coverage
  const finalProducts = await db.select().from(supplies);
  const withUpc = finalProducts.filter(p => p.upc || p.sku).length;
  console.log(`\nFinal coverage: ${withUpc}/${finalProducts.length} (${((withUpc/finalProducts.length)*100).toFixed(1)}%)`);
}

restoreUpcs().then(() => {
  console.log('Done!');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
