import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

async function processProducts(brand: string, limit: number = 50) {
  console.log(`\n=== Processing ${brand} products ===`);
  
  const allSupplies = await storage.getAllSupplies();
  const toProcess = allSupplies.filter((s: any) => 
    s.brand === brand && 
    s.imageUrl?.startsWith('http')
  ).slice(0, limit);
  
  console.log(`Found ${toProcess.length} products to process`);
  
  let success = 0;
  let failed = 0;
  
  for (const supply of toProcess) {
    try {
      const result = await objectStorageService.downloadAndStoreImage(supply.imageUrl, `supplies/${supply.id}`);
      if (result) {
        await storage.updateSupply(supply.id, { imageUrl: result });
        success++;
        console.log(`✓ ${supply.id}: ${supply.name.substring(0, 40)}...`);
      } else {
        failed++;
        console.log(`✗ ${supply.id}: Download failed`);
      }
    } catch (err: any) {
      failed++;
      console.log(`✗ ${supply.id}: ${err.message}`);
    }
  }
  
  console.log(`\n${brand}: ${success} success, ${failed} failed`);
  return { success, failed };
}

async function main() {
  const brands = ['Kong', 'Science Diet', 'Tetra', 'Hikari', 'Kaytee'];
  
  for (const brand of brands) {
    await processProducts(brand, 30);
  }
  
  console.log('\n=== Done ===');
  process.exit(0);
}

main().catch(console.error);
