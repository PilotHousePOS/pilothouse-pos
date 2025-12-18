import * as fs from 'fs';

interface Product {
  name: string;
  sku: string;
  source: string;
}

// Penn-Plax format: Product Name followed by SKU (030172xxxxxx)
function extractPennPlaxProducts(text: string): Product[] {
  const products: Product[] = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for lines containing Penn-Plax SKU
    const skuMatch = line.match(/030172\d{6}/);
    if (skuMatch) {
      const sku = skuMatch[0];
      
      // Extract product name (text before the SKU)
      let name = line.substring(0, line.indexOf(sku)).trim();
      
      // Clean up name
      name = name.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();
      
      // Skip partial names or empty
      if (name.length < 5) {
        // Look at previous line for name
        if (i > 0) {
          const prevLine = lines[i - 1].trim();
          if (prevLine.length > 5 && !prevLine.match(/^\$/) && !prevLine.match(/^030172/)) {
            name = prevLine.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();
          }
        }
      }
      
      // Handle multi-line product names (look up to 3 lines back)
      if (name.length < 10 && i > 0) {
        let fullName = name;
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const prevLine = lines[j].trim();
          if (prevLine.length > 3 && 
              !prevLine.match(/^\$/) && 
              !prevLine.match(/^030172/) &&
              !prevLine.match(/^Size:|^Wattage:|^Product\(s\)/) &&
              !prevLine.match(/^\d+\.\d{2}$/)) {
            fullName = prevLine.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim() + ' ' + fullName;
            if (fullName.length > 20) break;
          }
        }
        name = fullName.trim();
      }
      
      if (name.length >= 5) {
        products.push({ name, sku, source: 'penn-plax' });
      }
    }
  }
  
  return products;
}

// Central Pet abbreviated format parsing
// Format: abbreviated product codes like "API COND WTR TAP 4OZ"
const BRAND_ABBREVIATIONS: Record<string, string> = {
  'API': 'API',
  'TET': 'Tetra',
  'HIK': 'Hikari',
  'AQE': 'Aqueon',
  'AQA': 'Aquatic',
  'ZOO': 'Zoo Med',
  'MAR': 'Marineland',
  'FLU': 'Fluval',
  'EXO': 'Exo Terra',
  'SEC': 'SeaChem',
  'OMG': 'Omega One',
  'WWI': 'Worldwide',
  'SIC': 'Sicce',
  'ATP': 'All Pond Solutions',
  'CLI': 'Carib Sea',
  'WEC': 'Weco',
  'GBE': 'Glo Fish',
  'NLS': 'New Life Spectrum',
  'OXB': 'Oxbow',
  'KAY': 'Kaytee',
  'FMB': 'F.M. Brown',
  'CRK': 'Crazy K Farm',
  'SUN': 'Sunseed',
  'VIT': 'Vitakraft',
  'ZUP': 'ZuPreem',
  'MFP': 'Marshall',
  'HAG': 'Hagen',
};

function extractCentralPetProducts(text: string): Product[] {
  const products: Product[] = [];
  
  // Find lines that look like Central Pet product entries
  // Format: Abbreviated description followed by UPC on another line
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check for UPC pattern (12-13 digits)
    const upcMatch = line.match(/^(\d{12,13})$/);
    if (upcMatch) {
      const upc = upcMatch[1];
      
      // Look backwards for product description (abbreviated format)
      for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
        const prevLine = lines[j].trim();
        
        // Check if it's an abbreviated product line (starts with brand code)
        const brandMatch = prevLine.match(/^([A-Z]{2,4})\s+([A-Z][A-Z0-9\s\-#/.]+)/);
        if (brandMatch) {
          const brandCode = brandMatch[1];
          const description = brandMatch[2];
          
          if (BRAND_ABBREVIATIONS[brandCode] || description.length > 5) {
            const fullName = prevLine;
            products.push({ 
              name: fullName, 
              sku: upc, 
              source: 'central-pet' 
            });
            break;
          }
        }
      }
    }
  }
  
  return products;
}

// Extract products with inline UPC (Name + UPC on same line)
function extractInlineProducts(text: string): Product[] {
  const products: Product[] = [];
  
  // Pattern: Product text followed by UPC
  const pattern = /([A-Za-z][A-Za-z\s\-'"™®©,&()]+)\s+(\d{10,14})\s/g;
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].trim().replace(/[™®©]/g, '');
    const sku = match[2];
    
    if (name.length >= 8 && !name.match(/^\d+$/)) {
      products.push({ name, sku, source: 'inline' });
    }
  }
  
  return products;
}

// Main extraction function
async function extractAllProducts() {
  console.log('=== Invoice Product Extraction ===\n');
  
  const products: Product[] = [];
  
  // Load Penn-Plax invoice text
  if (fs.existsSync('/tmp/penn_plax_combined.txt')) {
    const pennPlaxText = fs.readFileSync('/tmp/penn_plax_combined.txt', 'utf-8');
    console.log(`Penn-Plax text: ${pennPlaxText.length} characters`);
    const pennPlaxProducts = extractPennPlaxProducts(pennPlaxText);
    console.log(`Extracted ${pennPlaxProducts.length} Penn-Plax products`);
    products.push(...pennPlaxProducts);
  }
  
  // Load all invoice text
  if (fs.existsSync('/tmp/all_invoice_text.txt')) {
    const allText = fs.readFileSync('/tmp/all_invoice_text.txt', 'utf-8');
    console.log(`All invoice text: ${allText.length} characters`);
    
    const centralPetProducts = extractCentralPetProducts(allText);
    console.log(`Extracted ${centralPetProducts.length} Central Pet products`);
    products.push(...centralPetProducts);
    
    const inlineProducts = extractInlineProducts(allText);
    console.log(`Extracted ${inlineProducts.length} inline products`);
    products.push(...inlineProducts);
  }
  
  // Deduplicate by SKU, keeping longest name
  const skuMap = new Map<string, Product>();
  for (const prod of products) {
    const existing = skuMap.get(prod.sku);
    if (!existing || prod.name.length > existing.name.length) {
      skuMap.set(prod.sku, prod);
    }
  }
  
  const uniqueProducts = Array.from(skuMap.values());
  console.log(`\nTotal unique products: ${uniqueProducts.length}`);
  
  // Save to JSON file
  fs.writeFileSync('/tmp/extracted_products.json', JSON.stringify(uniqueProducts, null, 2));
  console.log('Saved to /tmp/extracted_products.json');
  
  // Show sample
  console.log('\nSample products:');
  for (const prod of uniqueProducts.slice(0, 30)) {
    console.log(`  [${prod.source}] "${prod.name}" => ${prod.sku}`);
  }
  
  return uniqueProducts;
}

extractAllProducts()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
