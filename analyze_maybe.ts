import ExcelJS from 'exceljs';

async function analyzeInventoryMaybe() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  workbook.eachSheet((worksheet) => {
    console.log(`\n=== Sheet: ${worksheet.name} ===`);
    console.log(`Total rows: ${worksheet.rowCount}`);
    
    // Get headers
    const headers: string[] = [];
    const firstRow = worksheet.getRow(1);
    firstRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '');
    });
    console.log('Headers:', headers.filter(h => h).join(' | '));
    
    // Sample first 10 rows
    console.log('\nSample data:');
    for (let i = 2; i <= Math.min(12, worksheet.rowCount); i++) {
      const row = worksheet.getRow(i);
      const values: string[] = [];
      row.eachCell((cell, colNumber) => {
        values.push(String(cell.value || '').substring(0, 40));
      });
      console.log(`  Row ${i}: ${values.join(' | ')}`);
    }
  });
}

analyzeInventoryMaybe().catch(console.error);
