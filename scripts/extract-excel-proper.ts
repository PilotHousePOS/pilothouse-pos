import fs from 'fs';
import ExcelJS from 'exceljs';

interface UPCEntry { upc: string; name: string; source: string; }

async function main() {
  console.log('Extracting UPCs from Excel properly...');
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const excelUpcs: UPCEntry[] = [];
  
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // Skip header
      
      const upc = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      
      if (upc && name && /^\d{10,14}$/.test(upc)) {
        excelUpcs.push({ upc, name, source: 'excel_inventory' });
      }
    });
  });
  
  console.log(`Extracted ${excelUpcs.length} UPCs from Excel`);
  
  // Load existing master and merge
  let master: UPCEntry[] = [];
  if (fs.existsSync('.local/state/memory/master_upc_database.json')) {
    master = JSON.parse(fs.readFileSync('.local/state/memory/master_upc_database.json', 'utf-8'));
  }
  
  const existingUpcs = new Set(master.map(m => m.upc));
  let newCount = 0;
  
  for (const u of excelUpcs) {
    if (!existingUpcs.has(u.upc)) {
      master.push(u);
      existingUpcs.add(u.upc);
      newCount++;
    }
  }
  
  console.log(`Added ${newCount} new UPCs from Excel`);
  console.log(`Total master list: ${master.length} UPCs`);
  
  fs.writeFileSync('.local/state/memory/master_upc_database.json', JSON.stringify(master, null, 2));
}

main().catch(console.error);
