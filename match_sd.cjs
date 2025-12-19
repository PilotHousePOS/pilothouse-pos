const fs = require('fs');

// Load UPC database
const upcData = fs.readFileSync('.local/state/memory/inventory_maybe_upcs.txt', 'utf8')
  .split('\n')
  .filter(line => line.includes('|'))
  .map(line => {
    const [upc, name] = line.split('|');
    return { upc: upc.trim(), name: name ? name.trim() : '' };
  })
  .filter(entry => entry.upc && entry.name);

// Normalize and expand Science Diet products
function normalizeSD(text) {
  return text.toLowerCase()
    .replace(/science diet/gi, 'sd')
    .replace(/chicken/gi, 'ck')
    .replace(/turkey/gi, 'turk')
    .replace(/salmon/gi, 'sal')
    .replace(/perfect digestion/gi, 'perf dig')
    .replace(/healthy cuisine/gi, 'heal cuis')
    .replace(/sensitive/gi, 'sensi')
    .replace(/vitality/gi, 'vita')
    .replace(/puppy/gi, 'pup')
    .replace(/stew/gi, 'stew')
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build lookup for SD products
const sdUpcByName = new Map();
for (const entry of upcData) {
  if (entry.name.toLowerCase().startsWith('sd ')) {
    const key = normalizeSD(entry.name);
    if (!sdUpcByName.has(key)) {
      sdUpcByName.set(key, { upc: entry.upc, name: entry.name });
    }
  }
}
console.log(`Found ${sdUpcByName.size} Science Diet UPC entries`);

// Sample product names to match
const sampleProducts = [
  { id: 6585, name: 'Science Diet 7+ Beef 13oz' },
  { id: 6568, name: 'Science Diet 7+ Beef 5.8oz' },
  { id: 6586, name: 'Science Diet 7+ Chicken 13oz' },
  { id: 6563, name: 'Science Diet 7+ Chicken Stew' },
  { id: 6592, name: 'Science Diet Beef 13oz' },
  { id: 6566, name: 'Science Diet Beef 5.8oz' },
  { id: 6571, name: 'Science Diet Beef Stew 12.8oz' },
  { id: 6562, name: 'Science Diet Beef Stew 3.5 oz' },
  { id: 6593, name: 'Science Diet Chicken 13oz' },
  { id: 6565, name: 'Science Diet Chicken 5.8oz' },
  { id: 6570, name: 'Science Diet Chicken Stew 12.8oz' },
  { id: 6561, name: 'Science Diet Chicken Stew 3.5 oz' },
];

console.log('\nMatching sample products:');
const matches = [];
for (const prod of sampleProducts) {
  const key = normalizeSD(prod.name);
  if (sdUpcByName.has(key)) {
    const match = sdUpcByName.get(key);
    console.log(`MATCH: "${prod.name}" -> ${match.upc} (${match.name})`);
    matches.push({ id: prod.id, sku: match.upc });
  } else {
    // Try partial matching
    let found = false;
    for (const [upcKey, value] of sdUpcByName) {
      if (key.includes(upcKey) || upcKey.includes(key)) {
        console.log(`PARTIAL: "${prod.name}" ~ ${value.upc} (${value.name})`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`NO MATCH: "${prod.name}" -> "${key}"`);
    }
  }
}

// Output SQL for matches
if (matches.length > 0) {
  console.log('\nSQL to apply:');
  for (const m of matches) {
    console.log(`UPDATE supplies SET sku = '${m.sku}' WHERE id = ${m.id};`);
  }
}
