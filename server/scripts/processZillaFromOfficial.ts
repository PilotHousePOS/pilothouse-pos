import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, and, or, ilike } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import https from 'https';

const zillaProductImages: Record<string, string> = {
  'aquatic turtle sticks': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/New-Zilla-Images/096316003026Zilla-Aquatic-Turtle-Sticks-Natural-45-oz/09631600302601.jpg',
  'bark bend': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Decor/Dens-HidingPlaces/096316685529main.jpg',
  'bark blend': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/New-2/Bark-Blend--8-Q-and-24-Q/09631611301501.jpg',
  'desert blend': 'https://www.zillarules.com/-/media/project/oneweb/zilla/images/products-homepage/product-images/new-3/desert-blend/09631670045101.jpg',
  'jungle mix': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Bedding/Jungle-Mix/09631611300201.jpg',
  'terrarium liner': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Bedding/Terrarium-Liners/096316680128main.jpg',
  'green liner': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Bedding/Terrarium-Liners/096316680128main.jpg',
  'grey liner': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Bedding/Terrarium-Liners/096316680128main.jpg',
  'critter cage': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Terrariums/Critter-Cages/096316680302main.jpg',
  'creature cage': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Terrariums/front-opening/09631610923002.jpg',
  'durable dish': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Decor/Bowls-Dishes/096316685512main.jpg',
  'durable den': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Decor/Dens-HidingPlaces/096316685505main.jpg',
  'rock den': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Decor/Dens-HidingPlaces/096316685505main.jpg',
  'shale rock den': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Decor/Dens-HidingPlaces/096316117310main.jpg',
  'spring cave': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Decor/springs-ledges-and-ramps/09631611708001.jpg',
  'fruit mix': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Food/Munchies-Fruit/09631600011301.jpg',
  'vegetable mix': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Food/Munchies-Vegetable/09631600012001.jpg',
  'omnivore mix': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Food/Munchies-Omnivore/09631600010601.jpg',
  'cricket drink': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Food/Gutload-Cricketdrink/096316700017main.jpg',
  'gut load': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Food/Gutload-Cricketdrink/096316700017main.jpg',
  'night black': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Night-Black-Heat/096316150041main.jpg',
  'night red': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Night-Red/096316150089main.jpg',
  'day blue': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Day-Blue/096316150171main.jpg',
  'day white': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Day-White/096316150126main.jpg',
  'black heat': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Night-Black-Heat/096316150041main.jpg',
  'halogen mini dome': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Halogen-MiniDome/096316156296pt01.jpg',
  'premium reflector': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Premium-Reflector-Dome/096316156005main.jpg',
  'canopy series': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/T8-Light-Fixtures/096316280359main.jpg',
  'slimline': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Slimline/096316156319main.jpg',
  'desert series 50': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Desert-50/096316280182main.jpg',
  'tropical series 25': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Tropical-25/096316280137main.jpg',
  'mini compact': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Mini-Compact-Fluorescent/096316280205main.jpg',
  'dual low profile': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Lighting-Heating/Dual-Low-Profile-Fixture/096316280144main.jpg',
  'heat mat': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Heat-Emitters/Heat-Mats/096316280960main.jpg',
  'ceramic heat': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Heat-Emitters/Ceramic-Heat-Emitter/096316281011main.jpg',
  'digital temp': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Environmental-Control/Digital-Temp-Hum-Gauge/096316680425main.jpg',
  'thermometer': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Environmental-Control/Digital-Temp-Hum-Gauge/096316680425main.jpg',
  'humidity gauge': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Environmental-Control/humidity-temp-gauge/096316680418main.jpg',
  'temp controller': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Environmental-Control/temp-controller/096316680210main.jpg',
  'screen cover': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/ScreenCovers-Accessories/Fresh-Air-Screen-Covers/096316680678main.jpg',
  'fresh air': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/ScreenCovers-Accessories/Fresh-Air-Screen-Covers/096316680678main.jpg',
  'bearded dragon kit': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Terrariums/kits-combo/09631612003001.jpg',
  'bearddrg kit': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Terrariums/kits-combo/09631612003001.jpg',
  'snake kit': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Terrariums/kits-combo/09631612004001.jpg',
  'tropical kit': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Terrariums/kits-combo/09631612002001.jpg',
  'quickbuild': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Terrariums/quickbuild/zilla-quickbuild-30in-01.jpg',
  'micro habitat': 'https://www.zillarules.com/-/media/Project/OneWeb/Zilla/Images/products-homepage/product-images/Terrariums/micro-habitats/096316090040main.jpg',
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const makeRequest = (requestUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        resolve(Buffer.alloc(0));
        return;
      }
      
      const protocol = requestUrl.startsWith('https') ? https : require('http');
      protocol.get(requestUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.zillarules.com/'
        },
        timeout: 30000
      }, (response: any) => {
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            const fullUrl = redirectUrl.startsWith('http') ? redirectUrl : `https://www.zillarules.com${redirectUrl}`;
            makeRequest(fullUrl, redirectCount + 1);
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
        response.on('error', () => resolve(Buffer.alloc(0)));
      }).on('error', () => resolve(Buffer.alloc(0)))
        .on('timeout', () => resolve(Buffer.alloc(0)));
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
    const name = (product.name || '').toLowerCase();
    
    let matchedKey = '';
    let imageUrl = '';
    
    for (const [key, url] of Object.entries(zillaProductImages)) {
      if (name.includes(key)) {
        matchedKey = key;
        imageUrl = url;
        break;
      }
    }
    
    if (!imageUrl) {
      console.log(`❌ No mapping: ${product.name}`);
      failed++;
      continue;
    }
    
    let imageBuffer: Buffer;
    if (imageCache[imageUrl]) {
      imageBuffer = imageCache[imageUrl];
      console.log(`  (cached)`);
    } else {
      await delay(500);
      imageBuffer = await downloadImage(imageUrl);
      if (imageBuffer.length > 1000) {
        imageCache[imageUrl] = imageBuffer;
      }
    }
    
    if (imageBuffer.length < 1000) {
      console.log(`❌ Download failed: ${product.name}`);
      failed++;
      continue;
    }
    
    const sanitizedName = name.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const objectFileName = `products/zilla/${sanitizedName}-${product.id}.jpg`;
    const fullPath = prefix ? `${prefix}/${objectFileName}` : objectFileName;
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(fullPath);
    
    await file.save(imageBuffer, {
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'public, max-age=31536000' }
    });
    
    await setObjectAclPolicy(file, { owner: '', visibility: 'public' });
    
    await db.update(supplies).set({ imageUrl: `/public-objects/${objectFileName}` }).where(eq(supplies.id, product.id));
    
    console.log(`✓ ${product.name} (${imageBuffer.length} bytes)`);
    success++;
  }
  
  console.log(`\n========================================`);
  console.log(`Success: ${success} | Failed: ${failed}`);
  console.log(`========================================`);
}

main().catch(console.error);
