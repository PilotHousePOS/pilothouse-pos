import { ObjectStorageService } from "../objectStorageService";

const objectStorageService = new ObjectStorageService();
import { db } from "../db";
import { supplies } from "../../shared/schema";
import { eq } from "drizzle-orm";

async function downloadImages() {
  console.log("Downloading NutriSource product images...\n");

  const updates = [
    {
      id: 6310,
      name: "Nutrisource Element Series Open Waters Recipe 4lb",
      brand: "Nutrisource",
      imageUrl: "https://nutrisourcepetfoods.com/wp-content/uploads/2021/02/Element_OpenWaters.png"
    },
    {
      id: 4784,
      name: "Nutrisource Nutty Butter Bites with Apple",
      brand: "Nutrisource",
      imageUrl: "https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_NuttyButterBites_PB_Apple_Front.png"
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
