import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

interface ProductImage {
  id: number;
  name: string;
  brand: string;
  imageUrl: string;
}

// Verified Kong product images from Chewy - Batch 3
const verifiedProducts: ProductImage[] = [
  // Kong Cozie Marvin Moose Medium
  { id: 3079, name: 'Kong Cozie Marvin Moose Medium', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-cozie-marvin-the-moose-plush-dog-toy-medium/img-709760._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Cozie Elmer Elephant Medium
  { id: 3076, name: 'Kong Cozie Elmer Elephant Medium', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-cozie-elmer-the-elephant-dog-toy-medium/img-566655._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Squeezz Ball Medium
  { id: 3029, name: 'Kong Squeezz Ball Medium', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-squeezz-ball-dog-toy-color-varies-x-large/img-384946._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Classic Large
  { id: 3015, name: 'Kong Classic Large', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb655-4ad9-7cf8-8000-52289815188e._AC_SL1200_QL100_V1_.jpg' },
];

async function main() {
  console.log('=== Processing Kong Products Batch 3 ===\n');
  
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
