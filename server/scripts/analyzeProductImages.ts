import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const objectStorageService = new ObjectStorageService();

async function getImageAsBase64(imagePath: string): Promise<string | null> {
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
    
    return contents.toString('base64');
  } catch (error) {
    console.error(`  Error loading image:`, error);
    return null;
  }
}

async function analyzeImageWithAI(base64: string, index: number): Promise<{ type: string; color: string; hasUPC: boolean }> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: `Analyze this product image. Reply in JSON format: {"type": "front of bag|back of bag|ingredients panel|product photo|marketing graphic", "color": "dominant packaging color", "hasUPC": true/false if UPC barcode visible}` 
          },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } }
        ]
      }],
      max_completion_tokens: 500,
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0]?.message?.content;
    if (content) {
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`  Error analyzing image ${index}:`, error);
  }
  return { type: 'unknown', color: '', hasUPC: false };
}

async function checkForDuplicates(base64Images: string[]): Promise<{ duplicatePairs: number[][]; recommendation: string }> {
  if (base64Images.length < 2) return { duplicatePairs: [], recommendation: '' };
  
  const imageContents: any[] = base64Images.map(b64 => ({
    type: 'image_url',
    image_url: { url: `data:image/png;base64,${b64}` }
  }));
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: `Look at these ${imageContents.length} product images carefully. Are any of them duplicates or showing essentially the same view/angle of the product? Reply in JSON: {"hasDuplicates": true/false, "duplicatePairs": [[1,2]] (pairs of image indices that are duplicates), "recommendation": "which images to remove if any"}` 
          },
          ...imageContents
        ]
      }],
      max_completion_tokens: 500,
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return {
        duplicatePairs: parsed.duplicatePairs || [],
        recommendation: parsed.recommendation || ''
      };
    }
  } catch (error) {
    console.error('  Error checking duplicates:', error);
  }
  return { duplicatePairs: [], recommendation: '' };
}

async function main() {
  const productId = parseInt(process.argv[2]);
  
  if (!productId || isNaN(productId)) {
    console.log('Usage: npx tsx server/scripts/analyzeProductImages.ts <productId>');
    console.log('Example: npx tsx server/scripts/analyzeProductImages.ts 7410');
    process.exit(1);
  }
  
  console.log(`\n=== AI Image Analysis for Product ${productId} ===\n`);
  
  const [product] = await db.select()
    .from(supplies)
    .where(eq(supplies.id, productId));
  
  if (!product) {
    console.log('Product not found');
    process.exit(1);
  }
  
  console.log(`Product: ${product.name}`);
  console.log(`Current color: ${product.color || 'not set'}`);
  console.log(`Images: ${product.imageUrls?.length || 0}`);
  
  if (!product.imageUrls || product.imageUrls.length === 0) {
    console.log('No images to analyze');
    process.exit(0);
  }
  
  // Load images
  console.log('\nLoading images...');
  const base64Images: string[] = [];
  for (let i = 0; i < Math.min(product.imageUrls.length, 5); i++) {
    const b64 = await getImageAsBase64(product.imageUrls[i]);
    if (b64) {
      base64Images.push(b64);
      console.log(`  Loaded image ${i + 1}`);
    }
  }
  
  // Analyze each image
  console.log('\nAnalyzing individual images...');
  const analyses: { index: number; type: string; color: string; hasUPC: boolean }[] = [];
  let dominantColor = '';
  
  for (let i = 0; i < base64Images.length; i++) {
    console.log(`  Analyzing image ${i + 1}...`);
    const result = await analyzeImageWithAI(base64Images[i], i + 1);
    analyses.push({ index: i + 1, ...result });
    
    // Use first image color as dominant
    if (i === 0 && result.color) {
      dominantColor = result.color;
    }
  }
  
  // Check for duplicates
  console.log('\nChecking for duplicates...');
  const dupResult = await checkForDuplicates(base64Images);
  
  // Display results
  console.log('\n=== Analysis Results ===');
  console.log(`Dominant Color: ${dominantColor}`);
  console.log('\nImage Details:');
  for (const a of analyses) {
    const upcFlag = a.hasUPC ? ' [HAS UPC]' : '';
    console.log(`  ${a.index}. ${a.type}${upcFlag} - Color: ${a.color}`);
  }
  
  if (dupResult.duplicatePairs.length > 0) {
    console.log('\n⚠️  DUPLICATES DETECTED:');
    for (const pair of dupResult.duplicatePairs) {
      console.log(`  - Images ${pair.join(' and ')} appear similar`);
    }
    console.log(`  Recommendation: ${dupResult.recommendation}`);
  } else {
    console.log('\n✓ No duplicates detected');
  }
  
  // Update color if needed
  if (dominantColor && dominantColor !== product.color) {
    console.log(`\nUpdating color from "${product.color || 'none'}" to "${dominantColor}"...`);
    await db.update(supplies)
      .set({ color: dominantColor })
      .where(eq(supplies.id, productId));
    console.log('Color updated!');
  }
  
  console.log('\nDone!');
  process.exit(0);
}

main().catch(console.error);
