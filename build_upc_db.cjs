const fs = require('fs');

// Parse maybe inventory (UPC|Name format)
const maybeLines = fs.readFileSync('.local/state/memory/inventory_maybe_upcs.txt', 'utf8')
  .split('\n').filter(l => l.trim());

const upcDb = {};

for (const line of maybeLines) {
  const [upc, name] = line.split('|');
  if (upc && name && upc.match(/^\d+$/)) {
    upcDb[upc] = name.trim();
  }
}

console.log(`Loaded ${Object.keys(upcDb).length} UPCs from maybe inventory`);

// Add existing UPCs from all_upcs.json
const existingUpcs = JSON.parse(fs.readFileSync('/tmp/all_upcs.json', 'utf8'));
let added = 0;
for (const [upc, name] of Object.entries(existingUpcs)) {
  if (!upcDb[upc]) {
    upcDb[upc] = name;
    added++;
  }
}
console.log(`Added ${added} additional UPCs from all_upcs.json`);

// Parse invoice UPCs
const invoiceLines = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf8')
  .split('\n').filter(l => l.trim());

let invoiceAdded = 0;
for (const line of invoiceLines) {
  const [upc, name] = line.split('|');
  if (upc && name && upc.match(/^\d+$/) && !upcDb[upc]) {
    upcDb[upc] = name.trim();
    invoiceAdded++;
  }
}
console.log(`Added ${invoiceAdded} additional UPCs from invoices`);

console.log(`\nTotal UPC database: ${Object.keys(upcDb).length} entries`);

// Save combined database
fs.writeFileSync('/tmp/combined_upcs.json', JSON.stringify(upcDb, null, 2));
console.log('Saved to /tmp/combined_upcs.json');

// Sample entries
console.log('\nSample entries:');
Object.entries(upcDb).slice(0, 10).forEach(([upc, name]) => {
  console.log(`  ${upc}: ${name}`);
});
