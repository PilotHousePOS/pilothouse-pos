import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import https from 'https';

const objectStorageService = new ObjectStorageService();

async function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : require('http');
    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*',
        'Referer': 'https://www.google.com/'
      }
    }, (response: any) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadImage(redirectUrl).then(resolve);
          return;
        }
      }
      if (response.statusCode !== 200) {
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.length > 1000 ? buffer : null);
      });
    }).on('error', () => resolve(null));
  });
}

async function storeImage(imageBuffer: Buffer, product: any): Promise<string | null> {
  try {
    const publicPaths = objectStorageService.getPublicObjectSearchPaths();
    const bucketPath = publicPaths[0];
    const pathParts = bucketPath.split('/').filter(Boolean);
    const bucketName = pathParts[0];
    const prefix = pathParts.slice(1).join('/');
    
    const sanitizedBrand = (product.brand || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sanitizedName = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
    const objectFileName = `products/${sanitizedBrand}/${sanitizedName}-${product.id}.jpg`;
    const fullPath = prefix ? `${prefix}/${objectFileName}` : objectFileName;
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(fullPath);
    
    await file.save(imageBuffer, {
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'public, max-age=31536000' }
    });
    
    await setObjectAclPolicy(file, { visibility: 'public' });
    
    return `/public-objects/${objectFileName}`;
  } catch (error) {
    console.error(`  Error storing image:`, error);
    return null;
  }
}

function generateChewySearchUrls(productName: string, brand: string): string[] {
  const cleanName = productName.toLowerCase()
    .replace(/['"]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .substring(0, 60);
  
  const brandSlug = brand.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  return [
    `https://image.chewy.com/is/image/catalog/${brandSlug}_${cleanName}_primary`,
    `https://image.chewy.com/is/catalog/images/${brandSlug}/${cleanName}`,
  ];
}

async function findWorkingImageUrl(product: any): Promise<string | null> {
  const { name, brand } = product;
  
  const urls = generateChewySearchUrls(name, brand);
  
  for (const baseUrl of urls) {
    for (const ext of ['.jpg', '.png', '.webp']) {
      const url = baseUrl + ext;
      try {
        const response = await fetch(url, { method: 'HEAD' });
        if (response.ok) {
          return url;
        }
      } catch {
      }
    }
  }
  
  return null;
}

async function processBrand(brandName: string, limit: number = 100) {
  console.log(`\n=== Processing ${brandName} ===\n`);
  
  const products = await db
    .select()
    .from(supplies)
    .where(
      and(
        eq(supplies.brand, brandName),
        or(
          isNull(supplies.imageUrl),
          eq(supplies.imageUrl, '')
        )
      )
    )
    .limit(limit);
  
  console.log(`Found ${products.length} products missing images`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const product of products) {
    console.log(`\n[${successCount + failCount + 1}/${products.length}] ${product.name}`);
    
    if (product.imageUrl?.startsWith('/public-objects/')) {
      console.log(`  Already has image, skipping`);
      continue;
    }
    
    const imageUrl = await findWorkingImageUrl(product);
    
    if (!imageUrl) {
      console.log(`  No image found online`);
      failCount++;
      continue;
    }
    
    console.log(`  Found: ${imageUrl}`);
    
    const imageBuffer = await downloadImage(imageUrl);
    if (!imageBuffer) {
      console.log(`  Failed to download`);
      failCount++;
      continue;
    }
    
    console.log(`  Downloaded ${imageBuffer.length} bytes`);
    
    const storedPath = await storeImage(imageBuffer, product);
    if (!storedPath) {
      console.log(`  Failed to store`);
      failCount++;
      continue;
    }
    
    await db.update(supplies).set({ imageUrl: storedPath }).where(eq(supplies.id, product.id));
    console.log(`  ✓ Stored as ${storedPath}`);
    successCount++;
    
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log(`\n=== ${brandName} Complete ===`);
  console.log(`Success: ${successCount}, Failed: ${failCount}`);
  
  return { success: successCount, failed: failCount };
}

const brandName = process.argv[2] || 'Penn-Plax';
const limit = parseInt(process.argv[3] || '100');

processBrand(brandName, limit)
  .then(result => {
    console.log('\nDone!', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
