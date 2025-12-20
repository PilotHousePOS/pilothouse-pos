import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface UpcEntry { upc: string; name: string; source: string; }
interface Match { productId: number; productName: string; upc: string; upcName: string; matchType: string; }

const BRAND_NORMALIZE: Record<string, string> = {
  'sd': 'hills', 'science diet': 'hills', 'hill': 'hills',
  'nb': 'natural balance', 'tow': 'taste of the wild', 'toe': 'taste of the wild',
  'bb': 'blue buffalo', 'blue': 'blue buffalo', 'rc': 'royal canin',
  'aqe': 'aqueon', 'tet': 'tetra', 'hik': 'hikari',
  'sli': 'seachem', 'zml': 'zoo med', 'zoomed': 'zoo med',
  'flk': 'flukers', 'zup': 'zupreem', 'oxb': 'oxbow',
  'kay': 'kaytee', 'kt': 'kaytee', 'kon': 'kong', 'kc': 'kong',
  'eth': 'ethical', 'fou': 'four paws', 'jwp': 'jw pet',
  'tropi': 'tropiclean', 'coa': 'coastal', 'exo': 'exo terra',
  'zil': 'zilla', 'mar': 'marina', 'flu': 'fluval',
  'ar': 'api', 'penn': 'penn plax', 'prev': 'prevue',
  'cat': 'catit', 'voya': 'catit', 'vari': 'petmate',
  'mam': 'mammoth', 'nylab': 'nylabone', 'nyla': 'nylabone',
  'frm': 'fromm', 'vic': 'victor', 'nur': 'nutrisource',
  'mer': 'merrick', 'well': 'wellness', 'can': 'canidae',
  'inst': 'instinct', 'earth': 'earthborn', 'zig': 'zignature',
  'stel': 'stella chewy', 'prim': 'primal', 'ori': 'orijen',
  'aca': 'acana', 'wer': 'weruva', 'tik': 'tiki cat',
  'fus': 'fussie cat', 'glo': 'glofish', 'marineland': 'marineland',
  'cir': 'circle t', 'saf': 'safari', 'lil': 'lil pals',
  'pet': 'petmate', 'barn': 'petmate', 'diam': 'diamond',
};

function getBrand(name: string): string {
  const lower = name.toLowerCase().replace(/['']/g, '').trim();
  const words = lower.split(/[\s\-_]+/);
  
  for (let len = Math.min(3, words.length); len >= 1; len--) {
    const prefix = words.slice(0, len).join(' ');
    if (BRAND_NORMALIZE[prefix]) return BRAND_NORMALIZE[prefix];
    if (BRAND_NORMALIZE[words[0]]) return BRAND_NORMALIZE[words[0]];
  }
  
  return words[0] || 'unknown';
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getWords(s: string): Set<string> {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'oz', 'lb', 'ea', 'pk', 'in', 'ct', 'of']);
  const words = normalize(s).split(' ').filter(w => w.length >= 2 && !stopWords.has(w));
  return new Set(words);
}

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }

async function loadAllUpcs(): Promise<UpcEntry[]> {
  const entries: UpcEntry[] = [];
  
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = wb.worksheets[0];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const upc = cleanUpc(String(row.getCell(1).value || ''));
    const name = String(row.getCell(2).value || '').trim();
    if (upc.length >= 10 && upc.length <= 14 && name.length > 2) {
      entries.push({ upc, name, source: 'MaybeInv' });
    }
  });
  
  const gContent = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  for (const line of gContent.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = cleanUpc(parts[0]);
      const name = parts[1].trim();
      if (upc.length >= 10 && upc.length <= 14 && name) {
        entries.push({ upc, name, source: 'GSheet' });
      }
    }
  }
  
  const iContent = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
  for (const line of iContent.split('\n').slice(1)) {
    const parts = line.split('|');
    if (parts.length >= 3) {
      const upc = cleanUpc(parts[0]);
      const name = parts[2].trim();
      if (upc.length >= 10 && upc.length <= 14 && name.length > 3) {
        entries.push({ upc, name, source: 'Invoice' });
      }
    }
  }
  
  return entries;
}

