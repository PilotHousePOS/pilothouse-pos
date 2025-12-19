const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upcDb = JSON.parse(fs.readFileSync('/tmp/master_upc_db.json', 'utf8'));

// Build index by first word (brand)
const brandIndex = {};
for (const [upc, name] of Object.entries(upcDb)) {
  const firstWord = name.toLowerCase().split(/\s+/)[0].replace(/[^\w]/g, '');
  if (!brandIndex[firstWord]) brandIndex[firstWord] = [];
  brandIndex[firstWord].push({ upc, name });
}

console.log(`Indexed ${Object.keys(upcDb).length} UPCs into ${Object.keys(brandIndex).length} brands\n`);

function normalize(str) {
  return str.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Quick match by brand + similarity
function findMatch(productName) {
  const norm = normalize(productName);
  const firstWord = norm.split(' ')[0];
  
  // Get candidates from same brand
  let candidates = brandIndex[firstWord] || [];
  
  // Also try common brand variations
  const brandVariations = {
    'zoomed': 'zoo', 'zooemed': 'zoo', 'zoo': 'zoomed',
    'exoterra': 'exo', 'exo': 'exoterra',
    'fluval': 'fluv', 'fluv': 'fluval',
    'kaytee': 'kay', 'kay': 'kaytee',
    'marineland': 'marina', 'marina': 'marineland'
  };
  
  if (brandVariations[firstWord]) {
    candidates = [...candidates, ...(brandIndex[brandVariations[firstWord]] || [])];
  }
  
  if (candidates.length === 0) return null;
  
  // Find best match among candidates
  const prodWords = norm.split(' ').filter(w => w.length > 1);
  let best = null;
  let bestScore = 0;
  
  for (const c of candidates) {
    const upcNorm = normalize(c.name);
    const upcWords = upcNorm.split(' ').filter(w => w.length > 1);
    
    let matches = 0;
    for (const pw of prodWords) {
      if (upcWords.some(uw => uw === pw || uw.includes(pw) || pw.includes(uw))) {
        matches++;
      }
    }
    
    const score = prodWords.length > 0 ? matches / prodWords.length : 0;
    if (score > bestScore && score >= 0.7) {
      bestScore = score;
      best = { upc: c.upc, name: c.name, score };
    }
  }
  
  return best;
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, name FROM supplies 
      WHERE (sku IS NULL OR sku = '') AND name IS NOT NULL
    `);
    
    console.log(`Processing ${rows.length} products...\n`);
    
    let matched = 0;
    const updates = [];
    
    for (const row of rows) {
      const match = findMatch(row.name);
      if (match && match.score >= 0.75) {
        updates.push({ id: row.id, sku: match.upc });
        matched++;
      }
    }
    
    console.log(`Found ${matched} matches, applying...`);
    
    for (const u of updates) {
      await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [u.sku, u.id]);
    }
    
    const { rows: final } = await client.query('SELECT COUNT(*) as total, COUNT(sku) as with_sku FROM supplies');
    console.log(`\nResult: ${final[0].with_sku}/${final[0].total} have SKUs (${(final[0].with_sku/final[0].total*100).toFixed(1)}%)`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
