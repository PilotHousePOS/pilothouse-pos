import { db } from '../db';
import { supplies } from '@shared/schema';
import { ilike, eq } from 'drizzle-orm';
import https from 'https';
import crypto from 'crypto';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';

const objectStorageService = new ObjectStorageService();

interface ProductData {
  imageUrls: string[];
  size: string;
  style: string;
  description: string;
  ingredients: string;
  guaranteedAnalysis: string;
  feedingInstructions: string;
}

// Fetch page HTML and extract all product data
async function fetchProductData(slug: string): Promise<ProductData | null> {
  return new Promise((resolve) => {
    const url = `https://discovernutrisource.com/products/${slug}`;
    console.log(`  Fetching: ${url}`);
    
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        console.log(`    HTTP ${res.statusCode}`);
        resolve(null);
        return;
      }
      
      let html = '';
      res.on('data', (chunk) => html += chunk);
      res.on('end', () => {
        // Extract carousel images
        const imgRegex = /cdn\/shop\/files\/[^"'\s]+_2048x\.png(?:\?[^"'\s]*)?/g;
        const imgMatches = html.match(imgRegex) || [];
        
        const seenFiles = new Set<string>();
        const imageUrls: string[] = [];
        
        for (const match of imgMatches) {
          const filename = match.split('/').pop()?.split('?')[0] || '';
          if (!seenFiles.has(filename)) {
            seenFiles.add(filename);
            imageUrls.push(`https://discovernutrisource.com/${match.split('?')[0]}`);
          }
        }
        
        console.log(`    Found ${imageUrls.length} carousel images`);
        
        // Extract size from page - just get the number and unit
        let size = '6 oz';  // Default for Little Bites
        const sizeMatch = html.match(/(\d+)\s*(oz|lb)\b/i);
        if (sizeMatch) size = `${sizeMatch[1]} ${sizeMatch[2]}`;
        
        // Extract product title for style/flavor
        let style = '';
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (titleMatch) {
          style = titleMatch[1].trim();
        }
        
        // Extract description from tab1 content
        let description = '';
        const descMatch = html.match(/id="tab1"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
          // Extract text from list items
          const liMatches = descMatch[1].match(/<li[^>]*>([^<]+)<\/li>/gi) || [];
          const items = liMatches.map(li => li.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
          description = items.join('. ');
        }
        
        // Extract ingredients from tab3
        let ingredients = '';
        const ingredMatch = html.match(/id="tab3"[^>]*>([\s\S]*?)<\/div>/i);
        if (ingredMatch) {
          ingredients = ingredMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        
        // Extract guaranteed analysis from tab4
        let guaranteedAnalysis = '';
        const analysisMatch = html.match(/id="tab4"[^>]*>([\s\S]*?)<\/div>/i);
        if (analysisMatch) {
          // Parse table rows
          const rows = analysisMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
          const parts: string[] = [];
          for (const row of rows) {
            const cells = row.match(/<t[dh][^>]*>([^<]*)<\/t[dh]>/gi) || [];
            if (cells.length >= 2) {
              const label = cells[0].replace(/<[^>]+>/g, '').trim();
              const value = cells[1].replace(/<[^>]+>/g, '').trim();
              if (label && value && !label.includes('Guaranteed')) {
                parts.push(`${label}|${value}`);
              }
            }
          }
          guaranteedAnalysis = parts.join('|');
          
          // Get calorie content
          const calorieMatch = analysisMatch[1].match(/(\d+,?\d*)\s*kcal\/kg[^<]*/i);
          if (calorieMatch) {
            guaranteedAnalysis += `|Calorie Content|${calorieMatch[0].trim()}`;
          }
        }
        
        // Extract feeding instructions from tab5
        let feedingInstructions = '';
        const feedMatch = html.match(/id="tab5"[^>]*>([\s\S]*?)<\/div>/i);
        if (feedMatch) {
          feedingInstructions = feedMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        
        resolve({
          imageUrls,
          size,
          style,
          description,
          ingredients,
          guaranteedAnalysis,
          feedingInstructions
        });
      });
    }).on('error', (err) => {
      console.log(`    Error: ${err.message}`);
      resolve(null);
    });
  });
}

async function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    https.get({ hostname: urlObj.hostname, path: urlObj.pathname, headers: { 'User-Agent': 'Mozilla/5.0' }}, (res) => {
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

function computeHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
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

// Product slug mapping
const slugMappings: { [key: string]: string } = {
  'peanut butter': 'grain-free-peanut-butter-little-bites',
  'chicken': 'chicken-little-bites',
  'beef': 'grain-free-beef-little-bites',
  'turkey': 'grain-free-turkey-little-bites',
  'salmon': 'salmon-little-bites',
  'trout': 'grain-free-trout-little-bites',
  'duck': 'duck-little-bites',
};

function findSlug(productName: string): string | null {
  const name = productName.toLowerCase();
  for (const [key, slug] of Object.entries(slugMappings)) {
    if (name.includes(key) && name.includes('little bites')) {
      return slug;
    }
  }
  return null;
}

async function main() {
  const productIdArg = process.argv[2];
  const limit = parseInt(process.argv[3]) || 20;
  
  console.log(`\n=== NutriSource Complete Product Scraper ===`);
  console.log(`Downloads images and extracts: size, style, description, ingredients, analysis\n`);
  
  // Get products to process
  let products;
  if (productIdArg && !isNaN(parseInt(productIdArg))) {
    products = await db.select()
      .from(supplies)
      .where(eq(supplies.id, parseInt(productIdArg)));
  } else {
    products = await db.select()
      .from(supplies)
      .where(ilike(supplies.name, '%little bites%'))
      .limit(limit);
  }
  
  console.log(`Processing ${products.length} products\n`);
  
  for (const product of products) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Product: ${product.name} (ID: ${product.id})`);
    
    const slug = findSlug(product.name);
    if (!slug) {
      console.log(`  No slug mapping found - skipping`);
      continue;
    }
    
    // Fetch all product data from the page
    const data = await fetchProductData(slug);
    if (!data || data.imageUrls.length === 0) {
      console.log(`  Failed to fetch data`);
      continue;
    }
    
    // Download and store images with duplicate detection
    const storedUrls: string[] = [];
    const downloadedHashes = new Set<string>();
    
    console.log(`\n  Downloading and storing ${data.imageUrls.length} images...`);
    for (let i = 0; i < data.imageUrls.length; i++) {
      const imgUrl = data.imageUrls[i];
      const filename = imgUrl.split('/').pop() || 'unknown';
      console.log(`    [${i+1}/${data.imageUrls.length}] ${filename}`);
      
      const buffer = await downloadImage(imgUrl);
      if (!buffer) {
        console.log(`        → Failed to download`);
        continue;
      }
      
      const hash = computeHash(buffer);
      
      if (downloadedHashes.has(hash)) {
        console.log(`        → DUPLICATE content, skipping`);
        continue;
      }
      
      downloadedHashes.add(hash);
      
      const storedUrl = await storeImage(buffer, product.id, product.name, storedUrls.length + 1);
      if (storedUrl) {
        storedUrls.push(storedUrl);
        console.log(`        → Stored`);
      }
    }
    
    // Build update object
    const updates: any = {
      imageUrls: storedUrls,
      category: 'dogTreats',    // Little Bites are treats
      filterType: 'dogTreats',  // Little Bites are treats
      color: 'Purple',          // NutriSource Little Bites bags are purple
    };
    
    // Only update fields if we have better data
    if (data.size) {
      updates.size = data.size;
      console.log(`  Size: ${data.size}`);
    }
    
    if (data.style) {
      updates.style = data.style;
      console.log(`  Style: ${data.style}`);
    }
    
    if (data.description && data.description.length > 20) {
      updates.description = data.description;
      console.log(`  Description: ${data.description.substring(0, 60)}...`);
    }
    
    if (data.ingredients && data.ingredients.length > 20) {
      updates.ingredients = data.ingredients;
      console.log(`  Ingredients: ${data.ingredients.substring(0, 60)}...`);
    }
    
    if (data.guaranteedAnalysis) {
      updates.guaranteedAnalysis = data.guaranteedAnalysis;
      console.log(`  Guaranteed Analysis: extracted`);
    }
    
    if (data.feedingInstructions) {
      updates.feedingInstructions = data.feedingInstructions;
      console.log(`  Feeding Instructions: ${data.feedingInstructions.substring(0, 60)}...`);
    }
    
    // Update database
    await db.update(supplies)
      .set(updates)
      .where(eq(supplies.id, product.id));
    
    console.log(`\n  ✓ Updated with ${storedUrls.length} images and product data`);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done!`);
}

main().catch(console.error);
