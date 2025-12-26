import fs from 'fs';
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// Load rollback inventory
const rollbackData = JSON.parse(fs.readFileSync('backups/rollback-inventory-2025-12-26.json', 'utf8'));
const rollbackProducts = rollbackData.data.supplies;

console.log(`Rollback inventory has ${rollbackProducts.length} products`);

// Get current development IDs
const devProducts = await sql`SELECT id FROM supplies`;
const devIds = new Set(devProducts.map(p => p.id));
console.log(`Development has ${devIds.size} products`);

// Find missing products
const missing = rollbackProducts.filter(p => !devIds.has(p.id));
console.log(`Missing products: ${missing.length}`);

if (missing.length === 0) {
  console.log('No products to restore!');
  process.exit(0);
}

// Show what we're restoring
console.log('\nProducts to restore:');
missing.forEach(p => console.log(`  ID ${p.id}: ${p.brand} ${p.name}`));

// Insert missing products
console.log('\nRestoring...');

for (const p of missing) {
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
    console.log(`Restored ID ${p.id}: ${p.brand} ${p.name}`);
  } catch (err) {
    console.error(`Failed ID ${p.id}: ${err.message}`);
  }
}

console.log('\nRestore complete!');
