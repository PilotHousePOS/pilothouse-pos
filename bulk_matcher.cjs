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

console.log(`Loaded ${upcData.length} UPC entries`);

// Brand abbreviation mappings (both directions)
const expansions = {
  'science diet': 'sd',
  'taste of the wild': 'tow',
  'natural balance': 'nb',
  'blue buffalo': 'blu',
  'pro plan': 'pp',
  'proplan': 'pp',
  'victor': 'vict',
  'nutrisource': 'ns',
  'nutri source': 'ns',
  'chicken': 'ck',
  'turkey': 'turk',
  'salmon': 'sal',
  'lamb': 'lam',
  'perfect digestion': 'perf dig',
  'healthy cuisine': 'heal cuis',
  'sensitive': 'sensi',
  'vitality': 'vita',
  'puppy': 'pup',
  'kitten': 'kit',
  'adult': 'adt',
  'senior': 'sen',
  'small breed': 'sm br',
  'large breed': 'lg br',
  'small bite': 'sm bite',
  'formula': 'form',
  'original': 'orig',
  'wilderness': 'wild',
  'healthy weight': 'hlth wt',
  'weight management': 'wt mgmt',
};

function normalize(text) {
  let result = text.toLowerCase();
  // Apply expansions
  for (const [full, abbr] of Object.entries(expansions)) {
    result = result.replace(new RegExp(full, 'gi'), abbr);
  }
  // Clean up
  result = result
    .replace(/[^a-z0-9\s.#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return result;
}

// Build normalized lookup
const upcByNorm = new Map();
const upcToOrigName = {};
for (const entry of upcData) {
  const key = normalize(entry.name);
  if (!upcByNorm.has(key)) {
    upcByNorm.set(key, entry.upc);
    upcToOrigName[entry.upc] = entry.name;
  }
}
console.log(`Built ${upcByNorm.size} normalized entries`);

// Read products from stdin (CSV format: id,name,brand)
const input = fs.readFileSync('/dev/stdin', 'utf8');
const lines = input.split('\n').filter(l => l.trim());
const header = lines.shift(); // Skip header

const matches = [];
const noMatch = [];

for (const line of lines) {
  // Parse CSV with quoted fields
  const match = line.match(/^(\d+),(.+?),(.*)$/);
  if (!match) continue;
  
  const id = parseInt(match[1]);
  let name = match[2].replace(/^"|"$/g, '').replace(/""/g, '"');
  const brand = match[3].replace(/^"|"$/g, '');
  
  const normalized = normalize(name);
  
  if (upcByNorm.has(normalized)) {
    matches.push({
      id,
      sku: upcByNorm.get(normalized),
      name,
      upcName: upcToOrigName[upcByNorm.get(normalized)]
    });
  } else {
    noMatch.push({ id, name, normalized });
  }
}

console.log(`\nMatched: ${matches.length}, No match: ${noMatch.length}`);

// Output SQL for matches
const sqlFile = '/tmp/sku_updates.sql';
const sql = matches.map(m => 
  `UPDATE supplies SET sku = '${m.sku}' WHERE id = ${m.id};`
).join('\n');
fs.writeFileSync(sqlFile, sql);
console.log(`SQL written to ${sqlFile}`);

// Show first 20 matches
console.log('\nFirst 20 matches:');
for (const m of matches.slice(0, 20)) {
  console.log(`  ${m.id}: "${m.name}" -> ${m.sku} ("${m.upcName}")`);
}

// Show sample of no-matches
console.log('\nSample products without matches:');
for (const n of noMatch.slice(0, 10)) {
  console.log(`  ${n.id}: "${n.name}" -> "${n.normalized}"`);
}
