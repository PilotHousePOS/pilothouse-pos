import { ObjectStorageService } from './server/objectStorageService';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { eq } from 'drizzle-orm';

const objectStorage = new ObjectStorageService();

const productsToUpdate = [
  { id: 1190, name: 'Parrot Starter Kit', brand: 'Penn-Plax', externalUrl: 'https://m.media-amazon.com/images/I/71pnQpDB9wL._AC_SL1500_.jpg' },
  { id: 1204, name: 'Ezfill Feeder Bird', brand: 'Penn-Plax', externalUrl: 'https://m.media-amazon.com/images/I/71s0bQ9XiZL._AC_SL1500_.jpg' },
];

async function downloadAndUpdateImages() {
  for (const product of productsToUpdate) {
    console.log(`Processing ID ${product.id}: ${product.name}...`);
    const result = await objectStorage.downloadAndStoreProductImage(
      product.externalUrl, product.id, product.name, product.brand
    );
    if (result.success && result.storedPath) {
      await db.update(supplies).set({ imageUrl: result.storedPath }).where(eq(supplies.id, product.id));
      console.log(`Updated ID ${product.id}: ${result.storedPath}`);
    } else {
      console.log(`Failed ID ${product.id}: ${result.error}`);
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  console.log('Done!');
}

downloadAndUpdateImages().then(() => process.exit(0));
