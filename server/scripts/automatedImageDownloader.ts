import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, like, and, sql, desc } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorageService';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const objectStorageService = new ObjectStorageService();

interface ProcessedProduct {
  id: number;
  name: string;
  brand: string;
  oldImageUrl: string;
  newImageUrl: string | null;
  source: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  timestamp: string;
}

interface ProductForImage {
  id: number;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
}

// Log file for tracking all processed images
const logFilePath = path.join(__dirname, 'image-download-log.json');
const progressFilePath = path.join(__dirname, 'image-download-progress.json');

function loadLog(): ProcessedProduct[] {
  if (fs.existsSync(logFilePath)) {
    return JSON.parse(fs.readFileSync(logFilePath, 'utf-8'));
  }
  return [];
}

function saveLog(log: ProcessedProduct[]) {
  fs.writeFileSync(logFilePath, JSON.stringify(log, null, 2));
}

function loadProgress(): { processedIds: number[], lastBrand: string, lastOffset: number } {
  if (fs.existsSync(progressFilePath)) {
    return JSON.parse(fs.readFileSync(progressFilePath, 'utf-8'));
  }
  return { processedIds: [], lastBrand: '', lastOffset: 0 };
}

function saveProgress(progress: { processedIds: number[], lastBrand: string, lastOffset: number }) {
  fs.writeFileSync(progressFilePath, JSON.stringify(progress, null, 2));
}

// Known product image sources - manually verified mappings
const KNOWN_IMAGE_SOURCES: Record<string, Record<string, string>> = {
  'coastal': {
    'dinosaur': 'https://upco.com/wp-content/uploads/2022/04/Coastal-Styles-Dino-Leash-600x600.jpg',
    'aliens': 'https://images.chewy.com/is/image/catalog/156515_MAIN._AC_SL1200_V1516137234_.jpg',
    'unicorns': 'https://images.chewy.com/is/image/catalog/156519_MAIN._AC_SL1200_V1516137235_.jpg',
    'llamas': 'https://images.chewy.com/is/image/catalog/156517_MAIN._AC_SL1200_V1516137234_.jpg',
    'pineapples': 'https://images.chewy.com/is/image/catalog/156518_MAIN._AC_SL1200_V1516137234_.jpg',
    'donuts': 'https://images.chewy.com/is/image/catalog/156516_MAIN._AC_SL1200_V1516137234_.jpg',
  },
  'kong': {
    'ez soft': 'https://images.chewy.com/is/image/catalog/114947_MAIN._AC_SL1200_V1651697287_.jpg',
    'treatster': 'https://images.chewy.com/is/image/catalog/170982_MAIN._AC_SL1200_V1571946449_.jpg',
    'maxx': 'https://images.chewy.com/is/image/catalog/170975_MAIN._AC_SL1200_V1571946449_.jpg',
    'wubba': 'https://images.chewy.com/is/image/catalog/48858_MAIN._AC_SL1200_V1582752810_.jpg',
  },
  'zoo med': {
    'pacman frog': 'https://images.chewy.com/is/image/catalog/136159_MAIN._AC_SL1200_V1571951008_.jpg',
    'can o crickets': 'https://images.chewy.com/is/image/catalog/136097_MAIN._AC_SL1200_V1571951007_.jpg',
    'anole food': 'https://images.chewy.com/is/image/catalog/136103_MAIN._AC_SL1200_V1571951007_.jpg',
    'repti calcium': 'https://images.chewy.com/is/image/catalog/136152_MAIN._AC_SL1200_V1571951008_.jpg',
  },
};

// Chewy image URL patterns for common products
function getChewyImageUrl(productName: string, brand: string): string | null {
  const name = productName.toLowerCase();
  const brandLower = (brand || '').toLowerCase();
  
  // Check known sources first
  const brandSources = KNOWN_IMAGE_SOURCES[brandLower];
  if (brandSources) {
    for (const [keyword, url] of Object.entries(brandSources)) {
      if (name.includes(keyword)) {
        return url;
      }
    }
  }
  
  return null;
}

