import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';

interface UpcRecord {
  upc: string;
  name: string;
  source: string;
}

const ALL_UPCS: Map<string, UpcRecord> = new Map();

// ========== SOURCE 1: Google Sheet CSV ==========
async function extractGoogleSheet() {
  const csvPath = 'scripts/google_sheet_upcs.csv';
  if (!fs.existsSync(csvPath)) {
    console.log('  Google Sheet CSV not found');
    return 0;
  }
  
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  let count = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { parts.push(current.trim()); current = ''; }
      else current += char;
    }
    parts.push(current.trim());
    
    const [upc, name] = parts;
    if (upc && name && upc.length >= 8 && /^\d+$/.test(upc)) {
      if (!ALL_UPCS.has(upc)) {
        ALL_UPCS.set(upc, { upc, name, source: 'google_sheet' });
        count++;
      }
    }
  }
  
  return count;
}

// ========== SOURCE 2: Invoice UPCs ==========
async function extractInvoices() {
  const invoicePath = '.local/state/memory/all_invoice_upcs.txt';
  if (!fs.existsSync(invoicePath)) {
    console.log('  Invoice UPC file not found');
    return 0;
  }
  
  const content = fs.readFileSync(invoicePath, 'utf-8');
  let count = 0;
  
  for (const line of content.split('\n')) {
    if (!line.trim() || line.startsWith('UPC')) continue;
    const parts = line.split('|');
    const upc = parts[0]?.trim();
    const vendor = parts[1]?.trim() || '';
    const desc = parts.slice(2).join(' ').trim();
    
    if (upc && /^\d{10,}$/.test(upc) && desc) {
      if (!ALL_UPCS.has(upc)) {
        ALL_UPCS.set(upc, { upc, name: `${vendor} ${desc}`.trim(), source: 'invoice' });
        count++;
      }
    }
  }
  
  return count;
}

// ========== SOURCE 3: All Excel Files ==========
async function extractExcelFiles() {
  const excelFiles = [
    'attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx',
    'attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx',
    'attached_assets/AnimalHouse_Inventory_2025-12-04 (1)_1764877836470.xlsx',
    'attached_assets/AnimalHouse_Exatouch_Import.xlsx',
    'attached_assets/Exatouch-Retail-Import-Template-6-24-24_1764878779205.xlsx',
    'attached_assets/Exatouch-Retail-Import-Template-6-24-24_1764879233393.xlsx',
  ];
  
  let totalCount = 0;
  
  for (const filePath of excelFiles) {
    if (!fs.existsSync(filePath)) continue;
    
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      
      for (const sheet of workbook.worksheets) {
        let upcCol = -1;
        let nameCol = -1;
        let descCol = -1;
        
        // Find columns by header
        const headerRow = sheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
          const val = String(cell.value || '').toLowerCase();
          if (val.includes('upc') || val.includes('barcode') || val === 'sku') {
            upcCol = colNumber;
          }
          if (val.includes('name') || val.includes('description') || val.includes('item') || val === 'product') {
            if (nameCol === -1) nameCol = colNumber;
            else descCol = colNumber;
          }
        });
        
        if (upcCol === -1) continue;
        if (nameCol === -1) nameCol = upcCol + 1;
        
        let sheetCount = 0;
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          
          let upc = String(row.getCell(upcCol).value || '').trim();
          upc = upc.replace(/[^0-9]/g, '');
          
          const name = String(row.getCell(nameCol).value || '').trim();
          const desc = descCol > 0 ? String(row.getCell(descCol).value || '').trim() : '';
          const fullName = (name + ' ' + desc).trim();
          
          if (upc && upc.length >= 8 && /^\d+$/.test(upc) && fullName) {
            if (!ALL_UPCS.has(upc)) {
              ALL_UPCS.set(upc, { upc, name: fullName, source: `excel:${path.basename(filePath)}:${sheet.name}` });
              sheetCount++;
            }
          }
        });
        
        if (sheetCount > 0) {
          console.log(`    ${path.basename(filePath)} - ${sheet.name}: ${sheetCount} UPCs`);
        }
        totalCount += sheetCount;
      }
    } catch (e: any) {
      console.log(`  Error reading ${filePath}: ${e.message}`);
    }
  }
  
  return totalCount;
}

// ========== SOURCE 4: Order Text Files ==========
async function extractOrderFiles() {
  const orderDirs = [
    'attached_assets/extracted_orders',
    'attached_assets/extracted_orders2',
  ];
  
  let count = 0;
  
  for (const dir of orderDirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      
      // Look for UPC patterns: 10-14 digit numbers followed by text
      const upcPattern = /(\d{10,14})\s+([A-Za-z][\w\s\-\.\/]+)/g;
      let match;
      
      while ((match = upcPattern.exec(content)) !== null) {
        const upc = match[1];
        const name = match[2].trim().substring(0, 100);
        
        if (!ALL_UPCS.has(upc) && name.length > 3) {
          ALL_UPCS.set(upc, { upc, name, source: `order:${file}` });
          count++;
        }
      }
    }
  }
  
  return count;
}

