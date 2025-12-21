const fs = require('fs');
const path = require('path');

const dirs = [
  './attached_assets/extracted_orders',
  './attached_assets/extracted_orders2',
  './attached_assets/extracted_orders3',
  './attached_assets/extracted_orders4',
  './attached_assets/extracted_orders5',
  './attached_assets/extracted_orders6',
  './attached_assets/extracted_orders7'
];

const items = [];
const seenUpcs = new Set();
let totalFiles = 0;

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
  totalFiles += files.length;
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      // Match 12-14 digit UPCs
      const upcMatch = line.match(/\b(\d{12,14})\b/g);
      if (!upcMatch) continue;
      
      for (const upc of upcMatch) {
        if (upc.startsWith('0000') || seenUpcs.has(upc)) continue;
        
        // Extract description - look for text after UPC
        const idx = line.indexOf(upc);
        const rest = line.substring(idx + upc.length);
        const parts = rest.split(/\s{2,}/);
        
        let name = '';
        for (const p of parts) {
          const cleaned = p.trim();
          if (cleaned.length > 3 && /[A-Z]/.test(cleaned) && !/^\d+$/.test(cleaned)) {
            name = cleaned;
            break;
          }
        }
        
        if (name) {
          seenUpcs.add(upc);
          items.push({ upc, name, source: 'invoice_pdf' });
        }
      }
    }
  }
}

console.log(`Parsed ${totalFiles} text files from ${dirs.length} directories`);
console.log(`Extracted ${items.length} unique UPCs`);

// Save
fs.writeFileSync('./all_invoice_upcs.json', JSON.stringify(items, null, 2));

// Sample
console.log('\nSample:');
for (let i = 0; i < 10 && i < items.length; i++) {
  console.log(`  ${items[i].upc}: ${items[i].name}`);
}
