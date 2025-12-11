import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import https from 'https';

// All URLs verified from actual Chewy product pages - Dec 2025
const verifiedImageUrls: Record<number, string> = {
  // Grey Liners - Using Terrarium Liner Brown image
  96: 'https://image.chewy.com/catalog/general/images/zilla-terrarium-liner-brown-4050gal/img-23193._AC_SL1200_QL100_V1_.jpg',
  98: 'https://image.chewy.com/catalog/general/images/zilla-terrarium-liner-brown-4050gal/img-23193._AC_SL1200_QL100_V1_.jpg',
  
  // Non Locking Clips - Using Heavy Duty Screen Clips image
  190: 'https://image.chewy.com/catalog/general/images/moe/067d8911-b84e-739c-8000-07d42a289e6b._AC_SL1200_QL100_V1_.jpg',
  191: 'https://image.chewy.com/catalog/general/images/moe/067d8911-b84e-739c-8000-07d42a289e6b._AC_SL1200_QL100_V1_.jpg',
  
  // Fruit Mix
  226: 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-fruit-mix-reptile-food-2-5oz-bag/img-63675._AC_SL1200_QL100_V1_.jpg',
  
  // Mini Ceramic Heat - Using Ceramic Heat Emitter image
  264: 'https://image.chewy.com/catalog/general/images/moe/0689b972-a75b-76b2-8000-4ecd56d9a8ff._AC_SL1200_QL100_V1_.jpg',
  
  // Mini LED Plant Bulb
  267: 'https://image.chewy.com/catalog/general/images/zilla-mini-led-plant-bulb/img-97470._AC_SL1200_QL100_V1_.jpg',
  
  // Pro Series Tropical 25 UVB 20w - Using Canopy Series Tropical bulb image
  281: 'https://image.chewy.com/catalog/general/images/zilla-canopy-series-fluorescent-uvbuva-bulbs-tropical-13-w/img-74881._AC_SL1200_QL100_V1_.jpg',
  
  // Mini Heat & UVB Fixture
  286: 'https://image.chewy.com/catalog/general/images/moe/06798108-876a-7bba-8000-18fbb2d3be0d._AC_SL1200_QL100_V1_.jpg',
  
  // Night Red Heat 150w - Using Night Red Incandescent bulb image  
  363: 'https://image.chewy.com/catalog/general/images/zilla-night-red-incandescent-reptile-terrarium-lamp-75-watt/img-646._AC_SL1200_QL100_V1_.jpg',
  
  // Creature Cage 30g - Using QuickBuild Terrarium image
  757: 'https://image.chewy.com/catalog/general/images/zilla-quickbuild-terrarium-black-48-x-18-x-18in/img-45743._AC_SL1200_QL100_V1_.jpg',
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.chewy.com/'
      },
      timeout: 30000
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          https.get(redirectUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept': 'image/*'
            }
          }, (res2) => {
            if (res2.statusCode !== 200) {
              resolve(Buffer.alloc(0));
              return;
            }
            const chunks: Buffer[] = [];
            res2.on('data', (chunk) => chunks.push(chunk));
            res2.on('end', () => resolve(Buffer.concat(chunks)));
          }).on('error', () => resolve(Buffer.alloc(0)));
          return;
        }
      }
      if (response.statusCode !== 200) {
        console.log(`  HTTP ${response.statusCode}`);
        resolve(Buffer.alloc(0));
        return;
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => resolve(Buffer.alloc(0)));
    });
    request.on('error', () => resolve(Buffer.alloc(0)));
    request.on('timeout', () => {
      request.destroy();
      resolve(Buffer.alloc(0));
    });
  });
}

async function main() {
  const objectStorageService = new ObjectStorageService();
  const publicPaths = objectStorageService.getPublicObjectSearchPaths();
  const bucketPath = publicPaths[0];
  const pathParts = bucketPath.split('/').filter(Boolean);
  const bucketName = pathParts[0];
  const prefix = pathParts.slice(1).join('/');
  
  const products = await db.select().from(supplies).where(eq(supplies.brand, 'Zilla'));
  const brokenProducts = products.filter(p => 
    p.imageUrl?.includes('amazon') || p.imageUrl?.includes('media-amazon')
  );
  
  console.log(`Processing ${brokenProducts.length} Zilla products with broken URLs...\n`);
  
  let success = 0;
  let failed = 0;
  const notMapped: string[] = [];
  const imageCache: Record<string, Buffer> = {};
  
  for (const product of brokenProducts) {
    const imageUrl = verifiedImageUrls[product.id];
    
    if (!imageUrl) {
      notMapped.push(`${product.id}: ${product.name}`);
      failed++;
      continue;
    }
    
    console.log(`Processing: ${product.name} (ID: ${product.id})`);
    
    let imageBuffer: Buffer;
    if (imageCache[imageUrl]) {
      imageBuffer = imageCache[imageUrl];
      console.log('  Using cached image');
    } else {
      await delay(500);
      imageBuffer = await downloadImage(imageUrl);
      if (imageBuffer.length > 1000) {
        imageCache[imageUrl] = imageBuffer;
      }
    }
    
    if (imageBuffer.length < 1000) {
      console.log(`  ❌ Download failed`);
      failed++;
      continue;
    }
    
    const name = (product.name || '').toLowerCase();
    const sanitizedName = name.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const objectFileName = `products/zilla/${sanitizedName}-${product.id}.jpg`;
    const fullPath = prefix ? `${prefix}/${objectFileName}` : objectFileName;
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(fullPath);
    
    await file.save(imageBuffer, {
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'public, max-age=31536000' }
    });
    
    await setObjectAclPolicy(file, { visibility: 'public' });
    
    await db.update(supplies).set({ imageUrl: `/public-objects/${objectFileName}` }).where(eq(supplies.id, product.id));
    
    console.log(`  ✓ Stored ${imageBuffer.length} bytes`);
    success++;
  }
  
  console.log(`\n========================================`);
  console.log(`Success: ${success} | Failed: ${failed}`);
  console.log(`========================================`);
  
  if (notMapped.length > 0) {
    console.log(`\nProducts still needing URLs (${notMapped.length}):`);
    notMapped.forEach(p => console.log(`  - ${p}`));
  }
}

main().catch(console.error);
