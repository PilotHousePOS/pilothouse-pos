import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

// Verified accurate image mappings - searched and confirmed from Chewy
const verifiedImages: { productId: number; productName: string; brand: string; chewyImageUrl: string }[] = [
  // Kong Extreme Ball Medium
  { productId: 3094, productName: 'Kong Ball Extreme Medium', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb643-2f42-7403-8000-f1388d151249._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Jerky Chicken M/L
  { productId: 3123, productName: 'Kong Jerky Chicken M/L', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-jerky-chicken-recipe-grain-free-dog-mediumlarge-treats-5oz-pouch/img-290696._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Squeezz Ball Large
  { productId: 3183, productName: 'Kong Squeezz Ball Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-squeezz-ball-dog-toy-color-varies-large/img-520344._AC_SL1200_QL100_V1_.jpg' },
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
  console.log('=== Downloading Verified Kong Images (Batch 14) ===\n');
  
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
  console.log(`Total Kong images processed so far: ${46 + success}`);
  
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
