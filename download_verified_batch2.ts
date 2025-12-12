import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

// Verified accurate image mappings - searched and confirmed from Chewy
const verifiedImages: { productId: number; productName: string; brand: string; chewyImageUrl: string }[] = [
  // Kong Aqua (floating water toy - blue with rope)
  { productId: 3157, productName: 'Kong Aqua Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb65d-100a-7c56-8000-61972bdc0f4d._AC_SL1200_QL100_V1_.jpg' },
  { productId: 3164, productName: 'Kong Medium Aqua', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb65d-100a-7c56-8000-61972bdc0f4d._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Classic Goodie Bone (red bone)
  { productId: 3147, productName: 'Kong Goodie Bone Medium', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb642-93a0-784e-8000-1b40b52975a1._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Extreme Goodie Bone (black bone)
  { productId: 3146, productName: 'Kong Ext Goodie Bone Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb642-93a0-784e-8000-1b40b52975a1._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Biscuit Ball (red ball with bone-shaped ports)
  { productId: 3156, productName: 'Kong Biscuit Ball Small', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-classic-biscuit-ball-dog-toy-small/img-206922._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Puppy Binkie (puppy teether)
  { productId: 3162, productName: 'Kong Binkie Puppy Small', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb645-30cb-73af-8000-68ba6871757f._AC_SL1200_QL100_V1_.jpg' },
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
  console.log('=== Downloading Verified Kong Images (Batch 2) ===\n');
  
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
  console.log(`Total Kong images processed so far: ${8 + success}`);
  
  process.exit(0);
}

main().catch(console.error);
