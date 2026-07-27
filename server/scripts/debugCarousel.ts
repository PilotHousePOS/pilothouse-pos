import { chromium } from 'playwright';

async function debugCarousel() {
  const url = 'https://nutrisourcepetfoods.com/our-food/grain-free-peanut-butter-little-bites/';
  
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium'
  });
  const page = await browser.newPage();
  
  console.log('Loading page...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Debug: Look for data-bg attributes and background images
  const debug = await page.evaluate(`
    (function() {
      var result = {
        dataBgElements: [],
        backgroundImageElements: [],
        allColumns: [],
        allDivsWithBg: []
      };
      
      // Find all elements with data-bg attribute
      var dataBgEls = document.querySelectorAll('[data-bg]');
      for (var i = 0; i < dataBgEls.length; i++) {
        var dataBg = dataBgEls[i].getAttribute('data-bg');
        if (dataBg && dataBg.includes('uploads')) {
          result.dataBgElements.push(dataBg);
        }
      }
      
      // Find all et_pb_column elements and check their backgrounds
      var columns = document.querySelectorAll('.et_pb_column, .et_pb_section, [class*="column"]');
      for (var j = 0; j < columns.length; j++) {
        var col = columns[j];
        var style = window.getComputedStyle(col);
        var bgImage = style.backgroundImage;
        if (bgImage && bgImage !== 'none' && bgImage.includes('uploads')) {
          var match = bgImage.match(/url\\(["']?([^"')]+)["']?\\)/);
          if (match) {
            result.allColumns.push({
              className: col.className.substring(0, 50),
              bgUrl: match[1].split('/').pop()
            });
          }
        }
        // Also check inline style
        var inlineStyle = col.getAttribute('style') || '';
        if (inlineStyle.includes('background')) {
          var urlMatch = inlineStyle.match(/url\\(["']?([^"')]+)["']?\\)/);
          if (urlMatch && urlMatch[1].includes('uploads')) {
            result.allColumns.push({
              className: col.className.substring(0, 50),
              inlineBgUrl: urlMatch[1].split('/').pop()
            });
          }
        }
      }
      
      // Find ALL divs with background-image
      var allDivs = document.querySelectorAll('div');
      for (var k = 0; k < allDivs.length; k++) {
        var div = allDivs[k];
        var style = window.getComputedStyle(div);
        var bgImage = style.backgroundImage;
        if (bgImage && bgImage !== 'none' && bgImage.includes('NS_')) {
          var match = bgImage.match(/url\\(["']?([^"')]+)["']?\\)/);
          if (match) {
            result.allDivsWithBg.push({
              className: (div.className || '').substring(0, 60),
              bgUrl: match[1].split('/').pop()
            });
          }
        }
      }
      
      return result;
    })()
  `);
  
  console.log('\n=== Debug Results ===');
  console.log('\nElements with data-bg:', (debug as any).dataBgElements);
  console.log('\nColumns with background:', (debug as any).allColumns);
  console.log('\nAll divs with NS_ background:', (debug as any).allDivsWithBg);
  
  await browser.close();
}

debugCarousel().catch(console.error);
