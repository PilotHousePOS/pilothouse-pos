import { db } from '../db';
import { supplies } from '@shared/schema';
import { like, eq, or, and, sql } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorageService';

const objectStorageService = new ObjectStorageService();

async function downloadImage(id: number, url: string, name: string, brand: string) {
  const result = await objectStorageService.downloadAndStoreProductImage(url, id, name, brand);
  if (result.success && result.storedPath) {
    await db.update(supplies).set({ imageUrl: result.storedPath, updatedAt: new Date() }).where(eq(supplies.id, id));
    console.log('✓ Downloaded:', name, '=>', result.storedPath);
    return true;
  } else {
    console.log('✗ Failed:', name, '=>', result.error);
    return false;
  }
}

// Mapping of product patterns to Chewy image URLs
const CHEWY_IMAGE_MAPPINGS: { pattern: string; chewyUrl: string }[] = [
  { pattern: 'Spngeb Pinapple Home', chewyUrl: 'https://image.chewy.com/catalog/general/images/penn-plax-spongebob-pineapple-home-aquarium-ornament-6-5in/img-48100._AC_SL1200_QL100_V1_.jpg' },
  { pattern: 'Treasure Chest', chewyUrl: 'https://image.chewy.com/catalog/general/images/penn-plax-treasure-chest-aquarium-decor/img-38408._AC_SL1200_QL100_V1_.jpg' },
  { pattern: 'Shipwreck Front', chewyUrl: 'https://image.chewy.com/catalog/general/images/penn-plax-shipwreck-front-aquarium-decor/img-38404._AC_SL1200_QL100_V1_.jpg' },
];

async function processAmazonProducts(limit: number = 50) {
  console.log('Finding products with Amazon URLs...');
  
  const products = await db
    .select()
    .from(supplies)
    .where(like(supplies.imageUrl, '%amazon%'))
    .limit(limit);
  
  console.log(`Found ${products.length} products with Amazon URLs to process`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const product of products) {
    // First try to download the existing Amazon URL (some may still work)
    const success = await downloadImage(
      product.id,
      product.imageUrl!,
      product.name,
      product.brand || 'unknown'
    );
    
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`\nComplete! Success: ${successCount}, Failed: ${failCount}`);
}

const limit = parseInt(process.argv[2] || '20');
processAmazonProducts(limit)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
