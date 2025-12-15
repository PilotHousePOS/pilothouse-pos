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

function wordsMatch(excel: string, db: string): boolean {
  const excelWords = new Set(excel.split(' ').filter(w => w.length > 1));
  const dbWords = new Set(db.split(' ').filter(w => w.length > 1));
  
  if (excelWords.size === 0 || dbWords.size === 0) return false;
  
  let matchCount = 0;
  for (const w of excelWords) {
    if (dbWords.has(w)) matchCount++;
  }
  
  const matchRatio = matchCount / Math.max(excelWords.size, dbWords.size);
  return matchRatio >= 0.8;
}

async function main() {
  console.log('[SKU-EXACT] Step 1: Clearing all existing SKUs...');
  await db.update(supplies).set({ sku: null });
  
  console.log('[SKU-EXACT] Step 2: Loading Excel data...');
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
  console.log(`[SKU-EXACT] Loaded ${excelItems.length} Excel items`);
  
  console.log('[SKU-EXACT] Step 3: Loading database items...');
  const allSupplies = await db.select({ id: supplies.id, name: supplies.name }).from(supplies);
  console.log(`[SKU-EXACT] Found ${allSupplies.length} database items`);
  
  const dbByNormalized = new Map<string, { id: number; name: string }[]>();
  for (const s of allSupplies) {
    const norm = normalizeForMatching(s.name);
    if (!dbByNormalized.has(norm)) {
      dbByNormalized.set(norm, []);
    }
    dbByNormalized.get(norm)!.push(s);
  }
  
  console.log('[SKU-EXACT] Step 4: Matching with strict criteria...');
  const updates: { id: number; sku: string; excelName: string; dbName: string }[] = [];
  let exactMatches = 0;
  let wordMatches = 0;
  let noMatch = 0;
  let duplicateKeys = 0;
  
  for (const excel of excelItems) {
    const candidates = dbByNormalized.get(excel.normalized);
    
    if (candidates && candidates.length === 1) {
      updates.push({
        id: candidates[0].id,
        sku: excel.sku,
        excelName: excel.name,
        dbName: candidates[0].name
      });
      exactMatches++;
    } else if (candidates && candidates.length > 1) {
      duplicateKeys++;
    } else {
      let found = false;
      for (const [norm, items] of dbByNormalized.entries()) {
        if (items.length === 1 && wordsMatch(excel.normalized, norm)) {
          updates.push({
            id: items[0].id,
            sku: excel.sku,
            excelName: excel.name,
            dbName: items[0].name
          });
          wordMatches++;
          found = true;
          break;
        }
      }
      if (!found) noMatch++;
    }
  }
  
  console.log(`\n[SKU-EXACT] === MATCH SUMMARY ===`);
  console.log(`Exact normalized matches: ${exactMatches}`);
  console.log(`Word-based matches (80%+): ${wordMatches}`);
  console.log(`Duplicate keys skipped: ${duplicateKeys}`);
  console.log(`No match found: ${noMatch}`);
  console.log(`Total updates to apply: ${updates.length}`);
  
  console.log(`\n[SKU-EXACT] Step 5: Applying updates...`);
  const batchSize = 50;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    await Promise.all(batch.map(u => 
      db.update(supplies).set({ sku: u.sku }).where(eq(supplies.id, u.id))
    ));
    if ((i + batchSize) % 500 === 0 || i + batchSize >= updates.length) {
      console.log(`[SKU-EXACT] Progress: ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
    }
  }
  
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  console.log(`\n[SKU-EXACT] === FINAL ===`);
  console.log(`Total supplies with SKU: ${countResult[0].count}`);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
