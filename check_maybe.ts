import ExcelJS from 'exceljs';
async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = workbook.getWorksheet('Sheet1');
  ws?.eachRow((row, i) => {
    if (i <= 25) {
      const upc = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      console.log(upc + ' | ' + name);
    }
  });
}
main();
