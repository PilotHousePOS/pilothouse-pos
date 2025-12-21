const ExcelJS = require('exceljs');
const fs = require('fs');

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./attached_assets/AnimalHouse_Exatouch_Import.xlsx');
  
  const sheet = workbook.getWorksheet('Items');
  console.log(`Items sheet has ${sheet.rowCount} rows`);
  
  // Column 24 is SKU, column 2 is Description
  const items = [];
  const upcs = new Set();
  
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const sku = String(row.getCell(24).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    
    if (sku && name && sku.length >= 8 && /^\d+$/.test(sku)) {
      upcs.add(sku);
      items.push({ upc: sku, name, source: 'exatouch' });
    }
  }
  
  console.log(`Found ${upcs.size} unique UPCs from Exatouch SKU column`);
  
  // Sample
  console.log('\nSample:');
  for (let i = 0; i < 5; i++) {
    console.log(`  ${items[i].upc}: ${items[i].name}`);
  }
  
  // Save
  fs.writeFileSync('./exatouch_extracted.json', JSON.stringify(items, null, 2));
}

main().catch(console.error);
