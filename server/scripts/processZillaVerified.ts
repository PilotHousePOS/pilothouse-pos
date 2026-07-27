import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import https from 'https';

const verifiedUrls: Record<number, string> = {
  535: 'https://image.chewy.com/catalog/general/images/zilla-aquatic-turtle-food-sticks/img-48282._AC_SL1200_QL100_V1_.jpg',
  760: 'https://image.chewy.com/catalog/general/images/zilla-tropical-reptile-terrarium/img-70447._AC_SL1200_QL100_V1_.jpg',
  754: 'https://image.chewy.com/catalog/general/images/zilla-desert-reptile-terrarium/img-70445._AC_SL1200_QL100_V1_.jpg',
  354: 'https://image.chewy.com/catalog/general/images/moe/06862ea7-5a3b-703b-8000-4d91edabc50e._AC_SL1200_QL100_V1_.jpg',
  355: 'https://image.chewy.com/catalog/general/images/moe/06862ea7-5a3b-703b-8000-4d91edabc50e._AC_SL1200_QL100_V1_.jpg',
  275: 'https://image.chewy.com/catalog/general/images/zilla-t8-desert-light-fixture/img-70434._AC_SL1200_QL100_V1_.jpg',
  274: 'https://image.chewy.com/catalog/general/images/zilla-t8-tropical-light-fixture/img-70436._AC_SL1200_QL100_V1_.jpg',
  757: 'https://image.chewy.com/catalog/general/images/zilla-front-opening-terrarium/img-52189._AC_SL1200_QL100_V1_.jpg',
  138: 'https://image.chewy.com/catalog/general/images/zilla-gut-load-cricket-drink/img-70418._AC_SL1200_QL100_V1_.jpg',
  780: 'https://image.chewy.com/catalog/general/images/zilla-critter-cage/img-19088._AC_SL1200_QL100_V1_.jpg',
  359: 'https://image.chewy.com/catalog/general/images/zilla-day-blue-light-incandescent-reptile-bulb-75-watt/img-31356._AC_SL1200_QL100_V1_.jpg',
  370: 'https://image.chewy.com/catalog/general/images/zilla-day-white-light-incandescent-reptile-bulb-75-watt/img-76251._AC_SL1200_QL100_V1_.jpg',
  369: 'https://image.chewy.com/catalog/general/images/zilla-day-white-light-incandescent-reptile-bulb-75-watt/img-76251._AC_SL1200_QL100_V1_.jpg',
  752: 'https://image.chewy.com/catalog/general/images/zilla-desert-reptile-terrarium/img-70445._AC_SL1200_QL100_V1_.jpg',
  57: 'https://image.chewy.com/catalog/general/images/moe/0689b979-4e1a-765e-8000-587ae2cbe4b5._AC_SL1200_QL100_V1_.jpg',
  56: 'https://image.chewy.com/catalog/general/images/moe/0689b979-4e1a-765e-8000-587ae2cbe4b5._AC_SL1200_QL100_V1_.jpg',
  266: 'https://image.chewy.com/catalog/general/images/zilla-mini-compact-fluorescent-bulb-desert/img-70415._AC_SL1200_QL100_V1_.jpg',
  279: 'https://image.chewy.com/catalog/general/images/zilla-desert-series-50-t8-fluorescent-bulb/img-70413._AC_SL1200_QL100_V1_.jpg',
  280: 'https://image.chewy.com/catalog/general/images/zilla-desert-series-50-t8-fluorescent-bulb/img-70413._AC_SL1200_QL100_V1_.jpg',
  598: 'https://image.chewy.com/catalog/general/images/zilla-digital-terrarium-thermometer/img-70401._AC_SL1200_QL100_V1_.jpg',
  284: 'https://image.chewy.com/catalog/general/images/zilla-dual-low-profile-fixture/img-70430._AC_SL1200_QL100_V1_.jpg',
  709: 'https://image.chewy.com/catalog/general/images/zilla-rock-den-reptile-hideout-medium/img-52193._AC_SL1200_QL100_V1_.jpg',
  710: 'https://image.chewy.com/catalog/general/images/zilla-rock-den-reptile-hideout-medium/img-52193._AC_SL1200_QL100_V1_.jpg',
  711: 'https://image.chewy.com/catalog/general/images/zilla-rock-den-reptile-hideout-medium/img-52193._AC_SL1200_QL100_V1_.jpg',
  459: 'https://image.chewy.com/catalog/general/images/zilla-durable-dish/img-70419._AC_SL1200_QL100_V1_.jpg',
  460: 'https://image.chewy.com/catalog/general/images/zilla-durable-dish/img-70419._AC_SL1200_QL100_V1_.jpg',
  461: 'https://image.chewy.com/catalog/general/images/zilla-durable-dish/img-70419._AC_SL1200_QL100_V1_.jpg',
  226: 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-fruit-mix/img-70389._AC_SL1200_QL100_V1_.jpg',
  94: 'https://image.chewy.com/catalog/general/images/zilla-terrarium-liner/img-19090._AC_SL1200_QL100_V1_.jpg',
  100: 'https://image.chewy.com/catalog/general/images/zilla-terrarium-liner/img-19090._AC_SL1200_QL100_V1_.jpg',
  67: 'https://image.chewy.com/catalog/general/images/zilla-fir-sphagnum-peat-moss-jungle/img-19086._AC_SL1200_QL100_V1_.jpg',
  68: 'https://image.chewy.com/catalog/general/images/zilla-fir-sphagnum-peat-moss-jungle/img-19086._AC_SL1200_QL100_V1_.jpg',
  286: 'https://image.chewy.com/catalog/general/images/zilla-halogen-mini-dome/img-70428._AC_SL1200_QL100_V1_.jpg',
  366: 'https://image.chewy.com/catalog/general/images/zilla-night-red-incandescent-reptile-terrarium-lamp-75-watt-bundle-of-3/img-64527._AC_SL1200_QL100_V1_.jpg',
  356: 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-incandescent-reptile-bulb-75-watt/img-31357._AC_SL1200_QL100_V1_.jpg',
  357: 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-incandescent-reptile-bulb-75-watt/img-31357._AC_SL1200_QL100_V1_.jpg',
  287: 'https://image.chewy.com/catalog/general/images/zilla-premium-reflector-dome/img-70426._AC_SL1200_QL100_V1_.jpg',
  288: 'https://image.chewy.com/catalog/general/images/zilla-premium-reflector-dome/img-70426._AC_SL1200_QL100_V1_.jpg',
  97: 'https://image.chewy.com/catalog/general/images/zilla-terrarium-liner/img-19090._AC_SL1200_QL100_V1_.jpg',
  227: 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-omnivore-mix/img-70391._AC_SL1200_QL100_V1_.jpg',
};

async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*'
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        resolve(Buffer.alloc(0));
        return;
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(Buffer.alloc(0)));
  });
}

async function main() {
  const objectStorageService = new ObjectStorageService();
  const publicPaths = objectStorageService.getPublicObjectSearchPaths();
  const bucketPath = publicPaths[0];
  const pathParts = bucketPath.split('/').filter(Boolean);
  const bucketName = pathParts[0];
  const prefix = pathParts.slice(1).join('/');
  
  const productIds = Object.keys(verifiedUrls).map(Number);
  const products = await db.select().from(supplies)
    .where(eq(supplies.brand, 'Zilla'));
  
  const toProcess = products.filter(p => productIds.includes(p.id));
  console.log(`Processing ${toProcess.length} Zilla products...\n`);
  
  let success = 0;
  const imageCache: Record<string, Buffer> = {};
  
  for (const product of toProcess) {
    const imageUrl = verifiedUrls[product.id];
    if (!imageUrl) continue;
    
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
      console.log(`❌ Failed: ${product.name}`);
      continue;
    }
    
    const sanitizedName = (product.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
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
    
    console.log(`✓ ${product.name}`);
    success++;
  }
  
  console.log(`\nSuccess: ${success}`);
}

main().catch(console.error);
