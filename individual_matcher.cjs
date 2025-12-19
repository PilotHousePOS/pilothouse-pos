const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upcDb = JSON.parse(fs.readFileSync('/tmp/master_upc_db.json', 'utf8'));

console.log(`Loaded ${Object.keys(upcDb).length} UPCs from master database\n`);

// Abbreviation mappings (comprehensive)
const ABBREVS = {
  // Proteins
  'ck': 'chicken', 'chkn': 'chicken', 'chick': 'chicken',
  'bf': 'beef', 'lam': 'lamb', 'slm': 'salmon', 'salm': 'salmon',
  'trky': 'turkey', 'turk': 'turkey', 'dk': 'duck', 'vens': 'venison',
  'whtfsh': 'whitefish', 'wh fish': 'whitefish', 'whfsh': 'whitefish',
  // Sizes
  'lg': 'large', 'lrg': 'large', 'md': 'medium', 'med': 'medium',
  'sm': 'small', 'sml': 'small', 'xlg': 'extra large', 'xl': 'extra large',
  'xs': 'extra small', 'xsm': 'extra small', 'jmb': 'jumbo', 'jumb': 'jumbo',
  // Food types
  'gr': 'grain', 'grn': 'grain', 'fr': 'free', 'frzn': 'frozen', 'frz': 'frozen',
  'veg': 'vegetable', 'vegg': 'vegetable', 'vegi': 'vegetable',
  // Age/breed
  'br': 'breed', 'pup': 'puppy', 'kit': 'kitten', 'sr': 'senior', 'ad': 'adult',
  // General
  'nat': 'natural', 'natu': 'natural', 'pk': 'pack', 'ct': 'count',
  'cmfrt': 'comfort', 'comf': 'comfort', 'essen': 'essentials',
  // Colors
  'blk': 'black', 'wht': 'white', 'blu': 'blue', 'grn': 'green', 'rd': 'red',
  'brn': 'brown', 'brwn': 'brown', 'pnk': 'pink', 'prpl': 'purple',
  // Brands
  'bl buf': 'blue buffalo', 'bl wld': 'blue wilderness', 'n-bne': 'nylabone',
  'kng': 'kong', 'acana': 'acana', 'orij': 'orijen'
};

function expandAbbrevs(str) {
  let result = str.toLowerCase();
  // Sort by length (longest first) to avoid partial replacements
  const sorted = Object.entries(ABBREVS).sort((a, b) => b[0].length - a[0].length);
  for (const [abbr, full] of sorted) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  return result;
}

