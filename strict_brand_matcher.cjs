const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upcDb = JSON.parse(fs.readFileSync('/tmp/master_upc_db.json', 'utf8'));

// Known brands for matching
const BRANDS = [
  'zoomed', 'zoo med', 'exoterra', 'exo terra', 'zilla', 'flukers', 'repti',
  'kaytee', 'oxbow', 'vitakraft', 'living world',
  'aqueon', 'marina', 'fluval', 'tetra', 'api', 'hikari', 'seachem', 'penn plax',
  'kong', 'nylabone', 'benebone', 'mammoth', 'rascals', 'multipet',
  'coastal', 'hamilton', 'valhoma', 'weaver',
  'blue buffalo', 'purina', 'pro plan', 'science diet', 'royal canin', 'iams',
  'fromm', 'orijen', 'acana', 'taste of the wild', 'victor', 'diamond',
  'natural balance', 'wellness', 'nutro', 'merrick', 'canidae', 'zignature',
  'fancy feast', 'friskies', 'meow mix', '9 lives',
  'arm & hammer', 'fresh step', 'tidy cats', 'world best',
  'freshpet', 'stella', 'primal', 'instinct', 'nulo', 'open farm'
];

function extractBrand(name) {
  const lower = name.toLowerCase();
  for (const b of BRANDS) {
    if (lower.startsWith(b) || lower.includes(b + ' ')) return b;
  }
  // Use first word as brand
  return lower.split(/\s+/)[0].replace(/[^\w]/g, '');
}

function extractNumbers(str) {
  const matches = str.toLowerCase().match(/(\d+\.?\d*)\s*(lb|lbs|oz|#|qt|gal|w|ct|pk|in|cm|mm)/gi) || [];
  return matches.map(m => m.replace('#', 'lb').replace('lbs', 'lb').replace(/\s/g, '').toLowerCase());
}

function normalize(str) {
  return str.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Build brand-indexed lookup
const brandLookup = {};
for (const [upc, name] of Object.entries(upcDb)) {
  const brand = extractBrand(name);
  if (!brandLookup[brand]) brandLookup[brand] = [];
  brandLookup[brand].push({ upc, name, nums: extractNumbers(name), norm: normalize(name) });
}

function findMatch(productName) {
  const brand = extractBrand(productName);
  const prodNums = extractNumbers(productName);
  const prodNorm = normalize(productName);
  const prodWords = prodNorm.split(' ').filter(w => w.length > 2);
  
  const candidates = brandLookup[brand] || [];
  if (candidates.length === 0) return null;
  
  let best = null;
  let bestScore = 0;
  
  for (const c of candidates) {
    // If product has numbers, UPC must have matching numbers
    if (prodNums.length > 0) {
      let numMatch = true;
      for (const pn of prodNums) {
        if (!c.nums.includes(pn)) {
          numMatch = false;
          break;
        }
      }
      if (!numMatch) continue;
    }
    
    // Calculate word similarity
    const upcWords = c.norm.split(' ').filter(w => w.length > 2);
    let matches = 0;
    for (const pw of prodWords) {
      if (upcWords.includes(pw)) matches++;
    }
    const score = prodWords.length > 0 ? matches / prodWords.length : 0;
    
    if (score > bestScore && score >= 0.6) {
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
    
    const updates = [];
    for (const row of rows) {
      const match = findMatch(row.name);
      if (match && match.score >= 0.7) {
        updates.push({ id: row.id, sku: match.upc, name: row.name, upcName: match.name });
      }
    }
    
    console.log(`Found ${updates.length} strict matches`);
    
    // Sample
    console.log('\nSample matches:');
    updates.slice(0, 20).forEach(u => {
      console.log(`"${u.name}" => "${u.upcName}"`);
    });
    
    // Apply
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