function matchScore(upcName: string, productName: string): number {
  const normUpc = normalize(upcName);
  const normProd = normalize(productName);
  
  if (normUpc === normProd) return 1.0;
  
  const upcWords = getWords(upcName);
  const prodWords = getWords(productName);
  
  if (upcWords.size === 0 || prodWords.size === 0) return 0;
  
  let matches = 0;
  for (const w of upcWords) if (prodWords.has(w)) matches++;
  
  const union = new Set([...upcWords, ...prodWords]).size;
  return matches / union;
}

async function main() {
  console.log('=== Fast Brand-Grouped UPC Matching ===\n');
  
  const existingMatches = JSON.parse(
    fs.readFileSync('.local/state/memory/permanent_upc_matches.json', 'utf-8')
  );
  const matchedProductIds = new Set(existingMatches.map((m: any) => m.productId));
  const matchedUpcs = new Set(existingMatches.map((m: any) => m.upc));
  
  console.log(`Already matched: ${matchedProductIds.size} products`);
  
  const products = await db.select().from(supplies).where(isNull(supplies.sku));
  console.log(`Products needing SKU: ${products.length}`);
  
  console.log('\nLoading UPC sources...');
  const allUpcs = await loadAllUpcs();
  console.log(`Total UPC entries: ${allUpcs.length}`);
  
  const upcsByBrand = new Map<string, UpcEntry[]>();
  for (const entry of allUpcs) {
    if (matchedUpcs.has(entry.upc)) continue;
    const brand = getBrand(entry.name);
    if (!upcsByBrand.has(brand)) upcsByBrand.set(brand, []);
    upcsByBrand.get(brand)!.push(entry);
  }
  
  const productsByBrand = new Map<string, typeof products>();
  for (const product of products) {
    if (matchedProductIds.has(product.id)) continue;
    const brand = product.brand ? getBrand(product.brand) : getBrand(product.name);
    if (!productsByBrand.has(brand)) productsByBrand.set(brand, []);
    productsByBrand.get(brand)!.push(product);
  }
  
  console.log(`\nBrands in UPCs: ${upcsByBrand.size}`);
  console.log(`Brands in products: ${productsByBrand.size}`);
  
  const newMatches: Match[] = [];
  let brandsProcessed = 0;
  
  for (const [brand, brandUpcs] of upcsByBrand) {
    brandsProcessed++;
    const brandProducts = productsByBrand.get(brand) || [];
    if (brandProducts.length === 0) continue;
    
    if (brandsProcessed % 50 === 0) {
      console.log(`  Processed ${brandsProcessed}/${upcsByBrand.size} brands...`);
    }
    
    for (const upcEntry of brandUpcs) {
      let bestMatch: { product: any; score: number } | null = null;
      
      for (const product of brandProducts) {
        if (matchedProductIds.has(product.id)) continue;
        
        const score = matchScore(upcEntry.name, product.name);
        if (score >= 0.6 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { product, score };
        }
      }
      
      if (bestMatch && bestMatch.score >= 0.6) {
        newMatches.push({
          productId: bestMatch.product.id,
          productName: bestMatch.product.name,
          upc: upcEntry.upc,
          upcName: upcEntry.name,
          matchType: bestMatch.score >= 0.9 ? 'high' : bestMatch.score >= 0.75 ? 'medium' : 'low'
        });
        matchedProductIds.add(bestMatch.product.id);
      }
    }
  }
  
  console.log(`\nNew matches found: ${newMatches.length}`);
  console.log(`  High (90%+): ${newMatches.filter(m => m.matchType === 'high').length}`);
  console.log(`  Medium (75-90%): ${newMatches.filter(m => m.matchType === 'medium').length}`);
  console.log(`  Low (60-75%): ${newMatches.filter(m => m.matchType === 'low').length}`);
  
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
    score: '1.000', status: 'PERMANENT', matchType: m.matchType
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
  console.log(`Total permanent matches: ${allMatches.length}`);
  
  console.log('\nSample new matches:');
  newMatches.slice(0, 20).forEach(m => {
    console.log(`  [${m.matchType}] "${m.upcName}" -> "${m.productName}"`);
  });
}

main().catch(console.error);
