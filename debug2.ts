import ExcelJS from 'exceljs';
import { expandAbbreviations } from './server/abbreviationExpansion';

function normalize(str: string): string {
  return str.toLowerCase()
    .replace(/['".\-_\/\&\#\(\)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = workbook.getWorksheet('Sheet1');
  
  ws?.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (name.toLowerCase() === 'nibbles small pet chew') {
      const expanded = expandAbbreviations(name);
      console.log(`Raw: "${name}"`);
      console.log(`Expanded: "${expanded}"`);
      console.log(`Normalized: "${normalize(expanded)}"`);
      console.log(`DB normalized: "nibbles small pet chew"`);
      console.log(`Match: ${normalize(expanded) === 'nibbles small pet chew'}`);
      console.log();
    }
  });
}
main();
