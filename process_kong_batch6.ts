import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

interface ProductImage {
  id: number;
  name: string;
  brand: string;
  imageUrl: string;
}

// Verified Kong product images - Batch 6
const verifiedProducts: ProductImage[] = [
  // Kong Cat Active Scrunchie - from Chewy
  { id: 2235, name: 'Kong Active Scrunchie', brand: 'Kong', imageUrl: 'https://image.chewy.com/catalog/general/images/kong-cat-active-scrunchie-cat-toy/img-405436._AC_SL1200_QL100_V1_.jpg' },
  
  // Kong Cat Wubba Butterfly - from Kong official
  { id: 2225, name: 'Kong Cat Wubba Butterfly', brand: 'Kong', imageUrl: 'https://cdn11.bigcommerce.com/s-k3kxaf4rop/images/stencil/1280x1280/products/2247/17713/f9c5e763-41b2-4ad5-801e-8ef6ab83dfbe_medium__27274.1760781994.jpg' },
  
  // Kong Batabout Flicker Mouse - from Kong official
  { id: 2228, name: 'Kong Batabout Flicker Mouse', brand: 'Kong', imageUrl: 'https://cdn11.bigcommerce.com/s-k3kxaf4rop/images/stencil/1280x1280/products/2241/17675/4f45562c-338b-44b1-be8b-1a8ae3cde95f_medium__05079.1760781786.jpg' },
];

async function main() {
  console.log('=== Processing Kong Products Batch 6 ===\n');
  
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
  
  console.log('\n=== Batch 6 Summary ===');
  console.log(`Total: ${verifiedProducts.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log('\nResults:');
  results.forEach(r => console.log(r));
  
  process.exit(0);
}

main().catch(console.error);
