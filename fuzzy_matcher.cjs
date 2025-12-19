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

// Build normalized lookup with original names
const upcEntries = [];
for (const entry of upcData) {
  const norm = normalize(entry.name);
  upcEntries.push({ upc: entry.upc, name: entry.name, norm });
}
console.log(`Loaded ${upcEntries.length} UPC entries`);

// Read products from stdin
const input = fs.readFileSync('/dev/stdin', 'utf8');
const lines = input.split('\n').filter(l => l.trim());
lines.shift(); // Skip header

const matches = [];
const checked = new Set();
let processed = 0;

for (const line of lines) {
  const match = line.match(/^(\d+),(.+?),(.*)$/);
  if (!match) continue;
  
  const id = parseInt(match[1]);
  let name = match[2].replace(/^"|"$/g, '').replace(/""/g, '"');
  const brand = match[3].replace(/^"|"$/g, '');
  const prodNorm = normalize(name);
  
  // Skip if already processed
  if (checked.has(id)) continue;
  checked.add(id);
  
  // Find best match with 85%+ similarity
  let bestMatch = null;
  let bestSim = 0;
  
  for (const upc of upcEntries) {
    // Quick length check for performance
    if (Math.abs(prodNorm.length - upc.norm.length) > prodNorm.length * 0.3) continue;
    
    const sim = similarity(prodNorm, upc.norm);
    if (sim > bestSim && sim >= 0.85) {
      bestSim = sim;
      bestMatch = { id, sku: upc.upc, name, upcName: upc.name, sim };
    }
  }
  
  if (bestMatch) {
    matches.push(bestMatch);
  }
  
  processed++;
  if (processed % 200 === 0) {
    console.log(`Processed ${processed} products, found ${matches.length} matches...`);
  }
}

console.log(`\nTotal: Processed ${processed} products, found ${matches.length} fuzzy matches (85%+ similarity)`);

// Write SQL
const sqlFile = '/tmp/fuzzy_sku_updates.sql';
const sql = matches.map(m => 
  `UPDATE supplies SET sku = '${m.sku}' WHERE id = ${m.id}; -- ${Math.round(m.sim * 100)}% match: "${m.name}" -> "${m.upcName}"`
).join('\n');
fs.writeFileSync(sqlFile, sql);
console.log(`SQL written to ${sqlFile}`);

// Show sample matches
console.log('\nSample matches:');
for (const m of matches.slice(0, 20)) {
  console.log(`  ${Math.round(m.sim * 100)}%: "${m.name}" -> "${m.upcName}"`);
}
