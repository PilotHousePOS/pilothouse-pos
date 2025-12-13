/**
 * Web Image Finder - Finds real product images using web search
 * 
 * This script:
 * 1. Searches for products on Chewy/Petco/manufacturer sites
 * 2. Extracts product image URLs from pages
 * 3. Validates images are real product images
 * 4. Downloads and stores them permanently
 */

import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, like, and, sql, desc, not, or, isNull } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorageService';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const objectStorageService = new ObjectStorageService();

// Logging
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

interface SearchResult {
  productId: number;
  productName: string;
  brand: string;
  imageUrl: string | null;
  source: string;
  confidence: number;
  status: 'found' | 'not_found' | 'error';
  error?: string;
}

interface ProductToProcess {
  id: number;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
}

// Image URL patterns from major retailers
const CHEWY_IMAGE_PATTERNS = [
  /https:\/\/images\.chewy\.com\/is\/image\/catalog\/\d+_MAIN[^"'\s]*/,
  /https:\/\/images\.chewy\.com\/is\/image\/catalog\/\d+[^"'\s]*/,
];

const PETCO_IMAGE_PATTERNS = [
  /https:\/\/www\.petco\.com\/shop\/ProductCatalogPetcoSearchDisplay[^"'\s]*/,
  /https:\/\/images\.petco\.com\/\S+\.(?:jpg|jpeg|png|webp)/i,
];

const AMAZON_IMAGE_PATTERNS = [
  /https:\/\/m\.media-amazon\.com\/images\/I\/[^"'\s]+\.(?:jpg|jpeg|png)/i,
  /https:\/\/images-na\.ssl-images-amazon\.com\/images\/I\/[^"'\s]+\.(?:jpg|jpeg|png)/i,
];

// Extract image URL from HTML content
function extractImageUrl(html: string, productName: string): string | null {
  // Try Chewy patterns
  for (const pattern of CHEWY_IMAGE_PATTERNS) {
    const match = html.match(pattern);
    if (match) {
      return match[0].replace(/["'\s].*$/, '');
    }
  }
  
  // Try Amazon patterns
  for (const pattern of AMAZON_IMAGE_PATTERNS) {
    const match = html.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  // Try generic image patterns with product-related context
  const genericPattern = /(https?:\/\/[^\s"']+(?:product|main|primary)[^\s"']*\.(?:jpg|jpeg|png|webp))/i;
  const genericMatch = html.match(genericPattern);
  if (genericMatch) {
    return genericMatch[1];
  }
  
  return null;
}

// Build search query for a product
function buildSearchQuery(product: ProductToProcess): string {
  const brand = product.brand || '';
  let name = product.name;
  
  // Clean up product name
  name = name
    .replace(/\d+(\.\d+)?\s*(oz|lb|lbs|ml|l|g|kg|ct|count|pack|pk)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return `${brand} ${name} pet product`.trim();
}

// Search Chewy for product
async function searchChewy(product: ProductToProcess): Promise<SearchResult> {
  try {
    const searchQuery = encodeURIComponent(`${product.brand || ''} ${product.name}`);
    const searchUrl = `https://www.chewy.com/s?query=${searchQuery}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });
    
    if (!response.ok) {
      return {
        productId: product.id,
        productName: product.name,
        brand: product.brand || '',
        imageUrl: null,
        source: 'chewy',
        confidence: 0,
        status: 'error',
        error: `HTTP ${response.status}`,
      };
    }
    
    const html = await response.text();
    const imageUrl = extractImageUrl(html, product.name);
    
    if (imageUrl) {
      return {
        productId: product.id,
        productName: product.name,
        brand: product.brand || '',
        imageUrl,
        source: 'chewy',
        confidence: 70,
        status: 'found',
      };
    }
    
    return {
      productId: product.id,
      productName: product.name,
      brand: product.brand || '',
      imageUrl: null,
      source: 'chewy',
      confidence: 0,
      status: 'not_found',
    };
  } catch (error: any) {
    return {
      productId: product.id,
      productName: product.name,
      brand: product.brand || '',
      imageUrl: null,
      source: 'chewy',
      confidence: 0,
      status: 'error',
      error: error.message,
    };
  }
}

// Download and store image
async function downloadAndStoreImage(
  product: ProductToProcess,
  imageUrl: string
): Promise<{ success: boolean; storedPath?: string; error?: string }> {
  try {
    const result = await objectStorageService.downloadAndStoreProductImage(
      imageUrl,
      product.id,
      product.name,
      product.brand || 'unknown'
    );
    
    if (result.success && result.storedPath) {
      await db.update(supplies)
        .set({ imageUrl: result.storedPath, updatedAt: new Date() })
        .where(eq(supplies.id, product.id));
      
      return { success: true, storedPath: result.storedPath };
    }
    
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Get products needing images for a brand
async function getProductsNeedingImages(brand: string, limit: number = 50): Promise<ProductToProcess[]> {
  return db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    category: supplies.category,
    imageUrl: supplies.imageUrl,
  })
  .from(supplies)
  .where(and(
    like(supplies.imageUrl, '%/stock/%'),
    eq(supplies.brand, brand)
  ))
  .limit(limit);
}

// Process all products for a brand
async function processBrand(brandName: string, limit: number = 20): Promise<void> {
  console.log(`\n=== Processing ${brandName} (limit: ${limit}) ===\n`);
  
  const products = await getProductsNeedingImages(brandName, limit);
  console.log(`Found ${products.length} products with stock images\n`);
  
  const results: SearchResult[] = [];
  let successCount = 0;
  let failCount = 0;
  
  for (const product of products) {
    console.log(`Processing: ${product.name}...`);
    
    // Try Chewy search
    const searchResult = await searchChewy(product);
    
    if (searchResult.status === 'found' && searchResult.imageUrl) {
      console.log(`  Found image: ${searchResult.imageUrl.substring(0, 80)}...`);
      
      // Download and store
      const downloadResult = await downloadAndStoreImage(product, searchResult.imageUrl);
      
      if (downloadResult.success) {
        console.log(`  ✓ Stored: ${downloadResult.storedPath}`);
        successCount++;
      } else {
        console.log(`  ✗ Download failed: ${downloadResult.error}`);
        failCount++;
      }
    } else {
      console.log(`  ✗ Not found: ${searchResult.error || 'No image found'}`);
      failCount++;
    }
    
    results.push(searchResult);
    
    // Rate limit to avoid being blocked
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Save results log
  const logFile = path.join(logDir, `${brandName.replace(/\s+/g, '-')}-${Date.now()}.json`);
  fs.writeFileSync(logFile, JSON.stringify(results, null, 2));
  
  console.log(`\n=== ${brandName} Complete ===`);
  console.log(`Success: ${successCount}, Failed: ${failCount}`);
  console.log(`Log saved: ${logFile}`);
}

// Get statistics on remaining products
async function getStats(): Promise<void> {
  console.log('\n=== Image Statistics ===\n');
  
  const totalWithStock = await db.select({ count: sql<number>`count(*)::int` })
    .from(supplies)
    .where(like(supplies.imageUrl, '%/stock/%'));
  
  const totalWithReal = await db.select({ count: sql<number>`count(*)::int` })
    .from(supplies)
    .where(and(
      not(like(supplies.imageUrl, '%/stock/%')),
      not(isNull(supplies.imageUrl))
    ));
  
  const byBrand = await db.select({
    brand: supplies.brand,
    count: sql<number>`count(*)::int`,
  })
  .from(supplies)
  .where(like(supplies.imageUrl, '%/stock/%'))
  .groupBy(supplies.brand)
  .orderBy(desc(sql`count(*)`))
  .limit(20);
  
  console.log(`Products with stock images: ${totalWithStock[0]?.count || 0}`);
  console.log(`Products with real images: ${totalWithReal[0]?.count || 0}`);
  console.log('\nTop brands needing images:');
  
  for (const { brand, count } of byBrand) {
    console.log(`  ${(brand || 'Unknown').padEnd(25)} ${count}`);
  }
}

// Manually add image for a product
async function addImage(productId: number, imageUrl: string): Promise<void> {
  const products = await db.select()
    .from(supplies)
    .where(eq(supplies.id, productId))
    .limit(1);
  
  if (products.length === 0) {
    console.log(`Product ${productId} not found`);
    return;
  }
  
  const product = products[0];
  console.log(`Adding image for: ${product.name}`);
  
  const result = await downloadAndStoreImage(
    {
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      imageUrl: product.imageUrl,
    },
    imageUrl
  );
  
  if (result.success) {
    console.log(`✓ Success: ${result.storedPath}`);
  } else {
    console.log(`✗ Failed: ${result.error}`);
  }
}

// CLI
async function main() {
  const command = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];
  
  switch (command) {
    case 'brand':
      if (!arg1) {
        console.log('Usage: npx tsx server/scripts/webImageFinder.ts brand "Brand Name" [limit]');
        return;
      }
      await processBrand(arg1, parseInt(arg2 || '20'));
      break;
      
    case 'add':
      if (!arg1 || !arg2) {
        console.log('Usage: npx tsx server/scripts/webImageFinder.ts add <productId> <imageUrl>');
        return;
      }
      await addImage(parseInt(arg1), arg2);
      break;
      
    case 'stats':
      await getStats();
      break;
      
    default:
      console.log('Web Image Finder - Find real product images\n');
      console.log('Commands:');
      console.log('  brand "Brand" [limit]   - Process brand with web search');
      console.log('  add <id> <url>          - Manually add image');
      console.log('  stats                   - Show statistics');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
