import { db } from '../db';
import { supplies } from '@shared/schema';
import { like, eq } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorageService';

const objectStorageService = new ObjectStorageService();

// Chewy image URL patterns for known brands
const CHEWY_BRAND_PATTERNS: Record<string, string> = {
  'Penn-Plax': 'penn-plax',
  'Fromm': 'fromm-family',
  'Nutrisource': 'nutrisource',
  'Zilla': 'zilla',
  'Fluval': 'fluval',
  'API': 'api',
  'Kaytee': 'kaytee',
  'Oxbow': 'oxbow',
  'Marineland': 'marineland',
  'Kong': 'kong',
  'Zoo Med': 'zoo-med',
  'Science Diet': 'hills-science-diet',
  'Nylabone': 'nylabone',
  'Tetra': 'tetra',
  'Exo Terra': 'exo-terra',
  'Adams': 'adams',
};

async function searchChewyImage(productName: string, brand: string): Promise<string | null> {
  // Construct a Chewy search URL pattern
  const cleanName = productName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  const brandSlug = CHEWY_BRAND_PATTERNS[brand] || brand?.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  // Common Chewy image URL patterns
  const possibleUrls = [
    `https://image.chewy.com/is/image/catalog/${brandSlug}_${cleanName}_primary._AC_SL1200_V1_.jpg`,
    `https://image.chewy.com/is/catalog/images/${brandSlug}/${cleanName}._AC_SL1200_V1_.jpg`,
  ];
  
  // Test if any URL works
  for (const url of possibleUrls) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        return url;
      }
    } catch (e) {
      // URL doesn't work, try next
    }
  }
  
  return null;
}

async function downloadAndStoreImage(
  productId: number,
  productName: string,
  brand: string,
  externalUrl: string
): Promise<{ success: boolean; storedPath?: string; error?: string }> {
  try {
    const result = await objectStorageService.downloadAndStoreProductImage(
      externalUrl,
      productId,
      productName,
      brand
    );
    
    if (result.success && result.storedPath) {
      // Update the database
      await db
        .update(supplies)
        .set({ imageUrl: result.storedPath, updatedAt: new Date() })
        .where(eq(supplies.id, productId));
      
      return { success: true, storedPath: result.storedPath };
    }
    
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function processProductsWithAmazonUrls(limit: number = 50) {
  console.log('Finding products with Amazon URLs...');
  
  const products = await db
    .select()
    .from(supplies)
    .where(like(supplies.imageUrl, '%amazon%'))
    .limit(limit);
  
  console.log(`Found ${products.length} products with Amazon URLs`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const product of products) {
    console.log(`Processing: ${product.name} (${product.brand})`);
    
    // Try to download the existing Amazon image (some might still work)
    const result = await downloadAndStoreImage(
      product.id,
      product.name,
      product.brand || 'unknown',
      product.imageUrl!
    );
    
    if (result.success) {
      console.log(`  ✓ Downloaded and stored: ${result.storedPath}`);
      successCount++;
    } else {
      console.log(`  ✗ Failed: ${result.error}`);
      failCount++;
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\nComplete! Success: ${successCount}, Failed: ${failCount}`);
}

// Run the script
const limit = parseInt(process.argv[2] || '20');
processProductsWithAmazonUrls(limit)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
