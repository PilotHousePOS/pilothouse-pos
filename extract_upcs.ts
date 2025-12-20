import ExcelJS from 'exceljs';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function extractFromExcel(filePath: string, name: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const results: Array<{name: string, upc: string, description?: string}> = [];
  
  workbook.eachSheet((worksheet, sheetId) => {
    console.log(`\n=== ${name} - Sheet: ${worksheet.name} ===`);
    
    // Get headers
    const headers: string[] = [];
    const firstRow = worksheet.getRow(1);
    firstRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').toLowerCase();
    });
    
    console.log('Headers:', headers.filter(h => h).join(', '));
    
    // Find UPC/SKU and Name columns
    const upcCol = headers.findIndex(h => h && (h.includes('upc') || h.includes('sku') || h.includes('barcode')));
    const nameCol = headers.findIndex(h => h && (h.includes('name') || h.includes('description') || h.includes('item')));
    
    if (upcCol > 0 || nameCol > 0) {
      console.log(`UPC column: ${upcCol > 0 ? headers[upcCol] : 'not found'}`);
      console.log(`Name column: ${nameCol > 0 ? headers[nameCol] : 'not found'}`);
      
      let count = 0;
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        
        const upc = upcCol > 0 ? String(row.getCell(upcCol).value || '').trim() : '';
        const itemName = nameCol > 0 ? String(row.getCell(nameCol).value || '').trim() : '';
        
        if (upc && upc.length >= 8 && /^\d+$/.test(upc)) {
          results.push({ name: itemName, upc: upc });
          count++;
        }
      });
      
      console.log(`Found ${count} items with valid UPCs`);
    }
  });
  
  return results;
}

async function main() {
  const files = [
    { path: 'attached_assets/AnimalHouse_Exatouch_Import.xlsx', name: 'Exatouch Import' },
    { path: 'attached_assets/AnimalHouse_Inventory_2025-12-04 (1)_1764877836470.xlsx', name: 'Inventory 2025-12-04' },
    { path: 'attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx', name: 'InventoryMaybe' },
    { path: 'attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx', name: 'Final Inventory' },
  ];
  
  const allResults: Array<{name: string, upc: string}> = [];
  
  for (const file of files) {
    try {
      const results = await extractFromExcel(file.path, file.name);
      allResults.push(...results);
    } catch (err) {
      console.error(`Error processing ${file.name}:`, err);
    }
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total items with UPCs: ${allResults.length}`);
  
  // Dedupe by UPC
  const uniqueUPCs = new Map<string, string>();
  for (const item of allResults) {
    if (!uniqueUPCs.has(item.upc)) {
      uniqueUPCs.set(item.upc, item.name);
    }
  }
  console.log(`Unique UPCs: ${uniqueUPCs.size}`);
  
  // Check current coverage
  const { rows: current } = await pool.query(`
    SELECT COUNT(*) as total, COUNT(sku) as with_sku FROM supplies
  `);
  console.log(`\nCurrent coverage: ${current[0].with_sku}/${current[0].total}`);
  
  // Sample of UPCs to match
  console.log('\nSample UPCs to match:');
  let i = 0;
  for (const [upc, name] of uniqueUPCs) {
    if (i++ >= 10) break;
    console.log(`  ${upc}: ${name.substring(0, 60)}`);
  }
  
  await pool.end();
}

main().catch(console.error);
