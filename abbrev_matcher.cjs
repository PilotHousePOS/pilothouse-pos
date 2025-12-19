const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upcDb = JSON.parse(fs.readFileSync('/tmp/master_upc_db.json', 'utf8'));

// Comprehensive abbreviation expansion (both ways)
const ABBREVS = {
  // Brands (multi-word first)
  'bl buf': 'blue buffalo', 'bluebuff': 'blue buffalo',
  'nutri sou': 'nutrisource', 'nutri sour': 'nutrisource',
  'tow': 'taste of the wild', 'anc': 'ancient',
  'zign': 'zignature', 'diam': 'diamond',
  'sd': 'science diet', 'rc': 'royal canin', 
  'nb': 'natural balance', 'wlns': 'wellness', 'wlln': 'wellness',
  'vict': 'victor', 'nulo': 'nulo', 'acn': 'acana', 'orij': 'orijen',
  'frm': 'fromm', 'can': 'canidae', 'mrck': 'merrick',
  'nutrisrc': 'nutrisource', 'nutri': 'nutrisource',
  'euk': 'eukanuba', 'iams': 'iams', 'prina': 'purina',
  'kng': 'kong', 'nyla': 'nylabone', 'bne': 'bone',
  'bl': 'blue', 'buf': 'buffalo', 'sou': 'source', 'sour': 'source',
  // Proteins
  'ck': 'chicken', 'chkn': 'chicken', 'bf': 'beef',
  'lam': 'lamb', 'slm': 'salmon', 'salm': 'salmon',
  'trky': 'turkey', 'turk': 'turkey', 'truk': 'turkey',
  'dk': 'duck', 'duc': 'duck', 'dck': 'duck',
  'whtfsh': 'whitefish', 'wh fish': 'whitefish', 'whfsh': 'whitefish',
  'vens': 'venison', 'vnson': 'venison', 'veni': 'venison',
  'pork': 'pork', 'tna': 'tuna', 'bcn': 'bacon', 'bacn': 'bacon',
  // Sizes
  'lg': 'large', 'lrg': 'large', 'md': 'medium', 'med': 'medium',
  'sm': 'small', 'sml': 'small', 'xlg': 'extra large',
  'lil': 'little', 'bts': 'bites', 'cnt': 'count', 'pb': 'peanut butter',
  // Food types
  'gr': 'grain', 'grn': 'grain', 'fr': 'free', 'frzn': 'frozen',
  'veg': 'vegetable', 'vegg': 'vegetable', 'ri': 'rice',
  // Age/breed
  'br': 'breed', 'pup': 'puppy', 'pyppu': 'puppy', 'kit': 'kitten', 
  'sen': 'senior', 'sr': 'senior', 'ad': 'adult',
  // General
  'nat': 'natural', 'natu': 'natural', 'he': 'healthy', 
  'wei': 'weight', 'weigh': 'weight', 'orig': 'original',
  'wld': 'wild', 'wild': 'wild', 'zssen': 'essentials',
  // Products/treats
  'stw': 'stew', 'bac': 'backyard', 'bbq': 'bbq', 'din': 'dinner',
  'praire': 'prairie', 'wetl': 'wetland', 'mount': 'mountain', 'strm': 'stream',
  'als': 'all stages', 'stg': 'stages',
  'chom': 'chompy', 'chomp': 'chompy', 'crisp': 'crisper', 'crispy': 'crisper',
  'tndr': 'tender', 'grill': 'grilled', 'frommb': 'frommbalaya',
  'tenderollies': 'tenderollies', 'crunchyos': 'crunchyos',
  'sizz': 'sizzlers', 'sizzler': 'sizzlers'
};

function expand(str) {
  let result = str.toLowerCase()
    .replace(/#/g, 'lb')  // Normalize # to lb
    .replace(/\s+/g, ' ')
    .trim();
  
  // Sort by length (longest first) to avoid partial replacements
  const sorted = Object.entries(ABBREVS).sort((a, b) => b[0].length - a[0].length);
  for (const [abbr, full] of sorted) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  return result.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Extract numbers with normalized units
function extractNums(str) {
  const norm = str.toLowerCase().replace(/#/g, 'lb');
  const nums = [];
  const regex = /(\d+\.?\d*)\s*(lb|lbs|oz|qt|gal|w|ct|pk)/gi;
  let m;
  while ((m = regex.exec(norm)) !== null) {
    nums.push(parseFloat(m[1]) + m[2].replace('lbs', 'lb').toLowerCase());
  }
  return nums;
}

// Check numbers match
function numsMatch(pNums, uNums) {
  if (pNums.length === 0) return true;
  for (const pn of pNums) {
    if (!uNums.some(un => un === pn)) return false;
  }
  return true;
}

// Word similarity with expansion
function similarity(prodExp, upcExp) {
  const pWords = prodExp.split(' ').filter(w => w.length > 1);
  const uWords = upcExp.split(' ').filter(w => w.length > 1);
  
  if (pWords.length === 0) return 0;
  
  let matches = 0;
  for (const pw of pWords) {
    if (uWords.includes(pw)) matches++;
    else if (uWords.some(uw => uw.includes(pw) || pw.includes(uw))) matches += 0.5;
  }
  return matches / pWords.length;
}

// Pre-expand all UPC entries
console.log('Expanding UPC database...');
const expandedUpcs = [];
for (const [upc, name] of Object.entries(upcDb)) {
  expandedUpcs.push({
    upc,
    name,
    expanded: expand(name),
    nums: extractNums(name)
  });
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
    let checked = 0;
    
    for (const row of rows) {
      const prodExp = expand(row.name);
      const prodNums = extractNums(row.name);
      
      let best = null;
      let bestScore = 0;
      
      for (const u of expandedUpcs) {
        // Numbers must match
        if (!numsMatch(prodNums, u.nums)) continue;
        
        const score = similarity(prodExp, u.expanded);
        if (score > bestScore && score >= 0.7) {
          bestScore = score;
          best = { upc: u.upc, name: u.name, score };
        }
      }
      
      if (best) {
        updates.push({ id: row.id, sku: best.upc, prodName: row.name, upcName: best.name, score: best.score });
      }
      
      checked++;
      if (checked % 500 === 0) process.stdout.write(`${checked}...`);
    }
    
    console.log(`\n\nFound ${updates.length} matches`);
    
    // Show samples by brand
    console.log('\n=== Sample matches ===');
    updates.slice(0, 30).forEach(u => {
      console.log(`"${u.prodName}" => "${u.upcName}" (${(u.score*100).toFixed(0)}%)`);
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
