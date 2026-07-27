import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, ilike } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import https from 'https';

async function downloadAndStoreImage(productName: string, imageUrl: string, forceUpdate: boolean = false) {
  console.log(`Processing: ${productName}`);
  
  const products = await db.select().from(supplies)
    .where(ilike(supplies.name, productName))
    .limit(1);
  
  if (products.length === 0) {
    console.log(`  Product not found: ${productName}`);
    return false;
  }
  
  const product = products[0];
  console.log(`  Found product ID: ${product.id}`);
  
  if (product.imageUrl?.startsWith('/public-objects/') && !forceUpdate) {
    console.log(`  Already has Object Storage image`);
    return true;
  }
  
  if (forceUpdate) {
    console.log(`  Force updating with correct image...`);
  }
  
  const imageBuffer = await new Promise<Buffer>((resolve) => {
    https.get(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.chewy.com/',
        'Accept': 'image/*'
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          https.get(redirectUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.chewy.com/' }
          }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
          }).on('error', () => resolve(Buffer.alloc(0)));
          return;
        }
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(Buffer.alloc(0)));
  });
  
  if (imageBuffer.length < 1000) {
    console.log(`  Failed to download image`);
    return false;
  }
  
  console.log(`  Downloaded ${imageBuffer.length} bytes`);
  
  const objectStorageService = new ObjectStorageService();
  const publicPaths = objectStorageService.getPublicObjectSearchPaths();
  const bucketPath = publicPaths[0];
  const pathParts = bucketPath.split('/').filter(Boolean);
  const bucketName = pathParts[0];
  const prefix = pathParts.slice(1).join('/');
  
  const sanitizedName = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const objectFileName = `products/zilla/${sanitizedName}-${product.id}.jpg`;
  const fullPath = prefix ? `${prefix}/${objectFileName}` : objectFileName;
  
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(fullPath);
  
  await file.save(imageBuffer, {
    contentType: 'image/jpeg',
    metadata: { cacheControl: 'public, max-age=31536000' }
  });
  
  await setObjectAclPolicy(file, { owner: '', visibility: 'public' });
  
  const newImageUrl = `/public-objects/${objectFileName}`;
  await db.update(supplies).set({ imageUrl: newImageUrl }).where(eq(supplies.id, product.id));
  
  console.log(`  ✓ Stored as: ${newImageUrl}`);
  return true;
}

