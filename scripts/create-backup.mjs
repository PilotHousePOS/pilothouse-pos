import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';

async function createBackup() {
  console.log('Fetching all supplies from database...');
  
  const allSupplies = await db.select().from(supplies).where(eq(supplies.isActive, true));
  
  console.log(`Found ${allSupplies.length} active products`);
  
  // Count products with UPCs
  const withUpc = allSupplies.filter(s => s.sku && s.sku.trim() !== '');
  console.log(`Products with UPC: ${withUpc.length} (${(withUpc.length / allSupplies.length * 100).toFixed(1)}%)`);
  
  // Count products with images
  const withImages = allSupplies.filter(s => s.imageUrl && s.imageUrl.trim() !== '');
  console.log(`Products with images: ${withImages.length}`);
  
  // Count products with extended info
  const withFeatures = allSupplies.filter(s => s.features);
  const withIngredients = allSupplies.filter(s => s.ingredients);
  const withInstructions = allSupplies.filter(s => s.feedingInstructions);
  console.log(`Products with features: ${withFeatures.length}`);
  console.log(`Products with ingredients: ${withIngredients.length}`);
  console.log(`Products with feeding instructions: ${withInstructions.length}`);
  
  const today = new Date().toISOString().split('T')[0];
  const filename = `backups/rollback-inventory-${today}.json`;
  
  fs.writeFileSync(filename, JSON.stringify(allSupplies, null, 2));
  
  console.log(`\nBackup saved to: ${filename}`);
  console.log(`Total products: ${allSupplies.length}`);
  console.log(`File size: ${(fs.statSync(filename).size / 1024 / 1024).toFixed(2)} MB`);
}

createBackup().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
