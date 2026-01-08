import { db } from '../db';
import { supplies } from '@shared/schema';
import { ilike, sql, eq } from 'drizzle-orm';
import https from 'https';
import crypto from 'crypto';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';

const objectStorageService = new ObjectStorageService();

// Hardcoded product data from discovernutrisource.com (manually verified)
const littleBitesData: { [key: string]: {
  slug: string;
  prefix: string;
  size: string;
  style: string;
  description: string;
  ingredients: string;
  guaranteedAnalysis: string;
  feedingInstructions: string;
}} = {
  'peanut butter': {
    slug: 'grain-free-peanut-butter-little-bites',
    prefix: 'GFLittleBitesPB',
    size: '6 oz',
    style: 'Grain Free Peanut Butter',
    description: 'High-Quality Dog Training Treats. NutriSource Grain Free Peanut Butter Little Bites are made with high-quality plant protein. Real foods that dogs love in a treat make these totally satisfying. Peanut Butter is the #1 ingredient. Works great as a treat or reward that your dog will crave.',
    ingredients: 'Peanut butter, potato flour, cane molasses, peas, vegetable glycerin, chickpeas, flax seed, pork plasma, sweet potatoes, calcium lactate, natural flavor, lactic acid, salt, zinc propionate, calcium propionate (a preservative), preserved with citric acid and tocopherols, yucca schidigera extract, L-carnitine, rosemary extract.',
    guaranteedAnalysis: 'Crude Protein (Min.)|15%|Crude Fat (Min.)|8.0%|Crude Fiber (Max.)|5.0%|Moisture (Max.)|30%',
    feedingInstructions: 'Calorie Content: 3,235 kcal/kg, 3.2 calories per treat. Use as a training treat or reward. Adjust daily food intake accordingly.'
  },
  'chicken': {
    slug: 'chicken-little-bites',
    prefix: 'LittleBitesChicken',
    size: '6 oz',
    style: 'Chicken',
    description: 'High-Quality Dog Training Treats. NutriSource Chicken Little Bites are made with high-quality animal protein. Real chicken is the #1 ingredient. Works great as a treat or reward that your dog will crave.',
    ingredients: 'Chicken, ground rice, cane molasses, vegetable glycerin, natural flavor, salt, phosphoric acid, calcium lactate, lactic acid, zinc propionate, calcium propionate (a preservative), preserved with citric acid and tocopherols, yucca schidigera extract, L-carnitine, rosemary extract.',
    guaranteedAnalysis: 'Crude Protein (Min.)|12%|Crude Fat (Min.)|8.0%|Crude Fiber (Max.)|2.0%|Moisture (Max.)|30%',
    feedingInstructions: 'Calorie Content: 3,300 kcal/kg, 3.3 calories per treat. Use as a training treat or reward.'
  },
  'beef': {
    slug: 'grain-free-beef-little-bites',
    prefix: 'GFLittleBitesBeef',
    size: '6 oz',
    style: 'Grain Free Beef',
    description: 'High-Quality Dog Training Treats. NutriSource Grain Free Beef Little Bites are made with high-quality animal protein. Real beef is the #1 ingredient. Grain free recipe. Works great as a treat or reward.',
    ingredients: 'Beef, potato flour, cane molasses, peas, vegetable glycerin, chickpeas, flax seed, pork plasma, sweet potatoes, calcium lactate, natural flavor, lactic acid, salt, zinc propionate, calcium propionate (a preservative), preserved with citric acid and tocopherols, yucca schidigera extract, L-carnitine, rosemary extract.',
    guaranteedAnalysis: 'Crude Protein (Min.)|15%|Crude Fat (Min.)|8.0%|Crude Fiber (Max.)|5.0%|Moisture (Max.)|30%',
    feedingInstructions: 'Calorie Content: 3,235 kcal/kg, 3.2 calories per treat.'
  },
  'turkey': {
    slug: 'grain-free-turkey-little-bites',
    prefix: 'GFLittleBitesTurkey',
    size: '6 oz',
    style: 'Grain Free Turkey',
    description: 'High-Quality Dog Training Treats. NutriSource Grain Free Turkey Little Bites are made with high-quality animal protein. Real turkey is the #1 ingredient. Grain free recipe. Works great as a treat or reward.',
    ingredients: 'Turkey, potato flour, cane molasses, peas, vegetable glycerin, chickpeas, flax seed, pork plasma, sweet potatoes, calcium lactate, natural flavor, lactic acid, salt, zinc propionate, calcium propionate (a preservative), preserved with citric acid and tocopherols, yucca schidigera extract, L-carnitine, rosemary extract.',
    guaranteedAnalysis: 'Crude Protein (Min.)|15%|Crude Fat (Min.)|8.0%|Crude Fiber (Max.)|5.0%|Moisture (Max.)|30%',
    feedingInstructions: 'Calorie Content: 3,235 kcal/kg, 3.2 calories per treat.'
  },
  'salmon': {
    slug: 'salmon-little-bites',
    prefix: 'LittleBitesSalmon',
    size: '6 oz',
    style: 'Salmon',
    description: 'High-Quality Dog Training Treats. NutriSource Salmon Little Bites are made with high-quality protein. Real salmon is the #1 ingredient. Works great as a treat or reward that your dog will crave.',
    ingredients: 'Salmon, ground rice, cane molasses, vegetable glycerin, natural flavor, salt, phosphoric acid, calcium lactate, lactic acid, zinc propionate, calcium propionate (a preservative), preserved with citric acid and tocopherols, yucca schidigera extract, L-carnitine, rosemary extract.',
    guaranteedAnalysis: 'Crude Protein (Min.)|12%|Crude Fat (Min.)|8.0%|Crude Fiber (Max.)|2.0%|Moisture (Max.)|30%',
    feedingInstructions: 'Calorie Content: 3,300 kcal/kg, 3.3 calories per treat.'
  },
  'trout': {
    slug: 'grain-free-trout-little-bites',
    prefix: 'GFLittleBitesTrout',
    size: '6 oz',
    style: 'Grain Free Trout',
    description: 'High-Quality Dog Training Treats. NutriSource Grain Free Trout Little Bites are made with high-quality protein. Real trout is the #1 ingredient. Grain free recipe. Works great as a treat or reward.',
    ingredients: 'Trout, potato flour, cane molasses, peas, vegetable glycerin, chickpeas, flax seed, pork plasma, sweet potatoes, calcium lactate, natural flavor, lactic acid, salt, zinc propionate, calcium propionate (a preservative), preserved with citric acid and tocopherols, yucca schidigera extract, L-carnitine, rosemary extract.',
    guaranteedAnalysis: 'Crude Protein (Min.)|15%|Crude Fat (Min.)|8.0%|Crude Fiber (Max.)|5.0%|Moisture (Max.)|30%',
    feedingInstructions: 'Calorie Content: 3,235 kcal/kg, 3.2 calories per treat.'
  },
  'duck': {
    slug: 'duck-little-bites',
    prefix: 'LittleBitesDuck',
    size: '6 oz',
    style: 'Duck',
    description: 'High-Quality Dog Training Treats. NutriSource Duck Little Bites are made with high-quality animal protein. Real duck is the #1 ingredient. Works great as a treat or reward that your dog will crave.',
    ingredients: 'Duck, ground rice, cane molasses, vegetable glycerin, natural flavor, salt, phosphoric acid, calcium lactate, lactic acid, zinc propionate, calcium propionate (a preservative), preserved with citric acid and tocopherols, yucca schidigera extract, L-carnitine, rosemary extract.',
    guaranteedAnalysis: 'Crude Protein (Min.)|12%|Crude Fat (Min.)|8.0%|Crude Fiber (Max.)|2.0%|Moisture (Max.)|30%',
    feedingInstructions: 'Calorie Content: 3,300 kcal/kg, 3.3 calories per treat.'
  },
};

