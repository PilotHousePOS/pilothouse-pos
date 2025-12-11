import { db } from '../db';
import { supplies } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorageService';

// Verified Chewy URLs for products with wrong images
// Note: These URLs are only used temporarily for download - NOT stored in database
const productUrls: Record<number, string> = {
  // Terrarium Dishes
  469: 'https://image.chewy.com/is/image/catalog/130116_MAIN._AC_SL1200_V1527879698_.jpg',
  468: 'https://image.chewy.com/is/image/catalog/130118_MAIN._AC_SL1200_V1527879698_.jpg',
  467: 'https://image.chewy.com/is/image/catalog/130120_MAIN._AC_SL1200_V1527879698_.jpg',
  470: 'https://image.chewy.com/is/image/catalog/130117_MAIN._AC_SL1200_V1527879698_.jpg',
  
  // Rock Lairs/Dens - using Shale Rock Den image
  682: 'https://image.chewy.com/catalog/general/images/moe/06862ea7-dd84-78e4-8000-1461bdbc768a._AC_SL1200_QL100_V1_.jpg',
  681: 'https://image.chewy.com/catalog/general/images/moe/06862ea7-beee-7029-8000-8c8af668125d._AC_SL1200_QL100_V1_.jpg',
  680: 'https://image.chewy.com/catalog/general/images/moe/06862ea7-b411-7e3f-8000-10978d017026._AC_SL1200_QL100_V1_.jpg',
  666: 'https://image.chewy.com/catalog/general/images/moe/06862ea7-dd84-78e4-8000-1461bdbc768a._AC_SL1200_QL100_V1_.jpg',

  // Reflector Domes
  413: 'https://image.chewy.com/catalog/general/images/zilla-premium-reflector-light-heat-black-ceramic-dome-lighting-fixture-5-5in/img-78158._AC_SL1200_QL100_V1_.jpg',
  414: 'https://image.chewy.com/catalog/general/images/zilla-premium-reflector-light-heat-black-ceramic-dome-lighting-fixture-8-5in/img-78161._AC_SL1200_QL100_V1_.jpg',
  
  // Spring Cave
  334: 'https://image.chewy.com/catalog/general/images/zilla-spring-cave-decor-with-blue-led-rain-chamber-one-size/img-10061._AC_SL1200_QL100_V1_.jpg',

  // Vegetable Mixes
  227: 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-vegetable-mix-lizard-food-4oz-bag/img-26397._AC_SL1200_QL100_V1_.jpg',
  228: 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-vegetable-mix-lizard-food-4oz-bag/img-26397._AC_SL1200_QL100_V1_.jpg',

  // Tropical Mist Humidity Spray
  155: 'https://image.chewy.com/is/image/catalog/202406_main._AC_SL1200_QL100_V1569423779_.jpg',

  // Terrarium Cleaner
  152: 'https://image.chewy.com/is/image/catalog/130046_MAIN._AC_SL1200_V1527879619_.jpg',
};

async function fixZillaProducts() {
  console.log('=== Fixing Zilla Products ===');
  console.log('Images will be stored with clean, non-traceable paths');
  console.log('Source URLs are used temporarily for download only - NOT stored in database\n');
  
  const objectStorageService = new ObjectStorageService();
  let success = 0;
  let failed = 0;
  
  for (const [id, url] of Object.entries(productUrls)) {
    const productId = parseInt(id);
    
    // Get product details
    const [product] = await db.select()
      .from(supplies)
      .where(eq(supplies.id, productId));
    
    if (!product) {
      console.log(`ID ${productId}: Not found in database`);
      failed++;
      continue;
    }
    
    console.log(`Processing ID ${productId}: ${product.name}`);
    
    try {
      // Download from source URL and store in Object Storage
      // The stored path will be clean (no source reference)
      const result = await objectStorageService.downloadAndStoreProductImage(
        url,
        product.id,
        product.name,
        product.brand || 'Zilla'
      );
      
      if (result.success && result.storedPath) {
        // Update database with ONLY the clean storage path
        // No source URL is stored anywhere
        await db.update(supplies)
          .set({ imageUrl: result.storedPath })
          .where(eq(supplies.id, productId));
        
        console.log(`  ✓ Saved: ${result.storedPath}`);
        success++;
      } else {
        console.log(`  ✗ Failed: ${result.error}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`  ✗ Error: ${err.message}`);
      failed++;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`\n=== Complete ===`);
  console.log(`Success: ${success}, Failed: ${failed}`);
  console.log(`All stored images have clean paths - no external source references stored`);
}

fixZillaProducts().catch(console.error);
