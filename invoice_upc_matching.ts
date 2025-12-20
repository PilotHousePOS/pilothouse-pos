import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull, sql, eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { expandAbbreviations } from './server/abbreviationExpansion';

// Invoice brand prefix codes → full brand names
// These are 3-letter codes used in Central Pet Dallas invoices
const INVOICE_BRAND_CODES: Record<string, string> = {
  // === Aquatic ===
  'AQE': 'Aqueon',
  'API': 'API',
  'HIK': 'Hikari',
  'TET': 'Tetra',
  'SLI': 'SeaChem',
  'MAR': 'Marineland',
  'WWI': 'World Wide Imports',
  'ATP': 'Aquatop',
  'GLO': 'GloFish',
  'FLU': 'Fluval',
  
  // === Dog/Cat Brands ===
  'KON': 'Kong',
  'ETH': 'Ethical',
  'FOU': 'Four Paws',
  'MPF': 'Milkbone',
  'PBG': 'Pet Botanics',
  'BDL': 'BioGroom',
  'EPC': 'Litter Genie',
  'N/M': "Nature's Miracle",
  'SPT': 'Spot',
  'CST': 'Coastal',
  'CSL': 'Coastal',
  'LIL': "Li'l Pals",
  'FRM': 'Fromm',
  'NYL': 'Nylabone',
  'ARM': 'Arm & Hammer',
  'PET': 'Petmate',
  'FRN': 'Farnam',
  'ZYM': 'Zymox',
  'SAF': 'Safari',
  'DAY': 'Daylight',
  'GRN': 'Greenies',
  'TRF': 'TropiClean',
  
  // === Bird ===
  'KMP': 'Kaytee',
  'KAY': 'Kaytee',
  'JWP': 'JW Pet',
  'ZUP': 'ZuPreem',
  'PRV': 'Prevue',
  'AEC': 'A&E Cage',
  
  // === Small Animal ===
  'OXB': 'Oxbow',
  'SUP': 'Super Pet',
  'WAR': 'Ware',
  'LIV': 'Living World',
  'VIT': 'Vitakraft',
  
  // === Reptile ===
  'ZOO': 'Zoo Med',
  'ZMD': 'Zoo Med',
  'ZIL': 'Zilla',
  'EXO': 'Exo Terra',
  'FLK': "Fluker's",
  
  // === Other ===
  'MAM': 'Mammoth',
  'CHK': 'Chuckit',
  'OUT': 'Outward Hound',
  'POO': 'PoochPad',
  'TUF': 'Tuffy',
  'BEN': 'Benebone',
};

// Product type abbreviations
const PRODUCT_TYPE_CODES: Record<string, string> = {
  'FOOD': 'Food',
  'TRT': 'Treat',
  'TOY': 'Toy',
  'CLLR': 'Collar',
  'LSH': 'Leash',
  'HARN': 'Harness',
  'BED': 'Bed',
  'BWL': 'Bowl',
  'CRAT': 'Crate',
  'SHMP': 'Shampoo',
  'COND': 'Conditioner',
  'CLNR': 'Cleaner',
  'SBST': 'Substrate',
  'ORNM': 'Ornament',
  'FXTR': 'Fixture',
  'GRVL': 'Gravel',
  'FLTR': 'Filter',
  'PUMP': 'Pump',
  'HEAT': 'Heater',
  'LITE': 'Light',
  'BULB': 'Bulb',
  'DECO': 'Decoration',
  'TEST': 'Test Kit',
  'PERCH': 'Perch',
  'WATR': 'Waterer',
  'FEDR': 'Feeder',
  'LTTR': 'Litter',
  'SCRP': 'Scratch Post',
  'CARR': 'Carrier',
  'TEASR': 'Teaser',
  'DSPNSR': 'Dispenser',
  'S/O': 'Stain & Odor',
};

interface UPCEntry {
  upc: string;
  rawName: string;
  expandedName: string;
  source: string;
}

