import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

function normalizeForMatching(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract UPCs from InventoryMaybe (Item ID column contains UPCs)
async function extractFromInventoryMaybe(): Promise<UPCEntry[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const results: UPCEntry[] = [];
  const worksheet = workbook.getWorksheet('Sheet1');
  
  if (worksheet) {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      
      const upc = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      
      if (upc && upc.length >= 8 && /^\d+$/.test(upc) && name) {
        results.push({ upc, name, source: 'InventoryMaybe' });
      }
    });
  }
  
  console.log(`InventoryMaybe: ${results.length} UPCs extracted`);
  return results;
}

// Extract UPCs from Exatouch Import
async function extractFromExatouchImport(): Promise<UPCEntry[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/AnimalHouse_Exatouch_Import.xlsx');
  
  const results: UPCEntry[] = [];
  const worksheet = workbook.getWorksheet('Items');
  
  if (worksheet) {
    const headers: string[] = [];
    const firstRow = worksheet.getRow(1);
    firstRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').toLowerCase();
    });
    
    const skuCol = headers.findIndex(h => h === 'sku');
    const descCol = headers.findIndex(h => h === 'description');
    const altSkuCol = headers.findIndex(h => h === 'altsku');
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      
      // Try sku first, then altsku
      let upc = String(row.getCell(skuCol).value || '').trim();
      if (!upc || upc.length < 8 || !/^\d+$/.test(upc)) {
        upc = String(row.getCell(altSkuCol).value || '').trim();
      }
      const name = String(row.getCell(descCol).value || '').trim();
      
      if (upc && upc.length >= 8 && /^\d+$/.test(upc) && name) {
        results.push({ upc, name, source: 'ExatouchImport' });
      }
    });
  }
  
  console.log(`ExatouchImport: ${results.length} UPCs extracted`);
  return results;
}

// Extract UPCs from OCR text files
async function extractFromOCRFiles(): Promise<UPCEntry[]> {
  const results: UPCEntry[] = [];
  const dirs = ['attached_assets/extracted_orders', 'attached_assets/extracted_orders2'];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      
      // Look for UPC patterns followed by product names
      // Pattern: 12-13 digit UPC followed by text
      const lines = content.split('\n');
      
      for (const line of lines) {
        // Match UPC-like patterns (10-13 digits)
        const upcMatch = line.match(/\b(\d{10,13})\b/);
        if (upcMatch) {
          const upc = upcMatch[1];
          // Get the rest of the line as potential product name
          const restOfLine = line.replace(upc, '').trim();
          
          // Extract product name (text before or after the number)
          let name = restOfLine.replace(/[\$\d,\.]+/g, '').trim();
          name = name.replace(/^\s*[-\/\\|]\s*/, '').trim();
          
          if (name.length > 5 && name.length < 200) {
            results.push({ upc, name, source: `OCR:${file}` });
          }
        }
      }
    }
  }
  
  console.log(`OCR Files: ${results.length} potential UPCs extracted`);
  return results;
}

