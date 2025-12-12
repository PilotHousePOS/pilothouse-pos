import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

async function main() {
  console.log('=== Fixing Kong Puppy Activity Ball Medium Image ===\n');
  
  // Correct image URL from Chewy - the blue puppy Kong Activity Ball
  const correctImageUrl = 'https://image.chewy.com/catalog/general/images/moe/068fb653-57b6-72d0-8000-fde9b0269986._AC_SL1200_QL100_V1_.jpg';
  const productId = 3170;
  const productName = 'Kong Puppy Activity Ball Medium';
  const brand = 'Kong';
  
  console.log(`Product: ${productName} (ID: ${productId})`);
  console.log(`Downloading correct blue puppy Kong image...`);
  
  try {
    const result = await objectStorageService.downloadAndStoreProductImage(
      correctImageUrl,
      productId,
      productName,
      brand
    );
    
    if (result.success && result.storedPath) {
      await storage.updateSupply(productId, { imageUrl: result.storedPath });
      console.log(`✓ Image fixed successfully!`);
      console.log(`  New path: ${result.storedPath}`);
    } else {
      console.log(`✗ Failed: ${result.error}`);
    }
  } catch (err: any) {
    console.log(`✗ Error: ${err.message}`);
  }
  
  process.exit(0);
}

main().catch(console.error);