// Expand invoice description using brand codes and abbreviations
function expandInvoiceDescription(description: string): string {
  let expanded = description.trim();
  
  // First, try to expand the brand prefix (first 2-4 chars)
  const words = expanded.split(/\s+/);
  if (words.length > 0) {
    const firstWord = words[0].toUpperCase();
    
    // Try exact match first
    if (INVOICE_BRAND_CODES[firstWord]) {
      words[0] = INVOICE_BRAND_CODES[firstWord];
      expanded = words.join(' ');
    } else {
      // Try 3-letter prefix
      const prefix3 = firstWord.substring(0, 3);
      if (INVOICE_BRAND_CODES[prefix3]) {
        words[0] = INVOICE_BRAND_CODES[prefix3];
        expanded = words.join(' ');
      }
    }
  }
  
  // Expand product type codes
  for (const [code, full] of Object.entries(PRODUCT_TYPE_CODES)) {
    const regex = new RegExp(`\\b${code}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  
  // Use the abbreviation expansion system for remaining abbreviations
  expanded = expandAbbreviations(expanded);
  
  return expanded;
}

// Parse invoice text files and extract UPC/description pairs
async function extractFromInvoices(): Promise<UPCEntry[]> {
  const results: UPCEntry[] = [];
  const dirs = ['attached_assets/extracted_orders', 'attached_assets/extracted_orders2'];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.log(`Directory not found: ${dir}`);
      continue;
    }
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    console.log(`Processing ${files.length} files from ${dir}`);
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        // Invoice format: LINE  PRODUCT  UPC  [CPN/VPN]  DESCRIPTION  EA
        // Example: " 1/3   00800450   015905004503                AQE BULB T8 COLORMAX 18IN 15W                         EA"
        // CPN/VPN like "AR-26", "KC-O" comes BEFORE description in some lines
        
        // Find 12-13 digit UPC
        const upcMatch = line.match(/\b(\d{12,13})\b/);
        if (!upcMatch) continue;
        
        const upc = upcMatch[1];
        const upcIndex = line.indexOf(upc);
        
        // Everything after UPC
        let afterUpc = line.substring(upcIndex + upc.length).trim();
        
        // Skip CPN/VPN if present - these ALWAYS have a dash (like "AR-26", "KC-O", "U-04428", "SA-434", "KT-50379")
        // Don't strip 3-letter codes without dash (those are brand codes like AQE, KON, TET)
        afterUpc = afterUpc.replace(/^[A-Z]{1,3}-[A-Z0-9]{1,6}\s+/, '');
        
        // Now extract description - it starts with brand code (2-4 letters) and ends before EA/CS/etc
        // Pattern: Brand code + rest of description until multiple spaces or unit code
        const descMatch = afterUpc.match(/^([A-Z]{2,4}\s+[A-Z0-9\s\/\.\-\#\'\&\*]+?)(?:\s{2,}|\s+EA\s|\s+CS\s|\s+BX\s|\s+PK\s|\s+DZ\s)/i);
        
        if (descMatch) {
          const rawName = descMatch[1].trim();
          if (rawName.length >= 5 && rawName.length <= 100) {
            const expandedName = expandInvoiceDescription(rawName);
            results.push({ 
              upc, 
              rawName, 
              expandedName,
              source: `Invoice:${file}` 
            });
          }
        }
      }
    }
  }
  
  // Dedupe by UPC, prefer longer descriptions
  const unique = new Map<string, UPCEntry>();
  for (const entry of results) {
    const existing = unique.get(entry.upc);
    if (!existing || entry.expandedName.length > existing.expandedName.length) {
      unique.set(entry.upc, entry);
    }
  }
  
  console.log(`Invoices: ${unique.size} unique UPCs from ${results.length} total entries`);
  return Array.from(unique.values());
}

// Extract from InventoryMaybe Excel
async function extractFromInventoryMaybe(): Promise<UPCEntry[]> {
  const filePath = 'attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx';
  if (!fs.existsSync(filePath)) {
    console.log('InventoryMaybe file not found');
    return [];
  }
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const results: UPCEntry[] = [];
  const seenUPCs = new Set<string>();
  const worksheet = workbook.getWorksheet('Sheet1');
  
  if (worksheet) {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      if (results.length >= 3000) return; // First 3000 unique
      
      const upc = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      
      if (upc && upc.length >= 10 && /^\d+$/.test(upc) && name && !seenUPCs.has(upc)) {
        seenUPCs.add(upc);
        results.push({ 
          upc, 
          rawName: name, 
          expandedName: expandAbbreviations(name),
          source: 'InventoryMaybe' 
        });
      }
    });
  }
  
  console.log(`InventoryMaybe: ${results.length} unique UPCs`);
  return results;
}

// Normalize for matching
function normalize(str: string): string {
  return str.toLowerCase()
    .replace(/['".\-_\/\&\#\(\)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Remove all spaces for fuzzy matching
function noSpaceNormalize(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Extract key words for matching (brand + product type + key identifiers)
function extractKeyWords(str: string): string[] {
  const normalized = normalize(str);
  const words = normalized.split(' ').filter(w => w.length >= 2);
  
  // Filter out common filler words
  const stopWords = new Set(['for', 'with', 'and', 'the', 'all', 'in', 'of', 'to', 'a', 'an']);
  return words.filter(w => !stopWords.has(w));
}

// Calculate word overlap score
function wordOverlapScore(source: string[], target: string[]): number {
  const sourceSet = new Set(source);
  const targetSet = new Set(target);
  
  let matches = 0;
  for (const word of sourceSet) {
    if (targetSet.has(word)) matches++;
  }
  
  const maxLen = Math.max(sourceSet.size, targetSet.size);
  return maxLen > 0 ? matches / maxLen : 0;
}

async function main() {
  console.log('=== INVOICE UPC MATCHING WITH ABBREVIATION EXPANSION ===\n');
  
  // Get current stats
  const [initialStats] = await db.select({
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(sku)`
  }).from(supplies);
  
  console.log(`Current coverage: ${initialStats.withSku}/${initialStats.total} (${(Number(initialStats.withSku)/Number(initialStats.total)*100).toFixed(1)}%)\n`);
  
  // Extract from all sources
  const [invoiceData, maybeData] = await Promise.all([
    extractFromInvoices(),
    extractFromInventoryMaybe()
  ]);
  
  // Combine - prefer InventoryMaybe names (they're usually more complete)
  const upcMap = new Map<string, UPCEntry>();
  for (const entry of invoiceData) upcMap.set(entry.upc, entry);
  for (const entry of maybeData) upcMap.set(entry.upc, entry);
  
  const allUPCs = Array.from(upcMap.values());
  console.log(`\nTotal unique UPCs from all sources: ${allUPCs.length}`);
  
  // Show sample expanded names
  console.log('\nSample invoice expansions:');
  const invoiceSamples = invoiceData.slice(0, 10);
  for (const s of invoiceSamples) {
    console.log(`  "${s.rawName}" -> "${s.expandedName}"`);
  }
  
  // Get products without SKU
  const productsWithoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`\nProducts without SKU: ${productsWithoutSku.length}`);
  
  // Build multiple matching indexes
  const byNormalized = new Map<string, typeof productsWithoutSku[0]>();
  const byNoSpace = new Map<string, typeof productsWithoutSku[0]>();
  const productKeywords = new Map<number, string[]>();
  
  for (const product of productsWithoutSku) {
    const norm = normalize(product.name);
    const noSpace = noSpaceNormalize(product.name);
    
    if (!byNormalized.has(norm)) byNormalized.set(norm, product);
    if (!byNoSpace.has(noSpace)) byNoSpace.set(noSpace, product);
    
    // Store keywords for fuzzy matching
    productKeywords.set(product.id, extractKeyWords(product.name));
  }
  
  // Match using multiple strategies
  const matches: Array<{
    productId: number;
    productName: string;
    sourceName: string;
    expandedName: string;
    upc: string;
    matchType: string;
    score: number;
  }> = [];
  
  const matchedProductIds = new Set<number>();
  const matchedUPCs = new Set<string>();
  
  for (const entry of allUPCs) {
    if (matchedUPCs.has(entry.upc)) continue;
    
    // Strategy 1: Exact normalized match
    const normalized = normalize(entry.expandedName);
    let product = byNormalized.get(normalized);
    
    if (product && !matchedProductIds.has(product.id)) {
      matches.push({
        productId: product.id,
        productName: product.name,
        sourceName: entry.rawName,
        expandedName: entry.expandedName,
        upc: entry.upc,
        matchType: 'exact',
        score: 1.0
      });
      matchedProductIds.add(product.id);
      matchedUPCs.add(entry.upc);
      continue;
    }
    
    // Strategy 2: No-space match
    const noSpace = noSpaceNormalize(entry.expandedName);
    product = byNoSpace.get(noSpace);
    
    if (product && !matchedProductIds.has(product.id)) {
      matches.push({
        productId: product.id,
        productName: product.name,
        sourceName: entry.rawName,
        expandedName: entry.expandedName,
        upc: entry.upc,
        matchType: 'no-space',
        score: 0.95
      });
      matchedProductIds.add(product.id);
      matchedUPCs.add(entry.upc);
      continue;
    }
    
    // Strategy 3: High keyword overlap (for products with same brand and key terms)
    const sourceKeywords = extractKeyWords(entry.expandedName);
    let bestMatch: { product: typeof productsWithoutSku[0], score: number } | null = null;
    
    for (const product of productsWithoutSku) {
      if (matchedProductIds.has(product.id)) continue;
      
      const productWords = productKeywords.get(product.id) || [];
      const score = wordOverlapScore(sourceKeywords, productWords);
      
      // Require high overlap (>= 70%) and at least 3 matching words
      const matchingWords = sourceKeywords.filter(w => productWords.includes(w));
      if (score >= 0.70 && matchingWords.length >= 3) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { product, score };
        }
      }
    }
    
    if (bestMatch) {
      matches.push({
        productId: bestMatch.product.id,
        productName: bestMatch.product.name,
        sourceName: entry.rawName,
        expandedName: entry.expandedName,
        upc: entry.upc,
        matchType: 'keyword',
        score: bestMatch.score
      });
      matchedProductIds.add(bestMatch.product.id);
      matchedUPCs.add(entry.upc);
    }
  }
  
  // Sort by match quality
  matches.sort((a, b) => b.score - a.score);
  
  console.log(`\n=== MATCH RESULTS ===`);
  console.log(`Total matches: ${matches.length}`);
  console.log(`  Exact: ${matches.filter(m => m.matchType === 'exact').length}`);
  console.log(`  No-space: ${matches.filter(m => m.matchType === 'no-space').length}`);
  console.log(`  Keyword: ${matches.filter(m => m.matchType === 'keyword').length}`);
  
  // Show sample matches by type
  console.log('\nSample EXACT matches:');
  for (const match of matches.filter(m => m.matchType === 'exact').slice(0, 5)) {
    console.log(`  "${match.sourceName}" -> "${match.productName}" (${match.upc})`);
  }
  
  console.log('\nSample NO-SPACE matches:');
  for (const match of matches.filter(m => m.matchType === 'no-space').slice(0, 5)) {
    console.log(`  "${match.sourceName}" -> "${match.productName}" (${match.upc})`);
  }
  
  console.log('\nSample KEYWORD matches (verify these carefully):');
  for (const match of matches.filter(m => m.matchType === 'keyword').slice(0, 10)) {
    console.log(`  [${(match.score*100).toFixed(0)}%] "${match.expandedName}" -> "${match.productName}" (${match.upc})`);
  }
  
  // Apply exact and no-space matches (high confidence)
  const highConfidenceMatches = matches.filter(m => m.matchType !== 'keyword' || m.score >= 0.85);
  
  if (highConfidenceMatches.length > 0) {
    console.log(`\nApplying ${highConfidenceMatches.length} high-confidence updates...`);
    
    for (let i = 0; i < highConfidenceMatches.length; i++) {
      const match = highConfidenceMatches[i];
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.productId));
      
      if ((i + 1) % 100 === 0) {
        console.log(`  Updated ${i + 1}/${highConfidenceMatches.length}`);
      }
    }
    console.log(`  Updated ${highConfidenceMatches.length}/${highConfidenceMatches.length}`);
  }
  
  // Final stats
  const [finalStats] = await db.select({
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(sku)`
  }).from(supplies);
  
  const improvement = Number(finalStats.withSku) - Number(initialStats.withSku);
  
  console.log(`\n=== FINAL COVERAGE ===`);
  console.log(`Products with SKU: ${finalStats.withSku}/${finalStats.total} (${(Number(finalStats.withSku)/Number(finalStats.total)*100).toFixed(1)}%)`);
  console.log(`Improvement: +${improvement} products`);
  
  process.exit(0);
}

main().catch(console.error);
