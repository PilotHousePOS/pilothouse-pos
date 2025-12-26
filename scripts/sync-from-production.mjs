#!/usr/bin/env node
/**
 * Full Sync from Production Export
 * 
 * This script does TWO things:
 * 1. Updates UPCs/SKUs on existing products
 * 2. ADDS new products that exist in production but not in development
 * 
 * Usage: node scripts/sync-from-production.mjs <path-to-export.json>
 */

import fs from 'fs';
import { neon } from "@neondatabase/serverless";

const exportPath = process.argv[2];
if (!exportPath) {
  console.error('Usage: node scripts/sync-from-production.mjs <path-to-export.json>');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// Load production export
const prodData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
const prodProducts = prodData.data.supplies;

console.log(`\n=== SYNC FROM PRODUCTION ===`);
console.log(`Production export: ${prodProducts.length} products`);
console.log(`Export date: ${prodData.exportDate}`);

// Get current development products
const devProducts = await sql`SELECT id, sku FROM supplies`;
const devIds = new Set(devProducts.map(p => p.id));
const devSkuMap = new Map(devProducts.map(p => [p.id, p.sku]));

console.log(`Development database: ${devIds.size} products\n`);

// Separate into updates and inserts
const toUpdate = [];
const toInsert = [];

for (const prod of prodProducts) {
  if (devIds.has(prod.id)) {
    // Product exists - check if UPC needs update
    if (devSkuMap.get(prod.id) !== prod.sku) {
      toUpdate.push(prod);
    }
  } else {
    // New product - needs to be added
    toInsert.push(prod);
  }
}

console.log(`Products to UPDATE (UPC changes): ${toUpdate.length}`);
console.log(`Products to INSERT (new): ${toInsert.length}\n`);

// Update UPCs
if (toUpdate.length > 0) {
  const ids = toUpdate.map(p => p.id);
  const skus = toUpdate.map(p => p.sku || null);
  
  await sql`
    UPDATE supplies s 
    SET sku = v.sku 
    FROM (SELECT unnest(${ids}::int[]) as id, unnest(${skus}::text[]) as sku) v 
    WHERE s.id = v.id
  `;
  console.log(`Updated ${toUpdate.length} UPCs`);
}

// Insert new products
if (toInsert.length > 0) {
  console.log('\nInserting new products:');
  let inserted = 0;
  let failed = 0;
  
  for (const p of toInsert) {
    try {
      await sql`
        INSERT INTO supplies (
          id, name, category, brand, price, description, 
          image_url, image_urls, stock_quantity, is_active,
          weight, size, sku, upc, filter_type, price_source, quantity_source
        ) VALUES (
          ${p.id}, ${p.name}, ${p.category}, ${p.brand}, ${p.price}, ${p.description || ''},
          ${p.imageUrl}, ${p.imageUrls}, ${p.stockQuantity}, ${p.isActive},
          ${p.weight || ''}, ${p.size || ''}, ${p.sku}, ${p.upc}, ${p.filterType}, 
          ${p.priceSource || 'default'}, ${p.quantitySource || 'default'}
        )
      `;
      console.log(`  + ID ${p.id}: ${p.brand} ${p.name}`);
      inserted++;
    } catch (err) {
      console.error(`  ! Failed ID ${p.id}: ${err.message}`);
      failed++;
    }
  }
  
  console.log(`\nInserted ${inserted} new products (${failed} failed)`);
}

// Final count
const finalCount = await sql`SELECT COUNT(*) as count FROM supplies`;
console.log(`\n=== SYNC COMPLETE ===`);
console.log(`Development now has ${finalCount[0].count} products`);