const zillaProducts = [
  // Heat Mats (already processed, using same image for different sizes)
  { name: 'Zilla Heat Mat Small', url: 'https://image.chewy.com/catalog/general/images/moe/0689b974-6380-7fb8-8000-09bad394bd16._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Heat Mat Medium', url: 'https://image.chewy.com/catalog/general/images/moe/0689b974-6380-7fb8-8000-09bad394bd16._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Heat Mat Large', url: 'https://image.chewy.com/catalog/general/images/moe/0689b974-6380-7fb8-8000-09bad394bd16._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Heat Mat Mini', url: 'https://image.chewy.com/catalog/general/images/moe/0689b974-6380-7fb8-8000-09bad394bd16._AC_SL1200_QL100_V1_.jpg' },
  
  // Black Heat Bulbs 
  { name: 'Zilla Black Heat Bulb 75w', url: 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-incandescent-spot-reptile-bulb-75-watt/img-102985._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Black Heat Bulb 100w', url: 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-incandescent-spot-reptile-bulb-75-watt/img-102985._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Black Heat Bulb 150w', url: 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-incandescent-spot-reptile-bulb-75-watt/img-102985._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Black Heat Spot 50w', url: 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-incandescent-spot-reptile-bulb-75-watt/img-102985._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Black Heat Spot 75w', url: 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-incandescent-spot-reptile-bulb-75-watt/img-102985._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Black Heat Spot 100w', url: 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-incandescent-spot-reptile-bulb-75-watt/img-102985._AC_SL1200_QL100_V1_.jpg' },
  
  // Mini Halogen Bulbs
  { name: 'Zilla Mini Halogen Bulb 25w White', url: 'https://image.chewy.com/catalog/general/images/zilla-light-heat-mini-halogen-bulb-for-reptile-terrariums-day-white-50-watts/img-76253._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Mini Halogen Bulb 50w White', url: 'https://image.chewy.com/catalog/general/images/zilla-light-heat-mini-halogen-bulb-for-reptile-terrariums-day-white-50-watts/img-76253._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Mini Halogen Bulb 25w Blue', url: 'https://image.chewy.com/catalog/general/images/zilla-light-heat-mini-halogen-bulb-for-reptile-terrariums-day-white-50-watts/img-76253._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Mini Halogen Bulb 50w Blue', url: 'https://image.chewy.com/catalog/general/images/zilla-light-heat-mini-halogen-bulb-for-reptile-terrariums-day-white-50-watts/img-76253._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Mini Halogen Bulb 25w Red', url: 'https://image.chewy.com/catalog/general/images/zilla-light-heat-mini-halogen-bulb-for-reptile-terrariums-day-white-50-watts/img-76253._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Mini Halogen Bulb 50w Red', url: 'https://image.chewy.com/catalog/general/images/zilla-light-heat-mini-halogen-bulb-for-reptile-terrariums-day-white-50-watts/img-76253._AC_SL1200_QL100_V1_.jpg' },
  
  // Day White Bulbs (using Zilla Day White basking bulb image)
  { name: 'Zilla Day White Light Bulb 100w', url: 'https://image.chewy.com/catalog/general/images/zilla-day-white-incandescent-reptile-terrarium-lamp-50-watt/img-6173._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Day White Light Bulb 150w', url: 'https://image.chewy.com/catalog/general/images/zilla-day-white-incandescent-reptile-terrarium-lamp-50-watt/img-6173._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Day White Light Spot 100w', url: 'https://image.chewy.com/catalog/general/images/zilla-day-white-incandescent-reptile-terrarium-lamp-50-watt/img-6173._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Day White Light Spot 150w', url: 'https://image.chewy.com/catalog/general/images/zilla-day-white-incandescent-reptile-terrarium-lamp-50-watt/img-6173._AC_SL1200_QL100_V1_.jpg' },
  
  // Day Blue Bulbs
  { name: 'Zilla Day Blue Light 50w', url: 'https://image.chewy.com/catalog/general/images/zilla-day-white-incandescent-reptile-terrarium-lamp-50-watt/img-6173._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Day Blue Light 75w', url: 'https://image.chewy.com/catalog/general/images/zilla-day-white-incandescent-reptile-terrarium-lamp-50-watt/img-6173._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Day Blue Light 100w', url: 'https://image.chewy.com/catalog/general/images/zilla-day-white-incandescent-reptile-terrarium-lamp-50-watt/img-6173._AC_SL1200_QL100_V1_.jpg' },
  
  // Night Red Bulbs
  { name: 'Zilla Night Red Heat 50w', url: 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-incandescent-spot-reptile-bulb-75-watt/img-102985._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Night Red Heat 75w', url: 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-incandescent-spot-reptile-bulb-75-watt/img-102985._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Night Red Heat 100w', url: 'https://image.chewy.com/catalog/general/images/zilla-night-black-heat-incandescent-spot-reptile-bulb-75-watt/img-102985._AC_SL1200_QL100_V1_.jpg' },
  
  // Bedding & Substrates
  { name: 'Zilla Jungle Mix 8qt', url: 'https://image.chewy.com/catalog/general/images/zilla-jungle-mix-fir-sphagnum-peat-moss-organic-reptile-bedding-4qt-bag/img-48083._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Jungle Mix 24qt', url: 'https://image.chewy.com/catalog/general/images/zilla-jungle-mix-fir-sphagnum-peat-moss-organic-reptile-bedding-4qt-bag/img-48083._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Desert Blend 5qt', url: 'https://image.chewy.com/catalog/general/images/zilla-jungle-mix-fir-sphagnum-peat-moss-organic-reptile-bedding-4qt-bag/img-48083._AC_SL1200_QL100_V1_.jpg' },
  
  // Terrarium Liners
  { name: 'Zilla Green Liner 10 Gal', url: 'https://image.chewy.com/catalog/general/images/zilla-terrarium-liner-green-15-20h-gal/img-113066._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Green Liner 20l/29 g', url: 'https://image.chewy.com/catalog/general/images/zilla-terrarium-liner-green-15-20h-gal/img-113066._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Green Liner 30g', url: 'https://image.chewy.com/catalog/general/images/zilla-terrarium-liner-green-15-20h-gal/img-113066._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Grey Liner 10 Gal', url: 'https://image.chewy.com/catalog/general/images/zilla-terrarium-liner-green-15-20h-gal/img-113066._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Grey 40/50g', url: 'https://image.chewy.com/catalog/general/images/zilla-terrarium-liner-green-15-20h-gal/img-113066._AC_SL1200_QL100_V1_.jpg' },
  
  // Food & Supplements - CORRECTED with accurate Chewy URLs
  { name: 'Zilla Cricket Drink', url: 'https://image.chewy.com/catalog/general/images/zilla-gut-load-cricket-drink-supplement-16fl-oz-bottle/img-429023._AC_SL1200_QL100_V1_.jpg', forceUpdate: true },
  { name: 'Zilla Mealworms', url: 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-mealworms-lizard-food-3-75oz-bag/img-68683._AC_SL1200_QL100_V1_.jpg', forceUpdate: true },
  { name: 'Zilla Omnivore Mix W Calcium', url: 'https://image.chewy.com/catalog/general/images/zilla-reptile-munchies-omnivore-mix-lizard-food-4oz-bag/img-12525._AC_SL1200_QL100_V1_.jpg', forceUpdate: true },
  
  // More Zilla products
  { name: 'Zilla Vitamin Super', url: 'https://image.chewy.com/catalog/general/images/zilla-vitamin-supplement-with-beta-carotene-reptile-food-spray-8oz-bottle/img-69679._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zillla Calcium Supplement', url: 'https://image.chewy.com/catalog/general/images/zilla-food-spray-calcium-reptile-supplement-8oz-bottle/img-13960._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Zilla Terrarium Cleaner', url: 'https://image.chewy.com/catalog/general/images/zilla-reptile-terrarium-cleaner-8-oz-spray/img-48065._AC_SL1200_QL100_V1_.jpg' },
];

async function main() {
  let success = 0;
  let failed = 0;
  
  for (const product of zillaProducts) {
    const forceUpdate = (product as any).forceUpdate || false;
    const result = await downloadAndStoreImage(product.name, product.url, forceUpdate);
    if (result) success++;
    else failed++;
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\nComplete! Success: ${success}, Failed: ${failed}`);
}

main().catch(console.error);
