import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

interface ProductImage {
  id: number;
  name: string;
  brand: string;
  imageUrl: string;
}

// Verified Kong product images from Chewy - Batch 2
const verifiedProducts: ProductImage[] = [
  // Kong Ballistic Giraffe Medium/Large
  { id: 3009, name: 'Kong Ballistic Giraffe Medium/Large', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-ballistic-giraffe-squeaky-dog-plush-toy-pink-mediumlarge/img-374076._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Ballistic Alligator Medium/Large
  { id: 3022, name: 'Kong Ballistic Alligator Medium/Large', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-ballistic-alligator-squeaky-dog-plush-toy-green-mediumlarge/img-217352._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Cat Sport Balls - using Tennis Balls with Bells as closest match
  { id: 2246, name: 'Kong Cat Sport Balls', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-tennis-balls-with-bells-cat-toy/img-236181._AC_SL1200_QL100_V1_.jpg' },
];

async function main() {
  console.log('=== Processing Kong Products Batch 2 ===\n');
  
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
