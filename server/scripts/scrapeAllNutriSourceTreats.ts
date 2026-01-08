import { db } from '../db';
import { supplies } from '@shared/schema';
import { ilike, eq, or } from 'drizzle-orm';
import https from 'https';
import crypto from 'crypto';
import OpenAI from 'openai';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';

const objectStorageService = new ObjectStorageService();

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface ProductData {
  imageUrls: string[];
  size: string;
  style: string;
  description: string;
  ingredients: string;
  guaranteedAnalysis: string;
  feedingInstructions: string;
}

// Slug mappings - colors removed, will be detected via AI vision
const SLUG_MAPPINGS: Record<string, string> = {
  'little bites chicken': 'chicken-little-bites',
  'little bites duck': 'duck-little-bites',
  'little bites peanut butter': 'grain-free-peanut-butter-little-bites',
  'little bites beef': 'grain-free-beef-little-bites',
  'little bites turkey': 'grain-free-turkey-little-bites',
  'little bites trout': 'grain-free-trout-little-bites',
  'little bites salmon': 'salmon-little-bites',
  'big bites chicken': 'chicken-big-bites',
  'big bites beef': 'grain-free-beef-big-bites',
  'beef big bites': 'grain-free-beef-big-bites',
  'grillin grillers chicken': 'chicken-grillin-grillers',
  'grillin grillers beef': 'beef-grillin-grillers',
  'grillin grillers turkey': 'turkey-grillin-grillers',
  'grillin grillers whitefish': 'whitefish-grillin-grillers',
  'crispy crispers chicken duck': 'chicken-duck-crispy-crispers',
  'crispy crispers lamb beef': 'lamb-beef-crispy-crispers',
  'crispy crispers turkey venison': 'turkey-venison-crispy-crispers',
  'crispers chicken duck': 'chicken-duck-crispy-crispers',
  'chompy chompers beef boar': 'beef-wild-boar-chompy-chompers',
  'chompy chompers salmon trout': 'salmon-trout-chompy-chompers',
  'chompy chompers turkey duck': 'turkey-duck-chompy-chompers',
  'chompy chompers rabbit venison': 'rabbit-venison-chompy-chompers',
  'nutty butter apple': 'almond-butter-apple-nutty-butter-bites',
  'nutty butter blueberry': 'almond-butter-blueberry-nutty-butter-bites',
  'nutty butter cranberry': 'almond-butter-cranberry-nutty-butter-bites',
  'soft tender chicken': 'chicken-soft-tender-bites',
};

function findSlug(productName: string): string | null {
  const name = productName.toLowerCase();
  
  for (const [key, slug] of Object.entries(SLUG_MAPPINGS)) {
    const keywords = key.split(' ');
    if (keywords.every(k => name.includes(k))) {
      return slug;
    }
  }
  
  return null;
}

async function fetchProductData(slug: string): Promise<ProductData | null> {
  return new Promise((resolve) => {
    const url = `https://discovernutrisource.com/products/${slug}`;
    console.log(`    Fetching: ${url}`);
    
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        console.log(`    HTTP ${res.statusCode}`);
        resolve(null);
        return;
      }
      
      let html = '';
      res.on('data', (chunk) => html += chunk);
      res.on('end', () => {
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
        
        console.log(`    Found ${imageUrls.length} images`);
        
        let size = '';
        const sizeMatch = html.match(/(\d+(?:\.\d+)?)\s*(oz|lb)\b/i);
        if (sizeMatch) size = `${sizeMatch[1]} ${sizeMatch[2]}`;
        
        let style = '';
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (titleMatch) style = titleMatch[1].trim();
        
        let description = '';
        const descMatch = html.match(/id="tab1"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
          const liMatches = descMatch[1].match(/<li[^>]*>([^<]+)<\/li>/gi) || [];
          const items = liMatches.map(li => li.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
          description = items.join('. ');
        }
        
        let ingredients = '';
        const ingredMatch = html.match(/id="tab3"[^>]*>([\s\S]*?)<\/div>/i);
        if (ingredMatch) {
          ingredients = ingredMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        
        let guaranteedAnalysis = '';
        const analysisMatch = html.match(/id="tab4"[^>]*>([\s\S]*?)<\/div>/i);
        if (analysisMatch) {
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
        }
        
        let feedingInstructions = '';
        const feedMatch = html.match(/id="tab5"[^>]*>([\s\S]*?)<\/div>/i);
        if (feedMatch) {
          feedingInstructions = feedMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        
        resolve({ imageUrls, size, style, description, ingredients, guaranteedAnalysis, feedingInstructions });
      });
    }).on('error', () => resolve(null));
  });
}

