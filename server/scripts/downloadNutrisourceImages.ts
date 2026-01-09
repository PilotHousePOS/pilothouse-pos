import { ObjectStorageService } from "../objectStorageService";

const objectStorageService = new ObjectStorageService();
import { db } from "../db";
import { supplies } from "../../shared/schema";
import { eq } from "drizzle-orm";

async function downloadImages() {
  console.log("Downloading NutriSource product images...\n");

  const updates = [
    {
      id: 6513,
      name: "Nutrisource Small & Medium Breed Puppy Chicken & Rice Recipe 5.5oz",
      brand: "Nutrisource",
      imageUrl: "https://nutrisourcepetfoods.com/wp-content/uploads/2020/03/5_5ozNS_SmlMedPuppyCan.png"
    },
    {
      id: 6690,
      name: "Nutrisource Classic Catch Cat 5.5oz",
      brand: "Nutrisource",
      imageUrl: "https://nutrisourcepetfoods.com/wp-content/uploads/2023/11/5_5ozES_ClassicCatch_CatCan.png"
    }
  ];

  for (const product of updates) {
    console.log(`Processing: ${product.name}`);
    try {
      const result = await objectStorageService.downloadAndStoreProductImage(
        product.imageUrl,
        product.id,
        product.name,
        product.brand
      );
      if (result.success && result.storedPath) {
        await db.update(supplies)
          .set({ imageUrl: result.storedPath })
          .where(eq(supplies.id, product.id));
        console.log(`  ✓ Saved: ${result.storedPath}`);
      } else {
        console.log(`  ✗ Failed: ${result.error}`);
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error}`);
    }
  }

  console.log("\nDone!");
  process.exit(0);
}

downloadImages();
