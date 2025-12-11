import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import https from 'https';

const petcoMappings: Record<string, { petcoSku: string; variant?: string }> = {
  'terrarium liner': { petcoSku: '1039032', variant: 'left-1' },
  'green liner': { petcoSku: '1039032', variant: 'left-1' },
  'grey liner': { petcoSku: '1039033', variant: 'left-1' },
  'omnivore mix': { petcoSku: '1525581', variant: 'center-1' },
  'fruit mix': { petcoSku: '1525580', variant: 'center-1' },
  'munchies': { petcoSku: '1525581', variant: 'center-1' },
  'rock cave': { petcoSku: '3067059', variant: 'center-1' },
  'rock den': { petcoSku: '3067024', variant: 'center-1' },
  'durable den': { petcoSku: '3067024', variant: 'center-1' },
  'durable dish': { petcoSku: '3067073', variant: 'center-1' },
  'critter cage': { petcoSku: '2745831', variant: 'center-2' },
  'creature cage': { petcoSku: '2745839', variant: 'center-1' },
  'jungle mix': { petcoSku: '1128655', variant: 'right-1' },
  'desert blend': { petcoSku: '1128657', variant: 'right-1' },
  'bark blend': { petcoSku: '1128659', variant: 'right-1' },
  'halogen mini dome': { petcoSku: '401854', variant: 'right-1' },
  'heat mat': { petcoSku: '2372941', variant: 'center-1' },
  'night black': { petcoSku: '1043619', variant: 'center-1' },
  'night red': { petcoSku: '2373072', variant: 'center-1' },
  'day blue': { petcoSku: '2373051', variant: 'center-1' },
  'day white': { petcoSku: '2373041', variant: 'center-1' },
  'black heat': { petcoSku: '1043619', variant: 'center-1' },
  'premium reflector': { petcoSku: '2372970', variant: 'center-1' },
  'dual low profile': { petcoSku: '2372981', variant: 'center-1' },
  'desert series': { petcoSku: '2372997', variant: 'center-1' },
  'tropical series': { petcoSku: '2372998', variant: 'center-1' },
  'canopy series': { petcoSku: '2372987', variant: 'center-1' },
  'slimline': { petcoSku: '2372992', variant: 'center-1' },
  'mini compact': { petcoSku: '2372961', variant: 'center-1' },
  'ceramic heat': { petcoSku: '2372948', variant: 'center-1' },
  'digital temp': { petcoSku: '2373023', variant: 'center-1' },
  'thermometer': { petcoSku: '2373023', variant: 'center-1' },
  'micro habitat': { petcoSku: '3063024', variant: 'center-1' },
  'micro arboreal': { petcoSku: '3063022', variant: 'center-1' },
  'micro terrestial': { petcoSku: '3063023', variant: 'center-1' },
  'quickbuild': { petcoSku: '3067038', variant: 'center-1' },
  'bearded dragon kit': { petcoSku: '2373113', variant: 'center-1' },
  'bearddrg kit': { petcoSku: '2373113', variant: 'center-1' },
  'snake kit': { petcoSku: '2373115', variant: 'center-1' },
  'tropical kit': { petcoSku: '2373112', variant: 'center-1' },
  'spring cave': { petcoSku: '3067058', variant: 'center-1' },
  'cricket drink': { petcoSku: '1525598', variant: 'center-1' },
  'gut load': { petcoSku: '1525598', variant: 'center-1' },
  'aquatic turtle': { petcoSku: '1039033', variant: 'center-1' },
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFromPetco(petcoSku: string, variant: string = 'center-1'): Promise<Buffer> {
  const url = `https://assets.petco.com/petco/image/upload/f_auto,q_auto:best,dpr_2.0,w_500/${petcoSku}-${variant}`;
  
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      },
      timeout: 30000
    }, (response) => {
      if (response.statusCode !== 200) {
        console.log(`  HTTP ${response.statusCode} for ${petcoSku}`);
        resolve(Buffer.alloc(0));
        return;
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => resolve(Buffer.alloc(0)));
    }).on('error', (e) => {
      console.log(`  Error: ${e.message}`);
      resolve(Buffer.alloc(0));
    }).on('timeout', () => resolve(Buffer.alloc(0)));
  });
}

async function main() {
  const objectStorageService = new ObjectStorageService();
  const publicPaths = objectStorageService.getPublicObjectSearchPaths();
  const bucketPath = publicPaths[0];
  const pathParts = bucketPath.split('/').filter(Boolean);
  const bucketName = pathParts[0];
  const prefix = pathParts.slice(1).join('/');
  
  const products = await db.select().from(supplies).where(eq(supplies.brand, 'Zilla'));
  const brokenProducts = products.filter(p => 
    p.imageUrl?.includes('amazon') || p.imageUrl?.includes('media-amazon')
  );
  
  console.log(`Processing ${brokenProducts.length} Zilla products with Petco CDN...\n`);
  
  let success = 0;
  let failed = 0;
  const imageCache: Record<string, Buffer> = {};
  
  for (const product of brokenProducts) {
    const name = (product.name || '').toLowerCase();
    
    let matchedKey = '';
    let mapping: { petcoSku: string; variant?: string } | null = null;
    
    for (const [key, m] of Object.entries(petcoMappings)) {
      if (name.includes(key)) {
        matchedKey = key;
        mapping = m;
        break;
      }
    }
    
    if (!mapping) {
      console.log(`❌ No mapping: ${product.name}`);
      failed++;
      continue;
    }
    
    const cacheKey = `${mapping.petcoSku}-${mapping.variant || 'center-1'}`;
    let imageBuffer: Buffer;
    
    if (imageCache[cacheKey]) {
      imageBuffer = imageCache[cacheKey];
      console.log(`  (cached)`);
    } else {
      await delay(1000);
      imageBuffer = await downloadFromPetco(mapping.petcoSku, mapping.variant);
      if (imageBuffer.length > 1000) {
        imageCache[cacheKey] = imageBuffer;
      }
    }
    
    if (imageBuffer.length < 1000) {
      console.log(`❌ Download failed: ${product.name}`);
      failed++;
      continue;
    }
    
    const sanitizedName = name.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const objectFileName = `products/zilla/${sanitizedName}-${product.id}.jpg`;
    const fullPath = prefix ? `${prefix}/${objectFileName}` : objectFileName;
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(fullPath);
    
    await file.save(imageBuffer, {
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'public, max-age=31536000' }
    });
    
    await setObjectAclPolicy(file, { visibility: 'public' });
    
    await db.update(supplies).set({ imageUrl: `/public-objects/${objectFileName}` }).where(eq(supplies.id, product.id));
    
    console.log(`✓ ${product.name} (${imageBuffer.length} bytes)`);
    success++;
  }
  
  console.log(`\n========================================`);
  console.log(`Success: ${success} | Failed: ${failed}`);
  console.log(`========================================`);
}

main().catch(console.error);
