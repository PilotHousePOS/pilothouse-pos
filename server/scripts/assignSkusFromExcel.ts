import ExcelJS from 'exceljs';
import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, ilike, sql } from 'drizzle-orm';
import { expandAbbreviations } from '../abbreviationExpansion';

interface ExcelRow {
  sku: string;
  name: string;
}

function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function main() {
  console.log('[SKU-EXCEL] Starting SKU assignment from Excel file...');
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const sheet = workbook.worksheets[0];
  const rows: ExcelRow[] = [];
  
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    
    const sku = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    
    if (sku && name) {
      rows.push({ sku, name });
    }
  });
  
  console.log(`[SKU-EXCEL] Loaded ${rows.length} items from Excel`);
  
  const allSupplies = await db.select({ id: supplies.id, name: supplies.name, sku: supplies.sku }).from(supplies);
  console.log(`[SKU-EXCEL] Found ${allSupplies.length} supplies in database`);
  
  const dbMap = new Map<string, { id: number; name: string; sku: string | null }>();
  for (const s of allSupplies) {
    const key = normalizeForMatching(s.name);
    dbMap.set(key, s);
  }
  
  let matched = 0;
  let alreadyHasSku = 0;
  let notFound = 0;
  const updates: { id: number; sku: string }[] = [];
  
  for (const excelItem of rows) {
    const expandedName = expandAbbreviations(excelItem.name);
    const key = normalizeForMatching(expandedName);
    
    const match = dbMap.get(key);
    
    if (match) {
      if (match.sku && match.sku.trim() !== '') {
        alreadyHasSku++;
      } else {
        updates.push({ id: match.id, sku: excelItem.sku });
        matched++;
      }
    } else {
      notFound++;
    }
  }
  
  console.log(`\n[SKU-EXCEL] === PRE-UPDATE SUMMARY ===`);
  console.log(`Will update: ${updates.length}`);
  console.log(`Already have SKU: ${alreadyHasSku}`);
  console.log(`Not found in DB: ${notFound}`);
  
  if (updates.length > 0) {
    console.log(`\n[SKU-EXCEL] Applying ${updates.length} SKU updates in batch...`);
    
    const batchSize = 50;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      await Promise.all(batch.map(u => 
        db.update(supplies).set({ sku: u.sku }).where(eq(supplies.id, u.id))
      ));
      console.log(`[SKU-EXCEL] Progress: ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
    }
  }
  
  const suppliesWithSku = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  console.log(`\n[SKU-EXCEL] === FINAL SUMMARY ===`);
  console.log(`Successfully updated: ${updates.length}`);
  console.log(`Total supplies with SKU now: ${suppliesWithSku[0].count}`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('[SKU-EXCEL] Fatal error:', err);
  process.exit(1);
});
