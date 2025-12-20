import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { ilike, isNull, or, sql } from 'drizzle-orm';

async function extractFromExcel() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx');
  
  const results: Array<{name: string, upc: string}> = [];
  const worksheet = workbook.getWorksheet('Items');
  
  if (worksheet) {
    const headers: string[] = [];
    const firstRow = worksheet.getRow(1);
    firstRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').toLowerCase();
    });
    
    const skuCol = headers.findIndex(h => h === 'sku');
    const descCol = headers.findIndex(h => h === 'description');
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      
      const upc = String(row.getCell(skuCol).value || '').trim();
      const name = String(row.getCell(descCol).value || '').trim();
      
      if (upc && upc.length >= 8 && /^\d+$/.test(upc) && name) {
        results.push({ name, upc });
      }
    });
  }
  
  console.log(`Extracted ${results.length} items with UPCs from Excel`);
  return results;
}

function normalizeForMatching(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function matchAndUpdate() {
  const excelData = await extractFromExcel();
  
  // Get all products without SKU
  const productsWithoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    description: supplies.description,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Products without SKU: ${productsWithoutSku.length}`);
  
  // Build normalized index for fast matching
  const normalizedIndex = new Map<string, {id: number, name: string}>();
  for (const product of productsWithoutSku) {
    const normalized = normalizeForMatching(product.name);
    normalizedIndex.set(normalized, { id: product.id, name: product.name });
  }
  
  let matchCount = 0;
  let updateCount = 0;
  const matches: Array<{productId: number, productName: string, excelName: string, upc: string}> = [];
  
  for (const excelItem of excelData) {
    const normalizedExcel = normalizeForMatching(excelItem.name);
    
    // Try exact normalized match
    const match = normalizedIndex.get(normalizedExcel);
    if (match) {
      matches.push({
        productId: match.id,
        productName: match.name,
        excelName: excelItem.name,
        upc: excelItem.upc
      });
      matchCount++;
      normalizedIndex.delete(normalizedExcel); // Prevent duplicate matches
    }
  }
  
  console.log(`\nFound ${matchCount} exact matches`);
  
  // Apply updates in batches
  for (let i = 0; i < matches.length; i += 100) {
    const batch = matches.slice(i, i + 100);
    for (const match of batch) {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(sql`${supplies.id} = ${match.productId}`);
      updateCount++;
    }
    console.log(`Updated ${Math.min(i + 100, matches.length)}/${matches.length}`);
  }
  
  // Get new coverage stats
  const [stats] = await db.select({
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(sku)`
  }).from(supplies);
  
  console.log(`\n=== FINAL COVERAGE ===`);
  console.log(`Products with SKU: ${stats.withSku}/${stats.total} (${(stats.withSku/stats.total*100).toFixed(1)}%)`);
  console.log(`New matches applied: ${updateCount}`);
  
  process.exit(0);
}

matchAndUpdate().catch(console.error);
