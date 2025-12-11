import { db } from '../db';
import { supplies } from '../../shared/schema';
import { eq } from 'drizzle-orm';

// Verified correct image URLs (high-res, no source reference in final storage)
const productImageMapping: Record<number, { chewyUrl: string; storageName: string }> = {
  // Terrarium Dishes
  469: { chewyUrl: 'https://image.chewy.com/is/image/catalog/130116_MAIN._AC_SL1200_V1527879698_.jpg', storageName: 'zilla-terrarium-dish-small' },
  468: { chewyUrl: 'https://image.chewy.com/is/image/catalog/130118_MAIN._AC_SL1200_V1527879698_.jpg', storageName: 'zilla-terraced-dish-medium' },
  467: { chewyUrl: 'https://image.chewy.com/is/image/catalog/130120_MAIN._AC_SL1200_V1527879698_.jpg', storageName: 'zilla-terraced-dish-large' },
  470: { chewyUrl: 'https://image.chewy.com/is/image/catalog/130117_MAIN._AC_SL1200_V1527879698_.jpg', storageName: 'zilla-terrarium-dish-medium' },
  
  // Rock Lairs/Dens
  682: { chewyUrl: 'https://image.chewy.com/catalog/general/images/moe/06862ea7-dd84-78e4-8000-1461bdbc768a._AC_SL1200_QL100_V1_.jpg', storageName: 'zilla-rock-lair-medium' },
  681: { chewyUrl: 'https://image.chewy.com/catalog/general/images/moe/06862ea7-beee-7029-8000-8c8af668125d._AC_SL1200_QL100_V1_.jpg', storageName: 'zilla-rock-lair-large' },
  680: { chewyUrl: 'https://image.chewy.com/catalog/general/images/moe/06862ea7-b411-7e3f-8000-10978d017026._AC_SL1200_QL100_V1_.jpg', storageName: 'zilla-rock-lair-small' },
  666: { chewyUrl: 'https://image.chewy.com/catalog/general/images/moe/06862ea7-dd84-78e4-8000-1461bdbc768a._AC_SL1200_QL100_V1_.jpg', storageName: 'zilla-small-rock-den' },

  // Reflector Domes
  413: { chewyUrl: 'https://image.chewy.com/catalog/general/images/zilla-premium-reflector-light-heat-black-ceramic-dome-lighting-fixture-5-5in/img-78158._AC_SL1200_QL100_V1_.jpg', storageName: 'zilla-reflector-dome-5.5' },
  414: { chewyUrl: 'https://image.chewy.com/catalog/general/images/zilla-premium-reflector-light-heat-black-ceramic-dome-lighting-fixture-8-5in/img-78161._AC_SL1200_QL100_V1_.jpg', storageName: 'zilla-reflector-dome-8.5' },

  // Waterfall
  333: { chewyUrl: 'https://image.chewy.com/catalog/general/images/zilla-running-waterfall-large/img-2808._AC_SL1200_QL100_V1_.jpg', storageName: 'zilla-waterfall' },
  
  // Spring Cave
  334: { chewyUrl: 'https://image.chewy.com/catalog/general/images/zilla-spring-cave-decor-with-blue-led-rain-chamber-one-size/img-10061._AC_SL1200_QL100_V1_.jpg', storageName: 'zilla-spring-cave' },

  // Turtle products
  522: { chewyUrl: 'https://image.chewy.com/is/image/catalog/130072_MAIN._AC_SL1200_V1527879619_.jpg', storageName: 'zilla-turtle-miracle-ball' },
  523: { chewyUrl: 'https://image.chewy.com/is/image/catalog/130073_MAIN._AC_SL1200_V1527879619_.jpg', storageName: 'zilla-turtle-pure-water-care' },

  // Vegetable Mixes
  227: { chewyUrl: 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-vegetable-mix-lizard-food-4oz-bag/img-26397._AC_SL1200_QL100_V1_.jpg', storageName: 'zilla-vegetable-mix-calcium' },
  228: { chewyUrl: 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-vegetable-mix-lizard-food-4oz-bag/img-26397._AC_SL1200_QL100_V1_.jpg', storageName: 'zilla-vegetable-mix' },

  // Lighting fixtures
  278: { chewyUrl: 'https://image.chewy.com/is/image/catalog/130001_MAIN._AC_SL1200_V1527879568_.jpg', storageName: 'zilla-tropical-series-25-t8-18in' },
  276: { chewyUrl: 'https://image.chewy.com/is/image/catalog/129976_MAIN._AC_SL1200_V1527879568_.jpg', storageName: 'zilla-slimline-t8-desert-fixture-18' },
  277: { chewyUrl: 'https://image.chewy.com/is/image/catalog/129975_MAIN._AC_SL1200_V1527879567_.jpg', storageName: 'zilla-slimline-t8-tropical-fixture-18' },
  282: { chewyUrl: 'https://image.chewy.com/is/image/catalog/130060_MAIN._AC_SL1200_V1527879619_.jpg', storageName: 'zilla-pro-series-desert-50-uvb' },
  265: { chewyUrl: 'https://image.chewy.com/is/image/catalog/129998_MAIN._AC_SL1200_V1527879568_.jpg', storageName: 'zilla-tropical-mini-compact-fluorescent' },

  // Kits and Accessories
  753: { chewyUrl: 'https://image.chewy.com/catalog/general/images/zilla-tropical-reptile-terrarium-starter-kit-with-light-heat-10-gal/img-15155._AC_SL1200_QL100_V1_.jpg', storageName: 'zilla-tropical-kit' },
  152: { chewyUrl: 'https://image.chewy.com/is/image/catalog/130046_MAIN._AC_SL1200_V1527879619_.jpg', storageName: 'zilla-terrarium-cleaner' },
  155: { chewyUrl: 'https://image.chewy.com/is/image/catalog/202406_main._AC_SL1200_QL100_V1569423779_.jpg', storageName: 'zilla-tropical-mist-humidity-spray' },
  202: { chewyUrl: 'https://image.chewy.com/is/image/catalog/130044_MAIN._AC_SL1200_V1527879619_.jpg', storageName: 'zilla-water-pillow' },
};

async function downloadAndStore(sourceUrl: string, productId: number, storageName: string): Promise<string | null> {
  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      console.log(`  Failed to fetch: ${response.status}`);
      return null;
    }
    
    const buffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(buffer);
    
    // Store in Object Storage with clean path (no source reference)
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage();
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    
    if (!bucketId) {
      console.log('  No bucket ID configured');
      return null;
    }
    
    const bucket = storage.bucket(bucketId);
    const cleanPath = `public/products/zilla/${storageName}-${productId}.jpg`;
    const file = bucket.file(cleanPath);
    
    await file.save(imageBuffer, {
      metadata: { contentType: 'image/jpeg' }
    });
    
    // Return clean storage path (no external reference)
    return `/public-objects/products/zilla/${storageName}-${productId}.jpg`;
  } catch (err) {
    console.log(`  Error: ${err}`);
    return null;
  }
}

