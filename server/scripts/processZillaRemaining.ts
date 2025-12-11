import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, or, ilike } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import https from 'https';

const chewyProducts: Record<string, string> = {
  'Aquatic Turtle Sticks': 'https://image.chewy.com/catalog/general/images/zilla-aquatic-turtle-food-sticks/img-48282._AC_SL1200_QL100_V1_.jpg',
  'Basic Tropical Kit': 'https://image.chewy.com/catalog/general/images/zilla-tropical-reptile-terrarium/img-70447._AC_SL1200_QL100_V1_.jpg',
  'Bearddrg Kit': 'https://image.chewy.com/catalog/general/images/zilla-desert-reptile-terrarium/img-70445._AC_SL1200_QL100_V1_.jpg',
  'Black Heat Bulb': 'https://image.chewy.com/catalog/general/images/moe/06862ea7-5a3b-703b-8000-4d91edabc50e._AC_SL1200_QL100_V1_.jpg',
  'Black Heat Spot': 'https://image.chewy.com/catalog/general/images/moe/06862ea7-5a3b-703b-8000-4d91edabc50e._AC_SL1200_QL100_V1_.jpg',
  'Canopy Series Desert': 'https://image.chewy.com/catalog/general/images/zilla-t8-desert-light-fixture/img-70434._AC_SL1200_QL100_V1_.jpg',
  'Canopy Series Tropical': 'https://image.chewy.com/catalog/general/images/zilla-t8-tropical-light-fixture/img-70436._AC_SL1200_QL100_V1_.jpg',
  'Creature Cage': 'https://image.chewy.com/catalog/general/images/zilla-front-opening-terrarium/img-52189._AC_SL1200_QL100_V1_.jpg',
  'Cricket Drink': 'https://image.chewy.com/catalog/general/images/zilla-gut-load-cricket-drink/img-70418._AC_SL1200_QL100_V1_.jpg',
  'Critter Cage': 'https://image.chewy.com/catalog/general/images/zilla-critter-cage/img-19088._AC_SL1200_QL100_V1_.jpg',
  'Day Blue Light': 'https://image.chewy.com/catalog/general/images/zilla-day-blue-light-bulb/img-70407._AC_SL1200_QL100_V1_.jpg',
  'Day White Light': 'https://image.chewy.com/catalog/general/images/zilla-day-white-light-bulb/img-70409._AC_SL1200_QL100_V1_.jpg',
  'Deluxe Snake Kit': 'https://image.chewy.com/catalog/general/images/zilla-deluxe-snake-kit/img-70449._AC_SL1200_QL100_V1_.jpg',
  'Desert Blend': 'https://image.chewy.com/catalog/general/images/zilla-desert-blend-ground-english-walnut-shell-reptile-bedding/img-19092._AC_SL1200_QL100_V1_.jpg',
  'Desert Mini Compact': 'https://image.chewy.com/catalog/general/images/zilla-mini-compact-fluorescent-bulb-desert/img-70415._AC_SL1200_QL100_V1_.jpg',
  'Desert Series 50 T8': 'https://image.chewy.com/catalog/general/images/zilla-desert-series-50-t8-fluorescent-bulb/img-70413._AC_SL1200_QL100_V1_.jpg',
  'Digital Temp': 'https://image.chewy.com/catalog/general/images/zilla-digital-terrarium-thermometer/img-70401._AC_SL1200_QL100_V1_.jpg',
  'Dual Low Profile': 'https://image.chewy.com/catalog/general/images/zilla-dual-low-profile-fixture/img-70430._AC_SL1200_QL100_V1_.jpg',
  'Durable Den': 'https://image.chewy.com/catalog/general/images/zilla-durable-den/img-70421._AC_SL1200_QL100_V1_.jpg',
  'Durable Dish': 'https://image.chewy.com/catalog/general/images/zilla-durable-dish/img-70419._AC_SL1200_QL100_V1_.jpg',
  'Fruit Mix': 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-fruit-mix/img-70389._AC_SL1200_QL100_V1_.jpg',
  'Green Liner': 'https://image.chewy.com/catalog/general/images/zilla-terrarium-liner/img-19090._AC_SL1200_QL100_V1_.jpg',
  'Ground Cover': 'https://image.chewy.com/catalog/general/images/zilla-jungle-mix-fir-sphagnum-peat-moss-reptile-bedding/img-19086._AC_SL1200_QL100_V1_.jpg',
  'Gut Load': 'https://image.chewy.com/catalog/general/images/zilla-gut-load-cricket-drink/img-70418._AC_SL1200_QL100_V1_.jpg',
  'Halogen Mini Dome': 'https://image.chewy.com/catalog/general/images/zilla-halogen-mini-dome/img-70428._AC_SL1200_QL100_V1_.jpg',
  'Heat Mat': 'https://image.chewy.com/catalog/general/images/zilla-heat-mat/img-70393._AC_SL1200_QL100_V1_.jpg',
  'Humidity Gauge': 'https://image.chewy.com/catalog/general/images/zilla-terrarium-humidity-gauge/img-70403._AC_SL1200_QL100_V1_.jpg',
  'Jungle Mix': 'https://image.chewy.com/catalog/general/images/zilla-jungle-mix-fir-sphagnum-peat-moss-reptile-bedding/img-19086._AC_SL1200_QL100_V1_.jpg',
  'Munchies Omnivore': 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-omnivore-mix/img-70391._AC_SL1200_QL100_V1_.jpg',
  'Munchies Vegetable': 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-vegetable-mix/img-70387._AC_SL1200_QL100_V1_.jpg',
  'Night Black Heat': 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-bulb/img-70411._AC_SL1200_QL100_V1_.jpg',
  'Night Red Bulb': 'https://image.chewy.com/catalog/general/images/zilla-night-red-bulb/img-76254._AC_SL1200_QL100_V1_.jpg',
  'Premium Reflector': 'https://image.chewy.com/catalog/general/images/zilla-premium-reflector-dome/img-70426._AC_SL1200_QL100_V1_.jpg',
  'Reptile Health': 'https://image.chewy.com/catalog/general/images/zilla-reptile-health-supplies/img-70399._AC_SL1200_QL100_V1_.jpg',
  'Rock Lair': 'https://image.chewy.com/catalog/general/images/zilla-rock-lair/img-70423._AC_SL1200_QL100_V1_.jpg',
  'Screen Cover': 'https://image.chewy.com/catalog/general/images/zilla-fresh-air-screen-cover/img-19094._AC_SL1200_QL100_V1_.jpg',
  'Slimline Desert': 'https://image.chewy.com/catalog/general/images/zilla-slimline-desert-fixture/img-70438._AC_SL1200_QL100_V1_.jpg',
  'Slimline Tropical': 'https://image.chewy.com/catalog/general/images/zilla-slimline-tropical-fixture/img-70440._AC_SL1200_QL100_V1_.jpg',
  'Spring Cave': 'https://image.chewy.com/catalog/general/images/zilla-spring-cave-decor-blue-led-rain/img-52191._AC_SL1200_QL100_V1_.jpg',
  'Temp Controller': 'https://image.chewy.com/catalog/general/images/zilla-temperature-controller/img-70395._AC_SL1200_QL100_V1_.jpg',
  'Terrarium Thermometer': 'https://image.chewy.com/catalog/general/images/zilla-terrarium-thermometer/img-70397._AC_SL1200_QL100_V1_.jpg',
  'Tropical Mini Compact': 'https://image.chewy.com/catalog/general/images/zilla-mini-compact-fluorescent-bulb-tropical/img-70417._AC_SL1200_QL100_V1_.jpg',
  'Tropical Series 25 T8': 'https://image.chewy.com/catalog/general/images/zilla-tropical-series-25-t8-fluorescent-bulb/img-70414._AC_SL1200_QL100_V1_.jpg',
  'Turtle Basking Platform': 'https://image.chewy.com/catalog/general/images/zilla-turtle-basking-platform-filter/img-70443._AC_SL1200_QL100_V1_.jpg',
  'Water Conditioner': 'https://image.chewy.com/catalog/general/images/zilla-reptile-water-conditioner/img-70385._AC_SL1200_QL100_V1_.jpg',
  'Bark Bend': 'https://image.chewy.com/catalog/general/images/zilla-bark-bends-habitat-decor/img-70425._AC_SL1200_QL100_V1_.jpg',
  'Ceramic Heat Emitter': 'https://image.chewy.com/catalog/general/images/moe/0686264d-66d9-7a3a-8000-9077ca4d8a8a._AC_SL1200_QL100_V1_.jpg',
  'QuickBuild': 'https://image.chewy.com/catalog/general/images/zilla-quickbuild-terrarium-easy-clean/img-103833._AC_SL1200_QL100_V1_.jpg',
};

