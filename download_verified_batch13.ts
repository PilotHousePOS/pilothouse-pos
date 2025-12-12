import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

// Verified accurate image mappings - searched and confirmed from Chewy
const verifiedImages: { productId: number; productName: string; brand: string; chewyImageUrl: string }[] = [
  // Kong Stuff'N Puppy Ziggies Small 12 count
  { productId: 3122, productName: 'Kong Ziggies Puppy Small 7oz', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-stuffn-puppy-ziggies-dog-treats-small-12-count/img-521255._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Ball Medium - red classic ball
  { productId: 3095, productName: 'Kong Ball Medium', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb65c-474c-7bbe-8000-4dcfb4a590ef._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Extreme Ball Medium
  { productId: 3094, productName: 'Kong Ball Extreme Medium', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb652-8ea8-7eae-8000-44f90b8d0003._AC_SL1200_QL100_V1_.jpg' },
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
  console.log('=== Downloading Verified Kong Images (Batch 13) ===\n');
  
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
  console.log(`Total Kong images processed so far: ${44 + success}`);
  
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
  
  // Sample remaining
  console.log('\nSample Kong products still needing images:');
  kong.slice(0, 8).forEach(p => console.log(`  - ID ${p.id}: ${p.name}`));
  
  process.exit(0);
}

main().catch(console.error);