function findFlavorData(productName: string) {
  const name = productName.toLowerCase();
  for (const [flavor, data] of Object.entries(littleBitesData)) {
    if (name.includes(flavor)) {
      return { flavor, ...data };
    }
  }
  return null;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    
    https.get(options, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
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

function buildImageUrls(prefix: string): string[] {
  const base = 'https://discovernutrisource.com/cdn/shop/files/';
  return [
    `${base}${prefix}_Front_2048x.png`,
    `${base}${prefix}_Back_2048x.png`,
    `${base}${prefix}_Panel_2048x.png`,
    `${base}LittleBites_Product_2048x.png`,
    `${base}${prefix}_WIM_2048x.png`,
  ];
}

async function main() {
  const limit = parseInt(process.argv[2]) || 100;
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`\n=== NutriSource Little Bites Enhancement ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE UPDATE'}`);
  console.log(`Processing up to: ${limit} products\n`);
  
  // Get Little Bites products
  const products = await db.select()
    .from(supplies)
    .where(ilike(supplies.name, '%little bites%'))
    .limit(limit);
  
  console.log(`Found ${products.length} Little Bites products\n`);
  
  const imageHashCache = new Map<string, string>();
  const results: { id: number; name: string; changes: string[] }[] = [];
  
  for (const product of products) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Product: ${product.name} (ID: ${product.id})`);
    console.log(`Current: filterType=${product.filterType}, size=${product.size || '(empty)'}, style=${product.style || '(empty)'}`);
    
    const flavorData = findFlavorData(product.name);
    if (!flavorData) {
      console.log(`  ⚠ No data mapping found - skipping`);
      continue;
    }
    
    const changes: string[] = [];
    const updates: any = {};
    
    // 1. FIX CATEGORY: Little Bites are TREATS, not food
    if (product.filterType === 'dogFood') {
      updates.filterType = 'dogTreats';
      changes.push(`filterType: dogFood → dogTreats`);
    }
    
    // 2. Fill Size if missing
    if (!product.size) {
      updates.size = flavorData.size;
      changes.push(`size: (empty) → ${flavorData.size}`);
    }
    
    // 3. Fill Style if missing
    if (!product.style) {
      updates.style = flavorData.style;
      changes.push(`style: (empty) → ${flavorData.style}`);
    }
    
    // 4. Update description if empty or too short
    if (!product.description || product.description.length < 50) {
      updates.description = flavorData.description;
      changes.push(`description: updated (${flavorData.description.length} chars)`);
    }
    
    // 5. Update ingredients if empty
    if (!product.ingredients) {
      updates.ingredients = flavorData.ingredients;
      changes.push(`ingredients: added`);
    }
    
    // 6. Update guaranteed analysis if empty
    if (!product.guaranteedAnalysis) {
      updates.guaranteedAnalysis = flavorData.guaranteedAnalysis;
      changes.push(`guaranteedAnalysis: added`);
    }
    
    // 7. Update feeding instructions if empty
    if (!product.feedingInstructions) {
      updates.feedingInstructions = flavorData.feedingInstructions;
      changes.push(`feedingInstructions: added`);
    }
    
    // 8. Download and validate images with duplicate detection
    const imageUrls = buildImageUrls(flavorData.prefix);
    const newStoredUrls: string[] = [];
    const downloadedHashes = new Set<string>();
    
    console.log(`  Downloading ${imageUrls.length} images with duplicate detection...`);
    for (let i = 0; i < imageUrls.length; i++) {
      const imgUrl = imageUrls[i];
      const imgName = imgUrl.split('/').pop();
      console.log(`    [${i+1}] ${imgName}...`);
      
      const buffer = await downloadImage(imgUrl);
      if (!buffer) {
        console.log(`        → 404/error, skipping`);
        continue;
      }
      
      const hash = computeHash(buffer);
      
      // Check for duplicates within this batch
      if (downloadedHashes.has(hash)) {
        console.log(`        → DUPLICATE (same hash as another image), skipping`);
        continue;
      }
      
      downloadedHashes.add(hash);
      
      // Store the image
      const storedUrl = await storeImage(buffer, product.id, product.name, newStoredUrls.length + 1);
      if (storedUrl) {
        newStoredUrls.push(storedUrl);
        console.log(`        → Stored (hash: ${hash})`);
      }
    }
    
    if (newStoredUrls.length > 0) {
      updates.imageUrls = newStoredUrls;
      changes.push(`imageUrls: ${newStoredUrls.length} verified images`);
    }
    
    // Summary
    console.log(`\n  Changes:`);
    for (const c of changes) {
      console.log(`    ✓ ${c}`);
    }
    
    // Apply updates
    if (!dryRun && Object.keys(updates).length > 0) {
      await db.update(supplies)
        .set(updates)
        .where(eq(supplies.id, product.id));
      console.log(`  → Applied ${changes.length} changes`);
    } else if (dryRun) {
      console.log(`  [DRY RUN] Would apply ${changes.length} changes`);
    }
    
    results.push({ id: product.id, name: product.name, changes });
  }
  
  // Final Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY: ${results.length} products processed`);
  console.log(`${'='.repeat(60)}`);
  
  let totalChanges = 0;
  for (const r of results) {
    totalChanges += r.changes.length;
  }
  console.log(`Total changes: ${totalChanges}`);
  
  console.log(`\nDone!`);
}

main().catch(console.error);
