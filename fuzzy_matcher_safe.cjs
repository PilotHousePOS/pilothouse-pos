const fs = require('fs');

// Load UPC database
const upcData = fs.readFileSync('.local/state/memory/inventory_maybe_upcs.txt', 'utf8')
  .split('\n')
  .filter(line => line.includes('|'))
  .map(line => {
    const [upc, name] = line.split('|');
    return { upc: upc.trim(), name: name ? name.trim() : '' };
  })
  .filter(entry => entry.upc && entry.name && entry.upc.length >= 10);

// Brand expansions
const expansions = {
  'science diet': 'sd', 'taste of the wild': 'tow', 'natural balance': 'nb',
  'blue buffalo': 'blu', 'pro plan': 'pp', 'victor': 'vict',
  'nutrisource': 'ns', 'chicken': 'ck', 'turkey': 'turk', 'salmon': 'sal',
  'lamb': 'lam', 'puppy': 'pup', 'kitten': 'kit', 'senior': 'sen',
  'small breed': 'sm br', 'large breed': 'lg br', 'small bite': 'sm bite',
  'wilderness': 'wild', 'original': 'orig', 'formula': 'form',
  'perfect digestion': 'perf dig', 'healthy cuisine': 'heal cuis',
};

function normalize(text) {
  let result = text.toLowerCase();
  for (const [full, abbr] of Object.entries(expansions)) {
    result = result.replace(new RegExp(full, 'gi'), abbr);
  }
  return result.replace(/[^a-z0-9\s.#]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Extract sizes for comparison
function extractSize(text) {
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(lb|oz|#|"|qt|gal)/i);
  return sizeMatch ? { value: parseFloat(sizeMatch[1]), unit: sizeMatch[2].toLowerCase() } : null;
}

// Levenshtein distance
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return (maxLen - levenshtein(a, b)) / maxLen;
}

// Build normalized lookup
const upcEntries = [];
for (const entry of upcData) {
  const norm = normalize(entry.name);
  upcEntries.push({ upc: entry.upc, name: entry.name, norm, size: extractSize(entry.name) });
}
console.log(`Loaded ${upcEntries.length} UPC entries`);

// Read products from stdin
const input = fs.readFileSync('/dev/stdin', 'utf8');
const lines = input.split('\n').filter(l => l.trim());
lines.shift(); // Skip header

const matches = [];
let processed = 0;

for (const line of lines) {
  const match = line.match(/^(\d+),(.+?),(.*)$/);
  if (!match) continue;
  
  const id = parseInt(match[1]);
  let name = match[2].replace(/^"|"$/g, '').replace(/""/g, '"');
  const prodNorm = normalize(name);
  const prodSize = extractSize(name);
  
  // Find best match with 90%+ similarity
  let bestMatch = null;
  let bestSim = 0;
  
  for (const upc of upcEntries) {
    // Quick length check
    if (Math.abs(prodNorm.length - upc.norm.length) > prodNorm.length * 0.25) continue;
    
    const sim = similarity(prodNorm, upc.norm);
    if (sim > bestSim && sim >= 0.90) {
      // Verify sizes match if both have sizes
      if (prodSize && upc.size) {
        const sameUnit = prodSize.unit.replace('#', 'lb') === upc.size.unit.replace('#', 'lb') ||
                        (prodSize.unit === '"' && upc.size.unit === '"');
        if (sameUnit && Math.abs(prodSize.value - upc.size.value) > 0.5) {
          continue; // Size mismatch
        }
      }
      bestSim = sim;
      bestMatch = { id, sku: upc.upc, name, upcName: upc.name, sim };
    }
  }
  
  if (bestMatch) {
    matches.push(bestMatch);
  }
  
  processed++;
  if (processed % 500 === 0) {
    console.log(`Processed ${processed} products, found ${matches.length} matches...`);
  }
}

console.log(`\nTotal: Processed ${processed} products, found ${matches.length} matches (90%+ with size verification)`);

// Write SQL
const sqlFile = '/tmp/safe_fuzzy_updates.sql';
const sql = matches.map(m => 
  `UPDATE supplies SET sku = '${m.sku}' WHERE id = ${m.id};`
).join('\n');
fs.writeFileSync(sqlFile, sql);
console.log(`SQL written to ${sqlFile}`);

// Show sample
console.log('\nSample matches:');
for (const m of matches.slice(0, 15)) {
  console.log(`  ${Math.round(m.sim * 100)}%: "${m.name}" -> "${m.upcName}"`);
}
