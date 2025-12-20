import ExcelJS from 'exceljs';
import * as fs from 'fs';

async function investigate() {
  // 1. Check Google Spreadsheet structure
  console.log('=== GOOGLE SPREADSHEET (Inventory 2025-12-04) ===');
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile('attached_assets/AnimalHouse_Inventory_2025-12-04 (1)_1764877836470.xlsx');
  
  wb1.eachSheet((ws) => {
    console.log(`\nSheet: ${ws.name}`);
    const headers: string[] = [];
    ws.getRow(1).eachCell((cell, col) => {
      headers[col] = String(cell.value || '');
    });
    console.log('Headers:', headers.filter(h => h).join(' | '));
    
    // Show sample rows
    console.log('Sample data:');
    for (let r = 2; r <= 5; r++) {
      const row = ws.getRow(r);
      const vals: string[] = [];
      row.eachCell((cell, col) => {
        vals[col] = String(cell.value || '').substring(0, 30);
      });
      console.log(`  Row ${r}: ${vals.filter(v => v).join(' | ')}`);
    }
  });
  
  // 2. Check InventoryMaybe around row 3000 for duplicates
  console.log('\n\n=== INVENTORY MAYBE - Around row 3000 ===');
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const ws2 = wb2.getWorksheet('Sheet1');
  if (ws2) {
    const upcs = new Set<string>();
    let firstDupe = 0;
    ws2.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const upc = String(row.getCell(1).value || '').trim();
      if (upc && upc.length >= 8 && /^\d+$/.test(upc)) {
        if (upcs.has(upc) && !firstDupe) {
          firstDupe = rowNumber;
          console.log(`First duplicate UPC at row ${rowNumber}: ${upc}`);
        }
        upcs.add(upc);
      }
    });
    console.log(`Total unique UPCs: ${upcs.size}`);
    
    // Show rows around 2990-3010
    console.log('\nRows 2990-3010:');
    for (let r = 2990; r <= 3010; r++) {
      const row = ws2.getRow(r);
      const upc = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      console.log(`  Row ${r}: ${upc} | ${name}`);
    }
  }
  
  // 3. Count invoice text files in all locations
  console.log('\n\n=== INVOICE FILES ===');
  const dirs = ['attached_assets/extracted_orders', 'attached_assets/extracted_orders2'];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
      console.log(`${dir}: ${files.length} text files`);
    }
  }
  
  // 4. Sample invoice content
  console.log('\n\n=== SAMPLE INVOICE CONTENT ===');
  const sampleFile = 'attached_assets/extracted_orders/0372e565-0b19-4120-8446-2399b55b121b.txt';
  if (fs.existsSync(sampleFile)) {
    const content = fs.readFileSync(sampleFile, 'utf-8');
    console.log(content.substring(0, 2000));
  }
}

investigate().catch(console.error);