// Download and store image from URL
async function downloadAndStoreImage(
  product: ProductForImage,
  imageUrl: string,
  source: string
): Promise<{ success: boolean; storedPath?: string; error?: string }> {
  try {
    const result = await objectStorageService.downloadAndStoreProductImage(
      imageUrl,
      product.id,
      product.name,
      product.brand || 'unknown'
    );
    
    if (result.success && result.storedPath) {
      // Update the database
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

// Get products with stock images for a brand
async function getProductsWithStockImages(brand: string, limit: number = 100): Promise<ProductForImage[]> {
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

// Get all brands with stock images sorted by count
async function getBrandsWithStockImages(): Promise<{ brand: string; count: number }[]> {
  const result = await db.select({
    brand: supplies.brand,
    count: sql<number>`count(*)::int`,
  })
  .from(supplies)
  .where(like(supplies.imageUrl, '%/stock/%'))
  .groupBy(supplies.brand)
  .orderBy(desc(sql`count(*)`));
  
  return result.filter(r => r.brand).map(r => ({ brand: r.brand!, count: r.count }));
}

// Process a single product - try to find and apply a real image
async function processProduct(product: ProductForImage): Promise<ProcessedProduct> {
  const timestamp = new Date().toISOString();
  
  // Try known image sources first
  const knownUrl = getChewyImageUrl(product.name, product.brand || '');
  
  if (knownUrl) {
    console.log(`  [KNOWN] Found known image for: ${product.name}`);
    const result = await downloadAndStoreImage(product, knownUrl, 'known-mapping');
    
    if (result.success) {
      return {
        id: product.id,
        name: product.name,
        brand: product.brand || '',
        oldImageUrl: product.imageUrl || '',
        newImageUrl: result.storedPath || null,
        source: 'known-mapping',
        status: 'success',
        timestamp,
      };
    }
  }
  
  // Product needs web search to find image
  return {
    id: product.id,
    name: product.name,
    brand: product.brand || '',
    oldImageUrl: product.imageUrl || '',
    newImageUrl: null,
    source: 'needs-search',
    status: 'skipped',
    error: 'No known image source, needs web search',
    timestamp,
  };
}

// Process products for a brand
async function processBrand(brandName: string, limit: number = 50): Promise<{
  success: number;
  failed: number;
  skipped: number;
}> {
  console.log(`\n=== Processing ${brandName} ===\n`);
  
  const products = await getProductsWithStockImages(brandName, limit);
  console.log(`Found ${products.length} products with stock images\n`);
  
  const log = loadLog();
  const progress = loadProgress();
  
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const product of products) {
    // Skip already processed
    if (progress.processedIds.includes(product.id)) {
      console.log(`  [SKIP] Already processed: ${product.name}`);
      skipped++;
      continue;
    }
    
    const result = await processProduct(product);
    log.push(result);
    progress.processedIds.push(product.id);
    
    if (result.status === 'success') {
      console.log(`  [SUCCESS] ${product.name} => ${result.newImageUrl}`);
      success++;
    } else if (result.status === 'skipped') {
      console.log(`  [SKIPPED] ${product.name} - ${result.error}`);
      skipped++;
    } else {
      console.log(`  [FAILED] ${product.name} - ${result.error}`);
      failed++;
    }
    
    // Save progress periodically
    if (log.length % 10 === 0) {
      saveLog(log);
      saveProgress(progress);
    }
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Final save
  saveLog(log);
  progress.lastBrand = brandName;
  saveProgress(progress);
  
  console.log(`\n${brandName} Complete: Success: ${success}, Failed: ${failed}, Skipped: ${skipped}`);
  
  return { success, failed, skipped };
}

// Add a known image mapping for a product
async function addKnownMapping(productId: number, imageUrl: string): Promise<boolean> {
  try {
    const products = await db.select()
      .from(supplies)
      .where(eq(supplies.id, productId))
      .limit(1);
    
    if (products.length === 0) {
      console.log(`Product ${productId} not found`);
      return false;
    }
    
    const product = products[0];
    console.log(`Downloading image for: ${product.name}`);
    
    const result = await downloadAndStoreImage(
      { 
        id: product.id, 
        name: product.name, 
        brand: product.brand, 
        category: product.category,
        imageUrl: product.imageUrl 
      },
      imageUrl,
      'manual'
    );
    
    if (result.success) {
      console.log(`Success: ${result.storedPath}`);
      
      // Log the action
      const log = loadLog();
      log.push({
        id: product.id,
        name: product.name,
        brand: product.brand || '',
        oldImageUrl: product.imageUrl || '',
        newImageUrl: result.storedPath || null,
        source: 'manual',
        status: 'success',
        timestamp: new Date().toISOString(),
      });
      saveLog(log);
      
      return true;
    }
    
    console.log(`Failed: ${result.error}`);
    return false;
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    return false;
  }
}

// Show current statistics
async function showStats() {
  console.log('\n=== Image Download Statistics ===\n');
  
  const log = loadLog();
  const successCount = log.filter(l => l.status === 'success').length;
  const failedCount = log.filter(l => l.status === 'failed').length;
  const skippedCount = log.filter(l => l.status === 'skipped').length;
  
  console.log(`Total processed: ${log.length}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failedCount}`);
  console.log(`  Skipped: ${skippedCount}`);
  
  const brands = await getBrandsWithStockImages();
  const totalRemaining = brands.reduce((sum, b) => sum + b.count, 0);
  
  console.log(`\nRemaining: ${totalRemaining} products with stock images`);
  console.log(`Top brands needing images:`);
  for (const { brand, count } of brands.slice(0, 10)) {
    console.log(`  ${brand}: ${count}`);
  }
}

// Reset progress (use with caution)
function resetProgress() {
  if (fs.existsSync(progressFilePath)) {
    fs.unlinkSync(progressFilePath);
    console.log('Progress reset');
  }
}

// Main CLI
async function main() {
  const command = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];
  
  switch (command) {
    case 'brand':
      if (!arg1) {
        console.log('Usage: npx tsx server/scripts/automatedImageDownloader.ts brand "Brand Name" [limit]');
        process.exit(1);
      }
      await processBrand(arg1, parseInt(arg2 || '50'));
      break;
      
    case 'add':
      if (!arg1 || !arg2) {
        console.log('Usage: npx tsx server/scripts/automatedImageDownloader.ts add <productId> <imageUrl>');
        process.exit(1);
      }
      await addKnownMapping(parseInt(arg1), arg2);
      break;
      
    case 'stats':
      await showStats();
      break;
      
    case 'reset':
      resetProgress();
      break;
      
    default:
      console.log('Automated Image Downloader\n');
      console.log('Commands:');
      console.log('  brand "Brand" [limit]      - Process products for a brand');
      console.log('  add <productId> <url>      - Add image for specific product');
      console.log('  stats                      - Show current statistics');
      console.log('  reset                      - Reset progress tracking');
      break;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

export { 
  processBrand,
  addKnownMapping,
  getBrandsWithStockImages,
  getProductsWithStockImages,
  downloadAndStoreImage,
};