// ========== MATCHING LOGIC ==========
const BRAND_MAP: Record<string, string> = {
  'sd': 'science diet', 'hills': 'science diet', 'hill': 'science diet',
  'nb': 'natural balance', 'tow': 'taste of the wild', 'toe': 'taste of the wild',
  'diam': 'diamond', 'royal': 'royal canin', 'rc': 'royal canin',
  'blue': 'blue buffalo', 'bb': 'blue buffalo',
  'kong': 'kong', 'kon': 'kong', 'kc': 'kong',
  'kaytee': 'kaytee', 'kay': 'kaytee', 'kmp': 'kaytee', 'kt': 'kaytee',
  'aqueon': 'aqueon', 'aqe': 'aqueon',
  'tetra': 'tetra', 'tet': 'tetra',
  'hikari': 'hikari', 'hik': 'hikari',
  'api': 'api', 'ar': 'api',
  'fluval': 'fluval', 'flu': 'fluval',
  'marina': 'marina', 'mar': 'marina',
  'seachem': 'seachem', 'sli': 'seachem',
  'zoo med': 'zoo med', 'zoo': 'zoo med', 'zml': 'zoo med',
  'exo terra': 'exo terra', 'exo': 'exo terra',
  'zilla': 'zilla', 'zil': 'zilla',
  'flukers': 'flukers', 'flk': 'flukers',
  'zupreem': 'zupreem', 'zup': 'zupreem',
  'coastal': 'coastal', 'coa': 'coastal',
  'penn': 'penn plax', 'pennplax': 'penn plax',
  'oxbow': 'oxbow', 'oxb': 'oxbow',
  'fromm': 'fromm', 'frm': 'fromm',
  'victor': 'victor', 'vict': 'victor',
  'sportmix': 'sportmix', 'spot': 'spot',
  'nutrisource': 'nutrisource', 'nut': 'nutrisource',
  'merrick': 'merrick', 'merr': 'merrick',
  'wellness': 'wellness', 'well': 'wellness',
  'canidae': 'canidae', 'cand': 'canidae',
  'instinct': 'instinct', 'inst': 'instinct',
  'earthborn': 'earthborn', 'earth': 'earthborn',
  'nulo': 'nulo', 'zignature': 'zignature', 'zig': 'zignature',
  'stella': 'stella chewy', 'stell': 'stella chewy',
  'primal': 'primal', 'prim': 'primal',
  'proplan': 'pro plan', 'pro plan': 'pro plan', 'pp': 'pro plan',
  'redbarn': 'redbarn', 'nylabone': 'nylabone', 'nyla': 'nylabone',
  'catit': 'catit', 'voyager': 'catit',
  'prevue': 'prevue', 'jwp': 'jw pet', 'jw': 'jw pet',
  'four paws': 'four paws', 'fou': 'four paws', '4p': 'four paws',
  'ethical': 'ethical', 'eth': 'ethical',
  'mammoth': 'mammoth', 'mamm': 'mammoth',
  'safari': 'safari', 'tropiclean': 'tropiclean', 'tropi': 'tropiclean',
  'circle t': 'circle t', 'circ': 'circle t',
  'titan': 'titan', 'birdlife': 'birdlife',
  'petmate': 'petmate', 'vari': 'petmate', 'barn': 'petmate',
  'li\'l pals': 'lil pals', 'lil pals': 'lil pals',
  'marineland': 'marineland', 'acana': 'acana', 'orijen': 'orijen',
  'weruva': 'weruva', 'tiki': 'tiki cat', 'fussie': 'fussie cat',
  'glofish': 'glofish', 'glo': 'glofish',
};

