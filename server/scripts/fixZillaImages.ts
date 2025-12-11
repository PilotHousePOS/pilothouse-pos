import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, ilike } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import https from 'https';

async function downloadAndStoreImage(productName: string, imageUrl: string) {
  console.log(`Processing: ${productName}`);
  
  const products = await db.select().from(supplies)
    .where(ilike(supplies.name, `%${productName}%`))
    .limit(5);
  
  if (products.length === 0) {
    console.log(`  Product not found: ${productName}`);
    return 0;
  }
  
  console.log(`  Found ${products.length} products matching "${productName}"`);
  
  // Download image once
  const imageBuffer = await new Promise<Buffer>((resolve) => {
    const protocol = imageUrl.startsWith('https') ? https : require('http');
    protocol.get(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*'
      }
    }, (response: any) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          https.get(redirectUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
          }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
          }).on('error', () => resolve(Buffer.alloc(0)));
          return;
        }
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(Buffer.alloc(0)));
  });
  
  if (imageBuffer.length < 1000) {
    console.log(`  Failed to download image from ${imageUrl}`);
    return 0;
  }
  
  console.log(`  Downloaded ${imageBuffer.length} bytes`);
  
  const objectStorageService = new ObjectStorageService();
  const publicPaths = objectStorageService.getPublicObjectSearchPaths();
  const bucketPath = publicPaths[0];
  const pathParts = bucketPath.split('/').filter(Boolean);
  const bucketName = pathParts[0];
  const prefix = pathParts.slice(1).join('/');
  
  let success = 0;
  
  for (const product of products) {
    const sanitizedName = product.name!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
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
    
    console.log(`  ✓ Updated ${product.name} -> ${newImageUrl}`);
    success++;
  }
  
  return success;
}

async function main() {
  let total = 0;
  
  // Zilla Basking Platform with Ramp - from Chewy
  total += await downloadAndStoreImage('Basking Platform W Ramp', 
    'https://image.chewy.com/catalog/general/images/moe/06862ea7-8d0e-7761-8000-6fef73c89dfc._AC_SL1200_QL100_V1_.jpg');
  
  // Zilla Heat & UVB Basking Fixture
  total += await downloadAndStoreImage('Heat & UVB Basking Fixture',
    'https://image.chewy.com/catalog/general/images/zilla-heat-uvb-basking-fixture/img-70432._AC_SL1200_QL100_V1_.jpg');
  
  // Zilla Herp Hotel - from Zilla official website
  total += await downloadAndStoreImage('Herp Hotel',
    'https://www.zillarules.com/-/media/project/oneweb/zilla/images/products-homepage/product-images/decor/dens-hidingplaces/096316117402main.jpg');
  
  console.log(`\nTotal products updated: ${total}`);
}

main().catch(console.error);
