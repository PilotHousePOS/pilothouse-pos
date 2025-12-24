#!/usr/bin/env node
import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function importSupplies() {
  console.log('Reading export file...');
  const data = JSON.parse(fs.readFileSync('attached_assets/supplies-export-1766542024559_1766542040815.json', 'utf8'));
  
  console.log(`Importing ${data.data.supplies.length} supplies from production...`);
  
  let imported = 0;
  let failed = 0;
  
  for (const supply of data.data.supplies) {
    try {
      await pool.query(`
        INSERT INTO supplies (
          id, name, category, brand, price, description, image_url, image_urls,
          stock_quantity, is_active, weight, size, sku, upc, filter_type,
          price_source, quantity_source, manual_price_override, manual_quantity_override,
          pos_product_id, pos_last_synced_at, non_restockable,
          features, ingredients, instructions, guaranteed_analysis,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19,
          $20, $21, $22,
          $23, $24, $25, $26,
          $27, $28
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          brand = EXCLUDED.brand,
          price = EXCLUDED.price,
          description = EXCLUDED.description,
          image_url = EXCLUDED.image_url,
          image_urls = EXCLUDED.image_urls,
          stock_quantity = EXCLUDED.stock_quantity,
          is_active = EXCLUDED.is_active,
          weight = EXCLUDED.weight,
          size = EXCLUDED.size,
          sku = EXCLUDED.sku,
          upc = EXCLUDED.upc,
          filter_type = EXCLUDED.filter_type,
          price_source = EXCLUDED.price_source,
          quantity_source = EXCLUDED.quantity_source,
          manual_price_override = EXCLUDED.manual_price_override,
          manual_quantity_override = EXCLUDED.manual_quantity_override,
          pos_product_id = EXCLUDED.pos_product_id,
          pos_last_synced_at = EXCLUDED.pos_last_synced_at,
          non_restockable = EXCLUDED.non_restockable,
          features = EXCLUDED.features,
          ingredients = EXCLUDED.ingredients,
          instructions = EXCLUDED.instructions,
          guaranteed_analysis = EXCLUDED.guaranteed_analysis,
          updated_at = EXCLUDED.updated_at
      `, [
        supply.id,
        supply.name,
        supply.category,
        supply.brand,
        supply.price,
        supply.description,
        supply.imageUrl,
        supply.imageUrls && Array.isArray(supply.imageUrls) && supply.imageUrls.length > 0 ? supply.imageUrls : null,
        supply.stockQuantity,
        supply.isActive,
        supply.weight,
        supply.size,
        supply.sku,
        supply.upc,
        supply.filterType,
        supply.priceSource || 'default',
        supply.quantitySource || 'default',
        supply.manualPriceOverride || false,
        supply.manualQuantityOverride || false,
        supply.posProductId,
        supply.posLastSyncedAt ? new Date(supply.posLastSyncedAt) : null,
        supply.nonRestockable || false,
        supply.features ? JSON.stringify(supply.features) : null,
        supply.ingredients,
        supply.instructions,
        supply.guaranteedAnalysis,
        supply.createdAt ? new Date(supply.createdAt) : new Date(),
        supply.updatedAt ? new Date(supply.updatedAt) : new Date()
      ]);
      imported++;
      if (imported % 500 === 0) {
        console.log(`  Imported ${imported}...`);
      }
    } catch (err) {
      failed++;
      if (failed <= 5) {
        console.error(`Failed to import ${supply.name}:`, err.message);
      }
    }
  }
  
  console.log(`\nImport complete: ${imported} imported, ${failed} failed`);
  await pool.end();
}

importSupplies().catch(console.error);
