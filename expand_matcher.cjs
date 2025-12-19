const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upcDb = JSON.parse(fs.readFileSync('/tmp/master_upc_db.json', 'utf8'));

// Comprehensive abbreviation expansion
const ABBREVS = {
  // Proteins
  'ck': 'chicken', 'chkn': 'chicken', 'bf': 'beef', 'lam': 'lamb',
  'slm': 'salmon', 'salm': 'salmon', 'trky': 'turkey', 'turk': 'turkey',
  'dk': 'duck', 'duc': 'duck', 'vens': 'venison', 'vnson': 'venison',
  'whtfsh': 'whitefish', 'whfsh': 'whitefish', 'tna': 'tuna',
  // Sizes
  'lg': 'large', 'lrg': 'large', 'md': 'medium', 'med': 'medium',
  'sm': 'small', 'sml': 'small', 'xlg': 'xlarge', 'xl': 'xlarge',
  'xs': 'xsmall', 'xsm': 'xsmall', 'jmb': 'jumbo', 'gnt': 'giant',
  // Food
  'gr': 'grain', 'grn': 'grain', 'fr': 'free', 'frzn': 'frozen', 'frz': 'frozen',
  'veg': 'vegetable', 'vegg': 'vegetable',
  // Age
  'pup': 'puppy', 'kit': 'kitten', 'sr': 'senior', 'ad': 'adult', 'juv': 'juvenile',
  'br': 'breed',
  // General
  'nat': 'natural', 'natu': 'natural', 'pk': 'pack', 'ct': 'count',
  'cmfrt': 'comfort', 'essen': 'essentials', 'asst': 'assorted',
  // Brands - common abbreviations in UPC data
  'bl buf': 'bluebuffalo', 'bl wld': 'bluewilderness',
  'n-bne': 'nylabone', 'kng': 'kong', 'bne': 'bone',
  'frm': 'fromm', 'zig': 'zignature', 'zign': 'zignature',
  'acn': 'acana', 'orij': 'orijen',
  // Units normalization
  '#': 'lb'
};

function expand(str) {
  let result = str.toLowerCase().replace(/#/g, 'lb');
  for (const [abbr, full] of Object.entries(ABBREVS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  return result.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Extract numbers with normalized units
function extractNums(str) {
  const norm = str.toLowerCase().replace(/#/g, 'lb');
  const nums = [];
  const regex = /(\d+\.?\d*)\s*(lb|lbs|oz|qt|gal|w|ct|pk|in|cm|mm|g|kg|ml|l)/gi;
  let m;
  while ((m = regex.exec(norm)) !== null) {
    nums.push(m[1] + m[2].replace('lbs', 'lb'));
  }
  return nums;
}

// Check numbers match
function numsMatch(p, u) {
  const pNums = extractNums(p);
  const uNums = extractNums(u);
  if (pNums.length === 0) return true;
  for (const pn of pNums) {
    if (!uNums.includes(pn)) return false;
  }
  return true;
}

// Word similarity with expansion
function similarity(prod, upc) {
  const pWords = expand(prod).split(' ').filter(w => w.length > 1);
  const uWords = expand(upc).split(' ').filter(w => w.length > 1);
  
  if (pWords.length === 0) return 0;
  
  let matches = 0;
  for (const pw of pWords) {
    if (uWords.some(uw => uw === pw || (pw.length >= 4 && uw.includes(pw)) || (uw.length >= 4 && pw.includes(uw)))) {
      matches++;
    }
  }
  return matches / pWords.length;
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, name FROM supplies 
      WHERE (sku IS NULL OR sku = '') AND name IS NOT NULL
    `);
    
    console.log(`Processing ${rows.length} products with expanded matching...\n`);
    
    const updates = [];
    let checked = 0;
    
    for (const row of rows) {
      let best = null;
      let bestScore = 0;
      
      for (const [upc, upcName] of Object.entries(upcDb)) {
        // Numbers must match
        if (!numsMatch(row.name, upcName)) continue;
        
        const score = similarity(row.name, upcName);
        if (score > bestScore && score >= 0.75) {
          bestScore = score;
          best = { upc, upcName, score };
        }
      }
      
      if (best) {
        updates.push({ id: row.id, sku: best.upc, name: row.name, upcName: best.upcName, score: best.score });
      }
      
      checked++;
      if (checked % 500 === 0) process.stdout.write(`${checked}...`);
    }
    
    console.log(`\n\nFound ${updates.length} matches`);
    console.log('\nSample (first 20):');
    updates.slice(0, 20).forEach(u => console.log(`"${u.name}" => "${u.upcName}" (${(u.score*100).toFixed(0)}%)`));
    
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
