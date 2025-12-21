const ExcelJS = require('exceljs');
const fs = require('fs');

async function parseExcel(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const upcs = [];
  for (const sheet of workbook.worksheets) {
    let headers = [];
    let upcCol = -1, nameCol = -1;
    
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        headers = row.values.map((v, i) => String(v || '').toLowerCase());
        // Find UPC column
        for (let i = 0; i < headers.length; i++) {
          if (headers[i].includes('upc') || headers[i].includes('barcode') || headers[i].includes('sku')) {
            upcCol = i;
          }
          if (headers[i].includes('name') || headers[i].includes('description') || headers[i].includes('item')) {
            nameCol = i;
          }
        }
      } else if (upcCol >= 0 && nameCol >= 0) {
        const upc = String(row.values[upcCol] || '').replace(/\s/g, '');
        const name = String(row.values[nameCol] || '');
        if (upc && upc.length >= 10 && name) {
          upcs.push({ upc, name });
        }
      }
    });
  }
  return upcs;
}

async function main() {
  const files = [
    'attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx',
    'attached_assets/AnimalHouse_Inventory_2025-12-04 (1)_1764877836470.xlsx',
    'attached_assets/AnimalHouse_Exatouch_Import.xlsx',
  ];
  
  let allUpcs = [];
  for (const file of files) {
    try {
      const upcs = await parseExcel(file);
      console.log(`${file}: ${upcs.length} UPCs`);
      allUpcs = [...allUpcs, ...upcs];
    } catch (e) {
      console.log(`${file}: Error - ${e.message}`);
    }
  }
  
  // Dedupe
  const unique = new Map();
  for (const e of allUpcs) {
    if (!unique.has(e.upc)) unique.set(e.upc, e);
  }
  
  console.log(`\nTotal unique UPCs: ${unique.size}`);
  
  // Save to file
  fs.writeFileSync('excel_extracted_upcs.json', JSON.stringify(Array.from(unique.values()), null, 2));
  console.log('Saved to excel_extracted_upcs.json');
}

main().catch(console.error);
