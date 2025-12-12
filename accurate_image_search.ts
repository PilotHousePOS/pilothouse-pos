import { storage } from './server/storage';
import { ObjectStorageService } from './server/objectStorageService';

const objectStorageService = new ObjectStorageService();

interface ProductMatch {
  id: number;
  name: string;
  brand: string;
  searchUrl: string;
  imageUrl: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}

function buildChewySearchUrl(productName: string, brand: string): string {
  // Build a search URL for Chewy
  const query = `${brand} ${productName}`.replace(/[^\w\s]/g, ' ').replace(/\s+/g, '+');
  return `https://www.chewy.com/s?query=${encodeURIComponent(query)}`;
}

function buildChewyDirectUrl(productName: string, brand: string): string {
  // Try to build a direct product URL based on naming patterns
  const slug = `${brand}-${productName}`
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return `https://www.chewy.com/${slug}/dp/SEARCH`;
}

async function searchChewyForProduct(name: string, brand: string): Promise<{ imageUrl: string | null; confidence: string; reason: string }> {
  try {
    // Build search query - include brand and full product name
    const searchQuery = `${brand} ${name} site:chewy.com`;
    
    // For now, we'll construct the likely Chewy image URL based on patterns
    // Chewy images follow: https://image.chewy.com/catalog/general/images/{product-slug}/img-{id}._AC_SL1200_QL100_V1_.jpg
    
    // Since we can't do live web searches easily, let's validate existing URLs
    // and mark products that need manual review
    
    return {
      imageUrl: null,
      confidence: 'none',
      reason: 'Requires web search for accurate matching'
    };
  } catch (error: any) {
    return {
      imageUrl: null,
      confidence: 'none',
      reason: `Search failed: ${error.message}`
    };
  }
}

async function validateExistingUrl(url: string, productName: string): Promise<{ valid: boolean; reason: string }> {
  try {
    const response = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
    
    if (!response.ok) {
      return { valid: false, reason: `HTTP ${response.status}` };
    }
    
    // Check if URL slug contains relevant product keywords
    const urlLower = url.toLowerCase();
    const nameParts = productName.toLowerCase().split(/\s+/).filter(p => p.length > 3);
    const matchingParts = nameParts.filter(part => urlLower.includes(part));
    
    if (matchingParts.length >= 2) {
      return { valid: true, reason: `URL matches product keywords: ${matchingParts.join(', ')}` };
    } else if (matchingParts.length === 1) {
      return { valid: false, reason: `Weak match - only "${matchingParts[0]}" found in URL` };
    } else {
      return { valid: false, reason: 'No product keywords found in URL - likely generic image' };
    }
  } catch (error: any) {
    return { valid: false, reason: `Validation failed: ${error.message}` };
  }
}

async function processProduct(product: any): Promise<ProductMatch> {
  const { id, name, brand, imageUrl } = product;
  
  // First, validate the existing URL
  if (imageUrl && imageUrl.startsWith('http')) {
    const validation = await validateExistingUrl(imageUrl, name);
    
    if (validation.valid) {
      return {
        id,
        name,
        brand,
        searchUrl: imageUrl,
        imageUrl: imageUrl,
        confidence: 'high',
        reason: validation.reason
      };
    } else {
      return {
        id,
        name,
        brand,
        searchUrl: buildChewySearchUrl(name, brand),
        imageUrl: null,
        confidence: 'low',
        reason: validation.reason
      };
    }
  }
  
  return {
    id,
    name,
    brand,
    searchUrl: buildChewySearchUrl(name, brand),
    imageUrl: null,
    confidence: 'none',
    reason: 'No existing URL'
  };
}

async function main() {
  console.log('=== Accurate Image Validation for Kong Products ===\n');
  
  const allSupplies = await storage.getAllSupplies();
  const kongProducts = allSupplies
    .filter((s: any) => s.brand === 'Kong' && s.imageUrl?.startsWith('http'))
    .slice(0, 50);
  
  console.log(`Processing ${kongProducts.length} Kong products...\n`);
  
  const results: ProductMatch[] = [];
  let highConfidence = 0;
  let lowConfidence = 0;
  let needsManualReview = 0;
  
  for (const product of kongProducts) {
    const result = await processProduct(product);
    results.push(result);
    
    if (result.confidence === 'high') {
      highConfidence++;
      console.log(`✓ HIGH: ${product.id} - ${product.name.substring(0, 45)}`);
    } else if (result.confidence === 'low') {
      lowConfidence++;
      console.log(`? LOW:  ${product.id} - ${product.name.substring(0, 45)} - ${result.reason}`);
    } else {
      needsManualReview++;
      console.log(`✗ NONE: ${product.id} - ${product.name.substring(0, 45)}`);
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n=== Summary ===');
  console.log(`High confidence (can auto-download): ${highConfidence}`);
  console.log(`Low confidence (needs manual review): ${lowConfidence}`);
  console.log(`No match (needs search): ${needsManualReview}`);
  
  // Save results for review
  console.log('\n=== Products needing manual image search ===');
  results
    .filter(r => r.confidence !== 'high')
    .slice(0, 20)
    .forEach(r => {
      console.log(`ID ${r.id}: ${r.name}`);
      console.log(`   Reason: ${r.reason}`);
      console.log(`   Search: ${r.searchUrl}`);
      console.log('');
    });
  
  process.exit(0);
}

main().catch(console.error);