async function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    https.get({ hostname: urlObj.hostname, path: urlObj.pathname, headers: { 'User-Agent': 'Mozilla/5.0' }}, (res) => {
      if (res.statusCode !== 200) { resolve(null); return; }
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

async function detectColorWithAI(imagePath: string): Promise<string> {
  try {
    const publicPaths = objectStorageService.getPublicObjectSearchPaths();
    const bucketPath = publicPaths[0];
    const [bucketName, ...prefixParts] = bucketPath.split('/').filter(Boolean);
    const prefix = prefixParts.join('/');
    const relativePath = imagePath.replace('/public-objects/', '');
    const fullPath = prefix ? `${prefix}/${relativePath}` : relativePath;
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(fullPath);
    const [contents] = await file.download();
    const base64 = contents.toString('base64');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Look at the main product PACKAGING BAG color (not the contents, not accent colors, not small graphics). This is a pet treat bag. What is the dominant color of the BAG itself? NutriSource treats typically use purple bags. Reply with just one word - the packaging bag color (Purple, Blue, Red, Green, Orange, Brown, Tan, Yellow, Pink, Black, White).' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } }
        ]
      }],
      max_completion_tokens: 100
    });
    
    return response.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error('  AI color detection failed:', error);
    return '';
  }
}

async function main() {
  console.log('\n=== NutriSource Treats Comprehensive Scraper ===\n');
  console.log('⚠️  PROTECTED FIELDS (never modified): SKU (UPC), name\n');
  
  // CRITICAL: These fields are manually curated and must NEVER be overwritten
  const PROTECTED_FIELDS = ['sku', 'name'];
  
  const treatKeywords = ['little bites', 'big bites', 'soft & tender', 'nutty butter', 
    'crispers', 'grillin', 'chompy', 'chompers'];
  
  const products = await db.select()
    .from(supplies)
    .where(ilike(supplies.name, '%nutrisource%'));
  
  const treats = products.filter(p => {
    const name = p.name.toLowerCase();
    return treatKeywords.some(k => name.includes(k));
  });
  
  console.log(`Found ${treats.length} NutriSource treats to process\n`);
  
  let processed = 0;
  let skipped = 0;
  
  for (const product of treats) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${processed + skipped + 1}/${treats.length}] ${product.name} (ID: ${product.id})`);
    
    const slug = findSlug(product.name);
    
    // Always set category/filterType for treats
    const updates: any = {
      category: 'dogTreats',
      filterType: 'dogTreats',
    };
    
    // Try to fetch data from website if slug exists
    if (slug) {
      console.log(`  Slug: ${slug}`);
      const data = await fetchProductData(slug);
      
      if (data && data.imageUrls.length > 0) {
        const storedUrls: string[] = [];
        const downloadedHashes = new Set<string>();
        
        console.log(`  Downloading ${data.imageUrls.length} images...`);
        for (let i = 0; i < data.imageUrls.length; i++) {
          const buffer = await downloadImage(data.imageUrls[i]);
          if (!buffer) continue;
          
          const hash = computeHash(buffer);
          if (downloadedHashes.has(hash)) continue;
          downloadedHashes.add(hash);
          
          const storedUrl = await storeImage(buffer, product.id, product.name, storedUrls.length + 1);
          if (storedUrl) storedUrls.push(storedUrl);
        }
        
        console.log(`  Stored ${storedUrls.length} unique images`);
        
        if (storedUrls.length > 0) {
          updates.imageUrl = storedUrls[0];
          updates.imageUrls = storedUrls.slice(1);
        }
        
        if (data.size) updates.size = data.size;
        if (data.style) updates.style = data.style;
        if (data.description) updates.description = data.description;
        if (data.ingredients) updates.ingredients = data.ingredients;
        if (data.guaranteedAnalysis) updates.guaranteedAnalysis = data.guaranteedAnalysis;
        if (data.feedingInstructions) updates.feedingInstructions = data.feedingInstructions;
      } else {
        console.log(`  Website fetch failed`);
      }
    } else {
      console.log(`  No slug mapping for website`);
    }
    
    // Always detect color with AI vision from main image
    const imageToAnalyze = updates.imageUrl || product.imageUrl;
    if (imageToAnalyze && imageToAnalyze.startsWith('/public-objects/')) {
      console.log(`  Detecting color with AI vision...`);
      const detectedColor = await detectColorWithAI(imageToAnalyze);
      if (detectedColor) {
        updates.color = detectedColor;
        console.log(`  ✓ AI detected color: ${detectedColor}`);
      } else {
        // Fallback to Purple for NutriSource treats
        updates.color = 'Purple';
        console.log(`  ⚠ AI failed, defaulting to Purple`);
      }
    } else if (!product.color) {
      // No valid image, use default
      updates.color = 'Purple';
      console.log(`  ⚠ No valid image, defaulting to Purple`);
    }
    
    // SAFETY: Remove any protected fields that might have been accidentally added
    for (const field of PROTECTED_FIELDS) {
      if (field in updates) {
        console.log(`  ⚠️ BLOCKED: Attempted to modify protected field '${field}'`);
        delete updates[field];
      }
    }
    
    await db.update(supplies)
      .set(updates)
      .where(eq(supplies.id, product.id));
    
    console.log(`  ✓ Updated: color=${updates.color || product.color}, size=${updates.size || product.size || 'N/A'}`);
    console.log(`  (SKU/UPC preserved: ${product.sku || 'none'})`);
    processed++;
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done! Processed: ${processed}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch(console.error);
