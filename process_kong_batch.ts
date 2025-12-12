import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

interface ProductImage {
  id: number;
  name: string;
  brand: string;
  imageUrl: string;
}

// Verified Kong product images from Chewy
const verifiedProducts: ProductImage[] = [
  // Kong AirDog Dumbbell Large - using Medium URL as base for product match
  { id: 3042, name: 'Kong Airdog Dumbbell Large', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-airdog-dumbbell-dog-toy-medium/img-366756._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Cozie Ali Alligator Medium
  { id: 3082, name: 'Kong Cozie Ali Alligatpor Medium', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-cozie-ali-the-alligator-dog-toy-medium/img-743652._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Cozie Buster Koala Medium
  { id: 3074, name: 'Kong Cozie Buster Koala Medium', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-cozie-buster-the-koala-dog-toy/img-657494._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Dental Ball Medium - use the dental ball image
  { id: 1497, name: 'Kong Dental Ball Medium', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-dental-ball-tough-squeaky-dog-treat-dispenser-toy-green-large/img-329185._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Flyer Small
  { id: 3043, name: 'Kong Flyer Small', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/moe/068fb658-05b3-750d-8000-77885c248f6d._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Cloud Extra Small
  { id: 1794, name: 'Kong Cloud Extra Small', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-cloud-collar-for-dogs-cats-x-small/img-304693._AC_SL1200_QL100_V1_.jpg' },
];

async function main() {
  console.log('=== Processing Kong Products Batch ===\n');
  
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
