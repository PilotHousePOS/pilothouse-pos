/**
 * Fix Category-Mismatched Images
 * 
 * This script identifies products using wrong-category stock images
 * and replaces them with appropriate category images.
 */

import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, like, and, sql, or, inArray } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorageService';
import * as fs from 'fs';
import * as path from 'path';

const objectStorageService = new ObjectStorageService();

// Local stock images by category
const LOCAL_IMAGES: Record<string, string[]> = {
  collar: [
    'attached_assets/stock_images/dog_collar_nylon_adj_61397bb9.jpg',
    'attached_assets/stock_images/dog_collar_nylon_adj_6b36aff8.jpg',
    'attached_assets/stock_images/dog_collar_nylon_adj_9dc5a732.jpg',
    'attached_assets/stock_images/dog_collar_nylon_adj_da6f941b.jpg',
  ],
  leash: [
    'attached_assets/stock_images/dog_leash_nylon_pet__c2487cf0.jpg',
    'attached_assets/stock_images/dog_leash_nylon_pet__61474b58.jpg',
    'attached_assets/stock_images/dog_leash_nylon_pet__8e26c5ec.jpg',
    'attached_assets/stock_images/dog_leash_nylon_pet__db6dbd07.jpg',
  ],
  treats: [
    'attached_assets/stock_images/dog_treats_snacks_bi_6bcdcfcd.jpg',
    'attached_assets/stock_images/dog_treats_snacks_bi_48d19905.jpg',
    'attached_assets/stock_images/dog_treats_snacks_bi_91cc305b.jpg',
    'attached_assets/stock_images/dog_treats_snacks_bi_8e7f6c26.jpg',
  ],
  dogfood: [
    'attached_assets/stock_images/premium_dry_dog_food_3085b96a.jpg',
    'attached_assets/stock_images/premium_dry_dog_food_b9b692c2.jpg',
    'attached_assets/stock_images/premium_dry_dog_food_66db0b78.jpg',
    'attached_assets/stock_images/premium_dry_dog_food_4e6477ce.jpg',
  ],
};

// Uploaded image URLs by category
const UPLOADED_IMAGES: Record<string, string[]> = {
  collar: [],
  leash: [],
  treats: [],
  dogfood: [],
};

// Determine category from product name/actual category
function determineProductCategory(name: string, category: string | null): string | null {
  const lowerName = name.toLowerCase();
  const lowerCat = (category || '').toLowerCase();
  
  // Collar detection
  if (lowerName.includes('collar') || lowerCat.includes('collar')) {
    return 'collar';
  }
  
  // Leash detection
  if (lowerName.includes('leash') || lowerName.includes('lead') || 
      lowerCat.includes('leash')) {
    return 'leash';
  }
  
  // Collar category catches both
  if (lowerCat === 'leashesandcollars' || lowerCat === 'leashes') {
    if (lowerName.includes('leash') || lowerName.includes('lead')) {
      return 'leash';
    }
    return 'collar';
  }
  
  // Treats detection
  if (lowerCat.includes('treat') || lowerCat === 'dogtreats' || lowerCat === 'cattreats') {
    return 'treats';
  }
  if (lowerName.includes('treat') || lowerName.includes('biscuit') || 
      lowerName.includes('chew') || lowerName.includes('rawhide') ||
      lowerName.includes('jerky') || lowerName.includes('snack')) {
    return 'treats';
  }
  
  // Dog food detection
  if (lowerCat === 'dogfood' || lowerCat === 'dog food') {
    return 'dogfood';
  }
  if ((lowerName.includes('dog') || lowerCat.includes('dog')) &&
      (lowerName.includes('food') || lowerName.includes('kibble'))) {
    return 'dogfood';
  }
  
  return null;
}

// Determine what stock category the current image is from
function getImageStockCategory(imageUrl: string): string | null {
  if (!imageUrl || !imageUrl.includes('/stock/')) return null;
  
  if (imageUrl.includes('/stock/collar/')) return 'collar';
  if (imageUrl.includes('/stock/treats/')) return 'treats';
  if (imageUrl.includes('/stock/dogfood/')) return 'dogfood';
  if (imageUrl.includes('/stock/toys/')) return 'toys';
  if (imageUrl.includes('/stock/aquarium/')) return 'aquarium';
  if (imageUrl.includes('/stock/reptile/')) return 'reptile';
  if (imageUrl.includes('/stock/smallanimal/')) return 'smallanimal';
  
  return 'other';
}

