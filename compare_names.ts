import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull } from 'drizzle-orm';

async function compare() {
  // Get sample from InventoryMaybe
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const ws = wb.getWorksheet('Sheet1');
  const maybeItems: Array<{upc: string, name: string}> = [];
  
  if (ws) {
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1 || maybeItems.length >= 200) return;
      const upc = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      if (upc && name) maybeItems.push({ upc, name });
    });
  }
  
  // Get products without SKU
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log('Looking for potential matches by key words...\n');
  
  // Try to find matches by looking for key terms
  for (const item of maybeItems.slice(0, 50)) {
    const itemLower = item.name.toLowerCase();
    
    for (const prod of products) {
      const prodLower = prod.name.toLowerCase();
      
      // Check if they might be the same product
      // Look for brand + key product identifier
      if (itemLower.includes('lizard lounger') && prodLower.includes('lizard lounger')) {
        console.log(`MAYBE: "${item.name}" (${item.upc})`);
        console.log(`   DB: "${prod.name}" (ID: ${prod.id})\n`);
        break;
      }
      if (itemLower.includes('repti hammock') && prodLower.includes('hammock')) {
        console.log(`MAYBE: "${item.name}" (${item.upc})`);
        console.log(`   DB: "${prod.name}" (ID: ${prod.id})\n`);
        break;
      }
      if (itemLower.includes('zoomed') && prodLower.includes('zoo med')) {
        const itemWords = itemLower.split(/\s+/);
        const prodWords = prodLower.split(/\s+/);
        const shared = itemWords.filter(w => w.length > 3 && prodWords.some(pw => pw.includes(w) || w.includes(pw)));
        if (shared.length >= 2) {
          console.log(`MAYBE: "${item.name}" (${item.upc})`);
          console.log(`   DB: "${prod.name}" (ID: ${prod.id})`);
          console.log(`   Shared: ${shared.join(', ')}\n`);
          break;
        }
      }
    }
  }
  
  process.exit(0);
}

compare().catch(console.error);
