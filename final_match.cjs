const fs = require('fs');
const { Pool } = require('pg');

function normalize(s) {
  return (s || '').toLowerCase().replace(/['".,\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  // Load source UPCs (the good reference data)
  const sourceUpcs = JSON.parse(fs.readFileSync('source_upcs.json', 'utf8'));
  console.log(`Loaded ${sourceUpcs.length} source UPCs`);
  
  // Build lookup by normalized name
  const lookup = new Map();
  for (const e of sourceUpcs) {
    if (!e.upc || e.upc.length < 10) continue;
    const name = normalize(e.name);
    if (!lookup.has(name)) lookup.set(name, e.upc);
  }
  console.log(`Built ${lookup.size} unique name lookups`);
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Clear all current UPCs and start fresh
    await client.query(`UPDATE supplies SET sku = NULL`);
    console.log('Cleared all UPCs');
    
    // Get all products
    const result = await client.query(`SELECT id, name, brand FROM supplies ORDER BY id`);
    console.log(`${result.rows.length} products to match`);
    
    let matched = 0;
    const usedUpcs = new Set();
    
    for (const row of result.rows) {
      const name = normalize(row.name);
      
      // Try exact match
      if (lookup.has(name) && !usedUpcs.has(lookup.get(name))) {
        const upc = lookup.get(name);
        await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [upc, row.id]);
        usedUpcs.add(upc);
        matched++;
        continue;
      }
      
      // Try without brand
      if (row.brand) {
        const withoutBrand = normalize(row.name.replace(new RegExp(row.brand, 'i'), '')).trim();
        if (lookup.has(withoutBrand) && !usedUpcs.has(lookup.get(withoutBrand))) {
          const upc = lookup.get(withoutBrand);
          await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [upc, row.id]);
          usedUpcs.add(upc);
          matched++;
        }
      }
    }
    
    console.log(`Matched ${matched} products`);
    
    const final = await client.query(`
      SELECT COUNT(*) as total, COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc
      FROM supplies
    `);
    console.log(`Coverage: ${(final.rows[0].with_upc / final.rows[0].total * 100).toFixed(1)}%`);
    
  } finally {
    client.release();
    pool.end();
  }
}

main().catch(console.error);
