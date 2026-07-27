import { chromium } from 'playwright';

async function debugDiscoverNS() {
  const url = 'https://discovernutrisource.com/products/grain-free-peanut-butter-little-bites';
  
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium'
  });
  const page = await browser.newPage();
  
  console.log('Loading discovernutrisource.com page...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Get page title to confirm we're on right page
  const title = await page.title();
  console.log('\nPage title:', title);
  
  // Find all product images
  const images = await page.evaluate(`
    (function() {
      var result = {
        shopifyImages: [],
        allImages: [],
        thumbnails: []
      };
      
      // Look for all images
      var allImgs = document.querySelectorAll('img');
      for (var i = 0; i < allImgs.length; i++) {
        var src = allImgs[i].src || '';
        var alt = allImgs[i].alt || '';
        if (src.includes('cdn.shopify.com') && (src.includes('products') || src.includes('files'))) {
          result.shopifyImages.push({
            src: src.split('?')[0],
            alt: alt.substring(0, 50)
          });
        }
      }
      
      // Look for gallery thumbnails
      var thumbs = document.querySelectorAll('[class*="thumbnail"], [class*="gallery"], [class*="slider"] img');
      for (var j = 0; j < thumbs.length; j++) {
        if (thumbs[j].src) {
          result.thumbnails.push(thumbs[j].src.split('?')[0].split('/').pop());
        }
      }
      
      return result;
    })()
  `);
  
  console.log('\nShopify product images found:');
  (images as any).shopifyImages.forEach((img: any, i: number) => {
    console.log(`  ${i+1}. ${img.src.split('/').pop()} - "${img.alt}"`);
  });
  
  console.log('\nThumbnails:', (images as any).thumbnails);
  
  await browser.close();
}

debugDiscoverNS().catch(console.error);
