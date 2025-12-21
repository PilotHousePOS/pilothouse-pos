const fs = require('fs');
const path = require('path');

const dirs = [
  './attached_assets/extracted_new',
  './attached_assets/extracted_orders',
  './attached_assets/extracted_orders2',
  './attached_assets/extracted_orders3',
  './attached_assets/extracted_orders4',
  './attached_assets/extracted_orders5',
  './attached_assets/extracted_orders6',
  './attached_assets/extracted_orders7'
];

const allItems = [];
const seenUpcs = new Set();
let totalFiles = 0;

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
  totalFiles += files.length;
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const lines = content.split('\n').map(l => l.trim());
    
    // Look for pattern: product_number, upc, description
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this line is a 12-14 digit UPC
      if (/^\d{12,14}$/.test(line) && !line.startsWith('0000')) {
        const upc = line;
        if (seenUpcs.has(upc)) continue;
        
        // Look for description in next line or nearby
        let name = '';
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextLine = lines[j];
          if (nextLine.length > 3 && /[A-Z]/.test(nextLine) && !/^\d+$/.test(nextLine) && !nextLine.includes('EA') && !nextLine.includes('OV')) {
            name = nextLine;
            break;
          }
        }
        
        if (name) {
          seenUpcs.add(upc);
          allItems.push({ upc, name, source: 'pdf' });
        }
      }
      
      // Also check inline pattern: number upc description
      const inlineMatch = line.match(/\b(\d{12,14})\s+([A-Z][A-Z0-9\s\/\-\.\']+)/);
      if (inlineMatch) {
        const upc = inlineMatch[1];
        const name = inlineMatch[2].trim();
        if (!seenUpcs.has(upc) && name.length > 3) {
          seenUpcs.add(upc);
          allItems.push({ upc, name, source: 'pdf' });
        }
      }
    }
  }
}

console.log(`Parsed ${totalFiles} text files`);
console.log(`Extracted ${allItems.length} unique UPCs`);

fs.writeFileSync('./all_pdf_upcs.json', JSON.stringify(allItems, null, 2));

// Show sample
console.log('\nSample UPCs:');
for (let i = 0; i < 10 && i < allItems.length; i++) {
  console.log(`  ${allItems[i].upc}: ${allItems[i].name}`);
}
