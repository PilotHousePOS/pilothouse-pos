import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull, ilike, sql } from 'drizzle-orm';

async function main() {
  // Get some products without SKU
  const productsNoSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies).where(isNull(supplies.sku)).limit(50);
  
  // Load InventoryMaybe
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = workbook.getWorksheet('Sheet1');
  
  const maybeData: Array<{upc: string, name: string}> = [];
  ws?.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name) maybeData.push({upc, name});
  });
  
  console.log('Products without SKU vs InventoryMaybe:\n');
  
  // For each product without SKU, search for similar name in InventoryMaybe
  for (const prod of productsNoSku.slice(0, 20)) {
    const normalized = prod.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Find best match in InventoryMaybe
    let bestMatch = null;
    let bestScore = 0;
    
    for (const maybe of maybeData) {
      const maybeNorm = maybe.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Check for significant overlap
      if (normalized.includes(maybeNorm.slice(0, 10)) || maybeNorm.includes(normalized.slice(0, 10))) {
        const score = Math.min(normalized.length, maybeNorm.length) / Math.max(normalized.length, maybeNorm.length);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = maybe;
        }
      }
    }
    
    if (bestMatch && bestScore > 0.5) {
      console.log(`DB: "${prod.name}"`);
      console.log(`  Maybe: "${bestMatch.name}" (${bestMatch.upc}) [${(bestScore*100).toFixed(0)}%]`);
      console.log();
    }
  }
}
main();