function normalize(str) {
  return expandAbbrevs(str)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Extract key identifiers: size, weight, dimensions
function extractIdentifiers(str) {
  const norm = str.toLowerCase();
  const ids = new Set();
  
  // Dimensions: 12x30
  const dimMatch = norm.match(/(\d+)\s*x\s*(\d+)/g);
  if (dimMatch) dimMatch.forEach(m => ids.add(m.replace(/\s/g, '')));
  
  // Weights with # sign: 4#, 25#
  const poundMatch = norm.match(/(\d+\.?\d*)\s*#/g);
  if (poundMatch) poundMatch.forEach(m => ids.add(m.replace('#', 'lb').replace(/\s/g, '')));
  
  // Standard units: 15lb, 3oz, 8qt, 5gal
  const unitMatch = norm.match(/(\d+\.?\d*)\s*(lb|lbs|oz|qt|gal|kg|g|ml|l|w|ct|pk)\b/gi);
  if (unitMatch) unitMatch.forEach(m => ids.add(m.replace(/\s/g, '').toLowerCase()));
  
  // Inches: 10", 18"
  const inchMatch = norm.match(/(\d+\.?\d*)\s*["'']/g);
  if (inchMatch) inchMatch.forEach(m => ids.add(m.replace(/["'']/g, 'in').replace(/\s/g, '')));
  
  return Array.from(ids);
}

// Check if identifiers are compatible
function identifiersCompatible(productIds, upcIds) {
  if (productIds.length === 0) return true;
  
  // Normalize for comparison
  const normPids = productIds.map(p => p.replace('lbs', 'lb'));
  const normUids = upcIds.map(u => u.replace('lbs', 'lb'));
  
  for (const pid of normPids) {
    // Check if this identifier exists in UPC identifiers
    const hasMatch = normUids.some(uid => {
      // Extract numeric value and unit
      const pMatch = pid.match(/^(\d+\.?\d*)(.*)$/);
      const uMatch = uid.match(/^(\d+\.?\d*)(.*)$/);
      if (!pMatch || !uMatch) return pid === uid;
      
      const pNum = parseFloat(pMatch[1]);
      const pUnit = pMatch[2];
      const uNum = parseFloat(uMatch[1]);
      const uUnit = uMatch[2];
      
      // Units must match or be compatible
      if (pUnit !== uUnit) return false;
      // Numbers must match exactly for accuracy
      return pNum === uNum;
    });
    
    if (!hasMatch) return false;
  }
  return true;
}

// Get normalized words
function getWords(str) {
  return normalize(str).split(' ').filter(w => w.length > 1);
}

// Calculate word overlap score
function wordOverlap(productWords, upcWords) {
  if (productWords.length === 0) return 0;
  
  let matches = 0;
  for (const pw of productWords) {
    if (upcWords.includes(pw)) {
      matches++;
    } else {
      // Check for partial matches (brand names may be slightly different)
      const partial = upcWords.some(uw => 
        (uw.length >= 4 && pw.includes(uw)) || 
        (pw.length >= 4 && uw.includes(pw))
      );
      if (partial) matches += 0.5;
    }
  }
  
  return matches / productWords.length;
}

// Find best match for a product
function findBestMatch(productName) {
  const productWords = getWords(productName);
  const productIds = extractIdentifiers(productName);
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [upc, upcName] of Object.entries(upcDb)) {
    const upcWords = getWords(upcName);
    const upcIds = extractIdentifiers(upcName);
    
    // STRICT: identifiers must be compatible
    if (!identifiersCompatible(productIds, upcIds)) continue;
    
    // Calculate word overlap
    const score = wordOverlap(productWords, upcWords);
    
    if (score > bestScore && score >= 0.65) {
      bestScore = score;
      bestMatch = { upc, upcName, score };
    }
  }
  
  return bestMatch;
}

async function matchAll() {
  const client = await pool.connect();
  try {
    // Get all products without SKUs
    const { rows } = await client.query(`
      SELECT id, name, brand FROM supplies 
      WHERE (sku IS NULL OR sku = '') AND name IS NOT NULL
      ORDER BY id
    `);
    
    console.log(`Scanning ${rows.length} products individually...\n`);
    
    const matches = [];
    let noMatch = 0;
    
    for (const row of rows) {
      const match = findBestMatch(row.name);
      if (match && match.score >= 0.75) {
        matches.push({
          id: row.id,
          productName: row.name,
          upc: match.upc,
          upcName: match.upcName,
          score: match.score
        });
      } else {
        noMatch++;
      }
    }
    
    console.log(`\n=== RESULTS ===`);
    console.log(`High-confidence matches (>=75%): ${matches.length}`);
    console.log(`No match found: ${noMatch}`);
    
    // Show sample matches
    console.log('\n=== SAMPLE MATCHES (first 40) ===');
    matches.slice(0, 40).forEach(m => {
      console.log(`\n"${m.productName}"`);
      console.log(`  => "${m.upcName}" (${(m.score*100).toFixed(0)}%)`);
    });
    
    // Apply matches
    if (matches.length > 0) {
      console.log(`\nApplying ${matches.length} matches...`);
      for (const m of matches) {
        await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [m.upc, m.id]);
      }
      console.log('Done!');
    }
    
    // Save for review
    fs.writeFileSync('/tmp/applied_matches.json', JSON.stringify(matches, null, 2));
    
    // Check final count
    const { rows: final } = await client.query('SELECT COUNT(*) as total, COUNT(sku) as with_sku FROM supplies');
    console.log(`\nFinal: ${final[0].with_sku}/${final[0].total} products have SKUs (${(final[0].with_sku/final[0].total*100).toFixed(1)}%)`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

matchAll().catch(console.error);
