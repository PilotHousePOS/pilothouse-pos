import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

interface ProductImage {
  id: number;
  name: string;
  brand: string;
  imageUrl: string;
}

// Verified Kong product images from Chewy - Batch 4
const verifiedProducts: ProductImage[] = [
  // Kong Extreme Large
  { id: 3016, name: 'Kong Extreme Large', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb65e-9d70-758d-8000-bdbea9426642._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Wubba Classic Large
  { id: 3033, name: 'Kong Wubba Classic Large', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-wubba-classic-dog-toy-color-varies-large/img-238184._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Goodie Bone Medium
  { id: 3019, name: 'Kong Goodie Bone Medium', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-classic-goodie-bone-dog-toy-medium/img-444588._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Puppy Medium Blue
  { id: 3012, name: 'Kong Puppy Medium Blue', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb645-30cb-73af-8000-68ba6871757f._AC_SL1200_QL100_V1_.jpg' },
];

async function main() {
  console.log('=== Processing Kong Products Batch 4 ===\n');
  
  let successCount = 0;
  let failCount = 0;
  const results: string[] = [];
  
  for (const product of verifiedProducts) {
    console.log(`Processing: ${product.name} (ID: ${product.id})`);
    
    try {
      const result = await objectStorageService.downloadAndStoreProductImage(
        product.imageUrl,
        product.id,
        product.name,
        product.brand
      );
      
      if (result.success && result.storedPath) {
        await storage.updateSupply(product.id, { imageUrl: result.storedPath });
        console.log(`  ✓ Success: ${result.storedPath}`);
        results.push(`✓ ${product.name} (ID: ${product.id})`);
        successCount++;
      } else {
        console.log(`  ✗ Failed: ${result.error}`);
        results.push(`✗ ${product.name} - ${result.error}`);
        failCount++;
      }
    } catch (err: any) {
      console.log(`  ✗ Error: ${err.message}`);
      results.push(`✗ ${product.name} - Error: ${err.message}`);
      failCount++;
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Total: ${verifiedProducts.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log('\nResults:');
  results.forEach(r => console.log(r));
  
  process.exit(0);
}

main().catch(console.error);
