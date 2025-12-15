/**
 * Fix Wrong-Category Clothing Images
 * 
 * This script fixes clothing products that have incorrect category images
 * (collars, aquarium, toys) by replacing them with appropriate clothing images.
 */

import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, like, and, sql, or } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorageService';
import * as fs from 'fs';
import * as path from 'path';

const objectStorageService = new ObjectStorageService();

// Stock images downloaded for each clothing type
const LOCAL_CLOTHING_IMAGES = {
  sweater: [
    'attached_assets/stock_images/dog_wearing_knit_swe_8d6e0cb2.jpg',
    'attached_assets/stock_images/dog_wearing_knit_swe_e5fb3581.jpg'
  ],
  hoodie: [
    'attached_assets/stock_images/dog_wearing_hoodie_p_95a12618.jpg',
    'attached_assets/stock_images/dog_wearing_hoodie_p_9ae7086f.jpg'
  ],
  polo: [
    'attached_assets/stock_images/dog_wearing_polo_shi_9c02cc80.jpg',
    'attached_assets/stock_images/dog_wearing_polo_shi_9c98849c.jpg'
  ],
  tanktop: [
    'attached_assets/stock_images/dog_wearing_tank_top_d209ce0c.jpg',
    'attached_assets/stock_images/dog_wearing_tank_top_9006a10d.jpg'
  ],
  pajamas: [
    'attached_assets/stock_images/dog_wearing_pajamas__3e1be836.jpg',
    'attached_assets/stock_images/dog_wearing_pajamas__e2779a30.jpg'
  ]
};

// Store uploaded image URLs
const UPLOADED_CLOTHING_IMAGES: Record<string, string[]> = {
  sweater: [],
  hoodie: [],
  polo: [],
  tanktop: [],
  pajamas: []
};

async function uploadClothingImages() {
  console.log('Uploading clothing images to object storage...\n');
  
  // Use unique fake product IDs for stock clothing images (negative to avoid conflicts)
  let fakeProductId = -1000;
  
  for (const [type, localPaths] of Object.entries(LOCAL_CLOTHING_IMAGES)) {
    console.log(`Uploading ${type} images...`);
    
    for (let i = 0; i < localPaths.length; i++) {
      const localPath = localPaths[i];
      const fullPath = path.resolve(process.cwd(), localPath);
      
      if (!fs.existsSync(fullPath)) {
        console.log(`  - File not found: ${localPath}`);
        continue;
      }
      
      try {
        const imageBuffer = fs.readFileSync(fullPath);
        const productName = `stock-${type}-${i + 1}`;
        const brand = 'stock-clothing';
        
        const result = await objectStorageService.storeUploadedProductImage(
          imageBuffer,
          'image/jpeg',
          fakeProductId--,
          productName,
          brand
        );
        
        if (result.success && result.storedPath) {
          UPLOADED_CLOTHING_IMAGES[type].push(result.storedPath);
          console.log(`  - Uploaded: ${result.storedPath}`);
        } else {
          console.error(`  - Failed to upload ${localPath}: ${result.error}`);
        }
      } catch (error) {
        console.error(`  - Failed to upload ${localPath}:`, error);
      }
    }
  }
  
  console.log('\nUploaded images summary:');
  for (const [type, urls] of Object.entries(UPLOADED_CLOTHING_IMAGES)) {
    console.log(`  ${type}: ${urls.length} images`);
  }
}

function getClothingType(productName: string): string {
  const name = productName.toLowerCase();
  
  if (name.includes('sweater')) return 'sweater';
  if (name.includes('hoodie')) return 'hoodie';
  if (name.includes('polo')) return 'polo';
  if (name.includes('tank top') || name.includes('tanktop')) return 'tanktop';
  if (name.includes('pj') || name.includes('pajama') || name.includes('pjs')) return 'pajamas';
  
  return 'sweater'; // Default fallback
}

async function fixWrongCategoryImages() {
  console.log('\nFinding clothing products with wrong-category images...\n');
  
  // Get products with wrong-category images
  const wrongProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    imageUrl: supplies.imageUrl
  })
  .from(supplies)
  .where(
    and(
      or(
        like(sql`LOWER(${supplies.name})`, '%sweater%'),
        like(sql`LOWER(${supplies.name})`, '%hoodie%'),
        like(sql`LOWER(${supplies.name})`, '%polo%'),
        like(sql`LOWER(${supplies.name})`, '%tank top%'),
        like(sql`LOWER(${supplies.name})`, '%pj%'),
        like(sql`LOWER(${supplies.name})`, '%pajama%')
      ),
      or(
        like(supplies.imageUrl, '%collar%'),
        like(supplies.imageUrl, '%aquarium%'),
        like(supplies.imageUrl, '%toy%')
      )
    )
  );
  
  console.log(`Found ${wrongProducts.length} products with wrong-category images\n`);
  
  let updated = 0;
  let failed = 0;
  
  for (const product of wrongProducts) {
    const clothingType = getClothingType(product.name);
    const availableImages = UPLOADED_CLOTHING_IMAGES[clothingType];
    
    if (availableImages.length === 0) {
      console.log(`  No ${clothingType} images available for: ${product.name}`);
      failed++;
      continue;
    }
    
    // Pick a random image from the available images
    const newImageUrl = availableImages[Math.floor(Math.random() * availableImages.length)];
    
    try {
      await db.update(supplies)
        .set({ imageUrl: newImageUrl })
        .where(eq(supplies.id, product.id));
      
      console.log(`  Updated [${product.id}] ${product.name} -> ${clothingType} image`);
      updated++;
    } catch (error) {
      console.error(`  Failed to update [${product.id}] ${product.name}:`, error);
      failed++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${wrongProducts.length}`);
}

async function main() {
  console.log('=== Fix Wrong-Category Clothing Images ===\n');
  
  // First upload the clothing images
  await uploadClothingImages();
  
  // Then fix the products
  await fixWrongCategoryImages();
  
  console.log('\nDone!');
  process.exit(0);
}

main().catch(console.error);
