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

const ABBREV: Record<string, string> = {
  'ck': 'chicken', 'chk': 'chicken', 'chkn': 'chicken',
  'bf': 'beef', 'lam': 'lamb', 'slmn': 'salmon', 'sal': 'salmon',
  'tur': 'turkey', 'turk': 'turkey', 'ven': 'venison',
  'sm': 'small', 'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large', 'xl': 'extra large',
  'pup': 'puppy', 'kit': 'kitten', 'sr': 'senior',
  'ad': 'adult', 'adlt': 'adult', 'gr': 'grain', 'fr': 'free',
  'wt': 'weight', 'sens': 'sensitive',
  'sd': 'science diet', 'hills': 'science diet',
  'nb': 'natural balance', 'tow': 'taste of the wild',
  'bb': 'blue buffalo', 'rc': 'royal canin',
  'aqe': 'aqueon', 'tet': 'tetra', 'hik': 'hikari',
  'sli': 'seachem', 'zml': 'zoo med', 'flk': 'flukers',
  'zup': 'zupreem', 'oxb': 'oxbow', 'kay': 'kaytee',
  'kon': 'kong', 'eth': 'ethical', 'fou': 'four paws',
  'jwp': 'jw pet', 'kc': 'kong',
  'shmp': 'shampoo', 'cond': 'conditioner',
  'filt': 'filter', 'htr': 'heater', 'therm': 'thermometer',
  'cllr': 'collar', 'lsh': 'leash', 'hrns': 'harness',
  'trt': 'treat', 'clnr': 'cleaner', 'sbstrt': 'substrate',
  'ornmt': 'ornament', 'grvl': 'gravel', 'pllt': 'pellet',
  'cchld': 'cichlid', 'gld': 'gold', 'trpcl': 'tropical',
  'bsct': 'biscuit', 'jrky': 'jerky', 'dspnsr': 'dispenser',
  'lttr': 'litter', 'rfill': 'refill', 'fxtr': 'fixture',
  'br': 'breed', 'prrt': 'parrot', 'keet': 'parakeet',
  'tiel': 'cockatiel', 'lvbr': 'lovebird',
};

function expandAbbreviations(name: string): string {
  let expanded = name.toLowerCase();
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb');
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*z\b/gi, '$1oz');
  
  for (const [abbr, full] of Object.entries(ABBREV)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  
  return expanded.replace(/\s+/g, ' ').trim();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getWords(s: string): string[] {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'oz', 'lb', 'ea', 'pk', 'in', 'ct', 'of', 'a', 'an']);
  return normalize(s).split(' ').filter(w => w.length >= 2 && !stopWords.has(w));
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
      if (upc.length >= 10 && upc.length <= 14 && name) {
        entries.push({ upc, name, source: 'GoogleSheet' });
      }
    }
  }
  
  return entries;
}

async function loadInvoiceUpcs(): Promise<UpcEntry[]> {
  const entries: UpcEntry[] = [];
  const content = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
  const lines = content.split('\n');
  
  for (const line of lines.slice(1)) {
    const parts = line.split('|');
    if (parts.length >= 3) {
      const upc = cleanUpc(parts[0]);
      const name = parts[2].trim();
      if (upc.length >= 10 && upc.length <= 14 && name && name.length > 3) {
        entries.push({ upc, name, source: 'Invoice' });
      }
    }
  }
  
  return entries;
}

function findBestMatch(upcEntry: UpcEntry, products: any[]): { product: any; type: string; score: number } | null {
  const upcName = upcEntry.name;
  const expandedUpc = expandAbbreviations(upcName);
  const upcWords = getWords(expandedUpc);
  
  let bestMatch: { product: any; type: string; score: number } | null = null;
  
  for (const product of products) {
    const productName = product.name;
    const normalizedProduct = normalize(productName);
    const expandedProduct = expandAbbreviations(productName);
    const productWords = getWords(expandedProduct);
    
    if (normalize(upcName) === normalizedProduct) {
      return { product, type: 'exact', score: 1.0 };
    }
    
    if (expandedUpc === expandAbbreviations(productName).toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()) {
      return { product, type: 'exact_expanded', score: 1.0 };
    }
    
    if (upcWords.length >= 2 && productWords.length >= 2) {
      let matches = 0;
      for (const w of upcWords) {
        if (productWords.includes(w)) matches++;
      }
      
      const minLen = Math.min(upcWords.length, productWords.length);
      const maxLen = Math.max(upcWords.length, productWords.length);
      
      if (matches >= minLen && matches >= 3) {
        const score = matches / maxLen;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { product, type: 'word_match', score };
        }
      }
    }
  }
  
  if (bestMatch && bestMatch.score >= 0.7) {
    return bestMatch;
  }
  
  return null;
}

async function main() {
  console.log('=== Comprehensive Line-by-Line UPC Matching ===\n');
  
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
  
  const invoiceUpcs = await loadInvoiceUpcs();
  console.log(`  Invoice UPCs: ${invoiceUpcs.length} entries`);
  
  const allUpcs = [...maybeInventory, ...googleSheet, ...invoiceUpcs];
  const uniqueUpcs = new Map<string, UpcEntry>();
  for (const entry of allUpcs) {
    if (!matchedUpcs.has(entry.upc)) {
      uniqueUpcs.set(entry.upc, entry);
    }
  }
  console.log(`\nUnique UPCs to process: ${uniqueUpcs.size}`);
  
  const unmatchedProducts = products.filter(p => !matchedProductIds.has(p.id));
  console.log(`Unmatched products to search: ${unmatchedProducts.length}`);
  
  const newMatches: Match[] = [];
  let processed = 0;
  
  for (const [upc, entry] of uniqueUpcs) {
    processed++;
    if (processed % 1000 === 0) {
      console.log(`  Processed ${processed}/${uniqueUpcs.size}...`);
    }
    
    const match = findBestMatch(entry, unmatchedProducts);
    if (match && !matchedProductIds.has(match.product.id)) {
      newMatches.push({
        productId: match.product.id,
        productName: match.product.name,
        upc: upc,
        upcName: entry.name,
        matchType: match.type
      });
      matchedProductIds.add(match.product.id);
    }
  }
  
  console.log(`\nNew matches found: ${newMatches.length}`);
  const matchTypes = new Map<string, number>();
  for (const m of newMatches) {
    matchTypes.set(m.matchType, (matchTypes.get(m.matchType) || 0) + 1);
  }
  for (const [type, count] of matchTypes) {
    console.log(`  ${type}: ${count}`);
  }
  
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
  newMatches.slice(0, 25).forEach(m => {
    console.log(`  [${m.matchType}] "${m.upcName}" -> "${m.productName}"`);
  });
}

main().catch(console.error);
