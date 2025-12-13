import { db } from './server/db';
import { supplies } from './shared/schema';
import { eq } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from './server/objectStorageService';
import { setObjectAclPolicy } from './server/objectAcl';
import https from 'https';

const productsToUpdate = [
  { id: 5080, name: 'Decor Aqua Filter', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5081, name: 'The Bubbler Bottom Filter', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5086, name: 'Airtech 2k4', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5087, name: 'Airtech 2k1', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5090, name: 'Led Air Stone', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5129, name: 'Aquascapes Moodlight', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5130, name: 'Aquascapes Midnight River', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5138, name: 'Aquaplnt 1lg2md Assrt', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5139, name: 'Sinkers Water Lily White Medium', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5140, name: 'Sinkers Water Lily Red Medium', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5141, name: 'Sinkers Water Lily White Large', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5142, name: 'Sinkers Flrspike Extra Large', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5143, name: 'Sinkers Blom Ludwig Green Super', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5144, name: 'Sinkers Bloom Ludwig Red Super', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5145, name: 'Sinkers Bloom Ludwig Red Giant', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5146, name: 'Sinkers Ambulia Green Giant', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5152, name: 'Aquaplt 8 Glw Plant 6pc Pck', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5157, name: 'Aquaplt 8 Plant Green', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5202, name: 'Aquaplnt 6 Rckplnt Green', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5203, name: 'Aquaplnt 2.5/3.5 Rckplnt Assorted', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5204, name: 'Aquaplnt 12 Rckplnt Color', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5205, name: 'Aqyaplnt 8 Rckplnt Color', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5206, name: 'Jungle Pds Large Stle 6', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5208, name: '6 Rckplnt Green', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5210, name: '8 Rckplnt Color', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5212, name: 'Junglepd Small Style 2', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5228, name: 'Foregrounder Mnywrt/Green', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5229, name: 'Sinkers Rdwtr Hyacinth Bottom', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5253, name: 'Foregrounder Fan Brush Orange', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5254, name: 'Foregrounder Fan Palm Red', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5257, name: 'Foregrounder Caboma Grnwrd', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5261, name: 'Frozen Ice Castle/Mini', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5343448?fmt=jpg&wid=800&hei=800' },
  { id: 5262, name: 'Frozen Mini Elsa', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5343448?fmt=jpg&wid=800&hei=800' },
  { id: 5264, name: 'Frozen Anna Mini', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5343448?fmt=jpg&wid=800&hei=800' },
  { id: 5265, name: 'Frozen Olaf Slide Mini', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5343448?fmt=jpg&wid=800&hei=800' },
  { id: 5267, name: 'Mickey Merminnie Mini', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5343448?fmt=jpg&wid=800&hei=800' },
  { id: 5268, name: 'Mickey Goofy & Dolphin', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5343448?fmt=jpg&wid=800&hei=800' },
  { id: 5270, name: 'Minion Stuart Beach Budd', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5343448?fmt=jpg&wid=800&hei=800' },
  { id: 5271, name: 'Jurassic Pork Gates', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5343448?fmt=jpg&wid=800&hei=800' },
  { id: 5274, name: 'Little Mermaid 5pk', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5343448?fmt=jpg&wid=800&hei=800' },
  { id: 5275, name: 'Aquascapes Medium Green/Pink Bunch', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5276, name: 'Aquascapes Medium Green/Purple Bunch', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5277, name: 'Aquascapes Small Purpl Bunch', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5278, name: 'Aquascapes Small Yell Bunch', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5279, name: 'Aquascapes Medium Pnnywrt Bunch', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5280, name: 'Aquascapes Medium Ostrich Fern Bunch', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5281, name: 'Aquascapes Large Red Bunch', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5282, name: 'Aquascapes Glow Bunch', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5283, name: 'Aquascapes Glw Bunch Medium Green/Pink', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
  { id: 5284, name: 'Aquafloras Bloom Flower', brand: 'Penn-Plax', externalUrl: 'https://s7d2.scene7.com/is/image/PetSmart/5300815?fmt=jpg&wid=800&hei=800' },
];

async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.petsmart.com/'
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          const fullUrl = redirectUrl.startsWith('http') ? redirectUrl : `https:${redirectUrl}`;
          https.get(fullUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
          }).on('error', () => resolve(Buffer.alloc(0)));
          return;
        }
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(Buffer.alloc(0)));
  });
}

async function downloadAndUpdateImages() {
  const objectStorageService = new ObjectStorageService();
  const publicPaths = objectStorageService.getPublicObjectSearchPaths();
  const bucketPath = publicPaths[0];
  const pathParts = bucketPath.split('/').filter(Boolean);
  const bucketName = pathParts[0];
  const prefix = pathParts.slice(1).join('/');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const product of productsToUpdate) {
    console.log(`Downloading: ${product.name}...`);
    const imageBuffer = await downloadImage(product.externalUrl);
    if (imageBuffer.length < 1000) { 
      console.log(`Failed: ${product.name} (${imageBuffer.length} bytes)`); 
      failCount++;
      continue; 
    }
    
    const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const filename = `products/${product.brand?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unknown'}/${slug}-${product.id}.jpg`;
    const objectPath = prefix ? `${prefix}/${filename}` : filename;
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectPath);
    await file.save(imageBuffer, { contentType: 'image/jpeg', metadata: { cacheControl: 'public, max-age=31536000' } });
    await setObjectAclPolicy(file, { owner: 'system', visibility: 'public' });
    
    const cleanPath = `/public-objects/${filename}`;
    await db.update(supplies).set({ imageUrl: cleanPath, updatedAt: new Date() }).where(eq(supplies.id, product.id));
    console.log(`Success: ${product.name} => ${cleanPath}`);
    successCount++;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`\nCompleted: ${successCount} success, ${failCount} failed`);
}

downloadAndUpdateImages().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
