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

// Brand abbreviation expansions
const expansions = {
  'science diet': 'sd',
  'taste of the wild': 'tow',
  'natural balance': 'nb',
  'blue buffalo': 'blu',
  'pro plan': 'pp',
  'victor': 'vict',
  'nutrisource': 'ns',
  'chicken': 'ck',
  'turkey': 'turk',
  'salmon': 'sal',
  'lamb': 'lam',
  'beef': 'bf',
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
  'pounds': '#',
  'ounce': 'oz',
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

// Build lookup by normalized name
const upcByNorm = new Map();
for (const entry of upcData) {
  const key = normalize(entry.name);
  if (!upcByNorm.has(key)) {
    upcByNorm.set(key, { upc: entry.upc, name: entry.name });
  }
}
console.log(`Built ${upcByNorm.size} normalized UPC entries`);

// Read product data from database dump
// We'll need to get this from SQL queries
const productsSql = `SELECT id, name, brand FROM supplies WHERE sku IS NULL`;
console.log('\nTo match products, run this SQL and save to products.csv:');
console.log(productsSql);
console.log('\nThen run: node match_from_csv.cjs products.csv');

// Also output the UPC lookup as JSON for the matching script
const lookup = {};
for (const [key, value] of upcByNorm) {
  lookup[key] = value.upc;
}
fs.writeFileSync('/tmp/upc_lookup.json', JSON.stringify(lookup, null, 2));
console.log(`\nSaved ${Object.keys(lookup).length} entries to /tmp/upc_lookup.json`);
