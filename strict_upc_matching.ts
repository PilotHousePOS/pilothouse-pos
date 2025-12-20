import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull, sql, eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

// Strict normalization for matching
function strictNormalize(str: string): string {
  return str.toLowerCase()
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract from InventoryMaybe - ONLY first 3000 rows
async function extractFromInventoryMaybe(): Promise<UPCEntry[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const results: UPCEntry[] = [];
  const worksheet = workbook.getWorksheet('Sheet1');
  
  if (worksheet) {
    let rowNum = 0;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      rowNum++;
      if (rowNum > 3000) return; // Stop after 3000 rows
      
      const upc = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      
      if (upc && upc.length >= 10 && /^\d+$/.test(upc) && name) {
        results.push({ upc, name, source: 'InventoryMaybe' });
      }
    });
  }
  
  console.log(`InventoryMaybe (first 3000): ${results.length} UPCs`);
  return results;
}

// Extract from Google Spreadsheet (Inventory 2025-12-04)
async function extractFromGoogleSheet(): Promise<UPCEntry[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/AnimalHouse_Inventory_2025-12-04 (1)_1764877836470.xlsx');
  
  const results: UPCEntry[] = [];
  
  workbook.eachSheet((worksheet) => {
    console.log(`  Checking sheet: ${worksheet.name}`);
    const headers: string[] = [];
    const firstRow = worksheet.getRow(1);
    firstRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').toLowerCase();
    });
    
    // Look for any column that might have UPCs
    const upcCols = headers.map((h, i) => 
      h && (h.includes('upc') || h.includes('sku') || h.includes('barcode') || h === 'id') ? i : -1
    ).filter(i => i > 0);
    
    const nameCols = headers.map((h, i) => 
      h && (h.includes('name') || h.includes('description') || h.includes('item')) ? i : -1
    ).filter(i => i > 0);
    
    if (upcCols.length > 0 && nameCols.length > 0) {
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        
        for (const upcCol of upcCols) {
          const upc = String(row.getCell(upcCol).value || '').trim();
          if (upc && upc.length >= 10 && /^\d+$/.test(upc)) {
            const name = String(row.getCell(nameCols[0]).value || '').trim();
            if (name) {
              results.push({ upc, name, source: 'GoogleSheet' });
            }
          }
        }
      });
    }
  });
  
  console.log(`GoogleSheet: ${results.length} UPCs`);
  return results;
}

// Extract from ALL invoice OCR text files
async function extractFromAllInvoices(): Promise<UPCEntry[]> {
  const results: UPCEntry[] = [];
  const dirs = ['attached_assets/extracted_orders', 'attached_assets/extracted_orders2'];
  
  let fileCount = 0;
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    
    for (const file of files) {
      fileCount++;
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        // Match strict UPC pattern: 10-14 digits standing alone
        const matches = line.match(/\b(\d{10,14})\b/g);
        if (!matches) continue;
        
        for (const upc of matches) {
          // Get text around the UPC as potential product name
          const lineWithoutNumbers = line
            .replace(/\d{10,14}/g, '|||')
            .replace(/[\$\d,\.]+/g, ' ')
            .replace(/\|\|\|/g, '')
            .trim();
          
          // Clean up the name
          let name = lineWithoutNumbers
            .replace(/^[\s\-\|\/\\:]+/, '')
            .replace(/[\s\-\|\/\\:]+$/, '')
            .trim();
          
          if (name.length >= 5 && name.length <= 150 && !/^[\d\s\.\-]+$/.test(name)) {
            results.push({ upc, name, source: `Invoice:${file}` });
          }
        }
      }
    }
  }
  
  console.log(`Invoices (${fileCount} files): ${results.length} UPCs`);
  return results;
}

async function main() {
  console.log('=== EXTRACTING FROM ALL SOURCES ===\n');
  
  const [maybeData, googleData, invoiceData] = await Promise.all([
    extractFromInventoryMaybe(),
    extractFromGoogleSheet(),
    extractFromAllInvoices()
  ]);
  
  // Combine all sources - dedupe by UPC, prefer InventoryMaybe > Google > Invoice
  const upcMap = new Map<string, UPCEntry>();
  
  for (const entry of invoiceData) upcMap.set(entry.upc, entry);
  for (const entry of googleData) upcMap.set(entry.upc, entry);
  for (const entry of maybeData) upcMap.set(entry.upc, entry);
  
  const allUPCs = Array.from(upcMap.values());
  console.log(`\nTotal unique UPCs: ${allUPCs.length}`);
  
  // Get ALL products (with and without SKU) for matching
  const allProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
  }).from(supplies);
  
  console.log(`Total products in DB: ${allProducts.length}`);
  console.log(`Products without SKU: ${allProducts.filter(p => !p.sku).length}`);
  
  // Build strict matching index
  const productsByNormalizedName = new Map<string, typeof allProducts[0]>();
  for (const product of allProducts) {
    const normalized = strictNormalize(product.name);
    if (!productsByNormalizedName.has(normalized)) {
      productsByNormalizedName.set(normalized, product);
    }
  }
  
  // STRICT matching - exact normalized name match only
  const matches: Array<{
    productId: number;
    productName: string;
    sourceName: string;
    upc: string;
    source: string;
  }> = [];
  
  const alreadyMatched = new Set<number>();
  
  for (const entry of allUPCs) {
    const normalized = strictNormalize(entry.name);
    const product = productsByNormalizedName.get(normalized);
    
    if (product && !product.sku && !alreadyMatched.has(product.id)) {
      matches.push({
        productId: product.id,
        productName: product.name,
        sourceName: entry.name,
        upc: entry.upc,
        source: entry.source
      });
      alreadyMatched.add(product.id);
    }
  }
  
  console.log(`\nStrict exact matches found: ${matches.length}`);
  
  // Show sample matches for verification
  console.log('\nSample matches (first 20):');
  for (const match of matches.slice(0, 20)) {
    console.log(`  [${match.source}] "${match.sourceName}" -> DB: "${match.productName}" (UPC: ${match.upc})`);
  }
  
  // Apply updates
  if (matches.length > 0) {
    console.log(`\nApplying ${matches.length} updates...`);
    
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.productId));
      
      if ((i + 1) % 100 === 0) {
        console.log(`  Updated ${i + 1}/${matches.length}`);
      }
    }
    console.log(`  Updated ${matches.length}/${matches.length}`);
  }
  
  // Final stats
  const [stats] = await db.select({
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(sku)`
  }).from(supplies);
  
  console.log(`\n=== FINAL COVERAGE ===`);
  console.log(`Products with SKU: ${stats.withSku}/${stats.total} (${(Number(stats.withSku)/Number(stats.total)*100).toFixed(1)}%)`);
  
  process.exit(0);
}

main().catch(console.error);
