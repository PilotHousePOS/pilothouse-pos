import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull } from 'drizzle-orm';

async function debug() {
  // Get sample from InventoryMaybe
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const worksheet = workbook.getWorksheet('Sheet1');
  const maybeItems: Array<{upc: string, name: string}> = [];
  
  if (worksheet) {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (maybeItems.length >= 50) return;
      
      const upc = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      
      if (upc && upc.length >= 8 && /^\d+$/.test(upc) && name) {
        maybeItems.push({ upc, name });
      }
    });
  }
  
  // Get products without SKU
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
  }).from(supplies).where(isNull(supplies.sku)).limit(100);
  
  console.log('=== SAMPLE FROM INVENTORY MAYBE ===');
  for (const item of maybeItems.slice(0, 20)) {
    console.log(`  ${item.upc}: "${item.name}"`);
  }
  
  console.log('\n=== SAMPLE PRODUCTS WITHOUT SKU ===');
  for (const prod of products.slice(0, 20)) {
    console.log(`  ID ${prod.id}: "${prod.name}"`);
  }
  
  // Try to find some matches manually
  console.log('\n=== POTENTIAL MATCHES ===');
  for (const item of maybeItems.slice(0, 30)) {
    const nameLower = item.name.toLowerCase();
    for (const prod of products) {
      const prodLower = prod.name.toLowerCase();
      // Check if they share significant words
      const itemWords = nameLower.split(/\s+/).filter(w => w.length > 3);
      const prodWords = prodLower.split(/\s+/).filter(w => w.length > 3);
      const shared = itemWords.filter(w => prodWords.includes(w));
      if (shared.length >= 2) {
        console.log(`  Maybe: "${item.name}" -> DB: "${prod.name}" (shared: ${shared.join(', ')})`);
        break;
      }
    }
  }
  
  process.exit(0);
}

debug().catch(console.error);
