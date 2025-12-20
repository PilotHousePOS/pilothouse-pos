import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull, sql } from 'drizzle-orm';
import * as fs from 'fs';

async function analyze() {
  // Get products without SKU
  const productsWithoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    category: supplies.category,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`=== PRODUCTS WITHOUT SKU: ${productsWithoutSku.length} ===\n`);
  
  // Group by category
  const byCategory = new Map<string, number>();
  for (const p of productsWithoutSku) {
    const cat = p.category || 'unknown';
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
  }
  
  console.log('By category:');
  const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted.slice(0, 20)) {
    console.log(`  ${cat}: ${count}`);
  }
  
  // Group by brand
  const byBrand = new Map<string, number>();
  for (const p of productsWithoutSku) {
    const brand = p.brand || 'unknown';
    byBrand.set(brand, (byBrand.get(brand) || 0) + 1);
  }
  
  console.log('\nBy brand (top 30):');
  const sortedBrands = Array.from(byBrand.entries()).sort((a, b) => b[1] - a[1]);
  for (const [brand, count] of sortedBrands.slice(0, 30)) {
    console.log(`  ${brand}: ${count}`);
  }
  
  // Sample products without SKU
  console.log('\n=== SAMPLE PRODUCTS WITHOUT SKU ===');
  for (const p of productsWithoutSku.slice(0, 50)) {
    console.log(`  [${p.brand || 'no-brand'}] ${p.name}`);
  }
  
  // Load InventoryMaybe and show samples that didn't match
  console.log('\n=== SAMPLE INVENTORY MAYBE ITEMS ===');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = wb.getWorksheet('Sheet1');
  
  if (ws) {
    let count = 0;
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1 || count >= 50) return;
      count++;
      const upc = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      const type = String(row.getCell(3).value || '').trim();
      console.log(`  ${upc}: ${name} [${type}]`);
    });
  }
  
  process.exit(0);
}

analyze().catch(console.error);
