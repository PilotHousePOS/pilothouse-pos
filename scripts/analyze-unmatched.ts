import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }
function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  // Get unmatched products
  const noSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Unmatched products: ${noSku.length}\n`);
  
  // Load all UPC sources into single searchable list
  const sources: {upc: string; name: string; source: string}[] = [];
  
  // Load Maybe Inventory
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = wb.worksheets[0];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const upc = cleanUpc(String(row.getCell(1).value || ''));
    const name = String(row.getCell(2).value || '').trim();
    if (upc.length >= 10 && name.length > 2) {
      sources.push({ upc, name, source: 'Excel' });
    }
  });
  
  // Load Google Sheet
  const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  for (const line of csv.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = cleanUpc(parts[0]);
      const name = parts[1].trim();
      if (upc.length >= 10 && name.length > 2) {
        sources.push({ upc, name, source: 'Google' });
      }
    }
  }
  
  // Load Invoices
  const inv = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
  for (const line of inv.split('\n').slice(1)) {
    const parts = line.split('|');
    if (parts.length >= 3) {
      const upc = cleanUpc(parts[0]);
      const name = parts[2].trim();
      if (upc.length >= 10 && name.length > 3) {
        sources.push({ upc, name, source: 'Invoice' });
      }
    }
  }
  
  console.log(`Total source entries: ${sources.length}\n`);
  
  // For each unmatched, search sources for potential matches
  console.log('=== Analyzing Top Unmatched Products ===\n');
  
  const samples = noSku.slice(0, 50);
  for (const p of samples) {
    const pNorm = normalize(p.name);
    const pWords = pNorm.split(' ').filter(w => w.length >= 3);
    
    // Find sources that share first word
    const firstWord = pWords[0];
    const candidates = sources.filter(s => {
      const sNorm = normalize(s.name);
      return sNorm.startsWith(firstWord) || sNorm.includes(firstWord);
    });
    
    console.log(`\n[${p.brand}] ${p.name}`);
    console.log(`  Normalized: "${pNorm}"`);
    console.log(`  Candidates sharing "${firstWord}": ${candidates.length}`);
    
    if (candidates.length > 0 && candidates.length <= 10) {
      for (const c of candidates.slice(0, 5)) {
        console.log(`    -> [${c.source}] ${c.name}`);
      }
    }
  }
}

main().catch(console.error);
