const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Load UPC database (it's already an object: { upc: name })
const upcMap = JSON.parse(fs.readFileSync('/tmp/all_upcs.json', 'utf8'));

// Extract all numbers from a string (sizes, weights, wattages)
function extractNumbers(str) {
  const normalized = str.toLowerCase().replace(/[^\w\s.\/]/g, ' ');
  const nums = [];
  // Match patterns like 3oz, 15lb, 9W, 12x30, 5.5lb
  const regex = /(\d+\.?\d*)\s*([a-z]*)/g;
  let m;
  while ((m = regex.exec(normalized)) !== null) {
    if (m[1]) nums.push({ num: m[1], unit: m[2] || '' });
  }
  return nums;
}

// Critical animal/species words that must match
const criticalWords = [
  'dog', 'cat', 'puppy', 'kitten',
  'dubia', 'cricket', 'mealworm', 'waxworm',
  'snake', 'lizard', 'gecko', 'turtle', 'tortoise',
  'small', 'medium', 'large', 'mini', 'giant'
];

function extractCriticalWords(str) {
  const lower = str.toLowerCase();
  return criticalWords.filter(w => lower.includes(w));
}

// Strict validation
function validateMatch(productName, upcName) {
  if (!upcName) return { valid: false, reason: 'UPC not found in database' };
  
  const pLower = productName.toLowerCase();
  const uLower = upcName.toLowerCase();
  
  // Extract numbers from both
  const pNums = extractNumbers(productName);
  const uNums = extractNumbers(upcName);
  
  // Check key size/weight numbers
  for (const pn of pNums) {
    const numVal = parseFloat(pn.num);
    // Only check meaningful numbers with units
    if (pn.unit && numVal >= 1) {
      const found = uNums.some(un => un.num === pn.num);
      if (!found) {
        return { valid: false, reason: `Number ${pn.num}${pn.unit} not in UPC` };
      }
    }
  }
  
  // Check species conflicts
  const speciesConflicts = [
    ['dubia', 'cricket'],
    ['dog', 'cat'],
    ['snake', 'lizard']
  ];
  
  for (const [a, b] of speciesConflicts) {
    if (pLower.includes(a) && !pLower.includes(b) && uLower.includes(b) && !uLower.includes(a)) {
      return { valid: false, reason: `Species conflict: product="${a}", UPC="${b}"` };
    }
    if (pLower.includes(b) && !pLower.includes(a) && uLower.includes(a) && !uLower.includes(b)) {
      return { valid: false, reason: `Species conflict: product="${b}", UPC="${a}"` };
    }
  }
  
  return { valid: true };
}

async function audit() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, name, sku FROM supplies WHERE sku IS NOT NULL AND sku != ''
    `);
    
    console.log(`Auditing ${rows.length} products with SKUs...\n`);
    
    let badMatches = [];
    let goodMatches = 0;
    let notInDb = [];
    
    for (const row of rows) {
      const upcName = upcMap[row.sku];
      const result = validateMatch(row.name, upcName);
      
      if (!result.valid) {
        if (result.reason === 'UPC not found in database') {
          notInDb.push({ id: row.id, name: row.name, sku: row.sku });
        } else {
          badMatches.push({
            id: row.id,
            productName: row.name,
            sku: row.sku,
            upcName: upcName,
            reason: result.reason
          });
        }
      } else {
        goodMatches++;
      }
    }
    
    console.log(`Good matches: ${goodMatches}`);
    console.log(`Bad matches: ${badMatches.length}`);
    console.log(`SKUs not in UPC database: ${notInDb.length}`);
    
    console.log('\n=== BAD MATCHES (first 30) ===');
    badMatches.slice(0, 30).forEach(m => {
      console.log(`\nID ${m.id}: "${m.productName}"`);
      console.log(`  => UPC: "${m.upcName}"`);
      console.log(`  Reason: ${m.reason}`);
    });
    
    fs.writeFileSync('/tmp/bad_matches.json', JSON.stringify(badMatches, null, 2));
    fs.writeFileSync('/tmp/not_in_db.json', JSON.stringify(notInDb, null, 2));
    
    console.log(`\nLists saved to /tmp/bad_matches.json and /tmp/not_in_db.json`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

audit().catch(console.error);
