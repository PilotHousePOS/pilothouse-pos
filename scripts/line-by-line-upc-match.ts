import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

interface Match {
  productId: number;
  productName: string;
  upc: string;
  upcName: string;
  matchType: string;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanUpc(upc: string): string {
  return upc.replace(/[^0-9]/g, '');
}

async function loadMaybeInventory(): Promise<UpcEntry[]> {
  const entries: UpcEntry[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = wb.worksheets[0];
  
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const upc = cleanUpc(String(row.getCell(1).value || ''));
    const name = String(row.getCell(2).value || '').trim();
    if (upc.length >= 10 && upc.length <= 14 && name && name.length > 2) {
      entries.push({ upc, name, source: 'MaybeInventory' });
    }
  });
  
  return entries;
}

async function loadGoogleSheet(): Promise<UpcEntry[]> {
  const entries: UpcEntry[] = [];
  const content = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  const lines = content.split('\n');
  
  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = cleanUpc(parts[0]);
      const name = parts[1].trim();
      if (upc.length >= 10 && name) {
        entries.push({ upc, name, source: 'GoogleSheet' });
      }
    }
  }
  
  return entries;
}

async function loadFinalInventory(): Promise<UpcEntry[]> {
  const entries: UpcEntry[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx');
  
  for (const ws of wb.worksheets) {
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      for (let col = 1; col <= row.cellCount; col++) {
        const val = String(row.getCell(col).value || '');
        const upc = cleanUpc(val);
        if (upc.length >= 10 && upc.length <= 14) {
          const name = String(row.getCell(col + 1).value || row.getCell(col - 1).value || '').trim();
          if (name && name.length > 3) {
            entries.push({ upc, name, source: 'FinalInventory' });
          }
        }
      }
    });
  }
  
  return entries;
}

function findExactMatch(upcName: string, products: any[]): any | null {
  const normalizedUpc = normalizeForMatch(upcName);
  
  for (const product of products) {
    const normalizedProduct = normalizeForMatch(product.name);
    if (normalizedUpc === normalizedProduct) {
      return product;
    }
  }
  return null;
}

function findCloseMatch(upcName: string, products: any[]): { product: any; type: string } | null {
  const normalizedUpc = normalizeForMatch(upcName);
  const upcWords = new Set(normalizedUpc.split(' ').filter(w => w.length >= 2));
  
  for (const product of products) {
    const normalizedProduct = normalizeForMatch(product.name);
    const productWords = new Set(normalizedProduct.split(' ').filter(w => w.length >= 2));
    
    if (normalizedProduct.includes(normalizedUpc) || normalizedUpc.includes(normalizedProduct)) {
      return { product, type: 'substring' };
    }
    
    let matches = 0;
    for (const w of upcWords) {
      if (productWords.has(w)) matches++;
    }
    
    const minWords = Math.min(upcWords.size, productWords.size);
    if (minWords >= 2 && matches >= minWords * 0.9) {
      return { product, type: 'word_match_90' };
    }
  }
  
  return null;
}

async function main() {
  console.log('=== Line-by-Line UPC Matching ===\n');
  
  const existingMatches = JSON.parse(
    fs.readFileSync('.local/state/memory/permanent_upc_matches.json', 'utf-8')
  );
  const matchedProductIds = new Set(existingMatches.map((m: any) => m.productId));
  const matchedUpcs = new Set(existingMatches.map((m: any) => m.upc));
  
  console.log(`Already matched: ${matchedProductIds.size} products`);
  
  const products = await db.select().from(supplies).where(isNull(supplies.sku));
  console.log(`Products needing SKU: ${products.length}`);
  
  console.log('\nLoading UPC sources...');
  const maybeInventory = await loadMaybeInventory();
  console.log(`  Maybe Inventory: ${maybeInventory.length} entries`);
  
  const googleSheet = await loadGoogleSheet();
  console.log(`  Google Sheet: ${googleSheet.length} entries`);
  
  const finalInventory = await loadFinalInventory();
  console.log(`  Final Inventory: ${finalInventory.length} entries`);
  
  const allUpcs = [...maybeInventory, ...googleSheet, ...finalInventory];
  const uniqueUpcs = new Map<string, UpcEntry>();
  for (const entry of allUpcs) {
    if (!matchedUpcs.has(entry.upc)) {
      uniqueUpcs.set(entry.upc, entry);
    }
  }
  console.log(`\nUnique UPCs to process: ${uniqueUpcs.size}`);
  
  const newMatches: Match[] = [];
  let processed = 0;
  
  for (const [upc, entry] of uniqueUpcs) {
    processed++;
    if (processed % 500 === 0) {
      console.log(`  Processed ${processed}/${uniqueUpcs.size}...`);
    }
    
    const exactMatch = findExactMatch(entry.name, products);
    if (exactMatch && !matchedProductIds.has(exactMatch.id)) {
      newMatches.push({
        productId: exactMatch.id,
        productName: exactMatch.name,
        upc: upc,
        upcName: entry.name,
        matchType: 'exact'
      });
      matchedProductIds.add(exactMatch.id);
      continue;
    }
    
    const closeMatch = findCloseMatch(entry.name, products);
    if (closeMatch && !matchedProductIds.has(closeMatch.product.id)) {
      newMatches.push({
        productId: closeMatch.product.id,
        productName: closeMatch.product.name,
        upc: upc,
        upcName: entry.name,
        matchType: closeMatch.type
      });
      matchedProductIds.add(closeMatch.product.id);
    }
  }
  
  console.log(`\nNew matches found: ${newMatches.length}`);
  console.log(`  Exact: ${newMatches.filter(m => m.matchType === 'exact').length}`);
  console.log(`  Substring: ${newMatches.filter(m => m.matchType === 'substring').length}`);
  console.log(`  Word match 90%+: ${newMatches.filter(m => m.matchType === 'word_match_90').length}`);
  
  let applied = 0;
  for (const match of newMatches) {
    try {
      await db.execute(sql`UPDATE supplies SET sku = ${match.upc} WHERE id = ${match.productId}`);
      applied++;
    } catch (e) {}
  }
  console.log(`Applied ${applied} SKUs`);
  
  const newPermanent = newMatches.map(m => ({
    productId: m.productId,
    productName: m.productName,
    upc: m.upc,
    upcName: m.upcName,
    score: '1.000',
    status: 'PERMANENT',
    matchType: m.matchType
  }));
  
  const allMatches = [...existingMatches, ...newPermanent];
  fs.writeFileSync('.local/state/memory/permanent_upc_matches.json',
    JSON.stringify(allMatches, null, 2));
  
  const finalProducts = await db.select().from(supplies);
  const withSku = finalProducts.filter(p => p.sku).length;
  const total = finalProducts.length;
  const coverage = ((withSku / total) * 100).toFixed(1);
  
  console.log(`\n=== UPDATED BASELINE ===`);
  console.log(`Products with SKU: ${withSku} / ${total}`);
  console.log(`Coverage: ${coverage}%`);
  console.log(`Total permanent matches: ${allMatches.length}`);
  
  console.log('\nSample new matches:');
  newMatches.slice(0, 20).forEach(m => {
    console.log(`  [${m.matchType}] "${m.upcName}" -> "${m.productName}"`);
  });
}

main().catch(console.error);