const ABBREV_MAP: Record<string, string> = {
  'ck': 'chicken', 'chk': 'chicken', 'chkn': 'chicken',
  'bf': 'beef', 'lam': 'lamb', 'slmn': 'salmon', 'sal': 'salmon',
  'duck': 'duck', 'tur': 'turkey', 'turk': 'turkey', 'ven': 'venison',
  'br': 'breed', 'sm': 'small', 'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large', 'xl': 'extra large', 'xs': 'extra small',
  'pup': 'puppy', 'pupp': 'puppy', 'kit': 'kitten', 'sr': 'senior',
  'ad': 'adult', 'adlt': 'adult', 'gr': 'grain', 'fr': 'free',
  'wt': 'weight', 'sens': 'sensitive', 'sensi': 'sensitive',
  'perf': 'perfect', 'dig': 'digest', 'min': 'miniature',
  'anc': 'ancient', 'mount': 'mountain', 'prarie': 'prairie',
  'pacif': 'pacific', 'sierra': 'sierra', 'mainten': 'maintenance',
  'prem': 'premium', 'als': 'all stages', 'orig': 'original',
  'vitality': 'vitality', 'mobility': 'mobility', 'light': 'light',
  'bulb': 'bulb', 'fxtr': 'fixture', 'food': 'food', 'trt': 'treat',
  'clnr': 'cleaner', 'grvl': 'gravel', 'vac': 'vacuum',
  'ornmt': 'ornament', 'sbstrt': 'substrate', 'filt': 'filter',
  'crt': 'cartridge', 'pllt': 'pellet', 'flk': 'flake',
  'htr': 'heater', 'therm': 'thermometer', 'toy': 'toy',
  'cond': 'conditioner', 'shmp': 'shampoo',
  'cchld': 'cichlid', 'gld': 'gold', 'betta': 'betta', 'trpcl': 'tropical',
  'tiel': 'cockatiel', 'prrt': 'parrot', 'keet': 'parakeet',
  'glofsh': 'glofish', 'cllr': 'collar', 'lsh': 'leash', 'hrns': 'harness',
  'cozie': 'cozie', 'xtrm': 'extreme', 'rfill': 'refill',
};

