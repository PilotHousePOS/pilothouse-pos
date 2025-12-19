const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upcMap = JSON.parse(fs.readFileSync('/tmp/all_upcs.json', 'utf8'));

// Normalize for comparison
function normalize(str) {
  return str.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract all numbers with units
function extractNumbersWithUnits(str) {
  const norm = normalize(str);
  const patterns = [];
  
  // Dimension pattern: 12x30
  const dimRegex = /(\d+)\s*x\s*(\d+)/g;
  let m;
  while ((m = dimRegex.exec(norm)) !== null) {
    patterns.push(`${m[1]}x${m[2]}`);
  }
  
  // Weight/size with unit: 15lb, 3oz, 9w
  const unitRegex = /(\d+\.?\d*)\s*(lb|oz|lbs|kg|g|gal|ct|pk|w|ml|l)\b/g;
  while ((m = unitRegex.exec(norm)) !== null) {
    patterns.push(`${m[1]}${m[2]}`);
  }
  
  // Stand-alone significant numbers with pound sign: 4#, 25#
  const poundRegex = /(\d+)\s*#/g;
  while ((m = poundRegex.exec(norm)) !== null) {
    patterns.push(`${m[1]}lb`);  // Normalize # to lb
  }
  
  return [...new Set(patterns)];
}

// Check if product and UPC name have compatible numbers
function numbersMatch(productName, upcName) {
  const pNums = extractNumbersWithUnits(productName);
  const uNums = extractNumbersWithUnits(upcName);
  
  if (pNums.length === 0) return true; // No numbers to check
  
  // For strict matching, every number in product must be in UPC
  for (const pn of pNums) {
    if (!uNums.includes(pn)) {
      return false;
    }
  }
  return true;
}

// Get normalized words for comparison
function getWords(str) {
  return normalize(str).split(' ').filter(w => w.length > 2);
}

// Calculate similarity score
function similarity(a, b) {
  const wordsA = getWords(a);
  const wordsB = getWords(b);
  
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.includes(w)) matches++;
  }
  
  return wordsA.length > 0 ? matches / wordsA.length : 0;
}

// Find best UPC match for a product
function findBestMatch(productName) {
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [upc, upcName] of Object.entries(upcMap)) {
    // Must pass number check first
    if (!numbersMatch(productName, upcName)) continue;
    
    const score = similarity(productName, upcName);
    if (score > bestScore && score >= 0.6) {  // At least 60% word match
      bestScore = score;
      bestMatch = { upc, upcName, score };
    }
  }
  
  return bestMatch;
}

async function match() {
  const client = await pool.connect();
  try {
    // Get products without SKUs
    const { rows } = await client.query(`
      SELECT id, name FROM supplies 
      WHERE (sku IS NULL OR sku = '') AND name IS NOT NULL
      LIMIT 1000
    `);
    
    console.log(`Checking ${rows.length} products for strict matches...\n`);
    
    let matched = 0;
    let updates = [];
    
    for (const row of rows) {
      const match = findBestMatch(row.name);
      if (match && match.score >= 0.7) {  // Only high confidence
        updates.push({ id: row.id, sku: match.upc });
        console.log(`Match: "${row.name}"`);
        console.log(`  => "${match.upcName}" (score: ${match.score.toFixed(2)})`);
        matched++;
      }
    }
    
    console.log(`\nFound ${matched} high-confidence matches`);
    
    if (updates.length > 0) {
      for (const u of updates) {
        await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [u.sku, u.id]);
      }
      console.log(`Applied ${updates.length} updates`);
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

match().catch(console.error);
