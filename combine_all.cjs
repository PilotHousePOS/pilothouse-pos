const fs = require('fs');

const files = [
  './all_upcs.json',
  './source_upcs.json', 
  './excel_upcs.json',
  './invoice_upcs.json',
  './maybe_upcs.json',
  './clean_upcs.json'
];

const upcMap = new Map();

for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(`${file}: ${data.length} entries`);
    for (const item of data) {
      if (item.upc && item.name) {
        // Keep the one with longer name if duplicate
        if (!upcMap.has(item.upc) || item.name.length > upcMap.get(item.upc).name.length) {
          upcMap.set(item.upc, item);
        }
      }
    }
  } catch (e) {
    console.log(`${file}: Error - ${e.message}`);
  }
}

const combined = Array.from(upcMap.values());
console.log(`\nTotal unique UPCs: ${combined.length}`);
fs.writeFileSync('./all_sources_upcs.json', JSON.stringify(combined, null, 2));
