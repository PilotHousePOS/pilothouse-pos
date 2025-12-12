import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

// Verified accurate image mappings - searched and confirmed from Chewy
const verifiedImages: { productId: number; productName: string; brand: string; chewyImageUrl: string }[] = [
  // Kong Classic series
  { productId: 3161, productName: 'Kong Classic Small', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb655-4ad9-7cf8-8000-52289815188e._AC_SL1200_QL100_V1_.jpg' },
  { productId: 3160, productName: 'Kong Classic Medium', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb655-4ad9-7cf8-8000-52289815188e._AC_SL1200_QL100_V1_.jpg' },
  { productId: 3158, productName: 'Kong Classic Extra Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb655-4ad9-7cf8-8000-52289815188e._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Puppy series (Blue)
  { productId: 3168, productName: 'Kong Puppy Extra Small', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb645-30cb-73af-8000-68ba6871757f._AC_SL1200_QL100_V1_.jpg' },
  { productId: 3166, productName: 'Kong Puppy Medium', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb645-30cb-73af-8000-68ba6871757f._AC_SL1200_QL100_V1_.jpg' },
  { productId: 3165, productName: 'Kong Puppy Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb645-30cb-73af-8000-68ba6871757f._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Extreme series (Black)  
  { productId: 3153, productName: 'Kong Ext Small', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb65e-9d70-758d-8000-bdbea9426642._AC_SL1200_QL100_V1_.jpg' },
  { productId: 3150, productName: 'Kong Ext Extra Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb65e-9d70-758d-8000-bdbea9426642._AC_SL1200_QL100_V1_.jpg' },
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
  console.log('=== Downloading Verified Kong Images ===\n');
  
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
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  
  process.exit(0);
}

main().catch(console.error);
