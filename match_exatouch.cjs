const fs = require('fs');
const { Pool } = require('pg');

function normalize(s) {
  return (s || '').toLowerCase().replace(/['".,\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  // Load EXATOUCH UPCs
  const exatouch = JSON.parse(fs.readFileSync('exatouch_upcs.json', 'utf8'));
  console.log(`Loaded ${exatouch.length} EXATOUCH UPCs`);
  
  // Build lookup by normalized name
  const lookup = new Map();
  for (const e of exatouch) {
    const name = normalize(e.name);
    if (!lookup.has(name)) lookup.set(name, e.upc);
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Get existing UPCs to avoid duplicates
    const existing = await client.query(`SELECT DISTINCT sku FROM supplies WHERE sku IS NOT NULL AND sku != ''`);
    const usedUpcs = new Set(existing.rows.map(r => r.sku));
    console.log(`${usedUpcs.size} UPCs already in use`);
    
    // Get products without UPCs
    const result = await client.query(`SELECT id, name FROM supplies WHERE sku IS NULL OR sku = ''`);
    console.log(`${result.rows.length} products to match`);
    
    let matched = 0;
    for (const row of result.rows) {
      const name = normalize(row.name);
      const upc = lookup.get(name);
      
      if (upc && !usedUpcs.has(upc)) {
        await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [upc, row.id]);
        usedUpcs.add(upc);
        matched++;
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
