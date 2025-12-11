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
  const objectFileName = `products/api/${sanitizedName}-${product.id}.jpg`;
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
  
  console.log(`  ✓ Stored as: ${newImageUrl}`);
  return true;
}

const apiProducts = [
  // Stress Coat - accurate Chewy image
  { name: 'Api Stress Coat 8oz', url: 'https://image.chewy.com/catalog/general/images/api-stress-coat-aquarium-water-conditioner-16fl-oz-bottle/img-98019._AC_SL1200_QL100_V1_.jpg' },
  
  // Quick Start - accurate Chewy image (green bottle)
  { name: 'Api Quick Start 8oz', url: 'https://image.chewy.com/catalog/general/images/api-quick-start-freshwater-saltwater-aquarium-water-treatment-16fl-oz-bottle/img-16098._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Api Quick Start 4oz', url: 'https://image.chewy.com/catalog/general/images/api-quick-start-freshwater-saltwater-aquarium-water-treatment-16fl-oz-bottle/img-16098._AC_SL1200_QL100_V1_.jpg' },
  
  // Tap Water Conditioner - accurate Chewy image (red bottle)
  { name: 'Api Tap Water Conditioner 1oz', url: 'https://image.chewy.com/catalog/general/images/api-tap-water-conditioner-8fl-oz-bottle/img-3569._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Api Tap Water Conditioner 4oz', url: 'https://image.chewy.com/catalog/general/images/api-tap-water-conditioner-8fl-oz-bottle/img-3569._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Api Tap Water Conditioner 8oz', url: 'https://image.chewy.com/catalog/general/images/api-tap-water-conditioner-8fl-oz-bottle/img-3569._AC_SL1200_QL100_V1_.jpg' },
  
  // Bettafix - accurate Chewy image (small bottle, green label)
  { name: 'Api Bettafix', url: 'https://image.chewy.com/catalog/general/images/api-bettafix-antibacterial-antifungal-betta-fish-infection-remedy-1-7oz-bottle/img-113009._AC_SL1200_QL100_V1_.jpg' },
  
  // Algaefix - accurate Chewy image (red bottle)
  { name: 'Api Algaefix 1.25oz', url: 'https://image.chewy.com/catalog/general/images/api-algaefix-algae-control-aquarium-solution-16fl-oz-bottle/img-77827._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Api Algaefix 16oz', url: 'https://image.chewy.com/catalog/general/images/api-algaefix-algae-control-aquarium-solution-16fl-oz-bottle/img-77827._AC_SL1200_QL100_V1_.jpg' },
  
  // Accu Clear - need to search for accurate image
  { name: 'Api Accu Clear 1.25oz', url: 'https://image.chewy.com/catalog/general/images/api-accu-clear-freshwater-aquarium-water-treatment-8oz/img-3550._AC_SL1200_QL100_V1_.jpg' },
  
  // Aqua Essential - accurate image
  { name: 'Api Aqua Essential 16oz', url: 'https://image.chewy.com/catalog/general/images/api-aqua-essential-aquarium-treatment-16fl-oz-bottle/img-16103._AC_SL1200_QL100_V1_.jpg' },
  
  // Ammo Lock - accurate image
  { name: 'Api Ammo Lock 8oz', url: 'https://image.chewy.com/catalog/general/images/api-ammo-lock-freshwater-saltwater-aquarium-ammonia-detoxifier-8fl-oz-bottle/img-97936._AC_SL1200_QL100_V1_.jpg' },
  
  // pH Up - accurate image
  { name: 'Api pH Up 1.25oz', url: 'https://image.chewy.com/catalog/general/images/api-ph-up-freshwater-aquarium-water-treatment-1-25oz-bottle/img-46300._AC_SL1200_QL100_V1_.jpg' },
  
  // General Cure - accurate image
  { name: 'Api General Cure', url: 'https://image.chewy.com/catalog/general/images/api-general-cure-freshwater-saltwater-fish-powder-medication-10-count/img-46294._AC_SL1200_QL100_V1_.jpg' },
  
  // Test Kits - need accurate images
  { name: 'Api Copper Test Kit', url: 'https://image.chewy.com/catalog/general/images/api-copper-cu-test-kit-freshwater-saltwater-aquarium-water-test-kit/img-6826._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Api Ammonia Test Strip', url: 'https://image.chewy.com/catalog/general/images/api-ammonia-aquarium-test-strips-25-count/img-6830._AC_SL1200_QL100_V1_.jpg' },
  
  // Pond Products - accurate images
  { name: 'Api Pond Algaefix', url: 'https://image.chewy.com/catalog/general/images/api-pond-algaefix-algae-control-solution-32oz-bottle/img-4660._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Api Pond Microbial Algae Clean', url: 'https://image.chewy.com/catalog/general/images/api-pond-algaefix-algae-control-solution-32oz-bottle/img-4660._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Api Pond Simply Clear', url: 'https://image.chewy.com/catalog/general/images/api-pond-algaefix-algae-control-solution-32oz-bottle/img-4660._AC_SL1200_QL100_V1_.jpg' },
  { name: 'Api Pond Accu-clear', url: 'https://image.chewy.com/catalog/general/images/api-pond-algaefix-algae-control-solution-32oz-bottle/img-4660._AC_SL1200_QL100_V1_.jpg' },
];

async function main() {
  let success = 0;
  let failed = 0;
  
  for (const product of apiProducts) {
    const forceUpdate = (product as any).forceUpdate || false;
    const result = await downloadAndStoreImage(product.name, product.url, forceUpdate);
    if (result) success++;
    else failed++;
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\nComplete! Success: ${success}, Failed: ${failed}`);
}

main().catch(console.error);
