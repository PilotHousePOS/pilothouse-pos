const fs = require('fs');
const { Pool } = require('pg');

function normalize(name) {
  return (name || '')
    .toLowerCase()
    .replace(/['".,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function matchBrand(brandName, prefix) {
  // Load all sources
  const allUpcs = JSON.parse(fs.readFileSync('all_upcs.json', 'utf8'));
  const excelUpcs = JSON.parse(fs.readFileSync('excel_upcs.json', 'utf8'));
  
  // Filter by brand prefix
  const brandUpcs = [...allUpcs, ...excelUpcs].filter(e => 
    e.upc && e.upc.startsWith(prefix) && e.name
  );
  
  console.log(`Found ${brandUpcs.length} ${brandName} UPCs with prefix ${prefix}`);
  
  // Build lookup
  const lookup = new Map();
  for (const e of brandUpcs) {
    const name = normalize(e.name);
    if (!lookup.has(name)) lookup.set(name, e.upc);
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Get missing products for this brand
    const result = await client.query(`
      SELECT id, name FROM supplies 
      WHERE (sku IS NULL OR sku = '') AND brand = $1
    `, [brandName]);
    
    console.log(`${result.rows.length} ${brandName} products missing UPCs`);
    
    let matched = 0;
    for (const row of result.rows) {
      const name = normalize(row.name);
      const withoutBrand = normalize(row.name.replace(new RegExp(brandName, 'i'), '').trim());
      
      let upc = lookup.get(name) || lookup.get(withoutBrand);
      
      if (upc) {
        await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [upc, row.id]);
        matched++;
      }
    }
    
    console.log(`Matched ${matched} ${brandName} products`);
    return matched;
  } finally {
    client.release();
    pool.end();
  }
}

// Match major brands
async function main() {
  const brands = [
    ['Coastal', '076484'],
    ['Zoo Med', '097612'],
    ['Kong', '035585'],
    ['Zilla', '096316'],
    ['Exo Terra', '015561'],
    ['Fluval', '015561'],
    ['Nylabone', '018214'],
    ['Kaytee', '071859'],
  ];
  
  let total = 0;
  for (const [brand, prefix] of brands) {
    try {
      const matched = await matchBrand(brand, prefix);
      total += matched;
    } catch (e) {
      console.log(`Error with ${brand}: ${e.message}`);
    }
  }
  
  console.log(`\nTotal matched: ${total}`);
}

main().catch(console.error);