async function uploadCategoryImages() {
  console.log('Uploading category images to object storage...\n');
  
  let fakeId = -2000;
  
  for (const [category, localPaths] of Object.entries(LOCAL_IMAGES)) {
    console.log(`Uploading ${category} images...`);
    
    for (let i = 0; i < localPaths.length; i++) {
      const localPath = localPaths[i];
      const fullPath = path.resolve(process.cwd(), localPath);
      
      if (!fs.existsSync(fullPath)) {
        console.log(`  - File not found: ${localPath}`);
        continue;
      }
      
      try {
        const imageBuffer = fs.readFileSync(fullPath);
        const productName = `category-${category}-${i + 1}`;
        const brand = 'stock-category';
        
        const result = await objectStorageService.storeUploadedProductImage(
          imageBuffer,
          'image/jpeg',
          fakeId--,
          productName,
          brand
        );
        
        if (result.success && result.storedPath) {
          UPLOADED_IMAGES[category].push(result.storedPath);
          console.log(`  - Uploaded: ${result.storedPath}`);
        } else {
          console.error(`  - Failed: ${result.error}`);
        }
      } catch (error) {
        console.error(`  - Error: ${error}`);
      }
    }
  }
  
  console.log('\nUploaded images:');
  for (const [cat, urls] of Object.entries(UPLOADED_IMAGES)) {
    console.log(`  ${cat}: ${urls.length} images`);
  }
}

async function findMismatchedProducts() {
  console.log('\nFinding products with mismatched category images...\n');
  
  // Get all products with stock images
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    category: supplies.category,
    imageUrl: supplies.imageUrl,
  })
  .from(supplies)
  .where(like(supplies.imageUrl, '%/stock/%'));
  
  console.log(`Total products with stock images: ${products.length}`);
  
  const mismatched: Array<{
    id: number;
    name: string;
    category: string | null;
    imageUrl: string | null;
    currentImageCategory: string | null;
    expectedCategory: string | null;
  }> = [];
  
  for (const product of products) {
    const expectedCategory = determineProductCategory(product.name, product.category);
    const currentImageCategory = getImageStockCategory(product.imageUrl || '');
    
    // Only flag if we can determine expected category and it doesn't match
    if (expectedCategory && currentImageCategory && expectedCategory !== currentImageCategory) {
      mismatched.push({
        ...product,
        currentImageCategory,
        expectedCategory,
      });
    }
  }
  
  console.log(`Products with wrong category images: ${mismatched.length}`);
  
  // Group by mismatch type
  const mismatchCounts: Record<string, number> = {};
  for (const p of mismatched) {
    const key = `${p.currentImageCategory} -> should be ${p.expectedCategory}`;
    mismatchCounts[key] = (mismatchCounts[key] || 0) + 1;
  }
  
  console.log('\nMismatch breakdown:');
  for (const [key, count] of Object.entries(mismatchCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}: ${count}`);
  }
  
  return mismatched;
}

async function fixMismatchedProducts() {
  const mismatched = await findMismatchedProducts();
  
  console.log('\nFixing mismatched products...\n');
  
  let updated = 0;
  let skipped = 0;
  
  for (const product of mismatched) {
    const targetCategory = product.expectedCategory;
    if (!targetCategory || !UPLOADED_IMAGES[targetCategory] || UPLOADED_IMAGES[targetCategory].length === 0) {
      skipped++;
      continue;
    }
    
    const availableImages = UPLOADED_IMAGES[targetCategory];
    const newImageUrl = availableImages[Math.floor(Math.random() * availableImages.length)];
    
    try {
      await db.update(supplies)
        .set({ imageUrl: newImageUrl })
        .where(eq(supplies.id, product.id));
      
      updated++;
      if (updated % 50 === 0) {
        console.log(`  Updated ${updated} products...`);
      }
    } catch (error) {
      console.error(`  Failed to update ${product.id}: ${error}`);
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no images for category): ${skipped}`);
}

async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'analyze':
      await findMismatchedProducts();
      break;
      
    case 'fix':
      await uploadCategoryImages();
      await fixMismatchedProducts();
      break;
      
    default:
      console.log('Usage:');
      console.log('  npx tsx server/scripts/fixCategoryImages.ts analyze  - Find mismatched products');
      console.log('  npx tsx server/scripts/fixCategoryImages.ts fix      - Upload images and fix mismatches');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
