const ExcelJS = require('exceljs');

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./attached_assets/AnimalHouse_Exatouch_Import.xlsx');
  
  for (const sheet of workbook.worksheets) {
    console.log(`\nSheet: ${sheet.name}, rows: ${sheet.rowCount}`);
    
    const headerRow = sheet.getRow(1);
    const headers = [];
    for (let c = 1; c <= 30; c++) {
      const val = String(headerRow.getCell(c).value || '').trim();
      if (val) headers.push(`${c}:${val}`);
    }
    console.log(`Headers: ${headers.join(', ')}`);
    
    // Count UPCs
    let upcCount = 0;
    let upcCol = -1;
    for (let c = 1; c <= 30; c++) {
      const h = String(headerRow.getCell(c).value || '').toLowerCase();
      if (h.includes('upc') || h.includes('barcode') || h.includes('ean')) {
        upcCol = c;
        break;
      }
    }
    
    if (upcCol > 0) {
      const upcs = new Set();
      for (let r = 2; r <= sheet.rowCount; r++) {
        const upc = String(sheet.getRow(r).getCell(upcCol).value || '').trim();
        if (upc && upc.length >= 8 && /^\d+$/.test(upc)) {
          upcs.add(upc);
        }
      }
      console.log(`Found ${upcs.size} unique UPCs in column ${upcCol}`);
    }
  }
}

main().catch(console.error);
