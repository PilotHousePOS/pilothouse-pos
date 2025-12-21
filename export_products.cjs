const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Get all products without UPC
  const { rows } = await pool.query(`
    SELECT id, name, brand FROM supplies WHERE sku IS NULL OR sku = ''
  `);
  
  fs.writeFileSync('./products_no_upc.json', JSON.stringify(rows));
  console.log(`Exported ${rows.length} products to products_no_upc.json`);
  await pool.end();
}

main().catch(console.error);
