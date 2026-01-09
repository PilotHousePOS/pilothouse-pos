import { db } from "../db";
import { supplies } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import * as fs from "fs";

async function syncCoastalExact() {
  console.log("=== EXACT COASTAL SYNC FROM PRODUCTION ===\n");

  // Load production export
  const exportData = JSON.parse(fs.readFileSync("/tmp/prod_coastal_latest.json", "utf-8"));
  console.log(`Production Coastal products to sync: ${exportData.length}\n`);

  // Step 1: Delete all existing Coastal products in dev
  console.log("Step 1: Deleting all Coastal products from dev...");
  const deleted = await db.delete(supplies).where(eq(supplies.brand, "Coastal"));
  console.log(`  Deleted Coastal products from dev\n`);

  // Step 2: Reset sequence to avoid ID conflicts
  console.log("Step 2: Resetting ID sequence...");
  const maxId = await db.execute(sql`SELECT COALESCE(MAX(id), 0) as max_id FROM supplies`);
  const newSeq = (maxId.rows[0] as any).max_id + 1;
  await db.execute(sql`SELECT setval('supplies_id_seq', ${newSeq})`);
  console.log(`  Sequence reset to ${newSeq}\n`);

  // Step 3: Insert all production Coastal products
  console.log("Step 3: Inserting production Coastal products...");
  let inserted = 0;
  let errors = 0;

  for (const prod of exportData) {
    try {
      await db.insert(supplies).values({
        name: prod.name || "",
        category: prod.category || "leashesAndCollars",
        brand: "Coastal",
        price: prod.price || "0",
        description: prod.description || "",
        imageUrl: prod.imageUrl || null,
        imageUrls: prod.imageUrls || null,
        stockQuantity: prod.stockQuantity ?? 1,
        isActive: prod.isActive !== false,
        weight: prod.weight || "",
        size: prod.size || "",
        color: prod.color || "",
        style: prod.style || "",
        mfgPart: prod.mfgPart || "",
        sku: prod.sku || "",
        upc: prod.upc || prod.sku || "",
        filterType: prod.filterType || null,
        priceSource: prod.priceSource || "default",
        quantitySource: prod.quantitySource || "default",
        manualPriceOverride: prod.manualPriceOverride || false,
        manualQuantityOverride: prod.manualQuantityOverride || false,
        posProductId: prod.posProductId || null,
        posLastSyncedAt: prod.posLastSyncedAt ? new Date(prod.posLastSyncedAt) : null,
        nonRestockable: prod.nonRestockable || false,
        features: prod.features || null,
        ingredients: prod.ingredients || null,
        materials: prod.materials || null,
        instructions: prod.instructions || null,
        instructionLabel: prod.instructionLabel || null,
        contentSource: prod.contentSource || null,
        guaranteedAnalysis: prod.guaranteedAnalysis || null,
      });
      inserted++;
      if (inserted % 200 === 0) {
        console.log(`  Inserted ${inserted} products...`);
      }
    } catch (err: any) {
      console.error(`  Error inserting ${prod.name}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== SYNC COMPLETE ===`);
  console.log(`Inserted: ${inserted} Coastal products`);
  console.log(`Errors: ${errors}`);

  // Step 4: Verify count matches
  const finalCount = await db.select({ count: sql`COUNT(*)` }).from(supplies).where(eq(supplies.brand, "Coastal"));
  console.log(`\nFinal dev Coastal count: ${(finalCount[0] as any).count}`);
  console.log(`Expected (production): ${exportData.length}`);

  if (Number((finalCount[0] as any).count) === exportData.length) {
    console.log("\n✓ Coastal products EXACTLY match production!");
  } else {
    console.log("\n✗ Count mismatch - review errors above");
  }

  process.exit(0);
}

syncCoastalExact().catch(console.error);
