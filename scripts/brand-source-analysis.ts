import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  // Count unmatched by brand
  const noSku = await db.select({
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.sku));
  
  const brandMissing = new Map<string, number>();
  for (const p of noSku) {
    const b = p.brand || 'Unknown';
    brandMissing.set(b, (brandMissing.get(b) || 0) + 1);
  }
  
  // Load sources and count by brand-like first words
  const sources: string[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = wb.worksheets[0];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const name = String(row.getCell(2).value || '').trim();
    if (name.length > 2) sources.push(name);
  });
  
  const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  for (const line of csv.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) sources.push(parts[1].trim());
  }
  
  const inv = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
  for (const line of inv.split('\n').slice(1)) {
    const parts = line.split('|');
    if (parts.length >= 3) sources.push(parts[2].trim());
  }
  
  // Check each brand's presence in sources
  console.log('=== Brand Analysis: Missing vs Available in Sources ===\n');
  console.log('Brand | Missing | In Sources | Matchable?');
  console.log('-'.repeat(60));
  
  const sortedBrands = [...brandMissing.entries()].sort((a, b) => b[1] - a[1]);
  
  for (const [brand, missing] of sortedBrands.slice(0, 30)) {
    const brandLower = brand.toLowerCase();
    const brandWords = brandLower.split(' ');
    
    let inSources = 0;
    for (const s of sources) {
      const sLower = s.toLowerCase();
      if (brandWords.some(w => sLower.includes(w) && w.length >= 4)) {
        inSources++;
      }
    }
    
    const matchable = inSources >= missing * 0.3 ? 'YES' : 'NO';
    console.log(`${brand.padEnd(20)} | ${String(missing).padStart(5)} | ${String(inSources).padStart(8)} | ${matchable}`);
  }
  
  // Summary
  let totalMissing = 0;
  let matchableMissing = 0;
  
  for (const [brand, missing] of sortedBrands) {
    totalMissing += missing;
    const brandLower = brand.toLowerCase();
    let inSources = 0;
    for (const s of sources) {
      if (s.toLowerCase().includes(brandLower.split(' ')[0])) inSources++;
    }
    if (inSources >= missing * 0.3) matchableMissing += missing;
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total unmatched: ${totalMissing}`);
  console.log(`Potentially matchable (has source data): ~${matchableMissing}`);
  console.log(`Unmatchable (no source data): ~${totalMissing - matchableMissing}`);
}

main().catch(console.error);