async function fixZillaProducts() {
  console.log('=== Fixing Zilla Products with Verified Images ===');
  console.log('Images will be stored with clean, non-traceable paths\n');
  
  let success = 0;
  let failed = 0;
  
  for (const [id, config] of Object.entries(productImageMapping)) {
    const productId = parseInt(id);
    
    // Get product name
    const [product] = await db.select({ name: supplies.name })
      .from(supplies)
      .where(eq(supplies.id, productId));
    
    if (!product) {
      console.log(`ID ${productId}: Not found`);
      failed++;
      continue;
    }
    
    console.log(`Processing ID ${productId}: ${product.name}`);
    
    const storagePath = await downloadAndStore(config.chewyUrl, productId, config.storageName);
    
    if (storagePath) {
      // Update database with clean path only (no source reference stored)
      await db.update(supplies)
        .set({ imageUrl: storagePath })
        .where(eq(supplies.id, productId));
      
      console.log(`  ✓ Saved: ${storagePath}`);
      success++;
    } else {
      console.log(`  ✗ Failed`);
      failed++;
    }
  }
  
  console.log(`\n=== Complete ===`);
  console.log(`Success: ${success}, Failed: ${failed}`);
  console.log(`All stored images have clean paths with no external references`);
}

fixZillaProducts().catch(console.error);
