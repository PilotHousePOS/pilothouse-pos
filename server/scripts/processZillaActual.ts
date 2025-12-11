import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import https from 'https';

const actualImageUrls: Record<number, string> = {
  750: 'https://image.chewy.com/catalog/general/images/moe/0689b971-a19b-7978-8000-acacf7e1153a._AC_SL1200_QL100_V1_.jpg',
  749: 'https://image.chewy.com/catalog/general/images/moe/0689b972-27d6-79ca-8000-3da366d4f074._AC_SL1200_QL100_V1_.jpg',
  598: 'https://image.chewy.com/catalog/general/images/moe/068635f6-c94a-7bd4-8000-08cb8a8af90c._AC_SL1200_QL100_V1_.jpg',
  284: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-a96b-7c5d-8000-55685acd3a67._AC_SL1200_QL100_V1_.jpg',
  754: 'https://image.chewy.com/catalog/general/images/moe/0689b96c-ed1c-7d14-8000-b7b8f52b13bd._AC_SL1200_QL100_V1_.jpg',
  752: 'https://image.chewy.com/catalog/general/images/moe/0689b96c-ed1c-7d14-8000-b7b8f52b13bd._AC_SL1200_QL100_V1_.jpg',
  760: 'https://image.chewy.com/catalog/general/images/moe/0689b96c-ffc7-7d5d-8000-45abf26bbb04._AC_SL1200_QL100_V1_.jpg',
  267: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-b53a-7cf7-8000-ff46bd26f7c2._AC_SL1200_QL100_V1_.jpg',
  286: 'https://image.chewy.com/catalog/general/images/moe/0689b97e-2ed7-7890-8000-b45aa77dfdf9._AC_SL1200_QL100_V1_.jpg',
  459: 'https://image.chewy.com/catalog/general/images/moe/0689b97e-9b23-7e80-8000-a9b6ebd18a74._AC_SL1200_QL100_V1_.jpg',
  460: 'https://image.chewy.com/catalog/general/images/moe/0689b97e-9b23-7e80-8000-a9b6ebd18a74._AC_SL1200_QL100_V1_.jpg',
  461: 'https://image.chewy.com/catalog/general/images/moe/0689b97e-9b23-7e80-8000-a9b6ebd18a74._AC_SL1200_QL100_V1_.jpg',
  266: 'https://image.chewy.com/catalog/general/images/moe/0689b97e-0f74-7e68-8000-bda29a03a2b9._AC_SL1200_QL100_V1_.jpg',
  281: 'https://image.chewy.com/catalog/general/images/moe/0689b97e-1937-7eda-8000-f5f00ed59c04._AC_SL1200_QL100_V1_.jpg',
  280: 'https://image.chewy.com/catalog/general/images/moe/0689b97e-0598-7e24-8000-03eb87bdab72._AC_SL1200_QL100_V1_.jpg',
  279: 'https://image.chewy.com/catalog/general/images/moe/0689b97e-0598-7e24-8000-03eb87bdab72._AC_SL1200_QL100_V1_.jpg',
  757: 'https://image.chewy.com/catalog/general/images/moe/0689b96d-2da5-7e0d-8000-b9dc2ff72ac6._AC_SL1200_QL100_V1_.jpg',
  191: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-ccb3-7d97-8000-b4b5a30c9b47._AC_SL1200_QL100_V1_.jpg',
  190: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-ccb3-7d97-8000-b4b5a30c9b47._AC_SL1200_QL100_V1_.jpg',
  354: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-e959-7e3c-8000-11c6f04a4e4b._AC_SL1200_QL100_V1_.jpg',
  355: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-e959-7e3c-8000-11c6f04a4e4b._AC_SL1200_QL100_V1_.jpg',
  101: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-d7f9-7de1-8000-a97f3c3f1cf3._AC_SL1200_QL100_V1_.jpg',
  96: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-d7f9-7de1-8000-a97f3c3f1cf3._AC_SL1200_QL100_V1_.jpg',
  98: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-d7f9-7de1-8000-a97f3c3f1cf3._AC_SL1200_QL100_V1_.jpg',
  370: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-f54d-7e84-8000-9bfb63cfe2f9._AC_SL1200_QL100_V1_.jpg',
  369: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-f54d-7e84-8000-9bfb63cfe2f9._AC_SL1200_QL100_V1_.jpg',
  275: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-bce6-7d55-8000-f77e3db44f57._AC_SL1200_QL100_V1_.jpg',
  274: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-c2e5-7d75-8000-12c3a4e6edbe._AC_SL1200_QL100_V1_.jpg',
  226: 'https://image.chewy.com/catalog/general/images/moe/0689b97e-513c-7f26-8000-23c6b7a77f84._AC_SL1200_QL100_V1_.jpg',
  264: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-afb7-7d15-8000-e7c2a18aa7f9._AC_SL1200_QL100_V1_.jpg',
  363: 'https://image.chewy.com/catalog/general/images/moe/0689b97d-df6b-7e0a-8000-74dbf5b8fdbe._AC_SL1200_QL100_V1_.jpg',
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
        'Referer': 'https://www.chewy.com/'
      },
      timeout: 30000
    }, (response) => {
      if (response.statusCode !== 200) {
        console.log(`  HTTP ${response.statusCode}`);
        resolve(Buffer.alloc(0));
        return;
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => resolve(Buffer.alloc(0)));
    }).on('error', () => resolve(Buffer.alloc(0)))
      .on('timeout', () => resolve(Buffer.alloc(0)));
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
  
  console.log(`Processing ${brokenProducts.length} Zilla products...\n`);
  
  let success = 0;
  let failed = 0;
  const notMapped: string[] = [];
  const imageCache: Record<string, Buffer> = {};
  
  for (const product of brokenProducts) {
    const imageUrl = actualImageUrls[product.id];
    
    if (!imageUrl) {
      notMapped.push(`${product.id}: ${product.name}`);
      failed++;
      continue;
    }
    
    let imageBuffer: Buffer;
    if (imageCache[imageUrl]) {
      imageBuffer = imageCache[imageUrl];
    } else {
      await delay(500);
      imageBuffer = await downloadImage(imageUrl);
      if (imageBuffer.length > 1000) {
        imageCache[imageUrl] = imageBuffer;
      }
    }
    
    if (imageBuffer.length < 1000) {
      console.log(`❌ Download failed: ${product.name}`);
      failed++;
      continue;
    }
    
    const name = (product.name || '').toLowerCase();
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
  
  if (notMapped.length > 0) {
    console.log(`\nProducts without mapping:`);
    notMapped.forEach(p => console.log(`  - ${p}`));
  }
}

main().catch(console.error);
