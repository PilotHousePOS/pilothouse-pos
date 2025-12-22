import fs from 'fs';

// Load confirmed matches
const confirmed = JSON.parse(fs.readFileSync('scripts/confirmed_upc_matches.json'));
console.log('Total confirmed matches:', confirmed.matches.length);

// Load all source data to cross-reference
const combined = JSON.parse(fs.readFileSync('scripts/all_combined_upcs.json'));
const verified = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json'));

// Build UPC -> names map (showing conflicts)
const upcToNames = new Map();

for (const e of combined) {
  if (e.upc && e.name) {
    if (!upcToNames.has(e.upc)) upcToNames.set(e.upc, []);
    upcToNames.get(e.upc).push({ name: e.name, source: 'combined' });
  }
}

for (const e of verified) {
  if (e.upc && e.name) {
    if (!upcToNames.has(e.upc)) upcToNames.set(e.upc, []);
    upcToNames.get(e.upc).push({ name: e.name, source: 'verified' });
  }
}

// Find conflicting UPCs
let conflicts = 0;
for (const [upc, names] of upcToNames) {
  const uniqueNames = new Set(names.map(n => n.name.toLowerCase().trim()));
  if (uniqueNames.size > 1) {
    conflicts++;
  }
}
console.log('UPCs with conflicting names:', conflicts);

// Show some conflicts
console.log('\n=== Sample UPC Conflicts ===');
let shown = 0;
for (const [upc, names] of upcToNames) {
  const uniqueNames = new Set(names.map(n => n.name.toLowerCase().trim()));
  if (uniqueNames.size > 1 && shown < 10) {
    console.log('UPC:', upc);
    names.forEach(n => console.log('  -', n.source + ':', n.name));
    shown++;
  }
}
