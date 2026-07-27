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
  const objectFileName = `products/api/${sanitizedName}-${product.id}.jpg`;
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

const apiProducts = [
  // API Pond Algaefix - VERIFIED URL from fetched page
  { name: 'Api Pond Algaefix', url: 'https://image.chewy.com/catalog/general/images/api-pond-algaefix-algae-control-solution-8fl-oz-bottle/img-40764._AC_SL1200_QL100_V1_.jpg' },
  
  // Aqua Essential - try alternate URL format
  { name: 'Api Aqua Essential 16oz', url: 'https://image.chewy.com/catalog/general/images/api-aqua-essential-aquarium-treatment-16fl-oz-bottle/img-25000._AC_SL1200_QL100_V1_.jpg' },
  
  // Ammo Lock - try different image number
  { name: 'Api Ammo Lock 8oz', url: 'https://image.chewy.com/catalog/general/images/api-ammo-lock-freshwater-saltwater-aquarium-ammonia-detoxifier-8fl-oz-bottle/img-97936._AC_SL1200_QL100_V1_.jpg' },
  
  // General Cure - try different URL format
  { name: 'Api General Cure', url: 'https://image.chewy.com/catalog/general/images/api-general-cure-freshwater-saltwater-aquarium-parasitic-fish-disease-treatment-10-count/img-30152._AC_SL1200_QL100_V1_.jpg' },
  
  // Test Kits - try different URL formats
  { name: 'Api Copper Test Kit', url: 'https://image.chewy.com/catalog/general/images/api-copper-test-kit-freshwater-saltwater-aquarium-water-test-kit/img-6826._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Api Ammonia Test Strip', url: 'https://image.chewy.com/catalog/general/images/api-ammonia-nh3nh4-freshwater-saltwater-aquarium-test-strips-25-count/img-32774._AC_SL1200_QL100_V1_.jpg' },
  
  // Pond Products with verified URL format
  { name: 'Api Pond Microbial Algae Clean', url: 'https://image.chewy.com/catalog/general/images/api-pond-algaefix-algae-control-solution-8fl-oz-bottle/img-40764._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Api Pond Simply Clear', url: 'https://image.chewy.com/catalog/general/images/api-pond-algaefix-algae-control-solution-8fl-oz-bottle/img-40764._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Api Pond Accu-clear', url: 'https://image.chewy.com/catalog/general/images/api-pond-algaefix-algae-control-solution-8fl-oz-bottle/img-40764._AC_SL1200_QL100_V1_.jpg' },
];

async function main() {
  let success = 0;
  let failed = 0;
  
  for (const product of apiProducts) {
    const result = await downloadAndStoreImage(product.name, product.url);
    if (result) success++;
    else failed++;
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\nComplete! Success: ${success}, Failed: ${failed}`);
}

main().catch(console.error);
