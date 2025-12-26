import fs from 'fs';
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// Load the Dec 23 export with all Kong data
const data = JSON.parse(fs.readFileSync('attached_assets/supplies-export-1766522331196_1766522340365.json', 'utf8'));
const kong = data.data.supplies.filter(p => p.brand === 'Kong' && p.sku && p.sku.length >= 10);

console.log(`Found ${kong.length} Kong products with UPCs in Dec 23 export`);

// Build arrays for bulk update
const ids = kong.map(p => p.id);
const skus = kong.map(p => p.sku);
const imageUrls = kong.map(p => p.imageUrl || '');

// Bulk update
const result = await sql`
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

console.log('Bulk update complete');

// Verify
const check = await sql`
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN sku IS NOT NULL AND LENGTH(sku) >= 10 THEN 1 END) as with_upc,
    COUNT(CASE WHEN image_url IS NOT NULL AND LENGTH(image_url) > 5 THEN 1 END) as with_image
  FROM supplies WHERE brand = 'Kong'
`;
console.log(`Kong products: ${check[0].total}`);
console.log(`With UPCs: ${check[0].with_upc}`);
console.log(`With Images: ${check[0].with_image}`);
