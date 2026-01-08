import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, or, ilike } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import https from 'https';

const objectStorageService = new ObjectStorageService();

interface ProductPageData {
  images: string[];
  description: string;
  features: string[];
  ingredients: string;
  guaranteedAnalysis: string;
  feedingInstructions: string;
  availableSizes: string;
  calorieContent: string;
}

interface ProductMapping {
  productPattern: string;
  pageUrl: string;
}

const NUTRISOURCE_PRODUCT_MAPPINGS: ProductMapping[] = [
  { productPattern: 'large breed puppy', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/large-breed-puppy-recipe/' },
  { productPattern: 'small.*medium.*breed puppy', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/small-and-medium-breed-puppy-recipe/' },
  { productPattern: 'adult chicken.*rice|adult small bites chicken.*rice', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/adult-chicken-rice/' },
  { productPattern: 'adult small bites(?!.*chicken)', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/adult-small-bites-recipe/' },
  { productPattern: 'large breed.*chicken|large breed adult', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/large-breed-adult-recipe/' },
  { productPattern: 'beef.*rice', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/beef-rice-recipe/' },
  { productPattern: 'lamb meal.*rice(?!.*large)', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/lamb-meal-rice-recipe/' },
  { productPattern: 'large breed lamb', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/large-breed-lamb-meal-rice-recipe/' },
  { productPattern: 'senior(?!.*grain free)(?!.*cat)', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/senior-recipe/' },
  { productPattern: 'weight management(?!.*grain free)', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/weight-management-recipe/' },
  { productPattern: 'performance', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/performance-recipe/' },
  { productPattern: 'seafood select', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/seafood-select-recipe/' },
  { productPattern: 'high plains select', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/high-plains-select/' },
  { productPattern: 'prairie select', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/prairie-select-recipe/' },
  { productPattern: 'heartland select', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/heartland-select/' },
  { productPattern: 'woodlands select', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/woodlands-select/' },
  { productPattern: 'grain free.*senior|senior.*grain free', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/grain-free-senior-recipe/' },
  { productPattern: 'grain free.*weight|weight.*grain free', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/grain-free-weight-management-recipe/' },
  { productPattern: 'grain free.*lamb|lamb.*peas', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/lamb-meal-peas-recipe/' },
  { productPattern: 'large breed.*grain free|grain free.*large breed', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/grain-free-large-breed-puppy-recipe/' },
  { productPattern: 'grain free.*small.*medium|small.*medium.*grain free', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/grain-free-small-medium-breed-puppy-recipe/' },
  { productPattern: 'little bites.*peanut|peanut.*butter.*little', pageUrl: 'https://nutrisourcepetfoods.com/our-food/grain-free-peanut-butter-little-bites/' },
  { productPattern: 'little bites.*chicken|chicken.*little bites', pageUrl: 'https://nutrisourcepetfoods.com/our-food/chicken-little-bites/' },
  { productPattern: 'little bites.*duck|duck.*little bites', pageUrl: 'https://nutrisourcepetfoods.com/our-food/duck-little-bites/' },
  { productPattern: 'little bites.*salmon|salmon.*little bites|with salmon', pageUrl: 'https://nutrisourcepetfoods.com/our-food/salmon-little-bites/' },
  { productPattern: 'little bites.*turkey|turkey.*little bites|with turkey', pageUrl: 'https://nutrisourcepetfoods.com/our-food/grain-free-turkey-little-bites/' },
  { productPattern: 'little bites.*trout|trout.*little bites|with trout', pageUrl: 'https://nutrisourcepetfoods.com/our-food/grain-free-trout-little-bites/' },
  { productPattern: 'little bites.*beef|beef.*little bites|with beef', pageUrl: 'https://nutrisourcepetfoods.com/our-food/grain-free-beef-little-bites/' },
  { productPattern: 'little bites.*rabbit|rabbit.*little bites', pageUrl: 'https://nutrisourcepetfoods.com/our-food/rabbit-little-bites/' },
  { productPattern: 'big bites.*chicken|chicken.*big bites', pageUrl: 'https://nutrisourcepetfoods.com/our-food/chicken-big-bites/' },
  { productPattern: 'big bites.*beef|beef.*big bites|grain free beef big', pageUrl: 'https://nutrisourcepetfoods.com/our-food/grain-free-beef-big-bites/' },
  { productPattern: 'crispy crispers.*chicken|chicken.*duck.*crispers', pageUrl: 'https://nutrisourcepetfoods.com/our-food/chicken-duck-crispy-crispers/' },
  { productPattern: 'crispy crispers.*lamb|lamb.*beef.*crispers', pageUrl: 'https://nutrisourcepetfoods.com/our-food/lamb-beef-crispy-crispers/' },
  { productPattern: 'crispy crispers.*turkey|turkey.*venison.*crispers', pageUrl: 'https://nutrisourcepetfoods.com/our-food/turkey-venison-crispy-crispers/' },
  { productPattern: 'chompy chompers.*beef|beef.*boar', pageUrl: 'https://nutrisourcepetfoods.com/our-food/beef-wild-boar-chompy-chompers/' },
  { productPattern: 'chompy chompers.*rabbit|rabbit.*venison', pageUrl: 'https://nutrisourcepetfoods.com/our-food/rabbit-venison-chompy-chompers/' },
  { productPattern: 'chompy chompers.*salmon|salmon.*trout', pageUrl: 'https://nutrisourcepetfoods.com/our-food/salmon-trout-chompy-chompers/' },
  { productPattern: 'chompy chompers.*turkey|turkey.*duck', pageUrl: 'https://nutrisourcepetfoods.com/our-food/turkey-duck-chompy-chompers/' },
  { productPattern: "grillin'?.*grillers.*chicken|chicken.*grillers", pageUrl: 'https://nutrisourcepetfoods.com/our-food/chicken-grillin-grillers/' },
  { productPattern: "grillin'?.*grillers.*beef|beef.*grillers", pageUrl: 'https://nutrisourcepetfoods.com/our-food/beef-grillin-grillers/' },
  { productPattern: "grillin'?.*grillers.*turkey|turkey.*grillers", pageUrl: 'https://nutrisourcepetfoods.com/our-food/turkey-grillin-grillers/' },
  { productPattern: "grillin'?.*grillers.*whitefish|whitefish.*grillers", pageUrl: 'https://nutrisourcepetfoods.com/our-food/whitefish-grillin-grillers/' },
  { productPattern: 'crunchy crunchers.*chicken|chicken.*crunchy', pageUrl: 'https://nutrisourcepetfoods.com/our-food/treats/chicken-crunchy-crunchers/' },
  { productPattern: 'crunchy crunchers.*liver|liver.*crunchy', pageUrl: 'https://nutrisourcepetfoods.com/our-food/treats/liver-crunchy-crunchers/' },
  { productPattern: 'crunchy crunchers.*whitefish|whitefish.*crunchy', pageUrl: 'https://nutrisourcepetfoods.com/our-food/treats/whitefish-crunchy-crunchers/' },
  { productPattern: "jivin'?.*jerky.*beef.*salmon|beef.*turkey.*salmon.*jerky", pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/nutrisource-dogs/beef-turkey-salmon-jivin-jerky/' },
  { productPattern: "jivin'?.*jerky.*lamb|lamb.*beef.*kangaroo.*jerky", pageUrl: 'https://nutrisourcepetfoods.com/our-food/lamb-beef-kangaroo-jivin-jerky/' },
  { productPattern: "jivin'?.*jerky.*quail|quail.*duck.*chicken.*jerky", pageUrl: 'https://nutrisourcepetfoods.com/our-food/quail-duck-chicken-jivin-jerky/' },
  { productPattern: "jivin'?.*jerky.*boar|wild.*boar.*turkey.*salmon.*jerky", pageUrl: 'https://nutrisourcepetfoods.com/our-food/wildboar-turkey-salmon-jivin-jerky/' },
  { productPattern: "jivin'?.*jerky.*beef(?!.*salmon)|beef.*jerky", pageUrl: 'https://nutrisourcepetfoods.com/our-food/beef-jivin-jerky/' },
  { productPattern: 'cat.*chicken.*rice|chicken.*rice.*cat(?!.*turkey)|cat.*kitten.*chicken', pageUrl: 'https://nutrisourcepetfoods.com/our-food/nutrisource/cat-kitten-chicken-rice-recipe/' },
  { productPattern: 'cat.*chicken.*turkey.*lamb|chicken.*turkey.*lamb.*cat', pageUrl: 'https://nutrisourcepetfoods.com/our-food/chicken-turkey-lamb/' },
  { productPattern: 'cat.*senior.*weight|senior.*weight.*cat', pageUrl: 'https://nutrisourcepetfoods.com/our-food/senior-weight-management-cat-recipe/' },
  { productPattern: 'cat.*salmon.*select|salmon.*select.*cat', pageUrl: 'https://nutrisourcepetfoods.com/our-food/chicken-salmon-select/' },
  { productPattern: 'elements crispy', pageUrl: 'https://nutrisourcepetfoods.com/our-food/chicken-duck-crispy-crispers/' },
  { productPattern: 'soft.*tender|tender.*bites', pageUrl: 'https://nutrisourcepetfoods.com/our-food/chicken-little-bites/' },
  { productPattern: 'cat.*chicken.*salmon.*liver|chicken.*meal.*salmon.*liver', pageUrl: 'https://nutrisourcepetfoods.com/our-food/cat-kitten-chicken-meal-salmon-liver-recipe/' },
];

async function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    https.get({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          fetchPage(redirectUrl.startsWith('http') ? redirectUrl : `https://${urlObj.hostname}${redirectUrl}`)
            .then(resolve)
            .catch(reject);
          return;
        }
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    https.get({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*',
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadImage(redirectUrl.startsWith('http') ? redirectUrl : `https://${urlObj.hostname}${redirectUrl}`).then(resolve);
          return;
        }
      }
      if (response.statusCode !== 200) {
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.length > 1000 ? buffer : null);
      });
    }).on('error', () => resolve(null));
  });
}

function extractImages(html: string): string[] {
  const images: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+nutrisourcepetfoods\.com[^"']+\.(png|jpg|jpeg|webp))["'][^>]*>/gi;
  const srcRegex = /src=["']([^"']+)["']/i;
  
  const wpContentRegex = /https:\/\/nutrisourcepetfoods\.com\/wp-content\/uploads\/[^"'\s<>]+\.(png|jpg|jpeg|webp)/gi;
  let match;
  while ((match = wpContentRegex.exec(html)) !== null) {
    const url = match[0];
    if (!images.includes(url) && 
        !url.includes('logo') && 
        !url.includes('icon') && 
        !url.includes('sidenav') &&
        !url.includes('footer') &&
        !url.includes('FCF_Logo') &&
        !url.includes('kln-logo')) {
      images.push(url);
    }
  }
  
  return images.slice(0, 8);
}

function extractDescription(html: string): string {
  const bullets: string[] = [];
  
  const ulMatch = html.match(/<ul[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/ul>/i) ||
                   html.match(/<h2[^>]*>[^<]+<\/h2>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (ulMatch) {
    const listContent = ulMatch[1] || ulMatch[0];
    const listItems = listContent.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
    for (const li of listItems) {
      const text = li.replace(/<[^>]+>/g, '').trim();
      if (text.length > 10 && text.length < 200 && 
          !text.includes('COMING SOON') && 
          !text.includes('Feeding Guide') && 
          !text.includes('Find at Your')) {
        bullets.push('• ' + text);
      }
    }
  }
  
  const introMatch = html.match(/As a member of our[^<]+/i);
  if (introMatch) {
    return introMatch[0].trim() + (bullets.length > 0 ? '\n\n' + bullets.join('\n') : '');
  }
  
  const madeWithMatch = html.match(/NutriSource[^<]*(?:are made with|provides|features)[^<]+/i);
  if (madeWithMatch) {
    return madeWithMatch[0].trim() + (bullets.length > 0 ? '\n\n' + bullets.join('\n') : '');
  }
  
  if (bullets.length > 0) {
    return bullets.join('\n');
  }
  
  return '';
}

function extractFeatures(html: string): string[] {
  const features: string[] = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  
  const productSection = html.match(/<h1[^>]*>[^<]*<\/h1>[\s\S]*?(?=<h2|<footer|$)/i);
  if (productSection) {
    const section = productSection[0];
    while ((match = liRegex.exec(section)) !== null) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text.length > 10 && text.length < 200 && !text.includes('COMING SOON')) {
        features.push(text);
      }
    }
  }
  
  return features.slice(0, 6);
}

function extractIngredients(html: string): string {
  const h4Match = html.match(/<h4[^>]*>\s*Ingredients\s*<\/h4>\s*(?:<[^>]+>\s*)*<p[^>]*>([\s\S]*?)<\/p>/i);
  if (h4Match) {
    const text = h4Match[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 50 && !text.includes('Full Circle') && !text.includes('part of the')) {
      return text;
    }
  }
  
  const sectionMatch = html.match(/Ingredients\s*(?:&|and)?\s*Nutrition[\s\S]*?<h4[^>]*>\s*Ingredients\s*<\/h4>\s*(?:<[^>]+>\s*)*<p[^>]*>([\s\S]*?)<\/p>/i);
  if (sectionMatch) {
    const text = sectionMatch[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 50) {
      return text;
    }
  }
  
  const ingredientListMatch = html.match(/(?:Chicken|Beef|Lamb|Peanut butter|Turkey|Salmon|Fish)[^<]{50,500}(?:preserved with|rosemary extract|tocopherols)[^<]*/i);
  if (ingredientListMatch) {
    return ingredientListMatch[0].trim();
  }
  
  return '';
}

function extractGuaranteedAnalysis(html: string): string {
  const gaSection = html.match(/Guaranteed Analysis[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!gaSection) return '';
  
  const rows: string[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  
  while ((match = rowRegex.exec(gaSection[1])) !== null) {
    const cells = match[1].match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
    const cellValues = cells.map(cell => cell.replace(/<[^>]+>/g, '').trim());
    if (cellValues.length >= 2 && cellValues[0] && !cellValues[0].includes('Guaranteed')) {
      rows.push(cellValues.join('|'));
    }
  }
  
  return rows.join('\n');
}

function extractFeedingInstructions(html: string): string {
  const feedingMatch = html.match(/Feeding Guide[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  if (feedingMatch) {
    return feedingMatch[1].replace(/<[^>]+>/g, '').trim();
  }
  
  const altMatch = html.match(/Feed as[^<]+/i);
  if (altMatch) {
    return altMatch[0].trim();
  }
  
  return '';
}

function extractAvailableSizes(html: string): string {
  const sizeMatch = html.match(/Available in[:\s]*([^<]+)/i);
  if (sizeMatch) {
    return sizeMatch[1].trim().replace(/\s+/g, ' ');
  }
  return '';
}

function extractCalorieContent(html: string): string {
  const calorieMatch = html.match(/Calorie Content[^:]*:?\s*([^<]+)/i);
  if (calorieMatch) {
    return calorieMatch[1].trim();
  }
  return '';
}

async function scrapeProductPage(url: string): Promise<ProductPageData | null> {
  try {
    console.log(`  Fetching: ${url}`);
    const html = await fetchPage(url);
    
    return {
      images: extractImages(html),
      description: extractDescription(html),
      features: extractFeatures(html),
      ingredients: extractIngredients(html),
      guaranteedAnalysis: extractGuaranteedAnalysis(html),
      feedingInstructions: extractFeedingInstructions(html),
      availableSizes: extractAvailableSizes(html),
      calorieContent: extractCalorieContent(html),
    };
  } catch (error) {
    console.log(`  Error fetching page: ${error}`);
    return null;
  }
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

function findMapping(productName: string): ProductMapping | null {
  const lowerName = productName.toLowerCase();
  for (const mapping of NUTRISOURCE_PRODUCT_MAPPINGS) {
    const regex = new RegExp(mapping.productPattern, 'i');
    if (regex.test(lowerName)) {
      return mapping;
    }
  }
  return null;
}

function extractSizeFromName(name: string): string | null {
  const sizeMatch = name.match(/(\d+(?:\.\d+)?)\s*(oz|lb|lbs|fl\s*oz)/i);
  if (sizeMatch) {
    return `${sizeMatch[1]}${sizeMatch[2].toLowerCase().replace('lbs', 'lb')}`;
  }
  return null;
}

async function processNutriSourceProducts(limit: number = 5, dryRun: boolean = false) {
  console.log(`\n=== Comprehensive NutriSource Product Enhancement ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${limit} products\n`);
  
  const products = await db
    .select()
    .from(supplies)
    .where(
      or(
        ilike(supplies.brand, '%nutrisource%'),
        ilike(supplies.name, '%nutrisource%')
      )
    )
    .limit(limit);
  
  console.log(`Found ${products.length} NutriSource products to process\n`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const product of products) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${product.name} (ID: ${product.id})`);
    
    const mapping = findMapping(product.name);
    if (!mapping) {
      console.log(`  No URL mapping found, skipping`);
      skipped++;
      continue;
    }
    
    console.log(`  Matched URL: ${mapping.pageUrl}`);
    
    if (dryRun) {
      console.log(`  [DRY RUN] Would scrape page for all data`);
      updated++;
      continue;
    }
    
    const pageData = await scrapeProductPage(mapping.pageUrl);
    if (!pageData) {
      console.log(`  Failed to scrape page`);
      errors++;
      continue;
    }
    
    console.log(`  Found ${pageData.images.length} images`);
    console.log(`  Description: ${pageData.description.substring(0, 50)}...`);
    console.log(`  Features: ${pageData.features.length} items`);
    console.log(`  Ingredients: ${pageData.ingredients.length > 0 ? 'Yes' : 'No'}`);
    console.log(`  Guaranteed Analysis: ${pageData.guaranteedAnalysis.length > 0 ? 'Yes' : 'No'}`);
    console.log(`  Feeding Instructions: ${pageData.feedingInstructions.length > 0 ? 'Yes' : 'No'}`);
    
    const storedImageUrls: string[] = [];
    for (let i = 0; i < pageData.images.length && i < 8; i++) {
      console.log(`  Downloading image ${i + 1}/${pageData.images.length}...`);
      const imageBuffer = await downloadImage(pageData.images[i]);
      if (imageBuffer) {
        const storedPath = await storeImage(imageBuffer, product.id, product.name, i + 1);
        if (storedPath) {
          storedImageUrls.push(storedPath);
          console.log(`    Stored: ${storedPath}`);
        }
      }
    }
    
    if (storedImageUrls.length === 0 && product.imageUrl) {
      storedImageUrls.push(product.imageUrl);
    }
    
    const size = extractSizeFromName(product.name) || product.size;
    
    const featuresJson = pageData.features.length > 0 
      ? JSON.stringify({ highlights: pageData.features })
      : product.features;
    
    const description = pageData.description || pageData.features.join('\n') || product.description;
    
    await db
      .update(supplies)
      .set({
        imageUrl: storedImageUrls[0] || product.imageUrl,
        imageUrls: storedImageUrls.length > 0 ? storedImageUrls : product.imageUrls,
        description: description || product.description,
        ingredients: pageData.ingredients || product.ingredients,
        guaranteedAnalysis: pageData.guaranteedAnalysis || product.guaranteedAnalysis,
        instructions: pageData.feedingInstructions || product.instructions,
        features: featuresJson,
        size: size,
        updatedAt: new Date()
      })
      .where(eq(supplies.id, product.id));
    
    console.log(`  Updated with ${storedImageUrls.length} images and full product data`);
    updated++;
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
}

const args = process.argv.slice(2);
const limit = parseInt(args[0]) || 5;
const dryRun = args.includes('--dry-run');

processNutriSourceProducts(limit, dryRun)
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
