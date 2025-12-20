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

// Strict normalization - handles spacing issues like "ZooMed" vs "Zoo Med"
function strictNormalize(str: string): string {
  return str.toLowerCase()
    .replace(/['".\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Even stricter - remove all spaces for comparison
function noSpaceNormalize(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Extract from InventoryMaybe - first 3000 unique UPCs
async function extractFromInventoryMaybe(): Promise<UPCEntry[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const results: UPCEntry[] = [];
  const seenUPCs = new Set<string>();
  const worksheet = workbook.getWorksheet('Sheet1');
  
  if (worksheet) {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (results.length >= 3000) return;
      
      const upc = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      
      if (upc && upc.length >= 10 && /^\d+$/.test(upc) && name && !seenUPCs.has(upc)) {
        seenUPCs.add(upc);
        results.push({ upc, name, source: 'InventoryMaybe' });
      }
    });
  }
  
  console.log(`InventoryMaybe: ${results.length} unique UPCs (first 3000)`);
  return results;
}

// Parse ALL invoice text files properly
async function extractFromAllInvoices(): Promise<UPCEntry[]> {
  const results: UPCEntry[] = [];
  const dirs = ['attached_assets/extracted_orders', 'attached_assets/extracted_orders2'];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        // Invoice format: ... UPC ... DESCRIPTION ...
        // Look for 12-digit UPCs followed by description
        const match = line.match(/(\d{12,13})\s+([A-Z][A-Z0-9\s\/\.\-\#]+?)(?:\s+(?:EA|CS|BX|PK|DZ)\s+|\s{3,})/);
        if (match) {
          const upc = match[1];
          const name = match[2].trim();
          if (name.length >= 5 && name.length <= 100) {
            results.push({ upc, name, source: `Invoice:${file}` });
          }
        }
      }
    }
  }
  
  // Dedupe
  const unique = new Map<string, UPCEntry>();
  for (const entry of results) {
    if (!unique.has(entry.upc)) {
      unique.set(entry.upc, entry);
    }
  }
  
  console.log(`Invoices: ${unique.size} unique UPCs from ${results.length} total`);
  return Array.from(unique.values());
}

async function main() {
  console.log('=== COMPREHENSIVE UPC MATCHING ===\n');
  
  // Extract from all sources
  const [maybeData, invoiceData] = await Promise.all([
    extractFromInventoryMaybe(),
    extractFromAllInvoices()
  ]);
  
  // Combine - prefer InventoryMaybe names
  const upcMap = new Map<string, UPCEntry>();
  for (const entry of invoiceData) upcMap.set(entry.upc, entry);
  for (const entry of maybeData) upcMap.set(entry.upc, entry);
  
  const allUPCs = Array.from(upcMap.values());
  console.log(`\nTotal unique UPCs: ${allUPCs.length}`);
  
  // Get products without SKU
  const productsWithoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Products without SKU: ${productsWithoutSku.length}`);
  
  // Build multiple matching indexes
  const byStrictNorm = new Map<string, typeof productsWithoutSku[0]>();
  const byNoSpace = new Map<string, typeof productsWithoutSku[0]>();
  
  for (const product of productsWithoutSku) {
    const strict = strictNormalize(product.name);
    const noSpace = noSpaceNormalize(product.name);
    
    if (!byStrictNorm.has(strict)) byStrictNorm.set(strict, product);
    if (!byNoSpace.has(noSpace)) byNoSpace.set(noSpace, product);
  }
  
  // Match using multiple strategies
  const matches: Array<{
    productId: number;
    productName: string;
    sourceName: string;
    upc: string;
    matchType: string;
  }> = [];
  
  const matchedProductIds = new Set<number>();
  const matchedUPCs = new Set<string>();
  
  for (const entry of allUPCs) {
    if (matchedUPCs.has(entry.upc)) continue;
    
    // Strategy 1: Strict normalized match
    const strictNorm = strictNormalize(entry.name);
    let product = byStrictNorm.get(strictNorm);
    
    if (product && !matchedProductIds.has(product.id)) {
      matches.push({
        productId: product.id,
        productName: product.name,
        sourceName: entry.name,
        upc: entry.upc,
        matchType: 'strict'
      });
      matchedProductIds.add(product.id);
      matchedUPCs.add(entry.upc);
      continue;
    }
    
    // Strategy 2: No-space match (handles "ZooMed" vs "Zoo Med")
    const noSpace = noSpaceNormalize(entry.name);
    product = byNoSpace.get(noSpace);
    
    if (product && !matchedProductIds.has(product.id)) {
      matches.push({
        productId: product.id,
        productName: product.name,
        sourceName: entry.name,
        upc: entry.upc,
        matchType: 'no-space'
      });
      matchedProductIds.add(product.id);
      matchedUPCs.add(entry.upc);
    }
  }
  
  console.log(`\nMatches found: ${matches.length}`);
  console.log(`  Strict: ${matches.filter(m => m.matchType === 'strict').length}`);
  console.log(`  No-space: ${matches.filter(m => m.matchType === 'no-space').length}`);
  
  // Show sample matches
  console.log('\nSample matches (first 30):');
  for (const match of matches.slice(0, 30)) {
    console.log(`  [${match.matchType}] "${match.sourceName}" -> "${match.productName}" (${match.upc})`);
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
