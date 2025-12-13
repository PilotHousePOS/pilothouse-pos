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
  
  if (brand.includes('marineland') || brand.includes('cascade')) return 'aquarium';
  if (brand.includes('reptology') || brand.includes('pangea')) return 'reptile';
  if (brand.includes('diamond') || brand.includes('victor')) return 'dogfood';
  if (brand.includes('benebone') || brand.includes('tuffy') || brand.includes('rascals')) return 'toys';
  if (brand.includes('lupine') || brand.includes('valhoma') || brand.includes('petcrest')) return 'collar';
  if (brand.includes('wee-wee') || brand.includes('four paws') || brand.includes('ethical')) return 'treats';
  
  if (name.includes('toy') || name.includes('ball') || name.includes('chew') || name.includes('bone')) return 'toys';
  if (name.includes('treat') || name.includes('biscuit') || name.includes('snack') || name.includes('pad')) return 'treats';
  if (name.includes('food') || name.includes('kibble') || name.includes('diet')) return 'dogfood';
  if (name.includes('fish') || name.includes('aqua') || name.includes('tank') || name.includes('filter')) return 'aquarium';
  if (name.includes('reptile') || name.includes('heat') || name.includes('lamp') || name.includes('gecko')) return 'reptile';
  if (name.includes('collar') || name.includes('lead')) return 'collar';
  if (name.includes('harness')) return 'harness';
  
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
    { pattern: '%wee-wee%', name: 'Wee-Wee' },
    { pattern: '%four paws%', name: 'Four Paws' },
    { pattern: '%ethical%', name: 'Ethical Pet' },
    { pattern: '%benebone%', name: 'Benebone' },
    { pattern: '%petcrest%', name: 'PetCrest' },
    { pattern: '%diamond%', name: 'Diamond' },
    { pattern: '%specialty%', name: 'Specialty' },
    { pattern: '%tuffy%', name: 'Tuffy' },
    { pattern: '%quiet time%', name: 'Quiet Time' },
    { pattern: '%victor%', name: 'VICTOR' },
    { pattern: '%marineland%', name: 'Marineland' },
    { pattern: '%pets first%', name: 'Pets First' },
    { pattern: '%lupine%', name: 'Lupine' },
    { pattern: '%reptology%', name: 'Reptology' },
    { pattern: '%rascals%', name: 'Rascals' },
    { pattern: '%cascade%', name: 'Cascade' },
    { pattern: '%pangea%', name: 'Pangea' },
    { pattern: '%pethouse%', name: 'Pethouse' },
    { pattern: '%van ness%', name: 'Van Ness' },
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

  console.log(`\nTotal: ${totalUpdated} products updated`);
}

uploadAndAssign().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
