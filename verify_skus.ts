import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNotNull, sql } from 'drizzle-orm';

async function main() {
  // Load InventoryMaybe for verification
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = workbook.getWorksheet('Sheet1');
  
  // Build UPC -> Name map from InventoryMaybe
  const maybeMap = new Map<string, string>();
  ws?.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name) maybeMap.set(upc, name);
  });
  
  console.log(`InventoryMaybe: ${maybeMap.size} UPCs loaded\n`);
  
  // Get products WITH SKUs
  const productsWithSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
  }).from(supplies).where(isNotNull(supplies.sku)).limit(500);
  
  console.log(`Checking ${productsWithSku.length} products with SKUs...\n`);
  
  let correct = 0;
  let incorrect = 0;
  let notFound = 0;
  const mismatches: Array<{id: number, dbName: string, sku: string, maybeName: string}> = [];
  
  for (const prod of productsWithSku) {
    const maybeName = maybeMap.get(prod.sku!);
    if (maybeName) {
      // Normalize both for comparison
      const dbNorm = prod.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const maybeNorm = maybeName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Check similarity
      const shorter = Math.min(dbNorm.length, maybeNorm.length);
      const longer = Math.max(dbNorm.length, maybeNorm.length);
      
      // Simple check: do they share significant content?
      let matchChars = 0;
      for (let i = 0; i < shorter; i++) {
        if (dbNorm.includes(maybeNorm[i])) matchChars++;
      }
      const similarity = matchChars / shorter;
      
      if (dbNorm === maybeNorm || similarity > 0.8) {
        correct++;
      } else {
        incorrect++;
        if (mismatches.length < 20) {
          mismatches.push({id: prod.id, dbName: prod.name, sku: prod.sku!, maybeName});
        }
      }
    } else {
      notFound++;
    }
  }
  
  console.log(`=== SKU VERIFICATION RESULTS ===`);
  console.log(`Correct (name matches UPC): ${correct}`);
  console.log(`Incorrect (name doesn't match): ${incorrect}`);
  console.log(`Not in InventoryMaybe: ${notFound}`);
  
  if (mismatches.length > 0) {
    console.log(`\n=== SAMPLE MISMATCHES (verify manually) ===`);
    for (const m of mismatches) {
      console.log(`ID ${m.id}: "${m.dbName}"`);
      console.log(`  SKU ${m.sku} -> InventoryMaybe: "${m.maybeName}"`);
      console.log();
    }
  }
}
main();
