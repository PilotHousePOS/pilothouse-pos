import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

// Verified accurate image mappings - searched and confirmed from Chewy
const verifiedImages: { productId: number; productName: string; brand: string; chewyImageUrl: string }[] = [
  // Kong Squeezz Ball (assorted jewel tones)
  { productId: 3159, productName: 'Kong Squeez Ball Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-squeezz-ball-dog-toy-color-varies-x-large/img-384946._AC_SL1200_QL100_V1_.jpg' },
  { productId: 3153, productName: 'Kong Squeez Ball Medium', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-squeezz-ball-dog-toy-color-varies-x-large/img-384946._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong SqueakAir Tennis Balls
  { productId: 3165, productName: 'Kong Squeakair Ball M 3pk', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-squeakair-balls-packs-dog-toy-medium/img-780705._AC_SL1200_QL100_V1_.jpg' },
  { productId: 3166, productName: 'Kong Squeakair Ball L 2pk', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-squeakair-balls-packs-dog-toy-medium/img-780705._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Jumbler Ball
  { productId: 3163, productName: 'Kong Jumbler Ball Med/Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-jumbler-ball-dog-toy-color-varies-mediumlarge/img-534370._AC_SL1200_QL100_V1_.jpg' },
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
  console.log('=== Downloading Verified Kong Images (Batch 4) ===\n');
  
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
  console.log(`Total Kong images processed so far: ${17 + success}`);
  
  process.exit(0);
}

main().catch(console.error);
