import { db } from './server/db';
import { supplies } from './shared/schema';
import { eq, and, isNull, or, ilike, sql } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from './server/objectStorageService';
import { setObjectAclPolicy } from './server/objectAcl';
import fs from 'fs';
import path from 'path';

const stockImages: Record<string, string[]> = {
  aquarium: [
    'attached_assets/stock_images/aquarium_decoration__4752f977.jpg',
    'attached_assets/stock_images/aquarium_decoration__0f1786ff.jpg',
    'attached_assets/stock_images/aquarium_filter_pump_065d0027.jpg',
  ],
  reptile: [
    'attached_assets/stock_images/reptile_terrarium_he_26447b9b.jpg',
    'attached_assets/stock_images/reptile_terrarium_he_7456e510.jpg',
  ],
  treats: [
    'attached_assets/stock_images/dog_treats_snacks_pe_2f11a93e.jpg',
    'attached_assets/stock_images/dog_treats_snacks_pe_d9f6a4cd.jpg',
  ],
  toys: [
    'attached_assets/stock_images/dog_toy_rubber_chew__4b187fe0.jpg',
    'attached_assets/stock_images/dog_toy_rubber_chew__fdee1077.jpg',
  ],
  fishfood: [
    'attached_assets/stock_images/fish_food_flakes_aqu_96558ffc.jpg',
    'attached_assets/stock_images/fish_food_flakes_aqu_b2a62250.jpg',
  ],
  dogfood: [
    'attached_assets/stock_images/premium_dog_food_kib_851421ee.jpg',
    'attached_assets/stock_images/premium_dog_food_kib_b82cec23.jpg',
  ],
  smallanimal: [
    'attached_assets/stock_images/small_animal_hamster_d94d4a73.jpg',
    'attached_assets/stock_images/small_animal_hamster_978e68f0.jpg',
  ],
  collar: [
    'attached_assets/stock_images/dog_collar_colorful__ad954862.jpg',
    'attached_assets/stock_images/dog_collar_colorful__bf348ada.jpg',
  ],
  harness: [
    'attached_assets/stock_images/cat_harness_mesh_pet_3bd33da4.jpg',
  ],
};

function getImageCategory(productName: string, brandName: string): string {
  const name = productName.toLowerCase();
  const brand = brandName.toLowerCase();
  
  // Brand-based categorization for final batch
  if (brand.includes('lee') || brand.includes('bpv')) return 'aquarium';
  if (brand.includes('crazy cat')) return 'toys';
  if (brand.includes('max') || brand.includes('meijer') || brand.includes('ideal')) return 'dogfood';
  if (brand.includes('dog life') || brand.includes('ranch remedy') || brand.includes('pierce') || brand.includes('pet elite')) return 'treats';
  if (brand.includes('beautifur') || brand.includes('cardinal') || brand.includes('insight')) return 'treats';
  if (brand.includes('nation') || brand.includes('5strands') || brand.includes('dockstel') || brand.includes('pet mate')) return 'collar';
  
  // Name-based categorization
  if (name.includes('toy') || name.includes('ball') || name.includes('chew') || name.includes('plush') || name.includes('squeaky')) return 'toys';
  if (name.includes('treat') || name.includes('biscuit') || name.includes('snack') || name.includes('pad') || name.includes('jerky') || name.includes('chews')) return 'treats';
  if (name.includes('food') || name.includes('kibble') || name.includes('diet') || name.includes('recipe')) return 'dogfood';
  if (name.includes('fish') || name.includes('aqua') || name.includes('tank') || name.includes('filter') || name.includes('marine') || name.includes('coral')) return 'aquarium';
  if (name.includes('reptile') || name.includes('heat') || name.includes('lamp') || name.includes('gecko') || name.includes('terrarium')) return 'reptile';
  if (name.includes('hamster') || name.includes('guinea') || name.includes('rabbit') || name.includes('bird') || name.includes('ferret')) return 'smallanimal';
  if (name.includes('collar') || name.includes('lead') || name.includes('leash')) return 'collar';
  if (name.includes('harness')) return 'harness';
  if (name.includes('shampoo') || name.includes('spray') || name.includes('clean') || name.includes('grooming')) return 'treats';
  if (name.includes('cat')) return 'toys';
  if (name.includes('dog')) return 'toys';
  
  return 'collar';
}

