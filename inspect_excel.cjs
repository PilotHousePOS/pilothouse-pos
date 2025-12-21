const ExcelJS = require('exceljs');

async function inspect(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  console.log(`\n=== ${filePath} ===`);
  for (const sheet of workbook.worksheets) {
    console.log(`Sheet: ${sheet.name}`);
    const firstRow = sheet.getRow(1).values;
    console.log('Headers:', firstRow ? firstRow.filter(v => v) : 'none');
    console.log('Rows:', sheet.rowCount);
    break;
  }
}

async function main() {
  await inspect('attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx');
  await inspect('attached_assets/AnimalHouse_Inventory_2025-12-04 (1)_1764877836470.xlsx');
}

main().catch(console.error);
