import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, like, and, or, isNull, sql } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorageService';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const objectStorageService = new ObjectStorageService();

interface ImageCandidate {
  productId: number;
  productName: string;
  brand: string;
  candidateUrl: string;
  source: string;
  confidence: number;
  matchReason: string;
  verified: boolean;
}

interface ProductForImage {
  id: number;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
}

// Known brand -> manufacturer website mappings
const BRAND_WEBSITES: Record<string, string> = {
  'coastal': 'coastalpet.com',
  'kong': 'kongcompany.com',
  'zoo med': 'zoomed.com',
  'fluval': 'fluvalaquatics.com',
  'tetra': 'tetra-fish.com',
  'api': 'apifishcare.com',
  'hikari': 'hikariusa.com',
  'aqueon': 'aqueon.com',
  'marineland': 'marineland.com',
  'penn-plax': 'penn-plax.com',
  'exo terra': 'exo-terra.com',
  'fluker\'s': 'flukersfarms.com',
  'kaytee': 'kaytee.com',
  'oxbow': 'oxbowanimalhealth.com',
  'nutrisource': 'nutrisourcepetfoods.com',
  'fromm': 'frommfamily.com',
  'science diet': 'hillspet.com',
  'nylabone': 'nylabone.com',
  'benebone': 'benebone.com',
  'four paws': 'fourpaws.com',
  'petmate': 'petmate.com',
};

// Retailer sites for product image lookup
const RETAILER_SITES = [
  'chewy.com',
  'petco.com',
  'petsmart.com',
  'amazon.com',
];

