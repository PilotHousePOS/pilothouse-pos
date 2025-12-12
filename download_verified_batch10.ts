import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

// Verified accurate image mappings - searched and confirmed from Chewy
const verifiedImages: { productId: number; productName: string; brand: string; chewyImageUrl: string }[] = [
  // Kong Wubba Finz Blue Large
  { productId: 2934, productName: 'Kong Wubba Finz Blue Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-wubba-finz-dog-toy-blue-large/img-562962._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Cozie Elmer Elephant Medium
  { productId: 3083, productName: 'Kong Cozie Elmer Elephant Medium', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-cozie-elmer-the-elephant-dog-toy-medium/img-566655._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Squeezz Ball X-Large
  { productId: 3112, productName: 'Kong Squeezz Ball X Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-squeezz-ball-dog-toy-color-varies-x-large/img-384946._AC_SL1200_QL100_V1_.jpg' },
];

async function downloadAndStore(item: typeof verifiedImages[0]): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const result = await objectStorageService.downloadAndStoreProductImage(
      item.chewyImageUrl,
      item.productId,
      item.productName,
      item.brand
    );
    
    if (result.success && result.storedPath) {
      await storage.updateSupply(item.productId, { imageUrl: result.storedPath });
      return { success: true, path: result.storedPath };
    }
    return { success: false, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('=== Downloading Verified Kong Images (Batch 10) ===\n');
  
  let success = 0;
  let failed = 0;
  
  for (const item of verifiedImages) {
    console.log(`Processing: ${item.productName} (ID: ${item.productId})`);
    const result = await downloadAndStore(item);
    
    if (result.success) {
      console.log(`  ✓ Stored: ${result.path}`);
      success++;
    } else {
      console.log(`  ✗ Failed: ${result.error}`);
      failed++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total Kong images processed so far: ${36 + success}`);
  
  // Get current total in Object Storage
  const supplies = await storage.getAllSupplies();
  const inStorage = supplies.filter(s => s.imageUrl?.startsWith('/public-objects')).length;
  console.log(`Total products with Object Storage images: ${inStorage}`);
  
  // Show remaining Kong products
  const kong = supplies.filter(s => 
    s.brand?.toLowerCase() === 'kong' && 
    !s.imageUrl?.startsWith('/public-objects')
  );
  console.log(`Kong products still needing images: ${kong.length}`);
  
  process.exit(0);
}

main().catch(console.error);
