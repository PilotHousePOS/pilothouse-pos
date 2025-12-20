import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface UpcEntry { upc: string; name: string; }
interface Match { productId: number; productName: string; upc: string; upcName: string; }

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeyWords(name: string): string[] {
  const n = normalize(name);
  const words = n.split(' ').filter(w => w.length >= 2);
  const stopWords = new Set(['the', 'and', 'for', 'with', 'of', 'in', 'a', 'an', 'to']);
  return words.filter(w => !stopWords.has(w));
}

async function loadMaybeInventory(): Promise<Map<string, UpcEntry>> {
  const entries = new Map<string, UpcEntry>();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = wb.worksheets[0];
  
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const upc = cleanUpc(String(row.getCell(1).value || ''));
    const name = String(row.getCell(2).value || '').trim();
    if (upc.length >= 10 && upc.length <= 14 && name.length > 2) {
      const key = normalize(name);
      if (!entries.has(key)) {
        entries.set(key, { upc, name });
      }
    }
  });
  
  return entries;
}

async function loadGoogleSheet(): Promise<Map<string, UpcEntry>> {
  const entries = new Map<string, UpcEntry>();
  const content = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  
  for (const line of content.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = cleanUpc(parts[0]);
      const name = parts[1].trim();
      if (upc.length >= 10 && upc.length <= 14 && name.length > 2) {
        const key = normalize(name);
        if (!entries.has(key)) {
          entries.set(key, { upc, name });
        }
      }
    }
  }
  
  return entries;
}

async function loadInvoices(): Promise<Map<string, UpcEntry>> {
  const entries = new Map<string, UpcEntry>();
  const content = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
  
  for (const line of content.split('\n').slice(1)) {
    const parts = line.split('|');
    if (parts.length >= 3) {
      const upc = cleanUpc(parts[0]);
      const name = parts[2].trim();
      if (upc.length >= 10 && upc.length <= 14 && name.length > 3) {
        const key = normalize(name);
        if (!entries.has(key)) {
          entries.set(key, { upc, name });
        }
      }
    }
  }
  
  return entries;
}

function findMatch(productName: string, upcMap: Map<string, UpcEntry>): UpcEntry | null {
  const normalizedProduct = normalize(productName);
  
  if (upcMap.has(normalizedProduct)) {
    return upcMap.get(normalizedProduct)!;
  }
  
  const productWords = extractKeyWords(productName);
  
  for (const [key, entry] of upcMap) {
    const upcWords = extractKeyWords(entry.name);
    
    if (productWords.length >= 2 && upcWords.length >= 2) {
      const productSet = new Set(productWords);
      const upcSet = new Set(upcWords);
      
      let matches = 0;
      for (const w of productSet) {
        if (upcSet.has(w)) matches++;
      }
      
      const minLen = Math.min(productSet.size, upcSet.size);
      const maxLen = Math.max(productSet.size, upcSet.size);
      
      if (matches >= minLen && matches >= maxLen * 0.85 && matches >= 3) {
        return entry;
      }
    }
  }
  
  return null;
}

async function main() {
  console.log('=== Careful Product-by-Product Matching ===\n');
  
  const existingMatches = JSON.parse(
    fs.readFileSync('.local/state/memory/permanent_upc_matches.json', 'utf-8')
  );
  const matchedProductIds = new Set(existingMatches.map((m: any) => m.productId));
  const matchedUpcs = new Set(existingMatches.map((m: any) => m.upc));
  
  console.log(`Already matched: ${matchedProductIds.size} products`);
  
  const products = await db.select().from(supplies).where(isNull(supplies.sku));
  console.log(`Products needing SKU: ${products.length}`);
  
  console.log('\nLoading UPC sources...');
  const maybeInv = await loadMaybeInventory();
  console.log(`  Maybe Inventory: ${maybeInv.size} unique entries`);
  
  const gSheet = await loadGoogleSheet();
  console.log(`  Google Sheet: ${gSheet.size} unique entries`);
  
  const invoices = await loadInvoices();
  console.log(`  Invoices: ${invoices.size} unique entries`);
  
  const allUpcs = new Map<string, UpcEntry>();
  for (const [k, v] of invoices) allUpcs.set(k, v);
  for (const [k, v] of gSheet) allUpcs.set(k, v);
  for (const [k, v] of maybeInv) allUpcs.set(k, v);
  console.log(`  Combined unique: ${allUpcs.size}`);
  
  const newMatches: Match[] = [];
  let processed = 0;
  
  for (const product of products) {
    processed++;
    if (processed % 1000 === 0) {
      console.log(`  Processed ${processed}/${products.length}...`);
    }
    
    if (matchedProductIds.has(product.id)) continue;
    
    const match = findMatch(product.name, allUpcs);
    if (match && !matchedUpcs.has(match.upc)) {
      newMatches.push({
        productId: product.id,
        productName: product.name,
        upc: match.upc,
        upcName: match.name
      });
      matchedProductIds.add(product.id);
      matchedUpcs.add(match.upc);
    }
  }
  
  console.log(`\nNew matches found: ${newMatches.length}`);
  
  let applied = 0;
  for (const match of newMatches) {
    try {
      await db.execute(sql`UPDATE supplies SET sku = ${match.upc} WHERE id = ${match.productId}`);
      applied++;
    } catch (e) {}
  }
  console.log(`Applied ${applied} SKUs`);
  
  const newPermanent = newMatches.map(m => ({
    productId: m.productId, productName: m.productName,
    upc: m.upc, upcName: m.upcName,
    score: '1.000', status: 'PERMANENT'
  }));
  
  const allMatches = [...existingMatches, ...newPermanent];
  fs.writeFileSync('.local/state/memory/permanent_upc_matches.json',
    JSON.stringify(allMatches, null, 2));
  
  const finalProducts = await db.select().from(supplies);
  const withSku = finalProducts.filter(p => p.sku).length;
  const total = finalProducts.length;
  
  console.log(`\n=== UPDATED BASELINE ===`);
  console.log(`Products with SKU: ${withSku} / ${total}`);
  console.log(`Coverage: ${((withSku / total) * 100).toFixed(1)}%`);
  
  console.log('\nSample matches:');
  newMatches.slice(0, 30).forEach(m => {
    console.log(`  "${m.upcName}" -> "${m.productName}"`);
  });
}

main().catch(console.error);
