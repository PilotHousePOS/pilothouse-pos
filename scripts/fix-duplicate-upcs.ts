import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('=== Fixing Duplicate UPCs ===\n');
  
  // Get all products with their SKUs
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    category: supplies.category,
    sku: supplies.sku,
  }).from(supplies);
  
  console.log(`Total products: ${products.length}`);
  
  // Group by SKU
  const skuGroups = new Map<string, typeof products>();
  for (const p of products) {
    if (p.sku && p.sku.length >= 10) {
      if (!skuGroups.has(p.sku)) {
        skuGroups.set(p.sku, []);
      }
      skuGroups.get(p.sku)!.push(p);
    }
  }
  
  // Find duplicates
  const duplicates = Array.from(skuGroups.entries())
    .filter(([_, prods]) => prods.length > 1);
  
  console.log(`Found ${duplicates.length} duplicate SKUs affecting ${duplicates.reduce((sum, [_, p]) => sum + p.length, 0)} products`);
  
  // Analyze each duplicate - are they similar products or clear mismatches?
  let clearMismatches = 0;
  let possibleLegitimate = 0;
  const toFix: { sku: string; products: typeof products }[] = [];
  
  for (const [sku, prods] of duplicates) {
    // Check if products are similar (same brand, similar names)
    const brands = new Set(prods.map(p => (p.brand || '').toLowerCase().trim()));
    const categories = new Set(prods.map(p => p.category));
    
    // If multiple different brands or vastly different categories, it's a mismatch
    if (brands.size > 2 || (categories.size > 2)) {
      clearMismatches++;
      toFix.push({ sku, products: prods });
    } else {
      // Check if names are similar
      const words = prods.map(p => 
        p.name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
      );
      
      // Find common words across all products
      const allWords = new Set(words.flat());
      let commonCount = 0;
      for (const word of allWords) {
        if (words.every(w => w.includes(word))) {
          commonCount++;
        }
      }
      
      // If very few common words, likely a mismatch
      if (commonCount < 2) {
        clearMismatches++;
        toFix.push({ sku, products: prods });
      } else {
        possibleLegitimate++;
      }
    }
  }
  
  console.log(`\nClear mismatches (different brands/categories): ${clearMismatches}`);
  console.log(`Possibly legitimate (same brand, similar names): ${possibleLegitimate}`);
  
  // For clear mismatches, we need to determine which product should keep the UPC
  console.log(`\n=== Fixing ${toFix.length} mismatch groups ===`);
  
  let fixed = 0;
  for (const { sku, products: prods } of toFix) {
    // Strategy: Keep UPC only for the product whose name best matches the UPC name
    // For now, clear all but keep the first one if it seems to match
    
    // Check which product might legitimately have this UPC
    // The one with the most specific/unique name or matching brand
    const sortedByNameLength = [...prods].sort((a, b) => 
      (b.name?.length || 0) - (a.name?.length || 0)
    );
    
    // Keep UPC for the first product (longest name), clear for others
    const keep = sortedByNameLength[0];
    const toClear = sortedByNameLength.slice(1);
    
    for (const p of toClear) {
      await db.update(supplies)
        .set({ sku: null })
        .where(sql`${supplies.id} = ${p.id}`);
      fixed++;
    }
    
    if (fixed % 100 === 0) {
      console.log(`Cleared ${fixed} incorrect UPCs...`);
    }
  }
  
  console.log(`\nCleared ${fixed} incorrect UPC assignments`);
  
  // Final stats
  const finalProducts = await db.select({
    id: supplies.id,
    sku: supplies.sku,
  }).from(supplies);
  
  const finalWithUpc = finalProducts.filter(p => p.sku && p.sku.length >= 10);
  console.log(`\n=== After Fix ===`);
  console.log(`Products with UPC: ${finalWithUpc.length} / ${finalProducts.length} (${(finalWithUpc.length / finalProducts.length * 100).toFixed(1)}%)`);
  
  // Count remaining duplicates
  const remainingDupes = new Map<string, number>();
  for (const p of finalProducts) {
    if (p.sku && p.sku.length >= 10) {
      remainingDupes.set(p.sku, (remainingDupes.get(p.sku) || 0) + 1);
    }
  }
  const dupeCount = Array.from(remainingDupes.values()).filter(c => c > 1).length;
  console.log(`Remaining duplicate SKUs: ${dupeCount}`);
}

main().catch(console.error);
