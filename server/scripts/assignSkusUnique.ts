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
  console.log('[SKU-UNIQUE] Step 1: Clearing all existing SKUs...');
  await db.update(supplies).set({ sku: null });
  
  console.log('[SKU-UNIQUE] Step 2: Loading Excel data (filtering unique SKUs only)...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const sheet = workbook.worksheets[0];
  
  const skuCount = new Map<string, number>();
  const skuToItem = new Map<string, { name: string; normalized: string }>();
  
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const sku = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (sku && name) {
      skuCount.set(sku, (skuCount.get(sku) || 0) + 1);
      const expanded = expandAbbreviations(name);
      skuToItem.set(sku, { name, normalized: normalizeForMatching(expanded) });
    }
  });
  
  const uniqueSkuItems: { sku: string; name: string; normalized: string }[] = [];
  for (const [sku, count] of skuCount) {
    if (count === 1) {
      const item = skuToItem.get(sku)!;
      uniqueSkuItems.push({ sku, name: item.name, normalized: item.normalized });
    }
  }
  
  console.log(`[SKU-UNIQUE] Total SKUs in Excel: ${skuCount.size}`);
  console.log(`[SKU-UNIQUE] Unique SKUs (used only once): ${uniqueSkuItems.length}`);
  console.log(`[SKU-UNIQUE] Duplicate SKUs (skipped): ${skuCount.size - uniqueSkuItems.length}`);
  
  console.log('[SKU-UNIQUE] Step 3: Loading database items...');
  const allSupplies = await db.select({ id: supplies.id, name: supplies.name }).from(supplies);
  console.log(`[SKU-UNIQUE] Found ${allSupplies.length} database items`);
  
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
  
  for (const dup of duplicateDbKeys) {
    dbByNormalized.delete(dup);
  }
  
  console.log('[SKU-UNIQUE] Step 4: Matching exact names only...');
  const updates: { id: number; sku: string }[] = [];
  let matched = 0;
  let noMatch = 0;
  
  for (const excel of uniqueSkuItems) {
    const match = dbByNormalized.get(excel.normalized);
    if (match) {
      updates.push({ id: match.id, sku: excel.sku });
      matched++;
    } else {
      noMatch++;
    }
  }
  
  console.log(`\n[SKU-UNIQUE] === MATCH SUMMARY ===`);
  console.log(`Matched: ${matched}`);
  console.log(`No match: ${noMatch}`);
  
  console.log(`\n[SKU-UNIQUE] Step 5: Applying updates...`);
  const batchSize = 50;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    await Promise.all(batch.map(u => 
      db.update(supplies).set({ sku: u.sku }).where(eq(supplies.id, u.id))
    ));
    if ((i + batchSize) % 500 === 0 || i + batchSize >= updates.length) {
      console.log(`[SKU-UNIQUE] Progress: ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
    }
  }
  
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  console.log(`\n[SKU-UNIQUE] === FINAL ===`);
  console.log(`Total supplies with SKU: ${countResult[0].count}`);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
