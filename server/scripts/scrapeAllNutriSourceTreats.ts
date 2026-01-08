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

const SLUG_MAPPINGS: Record<string, { slug: string; color: string }> = {
  'little bites chicken': { slug: 'chicken-little-bites', color: 'Purple' },
  'little bites duck': { slug: 'duck-little-bites', color: 'Purple' },
  'little bites peanut butter': { slug: 'grain-free-peanut-butter-little-bites', color: 'Purple' },
  'little bites beef': { slug: 'grain-free-beef-little-bites', color: 'Purple' },
  'little bites turkey': { slug: 'grain-free-turkey-little-bites', color: 'Purple' },
  'little bites trout': { slug: 'grain-free-trout-little-bites', color: 'Purple' },
  'little bites salmon': { slug: 'salmon-little-bites', color: 'Purple' },
  'big bites chicken': { slug: 'chicken-big-bites', color: 'Orange' },
  'big bites beef': { slug: 'beef-big-bites', color: 'Orange' },
  'grillin grillers chicken': { slug: 'chicken-grillin-grillers', color: 'Brown' },
  'grillin grillers beef': { slug: 'beef-grillin-grillers', color: 'Brown' },
  'grillin grillers turkey': { slug: 'turkey-grillin-grillers', color: 'Brown' },
  'grillin grillers whitefish': { slug: 'whitefish-grillin-grillers', color: 'Brown' },
  'crispy crispers chicken duck': { slug: 'chicken-duck-crispy-crispers', color: 'Green' },
  'crispy crispers lamb beef': { slug: 'lamb-beef-crispy-crispers', color: 'Green' },
  'crispy crispers turkey venison': { slug: 'turkey-venison-crispy-crispers', color: 'Green' },
  'crispers chicken duck': { slug: 'chicken-duck-crispy-crispers', color: 'Green' },
  'chompy chompers beef boar': { slug: 'beef-wild-boar-chompy-chompers', color: 'Red' },
  'chompy chompers salmon trout': { slug: 'salmon-trout-chompy-chompers', color: 'Red' },
  'chompy chompers turkey duck': { slug: 'turkey-duck-chompy-chompers', color: 'Red' },
  'chompy chompers rabbit venison': { slug: 'rabbit-venison-chompy-chompers', color: 'Red' },
  'nutty butter apple': { slug: 'almond-butter-apple-nutty-butter-bites', color: 'Tan' },
  'nutty butter blueberry': { slug: 'almond-butter-blueberry-nutty-butter-bites', color: 'Tan' },
  'nutty butter cranberry': { slug: 'almond-butter-cranberry-nutty-butter-bites', color: 'Tan' },
  'soft tender chicken': { slug: 'chicken-soft-tender-bites', color: 'Blue' },
};

function findSlugMapping(productName: string): { slug: string; color: string } | null {
  const name = productName.toLowerCase();
  
  for (const [key, value] of Object.entries(SLUG_MAPPINGS)) {
    const keywords = key.split(' ');
    if (keywords.every(k => name.includes(k))) {
      return value;
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
          { type: 'text', text: 'What is the main/dominant color of this product packaging? Reply with just one word - the color name (e.g., Purple, Blue, Red, Green, Orange, Brown, Tan, Yellow, Pink, Black, White).' },
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
    
    const mapping = findSlugMapping(product.name);
    
    if (!mapping) {
      console.log(`  No slug mapping - will use AI for color detection only`);
      
      if (product.imageUrl && !product.color) {
        console.log(`  Detecting color with AI...`);
        const color = await detectColorWithAI(product.imageUrl);
        if (color) {
          await db.update(supplies)
            .set({ color, category: 'dogTreats', filterType: 'dogTreats' })
            .where(eq(supplies.id, product.id));
          console.log(`  ✓ Color set to: ${color}`);
        }
      }
      
      skipped++;
      continue;
    }
    
    console.log(`  Slug: ${mapping.slug}, Color: ${mapping.color}`);
    
    const data = await fetchProductData(mapping.slug);
    if (!data || data.imageUrls.length === 0) {
      console.log(`  Failed to fetch - skipping`);
      skipped++;
      continue;
    }
    
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
    
    const mainImage = storedUrls[0] || product.imageUrl;
    const additionalImages = storedUrls.slice(1);
    
    const updates: any = {
      imageUrl: mainImage,
      imageUrls: additionalImages,
      category: 'dogTreats',
      filterType: 'dogTreats',
      color: mapping.color,
    };
    
    if (data.size) updates.size = data.size;
    if (data.style) updates.style = data.style;
    if (data.description) updates.description = data.description;
    if (data.ingredients) updates.ingredients = data.ingredients;
    if (data.guaranteedAnalysis) updates.guaranteedAnalysis = data.guaranteedAnalysis;
    if (data.feedingInstructions) updates.feedingInstructions = data.feedingInstructions;
    
    await db.update(supplies)
      .set(updates)
      .where(eq(supplies.id, product.id));
    
    console.log(`  ✓ Updated: ${storedUrls.length} images, color=${mapping.color}, size=${data.size || 'N/A'}`);
    processed++;
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done! Processed: ${processed}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch(console.error);
