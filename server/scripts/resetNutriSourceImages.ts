import { db } from '../db';
import { supplies } from '@shared/schema';
import { ilike, or, sql } from 'drizzle-orm';

async function resetNutriSourceImages() {
  console.log("Resetting NutriSource images to just the first image...\n");
  
  const products = await db.select({ 
    id: supplies.id, 
    name: supplies.name,
    imageUrls: supplies.imageUrls 
  })
  .from(supplies)
  .where(
    or(
      ilike(supplies.brand, '%nutrisource%'),
      ilike(supplies.name, '%nutrisource%')
    )
  );
  
  console.log(`Found ${products.length} NutriSource products`);
  
  let updated = 0;
  for (const product of products) {
    if (product.imageUrls && product.imageUrls.length > 1) {
      // Keep only the first image
      await db.update(supplies)
        .set({ imageUrls: [product.imageUrls[0]] })
        .where(sql`id = ${product.id}`);
      updated++;
    }
  }
  
  console.log(`Reset ${updated} products to single image`);
}

resetNutriSourceImages().catch(console.error);
