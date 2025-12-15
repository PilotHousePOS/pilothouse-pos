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
  console.log('[SKU-CLEAN] Step 1: Clearing all existing SKUs...');
  await db.update(supplies).set({ sku: null });
  
  console.log('[SKU-CLEAN] Step 2: Loading Excel data (rows 2-3175 only - before duplicates)...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const sheet = workbook.worksheets[0];
  
  const excelItems: { sku: string; name: string; normalized: string; row: number }[] = [];
  
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || rowNumber > 3175) return; // Only clean section
    const sku = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (sku && name) {
      const expanded = expandAbbreviations(name);
      excelItems.push({ 
        sku, 
        name, 
        normalized: normalizeForMatching(expanded),
        row: rowNumber 
      });
    }
  });
  
  console.log(`[SKU-CLEAN] Loaded ${excelItems.length} items from Excel (rows 2-3175)`);
  
  console.log('[SKU-CLEAN] Step 3: Loading database items...');
  const allSupplies = await db.select({ id: supplies.id, name: supplies.name }).from(supplies);
  console.log(`[SKU-CLEAN] Found ${allSupplies.length} database items`);
  
  // Build map of normalized names to db items
  // Skip duplicates in the database
  const dbByNormalized = new Map<string, { id: number; name: string }>();
  const duplicateDbKeys = new Set<string>();
  
  for (const s of allSupplies) {
    const norm = normalizeForMatching(s.name);
    if (dbByNormalized.has(norm)) {
      duplicateDbKeys.add(norm);
    } else {
      dbByNormalized.set(norm, s);
    }
  }
  
  // Remove duplicates
  for (const dup of duplicateDbKeys) {
    dbByNormalized.delete(dup);
  }
  
  console.log(`[SKU-CLEAN] Unique normalized DB names: ${dbByNormalized.size}`);
  console.log(`[SKU-CLEAN] Duplicate DB names (skipped): ${duplicateDbKeys.size}`);
  
  console.log('[SKU-CLEAN] Step 4: Matching Excel items to database...');
  const updates: { id: number; sku: string; dbName: string; excelName: string }[] = [];
  const usedSkus = new Set<string>();
  
  for (const excel of excelItems) {
    // Skip if we already used this SKU (shouldn't happen in clean section, but safety check)
    if (usedSkus.has(excel.sku)) continue;
    
    const match = dbByNormalized.get(excel.normalized);
    if (match) {
      updates.push({ 
        id: match.id, 
        sku: excel.sku, 
        dbName: match.name,
        excelName: excel.name 
      });
      usedSkus.add(excel.sku);
      // Remove from map so we don't match the same db item twice
      dbByNormalized.delete(excel.normalized);
    }
  }
  
  console.log(`\n[SKU-CLEAN] === MATCH SUMMARY ===`);
  console.log(`Matched: ${updates.length}`);
  console.log(`Unique SKUs used: ${usedSkus.size}`);
  
  // Show some examples
  console.log(`\n[SKU-CLEAN] Sample matches:`);
  for (let i = 0; i < Math.min(10, updates.length); i++) {
    const u = updates[i];
    console.log(`  SKU ${u.sku}: "${u.excelName}" -> "${u.dbName}"`);
  }
  
  console.log(`\n[SKU-CLEAN] Step 5: Applying ${updates.length} updates...`);
  const batchSize = 50;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    await Promise.all(batch.map(u => 
      db.update(supplies).set({ sku: u.sku }).where(eq(supplies.id, u.id))
    ));
    if ((i + batchSize) % 500 === 0 || i + batchSize >= updates.length) {
      console.log(`[SKU-CLEAN] Progress: ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
    }
  }
  
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  console.log(`\n[SKU-CLEAN] === FINAL ===`);
  console.log(`Total supplies with SKU: ${countResult[0].count}`);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