async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const makeRequest = (requestUrl: string, redirectCount = 0) => {
      if (redirectCount > 3) {
        resolve(Buffer.alloc(0));
        return;
      }
      
      const protocol = requestUrl.startsWith('https') ? https : require('http');
      protocol.get(requestUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*'
        }
      }, (response: any) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            makeRequest(redirectUrl, redirectCount + 1);
            return;
          }
        }
        if (response.statusCode !== 200) {
          resolve(Buffer.alloc(0));
          return;
        }
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', () => resolve(Buffer.alloc(0)));
    };
    makeRequest(url);
  });
}

async function main() {
  const objectStorageService = new ObjectStorageService();
  const publicPaths = objectStorageService.getPublicObjectSearchPaths();
  const bucketPath = publicPaths[0];
  const pathParts = bucketPath.split('/').filter(Boolean);
  const bucketName = pathParts[0];
  const prefix = pathParts.slice(1).join('/');
  
  const products = await db.select().from(supplies)
    .where(eq(supplies.brand, 'Zilla'));
  
  const brokenProducts = products.filter(p => 
    p.imageUrl?.includes('amazon') || p.imageUrl?.includes('media-amazon')
  );
  
  console.log(`Processing ${brokenProducts.length} Zilla products with broken URLs...\n`);
  
  let success = 0;
  let failed = 0;
  const imageCache: Record<string, Buffer> = {};
  
  for (const product of brokenProducts) {
    const name = product.name || '';
    
    let matchedKey = '';
    let imageUrl = '';
    
    for (const [key, url] of Object.entries(chewyProducts)) {
      if (name.toLowerCase().includes(key.toLowerCase())) {
        matchedKey = key;
        imageUrl = url;
        break;
      }
    }
    
    if (!imageUrl) {
      console.log(`❌ No mapping for: ${name}`);
      failed++;
      continue;
    }
    
    let imageBuffer: Buffer;
    if (imageCache[imageUrl]) {
      imageBuffer = imageCache[imageUrl];
    } else {
      imageBuffer = await downloadImage(imageUrl);
      if (imageBuffer.length > 1000) {
        imageCache[imageUrl] = imageBuffer;
      }
    }
    
    if (imageBuffer.length < 1000) {
      console.log(`❌ Failed to download for: ${name}`);
      failed++;
      continue;
    }
    
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const objectFileName = `products/zilla/${sanitizedName}-${product.id}.jpg`;
    const fullPath = prefix ? `${prefix}/${objectFileName}` : objectFileName;
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(fullPath);
    
    await file.save(imageBuffer, {
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'public, max-age=31536000' }
    });
    
    await setObjectAclPolicy(file, { visibility: 'public' });
    
    const newImageUrl = `/public-objects/${objectFileName}`;
    await db.update(supplies).set({ imageUrl: newImageUrl }).where(eq(supplies.id, product.id));
    
    console.log(`✓ ${name}`);
    success++;
  }
  
  console.log(`\n========================================`);
  console.log(`Success: ${success} | Failed: ${failed}`);
  console.log(`========================================`);
}

main().catch(console.error);
