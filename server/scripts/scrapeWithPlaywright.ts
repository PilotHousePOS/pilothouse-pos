import { chromium } from 'playwright';
import { db } from '../db';
import { supplies } from '@shared/schema';
import { ilike, or, sql } from 'drizzle-orm';
import https from 'https';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';

const objectStorageService = new ObjectStorageService();

const productUrlMappings: { [key: string]: string } = {
  'peanut butter little bites': 'https://nutrisourcepetfoods.com/our-food/grain-free-peanut-butter-little-bites/',
  'chicken little bites': 'https://nutrisourcepetfoods.com/our-food/chicken-little-bites/',
  'beef little bites': 'https://nutrisourcepetfoods.com/our-food/grain-free-beef-little-bites/',
  'turkey little bites': 'https://nutrisourcepetfoods.com/our-food/grain-free-turkey-little-bites/',
  'salmon little bites': 'https://nutrisourcepetfoods.com/our-food/salmon-little-bites/',
  'trout little bites': 'https://nutrisourcepetfoods.com/our-food/grain-free-trout-little-bites/',
  'duck little bites': 'https://nutrisourcepetfoods.com/our-food/duck-little-bites/',
  'rabbit little bites': 'https://nutrisourcepetfoods.com/our-food/rabbit-little-bites/',
};

function findUrl(productName: string): string | null {
  const name = productName.toLowerCase();
  for (const [key, url] of Object.entries(productUrlMappings)) {
    if (name.includes(key) || key.split(' ').every(word => name.includes(word))) {
      return url;
    }
  }
  return null;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(null));
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
    
    await setObjectAclPolicy(file, { visibility: 'public' });
    
    return `/public-objects/${objectFileName}`;
  } catch (error) {
    console.error(`  Error storing image:`, error);
    return null;
  }
}

async function scrapeCarouselImages(url: string): Promise<string[]> {
  // Use system Chromium installed via Nix
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium'
  });
  const page = await browser.newPage();
  
  try {
    console.log(`  Loading page with Playwright...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for slider/carousel to load
    await page.waitForTimeout(3000);
    
    // Click through carousel to ensure all images load
    const nextButton = await page.$('.et-pb-arrow-next, .et_pb_slider_arrow_next');
    if (nextButton) {
      for (let i = 0; i < 5; i++) {
        await nextButton.click();
        await page.waitForTimeout(500);
      }
    }
    
    // Get all carousel/gallery images - inline all logic to avoid function reference issues
    const imageUrls = await page.evaluate(`
      (function() {
        var images = [];
        
        // Get all img elements
        var allImages = document.querySelectorAll('img');
        for (var i = 0; i < allImages.length; i++) {
          var img = allImages[i];
          var src = img.src || img.getAttribute('data-src') || '';
          var lower = src.toLowerCase();
          var filename = lower.split('/').pop() || '';
          
          // Check if valid product image
          if (src && lower.indexOf('/uploads/') !== -1) {
            if (filename.indexOf('ns_') === 0 || filename.indexOf('nsgf_') === 0) {
              if (lower.indexOf('-150x') === -1 && lower.indexOf('-300x') === -1 && lower.indexOf('-480x') === -1) {
                if (filename.indexOf('logo') === -1 && filename.indexOf('nav') === -1 && filename.indexOf('sidenav') === -1) {
                  if (images.indexOf(src) === -1) {
                    images.push(src);
                  }
                }
              }
            }
          }
        }
        
        // Also check data-full attributes
        var dataFullElements = document.querySelectorAll('[data-full]');
        for (var j = 0; j < dataFullElements.length; j++) {
          var dataFull = dataFullElements[j].getAttribute('data-full') || '';
          var dataLower = dataFull.toLowerCase();
          var dataFilename = dataLower.split('/').pop() || '';
          
          if (dataFull && dataLower.indexOf('/uploads/') !== -1) {
            if (dataFilename.indexOf('ns_') === 0 || dataFilename.indexOf('nsgf_') === 0) {
              if (images.indexOf(dataFull) === -1) {
                images.push(dataFull);
              }
            }
          }
        }
        
        return images;
      })()
    `);
    
    console.log(`  Found ${imageUrls.length} carousel images via Playwright`);
    return imageUrls;
  } catch (error) {
    console.log(`  Playwright error: ${error}`);
    return [];
  } finally {
    await browser.close();
  }
}

async function main() {
  const limit = parseInt(process.argv[2]) || 5;
  console.log(`\n=== Playwright-based NutriSource Image Scraper ===`);
  console.log(`Processing: ${limit} products\n`);
  
  // Get NutriSource Little Bites products
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    imageUrl: supplies.imageUrl,
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
    
    const url = findUrl(product.name);
    if (!url) {
      console.log(`  No URL mapping found`);
      continue;
    }
    
    console.log(`  URL: ${url}`);
    const carouselImages = await scrapeCarouselImages(url);
    
    if (carouselImages.length === 0) {
      console.log(`  No carousel images found`);
      continue;
    }
    
    console.log(`  Carousel images found:`);
    carouselImages.forEach((img, i) => console.log(`    ${i+1}. ${img.split('/').pop()}`));
    
    // Download and store images
    const storedUrls: string[] = [];
    for (let i = 0; i < carouselImages.length && i < 8; i++) {
      const imgBuffer = await downloadImage(carouselImages[i]);
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
