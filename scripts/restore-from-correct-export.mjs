import fs from 'fs';
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// Load the Dec 26 production export (correct data)
const data = JSON.parse(fs.readFileSync('attached_assets/supplies-export-1766769390237_1766783725260.json', 'utf8'));
const supplies = data.data.supplies;

console.log(`Loaded ${supplies.length} products from Dec 26 production export`);

// Build arrays for bulk update - update ALL products with their correct SKU and image_url
const ids = supplies.map(p => p.id);
const skus = supplies.map(p => p.sku || null);
const imageUrls = supplies.map(p => p.imageUrl || null);

// Bulk update
await sql`
  UPDATE supplies s 
  SET sku = v.sku, image_url = v.image_url
  FROM (
    SELECT 
      unnest(${ids}::int[]) as id, 
      unnest(${skus}::text[]) as sku,
      unnest(${imageUrls}::text[]) as image_url
  ) v 
  WHERE s.id = v.id
`;

console.log('Updated all products from production export');

// Also insert any missing products
const devProducts = await sql`SELECT id FROM supplies`;
const devIds = new Set(devProducts.map(p => p.id));
const missing = supplies.filter(p => !devIds.has(p.id));

console.log(`Missing products: ${missing.length}`);

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
    console.log(`  + ID ${p.id}: ${p.brand} ${p.name}`);
  } catch (err) {
    console.error(`  ! Failed ID ${p.id}: ${err.message}`);
  }
}

// Verify Kong
const kong = await sql`
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN sku IS NOT NULL AND LENGTH(sku) >= 10 THEN 1 END) as with_upc,
    COUNT(CASE WHEN image_url IS NOT NULL AND LENGTH(image_url) > 5 THEN 1 END) as with_image
  FROM supplies WHERE brand = 'Kong'
`;
console.log(`\nKong products: ${kong[0].total}`);
console.log(`With UPCs: ${kong[0].with_upc}`);
console.log(`With Images: ${kong[0].with_image}`);

// Show specific products
const check = await sql`SELECT id, name, sku, image_url FROM supplies WHERE id IN (3114, 3120, 3125)`;
console.log('\nSpecific products:');
check.forEach(p => {
  console.log(`ID ${p.id}: ${p.name}`);
  console.log(`  UPC: ${p.sku || 'NULL'}`);
  console.log(`  Image: ${p.image_url}`);
});
