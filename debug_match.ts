import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull, ilike, eq } from 'drizzle-orm';
import { expandAbbreviations } from './server/abbreviationExpansion';

// Normalize function from main script
function normalize(str: string): string {
  return str.toLowerCase()
    .replace(/['".\-_\/\&\#\(\)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  // Check specific products
  const nibblesProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
  }).from(supplies).where(ilike(supplies.name, '%nibbles small pet%'));
  
  console.log('Database products matching "nibbles small pet":');
  for (const p of nibblesProducts) {
    console.log(`  ID ${p.id}: "${p.name}" (SKU: ${p.sku})`);
    console.log(`  Normalized: "${normalize(p.name)}"`);
  }
  
  // Load InventoryMaybe and find Nibbles entry
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = workbook.getWorksheet('Sheet1');
  
  console.log('\nInventoryMaybe entries matching "nibbles":');
  ws?.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (name.toLowerCase().includes('nibbles')) {
      const expanded = expandAbbreviations(name);
      console.log(`  UPC ${upc}: "${name}"`);
      console.log(`  Expanded: "${expanded}"`);
      console.log(`  Normalized: "${normalize(expanded)}"`);
    }
  });
}
main();
