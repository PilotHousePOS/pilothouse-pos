const ExcelJS = require('exceljs');

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./attached_assets/AnimalHouse_Inventory_2025-12-04 (1)_1764877836470.xlsx');
  
  for (const sheet of workbook.worksheets) {
    console.log(`\nSheet: ${sheet.name}, rows: ${sheet.rowCount}`);
    
    // Show headers
    const headerRow = sheet.getRow(1);
    const headers = [];
    for (let c = 1; c <= 20; c++) {
      const val = String(headerRow.getCell(c).value || '').trim();
      if (val) headers.push(`${c}:${val}`);
    }
    console.log(`Headers: ${headers.join(', ')}`);
    
    // Show sample rows
    for (let r = 2; r <= 4; r++) {
      const row = sheet.getRow(r);
      const vals = [];
      for (let c = 1; c <= 10; c++) {
        vals.push(String(row.getCell(c).value || '').substring(0, 20));
      }
      console.log(`Row ${r}: ${vals.join(' | ')}`);
    }
  }
}

main().catch(console.error);
