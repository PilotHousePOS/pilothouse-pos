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

// Extract product variant keywords from product name for filtering
function getProductKeywords(productName: string): string[] {
  const name = productName.toLowerCase();
  const keywords: string[] = [];
  
  // Extract flavor/variant
  if (name.includes('peanut butter')) keywords.push('peanutbutter');
  if (name.includes('chicken')) keywords.push('chicken');
  if (name.includes('beef')) keywords.push('beef');
  if (name.includes('turkey')) keywords.push('turkey');
  if (name.includes('salmon')) keywords.push('salmon');
  if (name.includes('trout')) keywords.push('trout');
  if (name.includes('duck')) keywords.push('duck');
  if (name.includes('rabbit')) keywords.push('rabbit');
  if (name.includes('lamb')) keywords.push('lamb');
  
  // Extract product line
  if (name.includes('little bites')) keywords.push('littlebites');
  if (name.includes('big bites')) keywords.push('bigbites');
  if (name.includes('grain free') || name.includes('gf')) keywords.push('gf');
  
  return keywords;
}

async function scrapeCarouselImages(url: string, productName: string): Promise<string[]> {
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
      for (let i = 0; i < 6; i++) {
        await nextButton.click();
        await page.waitForTimeout(600);
      }
    }
    
    // Get images specifically from the carousel/slider container
    // Target the et_pb_slider or gallery container, not the whole page
    const carouselImages = await page.evaluate(`
      (function() {
        var images = [];
        var seen = {};
        
        // Helper to check if URL is a valid product image (not nav/logo)
        function isValidProductImage(src) {
          if (!src) return false;
          var lower = src.toLowerCase();
          var filename = lower.split('/').pop() || '';
          
          // Must be from uploads directory
          if (lower.indexOf('/uploads/') === -1) return false;
          
          // Exclude thumbnails
          if (lower.indexOf('-150x') !== -1 || lower.indexOf('-300x') !== -1 || lower.indexOf('-480x') !== -1) return false;
          
          // Exclude navigation and logo images
          if (filename.indexOf('logo') !== -1 || filename.indexOf('nav') !== -1 || 
              filename.indexOf('sidenav') !== -1 || filename.indexOf('button') !== -1 ||
              filename.indexOf('find-store') !== -1 || filename.indexOf('fcf_') !== -1 ||
              filename.indexOf('social') !== -1 || filename.indexOf('icon') !== -1) return false;
          
          return true;
        }
        
        // Strategy 1: Look for images inside the main slider container
        var sliderContainers = document.querySelectorAll('.et_pb_slider, .et_pb_gallery, .et_pb_fullwidth_slider, [class*="slider"], [class*="gallery"], [class*="carousel"]');
        for (var c = 0; c < sliderContainers.length; c++) {
          var container = sliderContainers[c];
          
          // Get images from slides
          var slideImages = container.querySelectorAll('.et_pb_slide img, .et_pb_gallery_item img, [class*="slide"] img');
          for (var i = 0; i < slideImages.length; i++) {
            var img = slideImages[i];
            var src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
            if (isValidProductImage(src) && !seen[src]) {
              seen[src] = true;
              images.push(src);
            }
          }
          
          // Get background images from slides
          var slides = container.querySelectorAll('.et_pb_slide, .et_pb_gallery_item, [class*="slide"]');
          for (var j = 0; j < slides.length; j++) {
            var slide = slides[j];
            // Check data attributes for full-size images
            var dataSrc = slide.getAttribute('data-image') || slide.getAttribute('data-full') || 
                          slide.getAttribute('data-src') || slide.getAttribute('data-background');
            if (isValidProductImage(dataSrc) && !seen[dataSrc]) {
              seen[dataSrc] = true;
              images.push(dataSrc);
            }
            
            // Check computed background-image
            var style = window.getComputedStyle(slide);
            var bgImage = style.backgroundImage;
            if (bgImage && bgImage !== 'none') {
              var match = bgImage.match(/url\\(["']?([^"')]+)["']?\\)/);
              if (match && isValidProductImage(match[1]) && !seen[match[1]]) {
                seen[match[1]] = true;
                images.push(match[1]);
              }
            }
          }
        }
        
        // Strategy 2: If no slider found, look for product-specific images (NS_ prefix)
        if (images.length === 0) {
          var allImages = document.querySelectorAll('img');
          for (var k = 0; k < allImages.length; k++) {
            var img2 = allImages[k];
            var src2 = img2.src || img2.getAttribute('data-src') || '';
            var filename = src2.toLowerCase().split('/').pop() || '';
            // Only accept NS_ or NSGF_ prefixed images (product images)
            if ((filename.indexOf('ns_') === 0 || filename.indexOf('nsgf_') === 0) && 
                isValidProductImage(src2) && !seen[src2]) {
              seen[src2] = true;
              images.push(src2);
            }
          }
        }
        
        return images;
      })()
    `) as string[];
    
    console.log(`  Found ${carouselImages.length} carousel images`);
    return carouselImages;
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
    const carouselImages = await scrapeCarouselImages(url, product.name);
    
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