function expandName(name: string): string {
  let expanded = name.toLowerCase();
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb');
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*z\b/gi, '$1oz');
  
  for (const [abbr, full] of Object.entries(ABBREV_MAP)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  
  return expanded.replace(/\s+/g, ' ').trim();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getWords(s: string): Set<string> {
  const words = normalize(s).split(' ').filter(w => w.length >= 2);
  const noise = new Set(['the', 'and', 'for', 'with', 'oz', 'lb', 'ea', 'pk', 'in', 'ct']);
  return new Set(words.filter(w => !noise.has(w)));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  return intersection / new Set([...a, ...b]).size;
}

function getBrand(name: string): string {
  const lower = name.toLowerCase().trim();
  const words = lower.split(/\s+/);
  
  for (let i = Math.min(3, words.length); i >= 1; i--) {
    const prefix = words.slice(0, i).join(' ');
    if (BRAND_MAP[prefix]) return BRAND_MAP[prefix];
  }
  
  return words[0] || 'unknown';
}

function calculateScore(upcName: string, productName: string, productBrand: string | null): number {
  const upcExpanded = expandName(upcName);
  const productLower = productName.toLowerCase();
  
  const upcWords = getWords(upcExpanded);
  const productWords = getWords(productLower);
  
  let score = jaccardSimilarity(upcWords, productWords);
  
  // Brand match bonus
  const upcBrand = getBrand(upcName);
  const prodBrand = productBrand?.toLowerCase().replace(/['']/g, '') || '';
  
  if (upcBrand && prodBrand) {
    const normalizedProdBrand = BRAND_MAP[prodBrand] || prodBrand;
    if (upcBrand === normalizedProdBrand || 
        normalizedProdBrand.includes(upcBrand) || 
        upcBrand.includes(normalizedProdBrand)) {
      score += 0.15;
    }
  }
  
  // Weight match bonus
  const upcWeight = upcName.match(/(\d+(?:\.\d+)?)\s*(?:lb|#|oz)/i)?.[1];
  const prodWeight = productName.match(/(\d+(?:\.\d+)?)\s*(?:lb|oz)/i)?.[1];
  if (upcWeight && prodWeight && upcWeight === prodWeight) {
    score += 0.20;
  }
  
  // Key word bonuses
  const keywords = ['puppy', 'kitten', 'senior', 'adult', 'small', 'large', 'medium',
                    'chicken', 'beef', 'lamb', 'salmon', 'turkey', 'duck'];
  for (const kw of keywords) {
    if (upcExpanded.includes(kw) && productLower.includes(kw)) {
      score += 0.05;
    }
  }
  
  return Math.min(score, 1.0);
}

async function main() {
  console.log('=== Building Comprehensive UPC Baseline ===\n');
  
  // Extract from all sources
  console.log('Extracting UPCs from all sources...');
  
  const googleCount = await extractGoogleSheet();
  console.log(`  Google Sheet: ${googleCount} UPCs`);
  
  const invoiceCount = await extractInvoices();
  console.log(`  Invoices: ${invoiceCount} UPCs`);
  
  console.log('  Excel files:');
  const excelCount = await extractExcelFiles();
  console.log(`  Excel total: ${excelCount} UPCs`);
  
  const orderCount = await extractOrderFiles();
  console.log(`  Order files: ${orderCount} UPCs`);
  
  console.log(`\nTotal unique UPCs: ${ALL_UPCS.size}`);
  
  // Save UPC database for reference
  const upcList = Array.from(ALL_UPCS.values());
  fs.writeFileSync('.local/state/memory/complete_upc_database.json', 
    JSON.stringify(upcList, null, 2));
  console.log('Saved complete UPC database to .local/state/memory/complete_upc_database.json');
  
  // Get products WITHOUT SKU only
  const products = await db.select().from(supplies).where(isNull(supplies.sku));
  console.log(`\nProducts needing SKU: ${products.length}`);
  
  // Get existing SKU count
  const allProducts = await db.select().from(supplies);
  const existingSku = allProducts.filter(p => p.sku).length;
  console.log(`Products already with SKU: ${existingSku}`);
  
  // Group products by brand for faster matching
  const productsByBrand = new Map<string, typeof products>();
  for (const product of products) {
    const brand = (product.brand || '').toLowerCase().replace(/['']/g, '');
    const normalizedBrand = BRAND_MAP[brand] || brand || 'unknown';
    if (!productsByBrand.has(normalizedBrand)) productsByBrand.set(normalizedBrand, []);
    productsByBrand.get(normalizedBrand)!.push(product);
  }
  
  // Group UPCs by brand
  const upcsByBrand = new Map<string, UpcRecord[]>();
  for (const upc of upcList) {
    const brand = getBrand(upc.name);
    if (!upcsByBrand.has(brand)) upcsByBrand.set(brand, []);
    upcsByBrand.get(brand)!.push(upc);
  }
  
  // HIGH CONFIDENCE MATCHING (90%+ score only)
  console.log('\nMatching with HIGH CONFIDENCE threshold (90%+)...');
  
  const highConfidenceMatches: Array<{
    productId: number;
    productName: string;
    upc: string;
    upcName: string;
    score: number;
  }> = [];
  
  const HIGH_THRESHOLD = 0.90;
  
  for (const [brand, brandProducts] of productsByBrand) {
    const brandUpcs = upcsByBrand.get(brand) || [];
    if (brandUpcs.length === 0) continue;
    
    for (const product of brandProducts) {
      let bestMatch: { upc: string; name: string; score: number } | null = null;
      
      for (const upc of brandUpcs) {
        const score = calculateScore(upc.name, product.name, product.brand);
        if (score >= HIGH_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { upc: upc.upc, name: upc.name, score };
        }
      }
      
      if (bestMatch) {
        highConfidenceMatches.push({
          productId: product.id,
          productName: product.name,
          upc: bestMatch.upc,
          upcName: bestMatch.name,
          score: bestMatch.score
        });
      }
    }
  }
  
  console.log(`High confidence matches (90%+): ${highConfidenceMatches.length}`);
  
  // Apply HIGH confidence matches
  let applied = 0;
  for (const match of highConfidenceMatches) {
    try {
      await db.execute(sql`UPDATE supplies SET sku = ${match.upc} WHERE id = ${match.productId}`);
      applied++;
    } catch (e: any) {
      // Skip errors
    }
  }
  console.log(`Applied ${applied} high-confidence SKUs`);
  
  // Save applied matches for reference (these are permanent)
  const appliedMatches = highConfidenceMatches.map(m => ({
    productId: m.productId,
    productName: m.productName,
    upc: m.upc,
    upcName: m.upcName,
    score: m.score.toFixed(3),
    status: 'PERMANENT'
  }));
  
  fs.writeFileSync('.local/state/memory/permanent_upc_matches.json',
    JSON.stringify(appliedMatches, null, 2));
  
  // Final statistics
  const finalProducts = await db.select().from(supplies);
  const withSku = finalProducts.filter(p => p.sku).length;
  const total = finalProducts.length;
  const coverage = ((withSku / total) * 100).toFixed(1);
  
  console.log(`\n=== BASELINE RESULTS ===`);
  console.log(`Total UPCs in database: ${ALL_UPCS.size}`);
  console.log(`Products with SKU: ${withSku} / ${total}`);
  console.log(`Coverage: ${coverage}%`);
  console.log(`\nHigh-confidence matches saved as PERMANENT`);
  console.log(`These will NOT be changed in future runs`);
  
  // Show sample matches
  console.log('\nSample permanent matches:');
  highConfidenceMatches.slice(0, 15).forEach(m => {
    console.log(`  ${(m.score * 100).toFixed(0)}%: "${m.upcName}" -> "${m.productName.substring(0, 50)}"`);
  });
}

main().catch(console.error);
