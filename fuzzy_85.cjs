const fs = require('fs');

const upcData = fs.readFileSync('.local/state/memory/inventory_maybe_upcs.txt', 'utf8')
  .split('\n')
  .filter(line => line.includes('|'))
  .map(line => {
    const [upc, name] = line.split('|');
    return { upc: upc.trim(), name: name ? name.trim() : '' };
  })
  .filter(entry => entry.upc && entry.name && entry.upc.length >= 10);

const expansions = {
  'science diet': 'sd', 'taste of the wild': 'tow', 'natural balance': 'nb',
  'blue buffalo': 'blu', 'pro plan': 'pp', 'victor': 'vict', 'nutrisource': 'ns',
  'chicken': 'ck', 'turkey': 'turk', 'salmon': 'sal', 'lamb': 'lam',
  'puppy': 'pup', 'kitten': 'kit', 'senior': 'sen',
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

function extractSize(text) {
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(lb|oz|#|"|qt|gal|in)/i);
  return sizeMatch ? { value: parseFloat(sizeMatch[1]), unit: sizeMatch[2].toLowerCase() } : null;
}

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

const upcEntries = upcData.map(e => ({ ...e, norm: normalize(e.name), size: extractSize(e.name) }));
console.log(`Loaded ${upcEntries.length} UPC entries`);

const input = fs.readFileSync('/dev/stdin', 'utf8');
const lines = input.split('\n').filter(l => l.trim());
lines.shift();

const matches = [];
let processed = 0;

for (const line of lines) {
  const match = line.match(/^(\d+),(.+?),(.*)$/);
  if (!match) continue;
  
  const id = parseInt(match[1]);
  let name = match[2].replace(/^"|"$/g, '').replace(/""/g, '"');
  const prodNorm = normalize(name);
  const prodSize = extractSize(name);
  
  let bestMatch = null;
  let bestSim = 0;
  
  for (const upc of upcEntries) {
    if (Math.abs(prodNorm.length - upc.norm.length) > prodNorm.length * 0.3) continue;
    
    const sim = similarity(prodNorm, upc.norm);
    if (sim > bestSim && sim >= 0.85) {
      // Size verification
      if (prodSize && upc.size) {
        const sameUnit = prodSize.unit.replace('#', 'lb').replace('in', '"') === 
                        upc.size.unit.replace('#', 'lb').replace('in', '"');
        if (sameUnit && Math.abs(prodSize.value - upc.size.value) > 0.5) continue;
      }
      bestSim = sim;
      bestMatch = { id, sku: upc.upc, name, upcName: upc.name, sim };
    }
  }
  
  if (bestMatch) {
    matches.push(bestMatch);
  }
  processed++;
  if (processed % 400 === 0) console.log(`Processed ${processed}...`);
}

console.log(`\nTotal: ${matches.length} matches (85%+ threshold with size verification)`);

fs.writeFileSync('/tmp/fuzzy_85_updates.sql', 
  matches.map(m => `UPDATE supplies SET sku = '${m.sku}' WHERE id = ${m.id};`).join('\n'));
console.log('SQL written to /tmp/fuzzy_85_updates.sql');

console.log('\nSample matches:');
matches.slice(0, 10).forEach(m => console.log(`  ${Math.round(m.sim*100)}%: "${m.name}" -> "${m.upcName}"`));
