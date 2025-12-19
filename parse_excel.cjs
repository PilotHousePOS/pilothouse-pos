const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function parseExcel(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const entries = [];
  
  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // Skip header
      
      const values = row.values;
      // Look for UPC-like numbers and product names
      for (let i = 1; i < values.length; i++) {
        const val = String(values[i] || '').trim();
        // Check if it looks like a UPC (10-14 digits)
        if (/^\d{10,14}$/.test(val)) {
          // Look for product name in adjacent cells
          const name = values[i+1] || values[i-1] || values[i+2];
          if (name && typeof name === 'string' && name.length > 3) {
            entries.push({ upc: val, name: name.trim(), source: path.basename(filePath) });
          }
        }
      }
    });
  });
  
  return entries;
}

async function main() {
  const files = [
    'attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx',
    'attached_assets/AnimalHouse_Exatouch_Import.xlsx',
    'attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx',
    'attached_assets/AnimalHouse_Inventory_2025-12-04 (1)_1764877836470.xlsx'
  ];
  
  let allEntries = [];
  
  for (const file of files) {
    if (fs.existsSync(file)) {
      console.log(`Parsing ${path.basename(file)}...`);
      try {
        const entries = await parseExcel(file);
        console.log(`  Found ${entries.length} UPC entries`);
        allEntries = allEntries.concat(entries);
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }
  }
  
  console.log(`\nTotal entries from Excel: ${allEntries.length}`);
  
  // Add to master database
  const masterDb = JSON.parse(fs.readFileSync('/tmp/master_upc_db.json', 'utf8'));
  let added = 0;
  
  for (const entry of allEntries) {
    if (!masterDb[entry.upc]) {
      masterDb[entry.upc] = entry.name;
      added++;
    }
  }
  
  console.log(`Added ${added} new UPCs to master database`);
  console.log(`New total: ${Object.keys(masterDb).length}`);
  
  fs.writeFileSync('/tmp/master_upc_db.json', JSON.stringify(masterDb, null, 2));
  
  // Sample
  console.log('\nSample new entries:');
  allEntries.slice(0, 10).forEach(e => console.log(`  ${e.upc}: ${e.name}`));
}

main().catch(console.error);
