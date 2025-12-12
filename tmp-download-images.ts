import { ObjectStorageService } from './server/objectStorageService';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { eq } from 'drizzle-orm';

const objectStorage = new ObjectStorageService();

const productsToUpdate = [
  { id: 851, name: 'E-z Feed 6oz', brand: 'Penn-Plax', externalUrl: 'https://upco.com/wp-content/uploads/2023/02/penn-plax-water-seed-cup.jpeg' },
  { id: 852, name: 'E-z Feed 2oz', brand: 'Penn-Plax', externalUrl: 'https://upco.com/wp-content/uploads/2023/02/penn-plax-water-seed-cup.jpeg' },
  { id: 853, name: 'E-z Feed 4oz', brand: 'Penn-Plax', externalUrl: 'https://upco.com/wp-content/uploads/2023/02/penn-plax-water-seed-cup.jpeg' },
  { id: 878, name: 'Donut Chew 2pk', brand: 'Penn-Plax', externalUrl: 'https://m.media-amazon.com/images/I/91Jnp+NXp0L._AC_SL1500_.jpg' },
  { id: 879, name: 'Finch Fries', brand: 'Penn-Plax', externalUrl: 'https://i5.walmartimages.com/seo/Penn-Plax-Bird-Life-Finch-Fries-Nutritious-Treats-for-All-Birds-Cracked-Corn-Flour_b601386c-8592-4a5f-adb0-96a41cee89c3_1.ec611480f0eec2526bea721dec5b11b1.jpeg' },
  { id: 1004, name: 'Pennplax Jingle Bird Wmirror/Perch', brand: 'Penn-Plax', externalUrl: 'https://i5.walmartimages.com/asr/c2a7e5e2-e19c-4ca1-9a2c-23d8ea5df34e.0d8c9d3a7f7cc8c7c74b9f1a91e7c2f5.jpeg' },
];

async function downloadAndUpdateImages() {
  for (const product of productsToUpdate) {
    console.log(`Processing ID ${product.id}: ${product.name}...`);
    const result = await objectStorage.downloadAndStoreProductImage(
      product.externalUrl, product.id, product.name, product.brand
    );
    if (result.success && result.storedPath) {
      await db.update(supplies).set({ imageUrl: result.storedPath }).where(eq(supplies.id, product.id));
      console.log(`SUCCESS ID ${product.id}: ${result.storedPath}`);
    } else {
      console.log(`FAILED ID ${product.id}: ${result.error}`);
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  console.log('Done!');
}

downloadAndUpdateImages().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
