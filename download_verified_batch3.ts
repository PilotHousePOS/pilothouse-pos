import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

// Verified accurate image mappings - searched and confirmed from Chewy
const verifiedImages: { productId: number; productName: string; brand: string; chewyImageUrl: string }[] = [
  // Kong Easy Treat Peanut Butter
  { productId: 3133, productName: 'Kong Easy Treat Peanut Butter', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-stuffn-easy-treat-peanut-butter-recipe/img-149471._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Stuff-a-Ball
  { productId: 3142, productName: 'Kong Stuff-a-ball Medium', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb65a-f310-7c86-8000-e624b2266049._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Wubba Classic
  { productId: 2933, productName: 'Kong Wubba Assort Extra Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-wubba-classic-dog-toy-color-varies-x-large/img-442805._AC_SL1200_QL100_V1_.jpg' },
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
  console.log('=== Downloading Verified Kong Images (Batch 3) ===\n');
  
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
  console.log(`Total Kong images processed so far: ${14 + success}`);
  
  process.exit(0);
}

main().catch(console.error);