// Generate search query for a product
function generateSearchQuery(product: ProductForImage): string {
  const brand = product.brand || '';
  const name = product.name;
  
  // Clean up product name - remove size specifications for better search
  const cleanName = name
    .replace(/\d+(\.\d+)?\s*(oz|lb|lbs|ml|l|g|kg|ct|count|pack|pk)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return `${brand} ${cleanName} pet product image`;
}

// Calculate confidence score based on name matching
function calculateConfidence(productName: string, brand: string, pageTitle: string, pageUrl: string): number {
  let score = 0;
  const nameLower = productName.toLowerCase();
  const brandLower = (brand || '').toLowerCase();
  const titleLower = pageTitle.toLowerCase();
  const urlLower = pageUrl.toLowerCase();
  
  // Brand match in title or URL
  if (brandLower && (titleLower.includes(brandLower) || urlLower.includes(brandLower))) {
    score += 30;
  }
  
  // Check for key product words in title
  const productWords = nameLower.split(/\s+/).filter(w => w.length > 3);
  let matchedWords = 0;
  for (const word of productWords) {
    if (titleLower.includes(word) || urlLower.includes(word)) {
      matchedWords++;
    }
  }
  
  if (productWords.length > 0) {
    score += Math.round((matchedWords / productWords.length) * 50);
  }
  
  // Retailer bonus - trusted sources
  if (RETAILER_SITES.some(site => urlLower.includes(site))) {
    score += 15;
  }
  
  // Manufacturer site bonus
  const brandSite = BRAND_WEBSITES[brandLower];
  if (brandSite && urlLower.includes(brandSite)) {
    score += 20;
  }
  
  return Math.min(score, 100);
}

// Extract image URL from a product page (would need actual web scraping)
async function findImageFromRetailer(productName: string, brand: string, retailer: string): Promise<ImageCandidate | null> {
  // This is a placeholder - in production, this would:
  // 1. Search the retailer's site for the product
  // 2. Extract the main product image URL
  // 3. Return the candidate with confidence score
  
  // For now, we'll generate search URLs that can be used manually or with web fetch
  const searchQuery = encodeURIComponent(`${brand} ${productName}`);
  
  const searchUrls: Record<string, string> = {
    'chewy.com': `https://www.chewy.com/s?query=${searchQuery}`,
    'petco.com': `https://www.petco.com/shop/en/petcostore/search?query=${searchQuery}`,
    'petsmart.com': `https://www.petsmart.com/search/?q=${searchQuery}`,
  };
  
  return null; // Would return candidate if found
}

// Get products with stock images by brand
async function getProductsWithStockImages(brand: string, limit: number = 50): Promise<ProductForImage[]> {
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

// Get all brands with stock images
async function getBrandsWithStockImages(): Promise<{ brand: string; count: number }[]> {
  const result = await db.select({
    brand: supplies.brand,
    count: sql<number>`count(*)::int`,
  })
  .from(supplies)
  .where(like(supplies.imageUrl, '%/stock/%'))
  .groupBy(supplies.brand)
  .orderBy(sql`count(*) desc`);
  
  return result.filter(r => r.brand).map(r => ({ brand: r.brand!, count: r.count }));
}

// Store candidate for review
const candidatesFile = path.join(__dirname, 'image-candidates.json');

function loadCandidates(): ImageCandidate[] {
  if (fs.existsSync(candidatesFile)) {
    return JSON.parse(fs.readFileSync(candidatesFile, 'utf-8'));
  }
  return [];
}

function saveCandidates(candidates: ImageCandidate[]) {
  fs.writeFileSync(candidatesFile, JSON.stringify(candidates, null, 2));
}

function addCandidate(candidate: ImageCandidate) {
  const candidates = loadCandidates();
  // Avoid duplicates
  const exists = candidates.some(c => 
    c.productId === candidate.productId && c.candidateUrl === candidate.candidateUrl
  );
  if (!exists) {
    candidates.push(candidate);
    saveCandidates(candidates);
  }
}

// Apply verified image to product
async function applyVerifiedImage(productId: number, imageUrl: string): Promise<boolean> {
  try {
    // First, download and store the image permanently
    const product = await db.select().from(supplies).where(eq(supplies.id, productId)).limit(1);
    if (product.length === 0) return false;
    
    const result = await objectStorageService.downloadAndStoreProductImage(
      imageUrl,
      productId,
      product[0].name,
      product[0].brand || 'unknown'
    );
    
    if (result.success && result.storedPath) {
      await db.update(supplies)
        .set({ imageUrl: result.storedPath, updatedAt: new Date() })
        .where(eq(supplies.id, productId));
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to apply image for product ${productId}:`, error);
    return false;
  }
}

// Generate report of products needing images
async function generateReport() {
  console.log('\n=== Products with Stock Images Report ===\n');
  
  const brands = await getBrandsWithStockImages();
  let totalProducts = 0;
  
  console.log('Brand | Count | Sample Products');
  console.log('-'.repeat(80));
  
  for (const { brand, count } of brands.slice(0, 30)) {
    const samples = await getProductsWithStockImages(brand, 3);
    const sampleNames = samples.map(s => s.name.substring(0, 30)).join(', ');
    console.log(`${brand.padEnd(20)} | ${String(count).padStart(5)} | ${sampleNames}`);
    totalProducts += count;
  }
  
  console.log('-'.repeat(80));
  console.log(`Total: ${totalProducts} products need real images across ${brands.length} brands\n`);
  
  return { brands, totalProducts };
}

// Generate search URLs for manual image lookup
async function generateSearchUrls(brand: string, limit: number = 20) {
  const products = await getProductsWithStockImages(brand, limit);
  
  console.log(`\n=== Search URLs for ${brand} (${products.length} products) ===\n`);
  
  for (const product of products) {
    const searchQuery = encodeURIComponent(`${product.brand} ${product.name}`);
    console.log(`\nProduct: ${product.name} (ID: ${product.id})`);
    console.log(`  Chewy: https://www.chewy.com/s?query=${searchQuery}`);
    console.log(`  Petco: https://www.petco.com/shop/en/petcostore/search?query=${searchQuery}`);
    
    // If we know the manufacturer site
    const brandLower = (product.brand || '').toLowerCase();
    if (BRAND_WEBSITES[brandLower]) {
      console.log(`  Manufacturer: https://www.${BRAND_WEBSITES[brandLower]}`);
    }
  }
}

// Main CLI
async function main() {
  const command = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];
  
  switch (command) {
    case 'report':
      await generateReport();
      break;
      
    case 'search':
      if (!arg1) {
        console.log('Usage: npx tsx server/scripts/accurateImageFinder.ts search "Brand Name" [limit]');
        process.exit(1);
      }
      await generateSearchUrls(arg1, parseInt(arg2 || '20'));
      break;
      
    case 'apply':
      if (!arg1 || !arg2) {
        console.log('Usage: npx tsx server/scripts/accurateImageFinder.ts apply <productId> <imageUrl>');
        process.exit(1);
      }
      const success = await applyVerifiedImage(parseInt(arg1), arg2);
      console.log(success ? 'Image applied successfully' : 'Failed to apply image');
      break;
      
    default:
      console.log('Accurate Image Finder - Helps find real product images\n');
      console.log('Commands:');
      console.log('  report                    - Show report of brands needing images');
      console.log('  search "Brand" [limit]    - Generate search URLs for a brand');
      console.log('  apply <productId> <url>   - Apply verified image to product');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

export { 
  getProductsWithStockImages, 
  getBrandsWithStockImages, 
  applyVerifiedImage,
  generateSearchQuery,
  BRAND_WEBSITES,
  RETAILER_SITES
};
