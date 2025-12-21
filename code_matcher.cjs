const fs = require('fs');
const { Pool } = require('pg');

function extractCode(name) {
  // Extract pattern like "GBN08", "Slv12", "Black26" etc
  const match = name.match(/([A-Za-z]+\d+)/);
  return match ? match[1].toUpperCase() : null;
}

function extractSize(name) {
  // Extract size pattern like "12", "26", "08"
  const match = name.match(/(\d+)['""]?\s*(collar|leash)?/i);
  return match ? match[1] : null;
}

async function main() {
  const allUpcs = JSON.parse(fs.readFileSync('all_upcs.json', 'utf8'));
  const excelUpcs = JSON.parse(fs.readFileSync('excel_upcs.json', 'utf8'));
  
  // Build code-to-UPC lookup for major brands
  const codeLookup = new Map();
  
  for (const e of [...allUpcs, ...excelUpcs]) {
    if (!e.upc || !e.name) continue;
    const code = extractCode(e.name);
    if (code && code.length >= 3) {
      if (!codeLookup.has(code)) codeLookup.set(code, []);
      codeLookup.get(code).push({ upc: e.upc, name: e.name });
    }
  }
  
  console.log(`Built ${codeLookup.size} code mappings`);
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT id, name, brand FROM supplies 
      WHERE (sku IS NULL OR sku = '') AND brand IN ('Coastal', 'Zoo Med', 'Kong', 'Nylabone', 'Exo Terra')
    `);
    
    console.log(`${result.rows.length} products to match`);
    
    let matched = 0;
    for (const row of result.rows) {
      const code = extractCode(row.name);
      const size = extractSize(row.name);
      
      if (!code) continue;
      
      const candidates = codeLookup.get(code) || [];
      
      // Find best match (prefer matching size)
      let best = null;
      for (const c of candidates) {
        const candSize = extractSize(c.name);
        if (size && candSize && size === candSize) {
          best = c;
          break;
        }
        if (!best) best = c;
      }
      
      if (best) {
        await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [best.upc, row.id]);
        matched++;
      }
    }
    
    console.log(`Matched ${matched} products by code`);
    
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