async function uploadAndAssign() {
  const objectStorageService = new ObjectStorageService();
  const publicPaths = objectStorageService.getPublicObjectSearchPaths();
  const bucketPath = publicPaths[0];
  const pathParts = bucketPath.split('/').filter(Boolean);
  const bucketName = pathParts[0];
  const prefix = pathParts.slice(1).join('/');

  const uploadedImages: Record<string, string[]> = {};
  
  for (const [category, files] of Object.entries(stockImages)) {
    uploadedImages[category] = [];
    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;
      const imageBuffer = fs.readFileSync(filePath);
      const filename = `stock/${category}/${path.basename(filePath)}`;
      const objectPath = prefix ? `${prefix}/${filename}` : filename;
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectPath);
      await file.save(imageBuffer, { contentType: 'image/jpeg', metadata: { cacheControl: 'public, max-age=31536000' } });
      await setObjectAclPolicy(file, { owner: 'system', visibility: 'public' });
      
      uploadedImages[category].push(`/public-objects/${filename}`);
    }
  }
  console.log('Stock images uploaded');

  const brands = [
    { pattern: '%max%', name: 'Max' },
    { pattern: '%dog life%', name: 'Dog Life' },
    { pattern: '%lee%', name: "Lee's" },
    { pattern: '%ideal%', name: 'Ideal' },
    { pattern: '%insight%', name: 'Insight' },
    { pattern: '%cardinal%', name: 'Cardinal' },
    { pattern: '%meijer%', name: 'Meijer' },
    { pattern: '%crazy cat%', name: 'Crazy Cat' },
    { pattern: '%beautifur%', name: 'Beautifur' },
    { pattern: '%bpv%', name: 'BPV Environmental' },
    { pattern: '%pet mate%', name: 'Pet Mate' },
    { pattern: '%pierce%', name: "Pierce's" },
    { pattern: '%5strands%', name: '5Strands' },
    { pattern: '%ranch remedy%', name: 'Ranch Remedy' },
    { pattern: '%nation%', name: 'Nation' },
    { pattern: '%dockstel%', name: 'Dockstel' },
    { pattern: '%pet elite%', name: 'Pet Elite' },
  ];

  let totalUpdated = 0;
  const counters: Record<string, number> = {};

  for (const brand of brands) {
    const products = await db.select({ id: supplies.id, name: supplies.name, brand: supplies.brand })
      .from(supplies)
      .where(and(
        ilike(supplies.brand, brand.pattern),
        or(isNull(supplies.imageUrl), eq(supplies.imageUrl, ''))
      ))
      .limit(200);

    if (products.length === 0) continue;

    for (const product of products) {
      const category = getImageCategory(product.name, product.brand || '');
      counters[category] = (counters[category] || 0) + 1;
      
      const images = uploadedImages[category] || uploadedImages.collar;
      const imageUrl = images[counters[category] % images.length];

      await db.update(supplies).set({ imageUrl, updatedAt: new Date() }).where(eq(supplies.id, product.id));
      totalUpdated++;
    }
    console.log(`${brand.name}: ${products.length} updated`);
  }

  // Handle products without brands
  const noBrandProducts = await db.select({ id: supplies.id, name: supplies.name, brand: supplies.brand })
    .from(supplies)
    .where(and(
      or(isNull(supplies.brand), eq(supplies.brand, '')),
      or(isNull(supplies.imageUrl), eq(supplies.imageUrl, ''))
    ))
    .limit(100);

  for (const product of noBrandProducts) {
    const category = getImageCategory(product.name, '');
    counters[category] = (counters[category] || 0) + 1;
    
    const images = uploadedImages[category] || uploadedImages.collar;
    const imageUrl = images[counters[category] % images.length];

    await db.update(supplies).set({ imageUrl, updatedAt: new Date() }).where(eq(supplies.id, product.id));
    totalUpdated++;
  }
  if (noBrandProducts.length > 0) {
    console.log(`No Brand: ${noBrandProducts.length} updated`);
  }

  console.log(`\nTotal: ${totalUpdated} products updated`);
}

uploadAndAssign().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
