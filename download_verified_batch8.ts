import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

// Verified accurate image mappings - searched and confirmed from Chewy
const verifiedImages: { productId: number; productName: string; brand: string; chewyImageUrl: string }[] = [
  // Kong Snacks Liver
  { productId: 3128, productName: 'Kong Sncks Liver Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-stuffn-liver-snacks-crunchy-dog-treats-11oz/img-686976._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Ring Medium/Large
  { productId: 3156, productName: 'Kong Ring Medium/Large', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb64a-4944-7629-8000-89a939fb316d._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Cozie Marvin Moose Medium
  { productId: 3138, productName: 'Kong Cozie Marvin Moose Medium', brand: 'Kong', chewyImageUrl: 'https://image.chewy.com/catalog/general/images/kong-cozie-marvin-the-moose-plush-dog-toy-medium/img-709760._AC_SL1200_QL100_V1_.jpg' },
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
  console.log('=== Downloading Verified Kong Images (Batch 8) ===\n');
  
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
  console.log(`Total Kong images processed so far: ${30 + success}`);
  
  // Get current total in Object Storage
  const supplies = await storage.getAllSupplies();
  const inStorage = supplies.filter(s => s.imageUrl?.startsWith('/public-objects')).length;
  console.log(`Total products with Object Storage images: ${inStorage}`);
  
  process.exit(0);
}

main().catch(console.error);
