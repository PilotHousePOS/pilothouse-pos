import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface FrommProduct {
  name: string;
  url: string;
  thumbnailImage: string;
  productLine: string;
  recipeType: string;
  animal: 'dog' | 'cat';
}

interface ProductDetails {
  description: string;
  ingredients: string;
  guaranteedAnalysis: Record<string, string>;
  feedingGuidelines: string;
  images: string[];
  sizes: string[];
}

// Extract product URLs from listing page
function extractProductsFromListing(html: string, animal: 'dog' | 'cat'): FrommProduct[] {
  const products: FrommProduct[] = [];
  
  // Match product links like: [LEARN MORE](https://frommfamily.com/products/dog/gold/dry/puppy-gold/)
  const regex = /\[LEARN MORE\]\((https:\/\/frommfamily\.com\/products\/(dog|cat)\/([^/]+)\/([^/]+)\/([^/)]+)\/?)\)/g;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    const url = match[1];
    const productLine = match[3];
    const recipeType = match[4];
    const slug = match[5];
    
    // Find the corresponding image and name
    const nameRegex = new RegExp(`\\!\\[([^\\]]+)\\]\\(https://cdn\\.frommfamily\\.com[^)]+\\)\\s*\\n\\s*\\[([^\\]]+)\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g');
    const nameMatch = nameRegex.exec(html);
    
    const name = nameMatch ? nameMatch[2] : slug.replace(/-/g, ' ');
    
    // Find thumbnail image
    const imgRegex = new RegExp(`\\!\\[${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\((https://cdn\\.frommfamily\\.com/[^)]+)\\)`);
    const imgMatch = imgRegex.exec(html);
    const thumbnailImage = imgMatch ? imgMatch[1] : '';
    
    products.push({
      name,
      url,
      thumbnailImage,
      productLine,
      recipeType,
      animal
    });
  }
  
  return products;
}

// Fetch and parse a single product page
async function fetchProductDetails(url: string): Promise<ProductDetails | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      }
    });
    
    if (!response.ok) return null;
    const html = await response.text();
    
    // Extract images from carousel
    const images: string[] = [];
    const imgRegex = /https:\/\/cdn\.frommfamily\.com\/media\/[^"'\s]+\.(jpg|png|webp)/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const imgUrl = imgMatch[0];
      // Filter for product images (not icons or tiny thumbnails)
      if (!images.includes(imgUrl) && !imgUrl.includes('icon') && !imgUrl.includes('logo')) {
        images.push(imgUrl);
      }
    }
    
    // Extract description - look for meta description or main content
    let description = '';
    const metaDescRegex = /<meta\s+name="description"\s+content="([^"]+)"/i;
    const metaMatch = metaDescRegex.exec(html);
    if (metaMatch) {
      description = metaMatch[1];
    }
    
    // Extract ingredients section
    let ingredients = '';
    const ingredientsRegex = /<h[23][^>]*>Ingredients<\/h[23]>[^<]*<[^>]*>([^<]+(?:<[^>]*>[^<]*)*)/i;
    const ingMatch = ingredientsRegex.exec(html);
    if (ingMatch) {
      ingredients = ingMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    // Extract guaranteed analysis
    const guaranteedAnalysis: Record<string, string> = {};
    const gaRegex = /Crude Protein[^0-9]*([0-9.]+%)|Crude Fat[^0-9]*([0-9.]+%)|Crude Fiber[^0-9]*([0-9.]+%)|Moisture[^0-9]*([0-9.]+%)/gi;
    let gaMatch;
    while ((gaMatch = gaRegex.exec(html)) !== null) {
      const fullMatch = gaMatch[0];
      if (fullMatch.includes('Protein')) guaranteedAnalysis.protein = gaMatch[1];
      if (fullMatch.includes('Fat')) guaranteedAnalysis.fat = gaMatch[2];
      if (fullMatch.includes('Fiber')) guaranteedAnalysis.fiber = gaMatch[3];
      if (fullMatch.includes('Moisture')) guaranteedAnalysis.moisture = gaMatch[4];
    }
    
    // Extract sizes
    const sizes: string[] = [];
    const sizeRegex = /(\d+(?:\.\d+)?\s*(?:lb|oz|kg|g))/gi;
    let sizeMatch;
    while ((sizeMatch = sizeRegex.exec(html)) !== null) {
      if (!sizes.includes(sizeMatch[1])) {
        sizes.push(sizeMatch[1]);
      }
    }
    
    return {
      description,
      ingredients,
      guaranteedAnalysis,
      feedingGuidelines: '',
      images: images.slice(0, 10), // Limit to 10 images
      sizes
    };
  } catch (e) {
    console.error(`Error fetching ${url}:`, e);
    return null;
  }
}

// Main function to scrape a category
async function scrapeCategory(animal: 'dog' | 'cat', recipeType: 'dry' | 'canned' | 'treats') {
  const recipeTypeParam = recipeType === 'canned' ? 'can' : recipeType === 'treats' ? 'treat' : 'dry';
  const url = `https://frommfamily.com/products/${animal}?Animal=${animal}&RecipeType=${recipeTypeParam}`;
  
  console.log(`\n=== Scraping ${animal} ${recipeType} from ${url} ===`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const products = extractProductsFromListing(html, animal);
    
    console.log(`Found ${products.length} ${animal} ${recipeType} products`);
    
    // Log first 5 products
    products.slice(0, 5).forEach(p => {
      console.log(`  - ${p.name}: ${p.url}`);
    });
    
    return products;
  } catch (e) {
    console.error(`Error scraping ${url}:`, e);
    return [];
  }
}

// Get all products from all categories
async function getAllFrommProducts() {
  const allProducts: FrommProduct[] = [];
  
  // Dog products
  allProducts.push(...await scrapeCategory('dog', 'dry'));
  allProducts.push(...await scrapeCategory('dog', 'canned'));
  allProducts.push(...await scrapeCategory('dog', 'treats'));
  
  // Cat products
  allProducts.push(...await scrapeCategory('cat', 'dry'));
  allProducts.push(...await scrapeCategory('cat', 'canned'));
  allProducts.push(...await scrapeCategory('cat', 'treats'));
  
  console.log(`\nTotal Fromm products found: ${allProducts.length}`);
  
  return allProducts;
}

// Main execution
async function main() {
  const allProducts = await getAllFrommProducts();
  
  // Print summary
  console.log('\n=== SUMMARY ===');
  const dogDry = allProducts.filter(p => p.animal === 'dog' && p.recipeType === 'dry');
  const dogCan = allProducts.filter(p => p.animal === 'dog' && p.recipeType === 'can');
  const dogTreats = allProducts.filter(p => p.animal === 'dog' && p.recipeType === 'treat');
  const catDry = allProducts.filter(p => p.animal === 'cat' && p.recipeType === 'dry');
  const catCan = allProducts.filter(p => p.animal === 'cat' && p.recipeType === 'can');
  const catTreats = allProducts.filter(p => p.animal === 'cat' && p.recipeType === 'treat');
  
  console.log(`Dog Dry: ${dogDry.length}`);
  console.log(`Dog Canned: ${dogCan.length}`);
  console.log(`Dog Treats: ${dogTreats.length}`);
  console.log(`Cat Dry: ${catDry.length}`);
  console.log(`Cat Canned: ${catCan.length}`);
  console.log(`Cat Treats: ${catTreats.length}`);
  
  await pool.end();
}

main().catch(console.error);
