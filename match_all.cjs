const fs = require('fs');

// Load UPC lookup
const upcLookup = JSON.parse(fs.readFileSync('/tmp/upc_lookup.json', 'utf8'));

// Load original UPC data with original names for verification
const upcData = fs.readFileSync('.local/state/memory/inventory_maybe_upcs.txt', 'utf8')
  .split('\n')
  .filter(line => line.includes('|'))
  .map(line => {
    const [upc, name] = line.split('|');
    return { upc: upc.trim(), name: name ? name.trim() : '' };
  })
  .filter(entry => entry.upc && entry.name);

const upcToName = {};
for (const e of upcData) {
  upcToName[e.upc] = e.name;
}

// Brand abbreviations
const expansions = {
  'science diet': 'sd',
  'taste of the wild': 'tow',
  'natural balance': 'nb',
  'blue buffalo': 'blu',
  'pro plan': 'pp',
  'victor': 'vict',
  'nutrisource': 'ns',
  'nutri source': 'ns',
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
};

function normalize(text) {
  let result = text.toLowerCase();
  for (const [full, abbr] of Object.entries(expansions)) {
    result = result.replace(new RegExp(full, 'gi'), abbr);
  }
  result = result
    .replace(/[^a-z0-9\s.#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return result;
}

// Products without SKUs (from SQL output)
const products = [
  { id: 6585, name: 'Science Diet 7+ Beef 13oz' },
  { id: 6568, name: 'Science Diet 7+ Beef 5.8oz' },
  { id: 6586, name: 'Science Diet 7+ Chicken 13oz' },
  { id: 6563, name: 'Science Diet 7+ Chicken Stew' },
  { id: 6584, name: 'Science Diet 7+ Turkey 13oz' },
  { id: 6592, name: 'Science Diet Beef 13oz' },
  { id: 6566, name: 'Science Diet Beef 5.8oz' },
  { id: 6573, name: 'Science Diet Beef 7+ 12.8oz' },
  { id: 6571, name: 'Science Diet Beef Stew 12.8oz' },
  { id: 6593, name: 'Science Diet Chicken 13oz' },
  { id: 6565, name: 'Science Diet Chicken 5.8oz' },
  { id: 6572, name: 'Science Diet Chicken 7+ Stew 12.8oz' },
  { id: 6570, name: 'Science Diet Chicken Stew 12.8oz' },
  { id: 6452, name: 'Science Diet Flexi Stix Beef' },
  { id: 6454, name: 'Science Diet Flexi Stix Turkey' },
  { id: 6577, name: 'Science Diet Healthy Cuisine 7+ Beef 12.5oz' },
  { id: 6575, name: 'Science Diet Healthy Cuisine 7+ Chicken 12.5oz' },
  { id: 6576, name: 'Science Diet Healthy Cuisine Beef 12.5oz' },
  { id: 6574, name: 'Science Diet Healthy Cuisine Chicken 12.5oz' },
  { id: 6589, name: 'Science Diet Lamb 13oz' },
  { id: 6557, name: 'Science Diet Large Breed Chicken 30lb' },
  { id: 6556, name: 'Science Diet Large Breed Chicken 35lb' },
  { id: 6555, name: 'Science Diet Large Breed Lamb 30lb' },
  { id: 6558, name: 'Science Diet Large Breed Light 15lb' },
  { id: 6559, name: 'Science Diet Large Breed Light 30lb' },
  { id: 6591, name: 'Science Diet Chicken & Beef 13oz' },
  { id: 6588, name: 'Science Diet Perfect Dig Salmon Stew 12.8oz' },
  { id: 6587, name: 'Science Diet Perfect Digestion Chicken 12.8oz' },
  { id: 6590, name: 'Science Diet Perfect Digestion Chicken Stew 12.8oz' },
  { id: 6569, name: 'Science Diet Perfect Digestion Chicken5.8oz' },
  { id: 6564, name: 'Science Diet Puppy Beef 5.8oz' },
  { id: 6594, name: 'Science Diet Puppy Chicken 13oz' },
  { id: 6567, name: 'Science Diet Puppy Chicken 5.8oz' },
  { id: 6580, name: 'Science Diet Puppy Stew Chicken 12.5oz' },
  { id: 6578, name: 'Science Diet Sensitive Chicken 12.8oz' },
  { id: 6581, name: 'Science Diet Sensitive Puppy Salmon 12.5oz' },
  { id: 6579, name: 'Science Diet Sensitive Turkey Stew 12.5oz' },
  { id: 6548, name: 'Science Diet Small Breed 11+ 4.5lb' },
  { id: 6549, name: 'Science Diet Small Breed 11+ 15.5lb' },
  { id: 6546, name: 'Science Diet Small Breed 7+ 4.5lb' },
  { id: 6544, name: 'Science Diet Small Breed Chicken 4.5lb' },
  { id: 6545, name: 'Science Diet Small Breed Chicken 15.5lb' },
  { id: 6551, name: 'Science Diet Small Breed Lamb 4.5lb' },
  { id: 6552, name: 'Science Diet Small Breed Lamb 15.5lb' },
  { id: 6553, name: 'Science Diet Small Breed Light 4.5lb' },
  { id: 6554, name: 'Science Diet Small Breed Light 15.5lb' },
  { id: 6583, name: 'Science Diet Vitality Chicken Stew 12.5oz' },
  { id: 6850, name: 'Science Diet Cat Indoor Salmon Stew 2.8oz' },
  { id: 6718, name: 'Science Diet Cat Senior Chicken 2.9oz' },
  { id: 6851, name: 'Science Diet Cat Senior Salmon Stew 2.8oz' },
  { id: 6800, name: 'Science Diet Cat Senior Sto 15.5lb' },
  { id: 6846, name: 'Science Diet Cat Urinary & Hairball Control Chicken Stew 2.9oz' },
  { id: 6848, name: 'Science Diet Cat Urinary & Hairball Control Salmon Stew 2.9oz' },
  { id: 6847, name: 'Science Diet Cat Urinary & Hairball Control Tuna Stew' },
];

const matches = [];
for (const prod of products) {
  const key = normalize(prod.name);
  if (upcLookup[key]) {
    matches.push({ id: prod.id, sku: upcLookup[key], name: prod.name, upcName: upcToName[upcLookup[key]] });
  }
}

console.log(`Found ${matches.length} matches out of ${products.length} products\n`);
console.log('Matches:');
for (const m of matches) {
  console.log(`ID ${m.id}: "${m.name}" -> ${m.sku} ("${m.upcName}")`);
}

// Output SQL
console.log('\n--- SQL Updates ---');
for (const m of matches) {
  console.log(`UPDATE supplies SET sku = '${m.sku}' WHERE id = ${m.id};`);
}
