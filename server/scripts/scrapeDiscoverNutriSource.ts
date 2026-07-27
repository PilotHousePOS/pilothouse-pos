import { chromium } from 'playwright';
import { db } from '../db';
import { supplies } from '@shared/schema';
import { ilike, or, sql } from 'drizzle-orm';
import https from 'https';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';

const objectStorageService = new ObjectStorageService();

// Map product names to discovernutrisource.com product data
// Format: { slug: string, imagePrefix: string, imageCount: number }
const productMappings: { [key: string]: { slug: string; prefix: string; images: string[] } } = {
  'peanut butter little bites': {
    slug: 'grain-free-peanut-butter-little-bites',
    prefix: 'GFLittleBitesPB',
    images: [
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesPB_Front_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesPB_Back_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesPB_Panel_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBites_Product_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesPB_WIM_2048x.png',
    ]
  },
  'chicken little bites': {
    slug: 'chicken-little-bites',
    prefix: 'LittleBitesChicken',
    images: [
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesChicken_Front_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesChicken_Back_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesChicken_Panel_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBites_Product_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesChicken_WIM_2048x.png',
    ]
  },
  'beef little bites': {
    slug: 'grain-free-beef-little-bites',
    prefix: 'GFLittleBitesBeef',
    images: [
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesBeef_Front_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesBeef_Back_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesBeef_Panel_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBites_Product_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesBeef_WIM_2048x.png',
    ]
  },
  'turkey little bites': {
    slug: 'grain-free-turkey-little-bites',
    prefix: 'GFLittleBitesTurkey',
    images: [
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesTurkey_Front_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesTurkey_Back_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesTurkey_Panel_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBites_Product_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesTurkey_WIM_2048x.png',
    ]
  },
  'salmon little bites': {
    slug: 'salmon-little-bites',
    prefix: 'LittleBitesSalmon',
    images: [
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesSalmon_Front_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesSalmon_Back_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesSalmon_Panel_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBites_Product_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesSalmon_WIM_2048x.png',
    ]
  },
  'trout little bites': {
    slug: 'grain-free-trout-little-bites',
    prefix: 'GFLittleBitesTrout',
    images: [
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesTrout_Front_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesTrout_Back_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesTrout_Panel_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBites_Product_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/GFLittleBitesTrout_WIM_2048x.png',
    ]
  },
  'duck little bites': {
    slug: 'duck-little-bites',
    prefix: 'LittleBitesDuck',
    images: [
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesDuck_Front_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesDuck_Back_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesDuck_Panel_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBites_Product_2048x.png',
      'https://discovernutrisource.com/cdn/shop/files/LittleBitesDuck_WIM_2048x.png',
    ]
  },
};

function findMapping(productName: string): { slug: string; prefix: string; images: string[] } | null {
  const name = productName.toLowerCase();
  for (const [key, mapping] of Object.entries(productMappings)) {
    if (name.includes(key) || key.split(' ').every(word => name.includes(word))) {
      return mapping;
    }
  }
  return null;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        console.log(`    Failed to download: ${res.statusCode}`);
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', (err) => {
      console.log(`    Download error: ${err.message}`);
      resolve(null);
    });
  });
}

async function storeImage(imageBuffer: Buffer, productId: number, productName: string, index: number): Promise<string | null> {
  try {
    const publicPaths = objectStorageService.getPublicObjectSearchPaths();
    const bucketPath = publicPaths[0];
    const pathParts = bucketPath.split('/').filter(Boolean);
    const bucketName = pathParts[0];
    const prefix = pathParts.slice(1).join('/');
    
    const sanitizedName = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40);
    const uniqueId = Math.random().toString(36).substring(2, 10);
    const objectFileName = `products/nutrisource/${sanitizedName}-${productId}-${index}-${uniqueId}.jpg`;
    const fullPath = prefix ? `${prefix}/${objectFileName}` : objectFileName;
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(fullPath);
    
    await file.save(imageBuffer, {
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'public, max-age=31536000' }
    });
    
    await setObjectAclPolicy(file, { owner: '', visibility: 'public' });
    
    return `/public-objects/${objectFileName}`;
  } catch (error) {
    console.error(`  Error storing image:`, error);
    return null;
  }
}

async function main() {
  const limit = parseInt(process.argv[2]) || 5;
  console.log(`\n=== DiscoverNutriSource Direct Image Loader ===`);
  console.log(`Processing: ${limit} products\n`);
  
  // Get NutriSource Little Bites products
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    imageUrls: supplies.imageUrls
  })
  .from(supplies)
  .where(
    or(
      ilike(supplies.name, '%little bites%'),
      ilike(supplies.name, '%soft & tender%')
    )
  )
  .limit(limit);
  
  console.log(`Found ${products.length} products\n`);
  
  for (const product of products) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Product: ${product.name} (ID: ${product.id})`);
    
    const mapping = findMapping(product.name);
    if (!mapping) {
      console.log(`  No URL mapping found`);
      continue;
    }
    
    console.log(`  Using predefined image URLs (${mapping.images.length} images)`);
    
    // Download and store images
    const storedUrls: string[] = [];
    for (let i = 0; i < mapping.images.length; i++) {
      console.log(`  Downloading image ${i+1}/${mapping.images.length}...`);
      const imgBuffer = await downloadImage(mapping.images[i]);
      if (imgBuffer) {
        const stored = await storeImage(imgBuffer, product.id, product.name, i + 1);
        if (stored) {
          storedUrls.push(stored);
          console.log(`    Stored: ${stored}`);
        }
      }
    }
    
    if (storedUrls.length > 0) {
      await db.update(supplies)
        .set({ imageUrls: storedUrls })
        .where(sql`id = ${product.id}`);
      console.log(`  Updated with ${storedUrls.length} images`);
    }
  }
  
  console.log(`\nDone!`);
}

main().catch(console.error);
