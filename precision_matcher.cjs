const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Load maybe inventory (clean names) as PRIMARY source
const maybeLines = fs.readFileSync('.local/state/memory/inventory_maybe_upcs.txt', 'utf8')
  .split('\n').filter(l => l.trim());

const upcDb = {};
for (const line of maybeLines) {
  const parts = line.split('|');
  if (parts.length >= 2) {
    const upc = parts[0].trim();
    const name = parts[1].trim();
    if (upc.match(/^\d+$/) && name) {
      upcDb[upc] = name;
    }
  }
}
console.log(`Loaded ${Object.keys(upcDb).length} UPCs from maybe inventory`);

// Abbreviation mappings (from abbreviationExpansion.ts)
const ABBREVS = {
  'ck': 'chicken', 'lam': 'lamb', 'bf': 'beef', 'slm': 'salmon', 'trky': 'turkey',
  'lg': 'large', 'md': 'medium', 'sm': 'small', 'xlg': 'extra large', 'xs': 'extra small',
  'gr': 'grain', 'fr': 'free', 'nat': 'natural', 'pk': 'pack', 'ct': 'count',
  'brn': 'brown', 'blk': 'black', 'wht': 'white', 'blu': 'blue', 'grn': 'green',
  'frzn': 'frozen', 'frz': 'frozen', 'veg': 'vegetable', 'br': 'breed',
  'pup': 'puppy', 'kit': 'kitten', 'sr': 'senior', 'ad': 'adult'
};

function expandAbbrevs(str) {
  let result = str.toLowerCase();
  for (const [abbr, full] of Object.entries(ABBREVS)) {
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

// Extract key identifiers: size, weight, model numbers
function extractIdentifiers(str) {
  const norm = str.toLowerCase();
  const ids = [];
  
  // Dimensions: 12x30, 18x36
  const dimMatch = norm.match(/(\d+)\s*x\s*(\d+)/g);
  if (dimMatch) ids.push(...dimMatch.map(m => m.replace(/\s/g, '')));
  
  // Weights: 15lb, 4#, 3.5oz, 8qt
  const weightMatch = norm.match(/(\d+\.?\d*)\s*(lb|lbs|#|oz|qt|gal|kg|g|ml|l|w|ct|pk)\b/gi);
  if (weightMatch) {
    weightMatch.forEach(w => {
      let normalized = w.replace(/\s/g, '').toLowerCase();
      normalized = normalized.replace('#', 'lb');  // Normalize # to lb
      ids.push(normalized);
    });
  }
  
  // Inches: 10", 18"
  const inchMatch = norm.match(/(\d+\.?\d*)\s*["'']/g);
  if (inchMatch) {
    inchMatch.forEach(i => {
      ids.push(i.replace(/\s/g, '').replace(/["'']/g, 'in'));
    });
  }
  
  // Model numbers: AC50, AC70, 206/306
  const modelMatch = norm.match(/\b(ac\d+|[a-z]{1,3}\d{2,4})\b/gi);
  if (modelMatch) ids.push(...modelMatch.map(m => m.toLowerCase()));
  
  return ids;
}

// Check if identifiers match (all product IDs must be in UPC IDs)
function identifiersMatch(productIds, upcIds) {
  if (productIds.length === 0) return true;
  
  for (const pid of productIds) {
    // Check exact match or close match
    if (!upcIds.some(uid => uid === pid || 
        (pid.includes('lb') && uid.includes('lb') && pid === uid) ||
        (pid.includes('oz') && uid.includes('oz') && pid === uid))) {
      return false;
    }
  }
  return true;
}

// Calculate word similarity
function wordSimilarity(a, b) {
  const wordsA = normalize(a).split(' ').filter(w => w.length > 1);
  const wordsB = normalize(b).split(' ').filter(w => w.length > 1);
  
  if (wordsA.length === 0) return 0;
  
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.some(wb => wb === w || wb.includes(w) || w.includes(wb))) {
      matches++;
    }
  }
  
  return matches / wordsA.length;
}

// Find best match for a product
function findBestMatch(productName) {
  const productIds = extractIdentifiers(productName);
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [upc, upcName] of Object.entries(upcDb)) {
    const upcIds = extractIdentifiers(upcName);
    
    // First check: identifiers must match
    if (!identifiersMatch(productIds, upcIds)) continue;
    
    // Calculate word similarity
    const score = wordSimilarity(productName, upcName);
    
    if (score > bestScore && score >= 0.7) {  // At least 70% word match
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
      ORDER BY id
    `);
    
    console.log(`\nScanning ${rows.length} products individually for matches...\n`);
    
    let matched = 0;
    let updates = [];
    
    for (const row of rows) {
      const match = findBestMatch(row.name);
      if (match && match.score >= 0.75) {  // High confidence only
        updates.push({ id: row.id, sku: match.upc, name: row.name, upcName: match.upcName, score: match.score });
        console.log(`[MATCH] "${row.name}"`);
        console.log(`     => "${match.upcName}" (${(match.score*100).toFixed(0)}%)`);
        matched++;
      }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Found ${matched} high-confidence matches out of ${rows.length} products`);
    
    if (updates.length > 0) {
      console.log(`\nApplying ${updates.length} updates...`);
      for (const u of updates) {
        await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [u.sku, u.id]);
      }
      console.log('Done!');
    }
    
    // Save matches for review
    fs.writeFileSync('/tmp/precision_matches.json', JSON.stringify(updates, null, 2));
    
  } finally {
    client.release();
    await pool.end();
  }
}

match().catch(console.error);
