const fs = require('fs');

// Parse Google Sheet CSV
function parseCSV(content) {
  const lines = content.split('\n').slice(1); // Skip header
  const items = [];
  for (const line of lines) {
    const parts = line.split(',');
    const upc = parts[0]?.trim();
    const name = parts[1]?.trim();
    if (upc && name && /^\d{12,14}$/.test(upc)) {
      items.push({ upc, name, source: 'google_sheet' });
    }
  }
  return items;
}

// Load all sources
const upcMap = new Map();

// 1. Google Sheet CSV
const googleSheet = parseCSV(fs.readFileSync('./scripts/google_sheet_upcs.csv', 'utf8'));
console.log('Google Sheet:', googleSheet.length);
for (const item of googleSheet) {
  if (!upcMap.has(item.upc)) upcMap.set(item.upc, item);
}

// 2. Excel UPCs
const excelUpcs = JSON.parse(fs.readFileSync('./excel_upcs.json', 'utf8'));
console.log('Excel UPCs:', excelUpcs.length);
for (const item of excelUpcs) {
  if (item.upc && item.name && !upcMap.has(item.upc)) {
    upcMap.set(item.upc, item);
  }
}

// 3. All PDF UPCs
const pdfUpcs = JSON.parse(fs.readFileSync('./all_pdf_upcs.json', 'utf8'));
console.log('PDF UPCs:', pdfUpcs.length);
for (const item of pdfUpcs) {
  if (!upcMap.has(item.upc)) upcMap.set(item.upc, item);
}

// 4. Maybe UPCs
const maybeUpcs = JSON.parse(fs.readFileSync('./maybe_upcs.json', 'utf8'));
console.log('Maybe UPCs:', maybeUpcs.length);
for (const item of maybeUpcs) {
  if (!upcMap.has(item.upc)) upcMap.set(item.upc, item);
}

// 5. All UPCs (previous combined)
const allUpcs = JSON.parse(fs.readFileSync('./all_upcs.json', 'utf8'));
console.log('All UPCs:', allUpcs.length);
for (const item of allUpcs) {
  if (item.upc && item.name && !upcMap.has(item.upc)) {
    upcMap.set(item.upc, item);
  }
}

// 6. Invoice UPCs
const invoiceUpcs = JSON.parse(fs.readFileSync('./all_invoice_upcs.json', 'utf8'));
console.log('Invoice UPCs:', invoiceUpcs.length);
for (const item of invoiceUpcs) {
  if (!upcMap.has(item.upc)) upcMap.set(item.upc, item);
}

const combined = Array.from(upcMap.values());
console.log('\nTotal unique UPCs:', combined.length);

fs.writeFileSync('./master_upcs.json', JSON.stringify(combined, null, 2));
