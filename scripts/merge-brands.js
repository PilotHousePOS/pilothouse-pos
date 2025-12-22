const fs = require('fs');

// Load master index
const master = JSON.parse(fs.readFileSync('scripts/master_upc_index.json'));
console.log('Current master entries:', master.entries.length);
const masterUpcs = new Set(master.entries.map(e => e.upc));

// Brands to find
const targetBrands = ['oxbow', 'benebone', 'smartbone', 'barkworth', 'disney', 'pixar'];

// Load all_combined_upcs
const combined = JSON.parse(fs.readFileSync('scripts/all_combined_upcs.json'));
console.log('Combined entries:', combined.length);

let added = 0;
for (const entry of combined) {
  if (!masterUpcs.has(entry.upc) && entry.upc && entry.name) {
    const name = entry.name.toLowerCase();
    if (targetBrands.some(b => name.includes(b))) {
      master.entries.push({
        upc: entry.upc,
        name: entry.name,
        source: 'combined_upcs',
        isCoastal: false
      });
      masterUpcs.add(entry.upc);
      added++;
      console.log('  Added from combined:', entry.name);
    }
  }
}
console.log('Added from combined:', added);

// Load master_verified_upcs
const verified = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json'));
console.log('Verified entries:', verified.length);

let addedV = 0;
for (const entry of verified) {
  if (!masterUpcs.has(entry.upc) && entry.upc && entry.name) {
    const name = entry.name.toLowerCase();
    if (targetBrands.some(b => name.includes(b))) {
      master.entries.push({
        upc: entry.upc,
        name: entry.name,
        source: 'verified_upcs',
        isCoastal: false
      });
      masterUpcs.add(entry.upc);
      addedV++;
      console.log('  Added from verified:', entry.name);
    }
  }
}
console.log('Added from verified:', addedV);

// Also check upc_catalog.json
try {
  const catalog = JSON.parse(fs.readFileSync('scripts/upc_catalog.json'));
  let addedC = 0;
  for (const [upc, names] of Object.entries(catalog)) {
    if (!masterUpcs.has(upc) && Array.isArray(names)) {
      for (const name of names) {
        const lname = name.toLowerCase();
        if (targetBrands.some(b => lname.includes(b))) {
          master.entries.push({
            upc: upc,
            name: name,
            source: 'upc_catalog',
            isCoastal: false
          });
          masterUpcs.add(upc);
          addedC++;
          console.log('  Added from catalog:', name);
          break;
        }
      }
    }
  }
  console.log('Added from catalog:', addedC);
} catch (e) {
  console.log('Catalog not available');
}

master.totalEntries = master.entries.length;
fs.writeFileSync('scripts/master_upc_index.json', JSON.stringify(master, null, 2));
console.log('\nFinal master entries:', master.entries.length);
