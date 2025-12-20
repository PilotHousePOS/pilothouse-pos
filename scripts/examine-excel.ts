import ExcelJS from 'exceljs';

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  workbook.eachSheet((sheet) => {
    console.log(`\nSheet: ${sheet.name}`);
    console.log(`Rows: ${sheet.rowCount}, Columns: ${sheet.columnCount}`);
    
    // Show first row (headers)
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, col) => {
      headers.push(`${col}: ${cell.value}`);
    });
    console.log('Headers:', headers.join(' | '));
    
    // Show sample data rows
    console.log('\nSample rows:');
    for (let i = 2; i <= Math.min(10, sheet.rowCount); i++) {
      const row = sheet.getRow(i);
      const vals: string[] = [];
      row.eachCell((cell, col) => {
        vals.push(`${col}:${String(cell.value).substring(0, 30)}`);
      });
      console.log(`  Row ${i}: ${vals.join(' | ')}`);
    }
    
    // Count potential UPCs
    let upcCount = 0;
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      row.eachCell((cell) => {
        const val = String(cell.value || '').trim();
        if (/^\d{10,14}$/.test(val)) upcCount++;
      });
    });
    console.log(`\nPotential UPCs in sheet: ${upcCount}`);
  });
}

main().catch(console.error);
