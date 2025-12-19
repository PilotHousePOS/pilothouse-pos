const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upcDb = JSON.parse(fs.readFileSync('/tmp/master_upc_db.json', 'utf8'));

// Normalize for matching
function normalize(str) {
  return str.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Check if string has numbers with units
function hasNumbersWithUnits(str) {
  return /\d+\s*(lb|lbs|oz|#|qt|gal|w|ct|pk|in|cm|mm|g|kg|ml|l)/i.test(str);
}

// Calculate similarity for simple products (no numbers)
function similarity(a, b) {
  const wordsA = normalize(a).split(' ').filter(w => w.length > 1);
  const wordsB = normalize(b).split(' ').filter(w => w.length > 1);
  
  if (wordsA.length === 0) return 0;
  
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.includes(w)) matches++;
  }
  return matches / wordsA.length;
}

// Build lookup by first word
const lookup = {};
for (const [upc, name] of Object.entries(upcDb)) {
  const first = normalize(name).split(' ')[0];
  if (!lookup[first]) lookup[first] = [];
  lookup[first].push({ upc, name });
}

async function run() {
  const client = await pool.connect();
  try {
    // Get products without SKUs that DON'T have numbers with units
    const { rows } = await client.query(`
      SELECT id, name FROM supplies 
      WHERE (sku IS NULL OR sku = '') AND name IS NOT NULL
    `);
    
    // Filter to simple products
    const simple = rows.filter(r => !hasNumbersWithUnits(r.name));
    console.log(`Found ${simple.length} simple products (no size/weight)\n`);
    
    const updates = [];
    for (const row of simple) {
      const first = normalize(row.name).split(' ')[0];
      const candidates = lookup[first] || [];
      
      let best = null;
      let bestScore = 0;
      
      for (const c of candidates) {
        // Skip UPCs with numbers if product has none
        if (hasNumbersWithUnits(c.name)) continue;
        
        const score = similarity(row.name, c.name);
        if (score > bestScore && score >= 0.8) {
          bestScore = score;
          best = { upc: c.upc, name: c.name, score };
        }
      }
      
      if (best) {
        updates.push({ id: row.id, sku: best.upc, name: row.name, upcName: best.name });
      }
    }
    
    console.log(`Found ${updates.length} matches for simple products`);
    console.log('\nSample:');
    updates.slice(0, 15).forEach(u => console.log(`"${u.name}" => "${u.upcName}"`));
    
    for (const u of updates) {
      await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [u.sku, u.id]);
    }
    
    const { rows: final } = await client.query('SELECT COUNT(*) as total, COUNT(sku) as with_sku FROM supplies');
    console.log(`\nResult: ${final[0].with_sku}/${final[0].total} (${(final[0].with_sku/final[0].total*100).toFixed(1)}%)`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
