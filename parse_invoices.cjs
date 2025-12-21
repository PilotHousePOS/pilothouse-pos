const fs = require('fs');
const path = require('path');

const invoiceDir = './attached_assets/extracted_orders';
const files = fs.readdirSync(invoiceDir).filter(f => f.endsWith('.txt'));
console.log(`Found ${files.length} invoice text files`);

const items = [];
const seenUpcs = new Set();

// UPC pattern: 12 digits
const upcPattern = /\b(\d{12,14})\b/g;

for (const file of files) {
  const content = fs.readFileSync(path.join(invoiceDir, file), 'utf8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Look for lines with UPC and description
    // Format: LINE  PRODUCT  UPC  *CPN/VPN  DESCRIPTION
    const matches = line.match(upcPattern);
    if (matches) {
      for (const upc of matches) {
        // Skip if doesn't look like a UPC
        if (upc.length < 12 || upc.length > 14) continue;
        if (upc.startsWith('0000')) continue; // Skip likely non-UPCs
        
        // Try to extract name from the line
        // The description usually follows the UPC
        const upcIdx = line.indexOf(upc);
        const afterUpc = line.substring(upcIdx + upc.length).trim();
        
        // Find the description - skip the VPN column
        const parts = afterUpc.split(/\s{2,}/);
        let name = '';
        for (const part of parts) {
          if (part.length > 5 && /[A-Z]/.test(part)) {
            name = part.trim();
            break;
          }
        }
        
        if (name && !seenUpcs.has(upc)) {
          seenUpcs.add(upc);
          items.push({ upc, name, source: 'invoice' });
        }
      }
    }
  }
}

console.log(`Extracted ${items.length} unique UPCs from invoices`);

// Show sample
console.log('\nSample:');
for (let i = 0; i < 10 && i < items.length; i++) {
  console.log(`  ${items[i].upc}: ${items[i].name}`);
}

fs.writeFileSync('./invoice_extracted_upcs.json', JSON.stringify(items, null, 2));