async function matchAndUpdate() {
  console.log('=== EXTRACTING FROM ALL SOURCES ===\n');
  
  // Extract from all sources
  const [maybeData, exatouchData, ocrData] = await Promise.all([
    extractFromInventoryMaybe(),
    extractFromExatouchImport(),
    extractFromOCRFiles()
  ]);
  
  // Combine and dedupe (prefer InventoryMaybe, then Exatouch, then OCR)
  const upcMap = new Map<string, UPCEntry>();
  
  // OCR first (lowest priority, will be overwritten)
  for (const entry of ocrData) {
    upcMap.set(entry.upc, entry);
  }
  // Exatouch next
  for (const entry of exatouchData) {
    upcMap.set(entry.upc, entry);
  }
  // InventoryMaybe last (highest priority)
  for (const entry of maybeData) {
    upcMap.set(entry.upc, entry);
  }
  
  console.log(`\nTotal unique UPCs after deduplication: ${upcMap.size}`);
  
  // Get all products without SKU
  const productsWithoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    description: supplies.description,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Products without SKU: ${productsWithoutSku.length}`);
  
  // Build normalized index for matching
  const normalizedIndex = new Map<string, {id: number, name: string}>();
  const partialIndex = new Map<string, Array<{id: number, name: string}>>();
  
  for (const product of productsWithoutSku) {
    const normalized = normalizeForMatching(product.name);
    normalizedIndex.set(normalized, { id: product.id, name: product.name });
    
    // Also index by significant words for fuzzy matching
    const words = normalized.split(' ').filter(w => w.length > 3);
    for (const word of words) {
      if (!partialIndex.has(word)) {
        partialIndex.set(word, []);
      }
      partialIndex.get(word)!.push({ id: product.id, name: product.name });
    }
  }
  
  const matches: Array<{productId: number, productName: string, excelName: string, upc: string, matchType: string}> = [];
  const usedProductIds = new Set<number>();
  
  // Stage 1: Exact matches
  for (const [upc, entry] of upcMap) {
    const normalizedName = normalizeForMatching(entry.name);
    const match = normalizedIndex.get(normalizedName);
    
    if (match && !usedProductIds.has(match.id)) {
      matches.push({
        productId: match.id,
        productName: match.name,
        excelName: entry.name,
        upc: upc,
        matchType: 'exact'
      });
      usedProductIds.add(match.id);
      normalizedIndex.delete(normalizedName);
    }
  }
  
  console.log(`Stage 1 - Exact matches: ${matches.length}`);
  
  // Stage 2: Partial matches (80%+ word overlap)
  for (const [upc, entry] of upcMap) {
    if (matches.some(m => m.upc === upc)) continue;
    
    const sourceWords = normalizeForMatching(entry.name).split(' ').filter(w => w.length > 3);
    if (sourceWords.length < 2) continue;
    
    let bestMatch: {id: number, name: string, score: number} | null = null;
    
    // Find products that share significant words
    const candidates = new Map<number, {id: number, name: string, hits: number}>();
    for (const word of sourceWords) {
      const prods = partialIndex.get(word) || [];
      for (const prod of prods) {
        if (usedProductIds.has(prod.id)) continue;
        if (!candidates.has(prod.id)) {
          candidates.set(prod.id, { id: prod.id, name: prod.name, hits: 0 });
        }
        candidates.get(prod.id)!.hits++;
      }
    }
    
    // Find best candidate with high overlap
    for (const [id, cand] of candidates) {
      const targetWords = normalizeForMatching(cand.name).split(' ').filter(w => w.length > 3);
      const overlapScore = cand.hits / Math.max(sourceWords.length, targetWords.length);
      
      if (overlapScore >= 0.7 && (!bestMatch || overlapScore > bestMatch.score)) {
        bestMatch = { id: cand.id, name: cand.name, score: overlapScore };
      }
    }
    
    if (bestMatch) {
      matches.push({
        productId: bestMatch.id,
        productName: bestMatch.name,
        excelName: entry.name,
        upc: upc,
        matchType: 'partial'
      });
      usedProductIds.add(bestMatch.id);
    }
  }
  
  console.log(`Stage 2 - After partial matches: ${matches.length}`);
  
  // Apply updates
  let updateCount = 0;
  for (let i = 0; i < matches.length; i += 100) {
    const batch = matches.slice(i, i + 100);
    for (const match of batch) {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(sql`${supplies.id} = ${match.productId}`);
      updateCount++;
    }
    if ((i + 100) % 500 === 0 || i + 100 >= matches.length) {
      console.log(`Updated ${Math.min(i + 100, matches.length)}/${matches.length}`);
    }
  }
  
  // Get final stats
  const [stats] = await db.select({
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(sku)`
  }).from(supplies);
  
  console.log(`\n=== FINAL COVERAGE ===`);
  console.log(`Products with SKU: ${stats.withSku}/${stats.total} (${(Number(stats.withSku)/Number(stats.total)*100).toFixed(1)}%)`);
  console.log(`New matches applied: ${updateCount}`);
  console.log(`Exact matches: ${matches.filter(m => m.matchType === 'exact').length}`);
  console.log(`Partial matches: ${matches.filter(m => m.matchType === 'partial').length}`);
  
  process.exit(0);
}

matchAndUpdate().catch(console.error);
