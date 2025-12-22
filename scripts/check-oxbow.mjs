import fs from 'fs';

// Load all_combined_upcs and find Oxbow entries
const combined = JSON.parse(fs.readFileSync('scripts/all_combined_upcs.json'));
const oxbowCombined = combined.filter(e => e.name && e.name.toLowerCase().includes('oxbow'));
console.log('=== Oxbow in combined_upcs:', oxbowCombined.length, '===');
oxbowCombined.slice(0, 10).forEach(e => console.log('  UPC:', e.upc, '|', e.name));

// Load master and check if these UPCs exist
const master = JSON.parse(fs.readFileSync('scripts/master_upc_index.json'));
const masterUpcs = new Set(master.entries.map(e => e.upc));

console.log('\n=== Checking if Oxbow UPCs exist in master ===');
let inMaster = 0;
for (const e of oxbowCombined.slice(0, 5)) {
  const exists = masterUpcs.has(e.upc);
  console.log('  UPC:', e.upc, exists ? 'EXISTS in master' : 'NOT in master', '|', e.name);
  if (exists) inMaster++;
}
console.log('Result:', inMaster, 'of 5 checked already in master');

// Check master for these same UPCs
console.log('\n=== Same UPCs in master (what names do they have?) ===');
for (const e of oxbowCombined.slice(0, 5)) {
  const masterEntry = master.entries.find(m => m.upc === e.upc);
  if (masterEntry) {
    console.log('  UPC:', e.upc);
    console.log('    Combined name:', e.name);
    console.log('    Master name:', masterEntry.name);
  }
}
