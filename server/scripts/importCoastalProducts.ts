import { db } from "../db";
import { supplies } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";

async function syncCoastalProducts() {
  console.log("Syncing Coastal products from production export...\n");

  // Load production Coastal products
  const prodCoastal: any[] = JSON.parse(fs.readFileSync("/tmp/coastal_products.json", "utf-8"));
  console.log(`Production has ${prodCoastal.length} Coastal products`);

  // Index production by SKU
  const prodBySku = new Map<string, any>();
  for (const p of prodCoastal) {
    if (p.sku) prodBySku.set(p.sku, p);
  }
  console.log(`Production has ${prodBySku.size} unique SKUs\n`);

  // Get all dev Coastal products
  const devCoastal = await db.select({
    id: supplies.id,
    sku: supplies.sku,
    name: supplies.name
  }).from(supplies).where(eq(supplies.brand, "Coastal"));
  
  console.log(`Development has ${devCoastal.length} Coastal products`);

  // Group dev by SKU
  const devBySku = new Map<string, { id: number; name: string }[]>();
  for (const d of devCoastal) {
    if (!d.sku) continue;
    if (!devBySku.has(d.sku)) devBySku.set(d.sku, []);
    devBySku.get(d.sku)!.push({ id: d.id, name: d.name || "" });
  }
  console.log(`Development has ${devBySku.size} unique SKUs\n`);

  let updated = 0;
  let inserted = 0;
  let duplicateSkus: string[] = [];

  for (const [sku, prodData] of prodBySku) {
    const devMatches = devBySku.get(sku);

    if (!devMatches || devMatches.length === 0) {
      // SKU not in dev - INSERT new product
      try {
        await db.insert(supplies).values({
          name: prodData.name,
          category: prodData.category || "leashesAndCollars",
          brand: "Coastal",
          price: prodData.price,
          description: prodData.description || "",
          imageUrl: prodData.imageUrl || null,
          imageUrls: prodData.imageUrls || null,
          stockQuantity: prodData.stockQuantity ?? 1,
          isActive: prodData.isActive !== false,
          weight: prodData.weight || "",
          size: prodData.size || "",
          color: prodData.color || "",
          style: prodData.style || "",
          mfgPart: prodData.mfgPart || "",
          sku: prodData.sku,
          upc: prodData.upc || prodData.sku,
          filterType: prodData.filterType || null,
          priceSource: prodData.priceSource || "default",
          quantitySource: prodData.quantitySource || "default",
          nonRestockable: prodData.nonRestockable || false,
        });
        inserted++;
      } catch (err: any) {
        console.error(`  Insert error for ${prodData.name}: ${err.message}`);
      }
    } else if (devMatches.length === 1) {
      // Unique match - UPDATE by dev ID
      const devId = devMatches[0].id;
      try {
        await db.update(supplies).set({
          name: prodData.name,
          category: prodData.category || "leashesAndCollars",
          price: prodData.price,
          description: prodData.description || "",
          imageUrl: prodData.imageUrl || null,
          imageUrls: prodData.imageUrls || null,
          stockQuantity: prodData.stockQuantity ?? 1,
          isActive: prodData.isActive !== false,
          weight: prodData.weight || "",
          size: prodData.size || "",
          color: prodData.color || "",
          style: prodData.style || "",
          mfgPart: prodData.mfgPart || "",
          upc: prodData.upc || prodData.sku,
          filterType: prodData.filterType || null,
        }).where(eq(supplies.id, devId));
        updated++;
      } catch (err: any) {
        console.error(`  Update error for ${prodData.name}: ${err.message}`);
      }
    } else {
      // Multiple matches - update all of them with same data
      for (const match of devMatches) {
        try {
          await db.update(supplies).set({
            name: prodData.name,
            category: prodData.category || "leashesAndCollars",
            price: prodData.price,
            description: prodData.description || "",
            imageUrl: prodData.imageUrl || null,
            imageUrls: prodData.imageUrls || null,
            stockQuantity: prodData.stockQuantity ?? 1,
            isActive: prodData.isActive !== false,
            weight: prodData.weight || "",
            size: prodData.size || "",
            color: prodData.color || "",
            style: prodData.style || "",
            mfgPart: prodData.mfgPart || "",
            upc: prodData.upc || prodData.sku,
            filterType: prodData.filterType || null,
          }).where(eq(supplies.id, match.id));
          updated++;
        } catch (err: any) {
          console.error(`  Update error for ${match.name}: ${err.message}`);
        }
      }
      duplicateSkus.push(sku);
    }

    if ((updated + inserted) % 100 === 0 && (updated + inserted) > 0) {
      console.log(`  Progress: ${updated} updated, ${inserted} inserted...`);
    }
  }

  console.log(`\n=== SYNC COMPLETE ===`);
  console.log(`Updated: ${updated} products`);
  console.log(`Inserted: ${inserted} products`);
  if (duplicateSkus.length > 0) {
    console.log(`\nNote: ${duplicateSkus.length} SKUs had multiple dev matches (all were updated)`);
  }

  // Verify final count
  const finalCount = await db.select({ id: supplies.id }).from(supplies).where(eq(supplies.brand, "Coastal"));
  console.log(`\nFinal dev Coastal count: ${finalCount.length}`);

  process.exit(0);
}

syncCoastalProducts().catch(console.error);
