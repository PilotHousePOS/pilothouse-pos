import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, ilike, isNull, or } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import zillaImageMap from './zillaImageMap.json';
import https from 'https';
import http from 'http';

async function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.chewy.com/',
      }
    };

    const req = client.get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadImage(redirectUrl).then(resolve);
          return;
        }
      }
      
      if (response.statusCode !== 200) {
        console.log(`  HTTP ${response.statusCode} for ${url}`);
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => resolve(null));
    });

    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function downloadZillaImages() {
  console.log('Downloading Zilla images from Chewy...');
  
  const objectStorageService = new ObjectStorageService();
  const publicPaths = objectStorageService.getPublicObjectSearchPaths();
  
  if (publicPaths.length === 0) {
    console.error('No public object storage paths configured');
    return;
  }
  
  const bucketPath = publicPaths[0];
  const pathParts = bucketPath.split('/').filter(Boolean);
  const bucketName = pathParts[0];
  const prefix = pathParts.slice(1).join('/');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const [productName, imageUrl] of Object.entries(zillaImageMap)) {
    console.log(`\nProcessing: ${productName}`);
    
    // Find matching product in database
    const products = await db.select().from(supplies)
      .where(ilike(supplies.name, productName))
      .limit(1);
    
    if (products.length === 0) {
      console.log(`  Product not found in database: ${productName}`);
      failCount++;
      continue;
    }
    
    const product = products[0];
    
    // Check if already has working image
    if (product.imageUrl && product.imageUrl.startsWith('/public-objects/')) {
      console.log(`  Already has Object Storage image, skipping`);
      continue;
    }
    
    // Download from Chewy
    console.log(`  Downloading from: ${imageUrl}`);
    const imageBuffer = await downloadImage(imageUrl);
    
    if (!imageBuffer || imageBuffer.length < 1000) {
      console.log(`  Failed to download or image too small`);
      failCount++;
      continue;
    }
    
    // Generate sanitized filename
    const sanitizedName = productName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const objectFileName = `products/zilla/${sanitizedName}-${product.id}.jpg`;
    const fullPath = prefix ? `${prefix}/${objectFileName}` : objectFileName;
    
    // Upload to Object Storage
    try {
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(fullPath);
      
      await file.save(imageBuffer, {
        contentType: 'image/jpeg',
        metadata: {
          cacheControl: 'public, max-age=31536000',
        },
      });
      
      await setObjectAclPolicy(file, { visibility: 'public' });
      
      // Update database
      const newImageUrl = `/public-objects/${objectFileName}`;
      await db.update(supplies)
        .set({ imageUrl: newImageUrl })
        .where(eq(supplies.id, product.id));
      
      console.log(`  ✓ Stored as: ${newImageUrl}`);
      successCount++;
      
    } catch (error) {
      console.log(`  Failed to upload: ${error}`);
      failCount++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log(`\n\nComplete! Success: ${successCount}, Failed: ${failCount}`);
}

downloadZillaImages().catch(console.error);
