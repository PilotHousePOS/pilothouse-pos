const ExcelJS = require('exceljs');
const fs = require('fs');

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const sheet = workbook.worksheets[0];
  const items = [];
  
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    
    if (upc && name && upc.length >= 8 && /^\d+$/.test(upc)) {
      items.push({ upc, name, source: 'maybe' });
    }
  }
  
  console.log(`Extracted ${items.length} items from Maybe inventory`);
  fs.writeFileSync('./maybe_upcs.json', JSON.stringify(items, null, 2));
}

main().catch(console.error);
