import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

// Verified accurate image mappings - searched and confirmed from Chewy
const verifiedImages: { productId: number; productName: string; brand: string; chewyImageUrl: string }[] = [
  // Kong Ziggies
  { productId: 3124, productName: 'Kong Ziggies 7oz Small', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-stuffn-ziggies-small-dog-treats-7oz-bag/img-604013._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Snacks Bacon & Cheese
  { productId: 3127, productName: 'Kong Sncks Bacon & Cheese Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-stuffn-bacon-cheese-snacks-large-dog-treats-11oz-bag/img-634447._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong ZoomGroom Brush
  { productId: 3136, productName: 'Kong Brush', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-dog-zoomgroom-multi-use-brush-boysenberry/img-262390._AC_SL1200_QL100_V1_.jpg' },
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
  console.log('=== Downloading Verified Kong Images (Batch 6) ===\n');
  
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
  console.log(`Total Kong images processed so far: ${24 + success}`);
  
  // Get current total in Object Storage
  const supplies = await storage.getAllSupplies();
  const inStorage = supplies.filter(s => s.imageUrl?.startsWith('/public-objects')).length;
  console.log(`Total products with Object Storage images: ${inStorage}`);
  
  process.exit(0);
}

main().catch(console.error);
