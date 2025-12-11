import { db } from '../db';
import { supplies } from '@shared/schema';
import { like, eq, and, sql } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorageService';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const objectStorageService = new ObjectStorageService();

// Load image source mappings
const mapPath = path.join(__dirname, 'imageSourceMap.json');
const imageSourceMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));

interface ProcessResult {
  id: number;
  name: string;
  brand: string | null;
  success: boolean;
  storedPath?: string;
  error?: string;
  source?: string;
}

async function downloadImage(id: number, url: string, name: string, brand: string): Promise<{success: boolean; storedPath?: string; error?: string}> {
  try {
    const result = await objectStorageService.downloadAndStoreProductImage(url, id, name, brand);
    if (result.success && result.storedPath) {
      await db.update(supplies).set({ imageUrl: result.storedPath, updatedAt: new Date() }).where(eq(supplies.id, id));
      return { success: true, storedPath: result.storedPath };
    }
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

function findKnownMapping(productName: string): string | null {
  const mappings = imageSourceMap.knownProductMappings;
  for (const [pattern, url] of Object.entries(mappings)) {
    if (productName.toLowerCase().includes(pattern.toLowerCase())) {
      return url as string;
    }
  }
  return null;
}

async function processProduct(product: any): Promise<ProcessResult> {
  const { id, name, brand, imageUrl } = product;
  
  // Step 1: Check for known product mapping
  const knownUrl = findKnownMapping(name);
  if (knownUrl) {
    console.log(`  [KNOWN] Found mapping for: ${name}`);
    const result = await downloadImage(id, knownUrl, name, brand || 'unknown');
    if (result.success) {
      return { id, name, brand, success: true, storedPath: result.storedPath, source: 'known-mapping' };
    }
  }
  
  // Step 2: Try existing Amazon URL (some still work)
  console.log(`  [AMAZON] Trying existing URL for: ${name}`);
  const amazonResult = await downloadImage(id, imageUrl, name, brand || 'unknown');
  if (amazonResult.success) {
    return { id, name, brand, success: true, storedPath: amazonResult.storedPath, source: 'amazon' };
  }
  
  // Step 3: Product needs manual mapping - log for later
  return { 
    id, 
    name, 
    brand, 
    success: false, 
    error: 'Needs manual URL mapping',
    source: 'failed'
  };
}

async function generateAuditReport() {
  console.log('Generating audit report of products with Amazon URLs...\n');
  
  const products = await db
    .select({
      brand: supplies.brand,
      count: sql<number>`count(*)::int`
    })
    .from(supplies)
    .where(like(supplies.imageUrl, '%amazon%'))
    .groupBy(supplies.brand)
    .orderBy(sql`count(*) desc`);
  
  console.log('Products with Amazon URLs by brand:');
  console.log('====================================');
  let total = 0;
  for (const { brand, count } of products) {
    console.log(`${brand || '(no brand)'}: ${count}`);
    total += count;
  }
  console.log('====================================');
  console.log(`Total: ${total} products\n`);
  
  return products;
}

async function processProductsByBrand(brandName: string, limit: number = 50) {
  console.log(`\nProcessing ${brandName} products (limit: ${limit})...`);
  
  const products = await db
    .select()
    .from(supplies)
    .where(and(
      like(supplies.imageUrl, '%amazon%'),
      eq(supplies.brand, brandName)
    ))
    .limit(limit);
  
  console.log(`Found ${products.length} products\n`);
  
  const results: ProcessResult[] = [];
  let successCount = 0;
  let failCount = 0;
  
  for (const product of products) {
    const result = await processProduct(product);
    results.push(result);
    
    if (result.success) {
      console.log(`✓ ${result.name} => ${result.storedPath} (${result.source})`);
      successCount++;
    } else {
      console.log(`✗ ${result.name} => ${result.error}`);
      failCount++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`\n${brandName} Complete: Success: ${successCount}, Failed: ${failCount}`);
  
  // Write failed products to a file for manual review
  const failedProducts = results.filter(r => !r.success);
  if (failedProducts.length > 0) {
    const failedPath = path.join(__dirname, `failed-${brandName.replace(/\s+/g, '-')}.json`);
    fs.writeFileSync(failedPath, JSON.stringify(failedProducts, null, 2));
    console.log(`Failed products written to: ${failedPath}`);
  }
  
  return { successCount, failCount, results };
}

async function main() {
  const command = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];
  
  if (command === 'audit') {
    await generateAuditReport();
  } else if (command === 'brand') {
    if (!arg1) {
      console.log('Usage: npx tsx server/scripts/batchImageProcessor.ts brand "Brand Name" [limit]');
      process.exit(1);
    }
    const limit = parseInt(arg2 || '50');
    await processProductsByBrand(arg1, limit);
  } else {
    console.log('Usage:');
    console.log('  npx tsx server/scripts/batchImageProcessor.ts audit');
    console.log('  npx tsx server/scripts/batchImageProcessor.ts brand "Brand Name" [limit]');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
