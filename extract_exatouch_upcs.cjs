const ExcelJS = require('exceljs');
const fs = require('fs');

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx');
  
  const sheet = workbook.worksheets[0];
  const upcs = [];
  
  // SKU is column 24 (index 23 in 0-based, 24 in 1-based)
  // Description is column 2
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    const sku = String(row.values[24] || '').replace(/\s/g, '');
    const name = String(row.values[2] || '');
    
    if (sku && sku.length >= 10 && name) {
      upcs.push({ upc: sku, name });
    }
  });
  
  console.log(`Extracted ${upcs.length} UPCs from EXATOUCH inventory`);
  
  // Dedupe by UPC
  const unique = new Map();
  for (const e of upcs) {
    if (!unique.has(e.upc)) unique.set(e.upc, e);
  }
  
  console.log(`Unique UPCs: ${unique.size}`);
  
  fs.writeFileSync('exatouch_upcs.json', JSON.stringify(Array.from(unique.values()), null, 2));
  console.log('Saved to exatouch_upcs.json');
}

main().catch(console.error);
