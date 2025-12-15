import ExcelJS from 'exceljs';
import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { expandAbbreviations } from '../abbreviationExpansion';

function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('[SKU-STRICT] Step 1: Clearing all existing SKUs...');
  await db.update(supplies).set({ sku: null });
  
  console.log('[SKU-STRICT] Step 2: Loading Excel data...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const sheet = workbook.worksheets[0];
  
  const excelItems: { sku: string; name: string; normalized: string }[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const sku = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (sku && name) {
      const expanded = expandAbbreviations(name);
      excelItems.push({ 
        sku, 
        name, 
        normalized: normalizeForMatching(expanded) 
      });
    }
  });
  console.log(`[SKU-STRICT] Loaded ${excelItems.length} Excel items`);
  
  console.log('[SKU-STRICT] Step 3: Loading database items...');
  const allSupplies = await db.select({ id: supplies.id, name: supplies.name }).from(supplies);
  console.log(`[SKU-STRICT] Found ${allSupplies.length} database items`);
  
  const dbByNormalized = new Map<string, { id: number; name: string }>();
  const duplicateKeys = new Set<string>();
  
  for (const s of allSupplies) {
    const norm = normalizeForMatching(s.name);
    if (dbByNormalized.has(norm)) {
      duplicateKeys.add(norm);
    } else {
      dbByNormalized.set(norm, s);
    }
  }
  
  for (const dup of duplicateKeys) {
    dbByNormalized.delete(dup);
  }
  console.log(`[SKU-STRICT] Unique normalized names: ${dbByNormalized.size}`);
  console.log(`[SKU-STRICT] Duplicate keys removed: ${duplicateKeys.size}`);
  
  console.log('[SKU-STRICT] Step 4: Matching EXACT only...');
  const updates: { id: number; sku: string }[] = [];
  let exactMatches = 0;
  let noMatch = 0;
  
  for (const excel of excelItems) {
    const match = dbByNormalized.get(excel.normalized);
    
    if (match) {
      updates.push({ id: match.id, sku: excel.sku });
      exactMatches++;
    } else {
      noMatch++;
    }
  }
  
  console.log(`\n[SKU-STRICT] === MATCH SUMMARY ===`);
  console.log(`Exact matches: ${exactMatches}`);
  console.log(`No match: ${noMatch}`);
  console.log(`Total updates: ${updates.length}`);
  
  console.log(`\n[SKU-STRICT] Step 5: Applying updates...`);
  const batchSize = 50;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    await Promise.all(batch.map(u => 
      db.update(supplies).set({ sku: u.sku }).where(eq(supplies.id, u.id))
    ));
    if ((i + batchSize) % 500 === 0 || i + batchSize >= updates.length) {
      console.log(`[SKU-STRICT] Progress: ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
    }
  }
  
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  console.log(`\n[SKU-STRICT] === FINAL ===`);
  console.log(`Total supplies with SKU: ${countResult[0].count}`);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
