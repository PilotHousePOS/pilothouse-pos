const fs = require('fs');
const path = require('path');

const masterDb = {};
let sources = { maybe: 0, comprehensive: 0, invoiceTxt: 0, extracted: 0 };

// 1. Load maybe inventory (cleanest names)
console.log('Loading maybe inventory...');
const maybeLines = fs.readFileSync('.local/state/memory/inventory_maybe_upcs.txt', 'utf8')
  .split('\n').filter(l => l.trim());
for (const line of maybeLines) {
  const [upc, name] = line.split('|');
  if (upc && name && upc.match(/^\d{8,14}$/)) {
    masterDb[upc] = { name: name.trim(), source: 'maybe' };
    sources.maybe++;
  }
}

// 2. Load comprehensive UPC database 
console.log('Loading comprehensive UPC database...');
const compLines = fs.readFileSync('.local/state/memory/comprehensive_upc_database.txt', 'utf8')
  .split('\n').filter(l => l.trim());
for (const line of compLines) {
  const parts = line.split('|');
  if (parts.length >= 2) {
    const upc = parts[0].trim();
    const name = parts[1].trim();
    if (upc.match(/^\d{8,14}$/) && name && !masterDb[upc]) {
      masterDb[upc] = { name, source: 'comprehensive' };
      sources.comprehensive++;
    }
  }
}

// 3. Load invoice UPCs with names
console.log('Loading invoice UPCs...');
const invoiceLines = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf8')
  .split('\n').filter(l => l.trim());
for (const line of invoiceLines) {
  const [upc, name] = line.split('|');
  if (upc && name && upc.match(/^\d{8,14}$/) && !masterDb[upc]) {
    masterDb[upc] = { name: name.trim(), source: 'invoice' };
    sources.invoiceTxt++;
  }
}

// 4. Parse extracted orders text files for UPC -> Product Name pairs
console.log('Loading extracted order files...');
const extractedDir = 'attached_assets/extracted_orders';
if (fs.existsSync(extractedDir)) {
  const files = fs.readdirSync(extractedDir).filter(f => f.endsWith('.txt'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(extractedDir, file), 'utf8');
    // Look for UPC patterns followed by product names
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Pattern: UPC at start of line followed by product description
      const match = line.match(/^(\d{12,13})\s+(.+)/);
      if (match) {
        const upc = match[1];
        let name = match[2].trim();
        // Clean up the name - remove quantity and pricing info
        name = name.replace(/\s+(EA|CS|PK)\s+\d+.*$/, '').trim();
        if (name.length > 3 && !masterDb[upc]) {
          masterDb[upc] = { name, source: 'extracted' };
          sources.extracted++;
        }
      }
    }
  }
}

console.log('\n=== SOURCE COUNTS ===');
console.log(`Maybe inventory: ${sources.maybe}`);
console.log(`Comprehensive: ${sources.comprehensive}`);
console.log(`Invoice text: ${sources.invoiceTxt}`);
console.log(`Extracted orders: ${sources.extracted}`);
console.log(`\nTOTAL UNIQUE UPCs: ${Object.keys(masterDb).length}`);

// Save master database
const output = {};
for (const [upc, data] of Object.entries(masterDb)) {
  output[upc] = data.name;
}
fs.writeFileSync('/tmp/master_upc_db.json', JSON.stringify(output, null, 2));
console.log('\nSaved to /tmp/master_upc_db.json');

// Also save a lookup version
const lookup = {};
for (const [upc, data] of Object.entries(masterDb)) {
  lookup[upc] = { name: data.name, source: data.source };
}
fs.writeFileSync('/tmp/master_upc_lookup.json', JSON.stringify(lookup, null, 2));

// Sample entries
console.log('\nSample entries:');
Object.entries(masterDb).slice(0, 15).forEach(([upc, data]) => {
  console.log(`  ${upc}: ${data.name} [${data.source}]`);
});
