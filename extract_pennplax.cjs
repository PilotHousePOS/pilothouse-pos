const fs = require('fs');
const path = require('path');

// Penn Plax invoices have format: ProductName SKU Price Qty Total
// SKUs are 12-digit UPCs starting with 030172 or 713733

const pdfDir = path.join(__dirname, 'attached_assets');
const files = fs.readdirSync(pdfDir).filter(f => f.includes('order_') && f.endsWith('.pdf'));

console.log(`Found ${files.length} Penn Plax order files`);

const entries = [];
const seenUPCs = new Set();

for (const file of files) {
  const content = fs.readFileSync(path.join(pdfDir, file), 'utf8');
  
  // Find 12-digit UPCs (Penn Plax format: 030172XXXXXX)
  const upcPattern = /(\d{12})\s+\$[\d.]+/g;
  let match;
  
  while ((match = upcPattern.exec(content)) !== null) {
    const upc = match[1];
    if (!seenUPCs.has(upc) && (upc.startsWith('030172') || upc.startsWith('713733'))) {
      seenUPCs.add(upc);
      
      // Try to find the product name before the UPC
      const beforeUpc = content.substring(Math.max(0, match.index - 200), match.index);
      const lines = beforeUpc.split('\n').filter(l => l.trim());
      const productName = lines[lines.length - 1] || '';
      
      entries.push({
        upc,
        description: productName.trim(),
        source: file
      });
    }
  }
}

console.log(`Extracted ${entries.length} unique Penn Plax UPCs`);

// Save to file
fs.writeFileSync('/tmp/pennplax_upcs.json', JSON.stringify(entries, null, 2));
console.log('Saved to /tmp/pennplax_upcs.json');

// Show sample
console.log('\nSample entries:');
entries.slice(0, 10).forEach(e => console.log(`  ${e.upc}: ${e.description.substring(0, 50)}`));
