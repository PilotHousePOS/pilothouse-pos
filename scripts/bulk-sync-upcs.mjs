import fs from 'fs';
import { neon } from "@neondatabase/serverless";

const prodData = JSON.parse(fs.readFileSync('attached_assets/supplies-export-1766779071052_1766781324492.json', 'utf8'));
const prodProducts = prodData.data.supplies;

const sql = neon(process.env.DATABASE_URL);

// Build array of [id, sku] pairs - only those with UPCs
const withUpcs = prodProducts.filter(p => p.sku && p.sku.length >= 10);
const withoutUpcs = prodProducts.filter(p => !p.sku || p.sku.length < 10);

console.log(`Products with UPCs: ${withUpcs.length}`);
console.log(`Products without UPCs: ${withoutUpcs.length}`);

// Use unnest for efficient bulk update
const query = `
  UPDATE supplies s 
  SET sku = v.sku 
  FROM (SELECT unnest($1::int[]) as id, unnest($2::text[]) as sku) v 
  WHERE s.id = v.id
`;

const ids = withUpcs.map(u => u.id);
const skus = withUpcs.map(u => u.sku);

const result = await sql(query, [ids, skus]);
console.log(`Updated products with UPCs`);

// Clear UPCs for products without them in production
if (withoutUpcs.length > 0) {
  const clearIds = withoutUpcs.map(u => u.id);
  await sql`UPDATE supplies SET sku = NULL WHERE id = ANY(${clearIds}::int[])`;
  console.log(`Cleared ${clearIds.length} products without UPCs`);
}

console.log('Sync complete!');
