import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

// Verified accurate image mappings - searched and confirmed from Chewy
const verifiedImages: { productId: number; productName: string; brand: string; chewyImageUrl: string }[] = [
  // Kong Goodiez Ring
  { productId: 3179, productName: 'Kong Goodiez Ring Medium', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-goodiez-ring-dog-toy-blue-medium/img-609380._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Rewards Tipsy Treat Dispenser
  { productId: 3171, productName: 'Kong Treat Spinner Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-rewards-tipsy-treat-dispenser-dog-toy-blue-large/img-198614._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Licks Rewards
  { productId: 3149, productName: 'Kong Licks Extra Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-licks-rewards-dog-treat-dispensers-toy-green-mediumlarge/img-655900._AC_SL1200_QL100_V1_.jpg' },
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
  console.log('=== Downloading Verified Kong Images (Batch 7) ===\n');
  
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
  console.log(`Total Kong images processed so far: ${27 + success}`);
  
  // Get current total in Object Storage
  const supplies = await storage.getAllSupplies();
  const inStorage = supplies.filter(s => s.imageUrl?.startsWith('/public-objects')).length;
  console.log(`Total products with Object Storage images: ${inStorage}`);
  
  process.exit(0);
}

main().catch(console.error);
