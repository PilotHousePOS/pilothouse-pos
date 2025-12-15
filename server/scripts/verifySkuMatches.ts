import ExcelJS from 'exceljs';
import { db } from '../db';
import { supplies } from '@shared/schema';
import { expandAbbreviations } from '../abbreviationExpansion';

function normalizeForMatching(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const sheet = workbook.worksheets[0];
  
  const excelBySku = new Map<string, { original: string; expanded: string }>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || rowNumber > 3175) return; // Only clean section before duplicates
    const sku = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (sku && name) {
      excelBySku.set(sku, { original: name, expanded: expandAbbreviations(name) });
    }
  });
  
  const allSupplies = await db.select().from(supplies);
  const withSku = allSupplies.filter(s => s.sku && s.sku.trim() !== '');
  
  let perfect = 0, close = 0, questionable = 0;
  const issues: { sku: string; excel: string; db: string }[] = [];
  
  for (const supply of withSku) {
    const excelData = excelBySku.get(supply.sku!);
    if (excelData) {
      const normExcel = normalizeForMatching(excelData.expanded);
      const normDb = normalizeForMatching(supply.name);
      
      if (normExcel === normDb) {
        perfect++;
      } else if (normExcel.includes(normDb) || normDb.includes(normExcel)) {
        close++;
      } else {
        questionable++;
        if (issues.length < 30) {
          issues.push({ sku: supply.sku!, excel: excelData.original, db: supply.name });
        }
      }
    }
  }
  
  console.log('=== SKU MATCH VERIFICATION (with abbreviation expansion) ===');
  console.log('Perfect matches:', perfect);
  console.log('Close matches (subset):', close);
  console.log('Questionable:', questionable);
  console.log('Total with SKU:', withSku.length);
  
  if (issues.length > 0) {
    console.log('\nSample questionable matches:');
    issues.forEach(i => {
      console.log(`SKU: ${i.sku}`);
      console.log(`  Excel: ${i.excel}`);
      console.log(`  DB:    ${i.db}`);
      console.log('');
    });
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
