import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface UpcEntry { upc: string; name: string; }

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Load all UPC sources into arrays for faster iteration
async function loadAllSources(): Promise<UpcEntry[]> {
  const all: UpcEntry[] = [];
  
  // Maybe Inventory
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = wb.worksheets[0];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const upc = cleanUpc(String(row.getCell(1).value || ''));
    const name = String(row.getCell(2).value || '').trim();
    if (upc.length >= 10 && upc.length <= 14 && name.length > 2) {
      all.push({ upc, name });
    }
  });
  
  // Google Sheet
  const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  for (const line of csv.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = cleanUpc(parts[0]);
      const name = parts[1].trim();
      if (upc.length >= 10 && upc.length <= 14 && name.length > 2) {
        all.push({ upc, name });
      }
    }
  }
  
  // Invoices
  const inv = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
  for (const line of inv.split('\n').slice(1)) {
    const parts = line.split('|');
    if (parts.length >= 3) {
      const upc = cleanUpc(parts[0]);
      const name = parts[2].trim();
      if (upc.length >= 10 && upc.length <= 14 && name.length > 3) {
        all.push({ upc, name });
      }
    }
  }
  
  return all;
}

// Brand-aware matching - extract brand and match products within same brand
function extractBrand(name: string): string | null {
  const brands = [
    'science diet', 'hills', 'royal canin', 'purina', 'blue buffalo', 'iams', 'eukanuba',
    'friskies', 'fancy feast', 'meow mix', 'wellness', 'nutro', 'natural balance',
    'coastal', 'kong', 'nylabone', 'petstages', 'bergan', 'omega',
    'zoo med', 'zoomed', 'exo terra', 'exoterra', 'flukers', 'zilla', 'tetra',
    'marineland', 'api', 'seachem', 'aqueon', 'penn plax', 'pennplax',
    'four paws', 'fourpaws', 'lil pals', 'lilpals', 'li\'l pals',
    'kaytee', 'oxbow', 'vitakraft', 'living world', 'ware', 'super pet',
    'hartz', 'arm hammer', 'natures miracle', 'simple solution', 'furminator'
  ];
  
  const lower = name.toLowerCase();
  for (const b of brands) {
    if (lower.startsWith(b) || lower.includes(b + ' ')) {
      return b;
    }
  }
  return null;
}

function getProductWords(name: string): Set<string> {
  return new Set(normalize(name).split(' ').filter(w => w.length >= 2));
}

function wordOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const w of a) if (b.has(w)) count++;
  return count;
}

async function main() {
  console.log('=== Expanded Coverage Matching ===\n');
  
  // Get products without SKU
  const noSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.sku));
  
  const hasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  
  console.log(`Products with SKU: ${hasSku.length}`);
  console.log(`Products needing SKU: ${noSku.length}\n`);
  
  const allSources = await loadAllSources();
  console.log(`Total UPC entries: ${allSources.length}\n`);
  
  // Group sources by normalized name for exact matching
  const byName = new Map<string, UpcEntry>();
  for (const e of allSources) {
    const key = normalize(e.name);
    if (!byName.has(key)) byName.set(key, e);
  }
  
  // Group by brand for brand-aware matching
  const byBrand = new Map<string, UpcEntry[]>();
  for (const e of allSources) {
    const brand = extractBrand(e.name);
    if (brand) {
      if (!byBrand.has(brand)) byBrand.set(brand, []);
      byBrand.get(brand)!.push(e);
    }
  }
  
  const matches: {id: number; upc: string; productName: string; upcName: string}[] = [];
  
  for (const product of noSku) {
    const pNorm = normalize(product.name);
    
    // Strategy 1: Exact normalized match
    if (byName.has(pNorm)) {
      matches.push({
        id: product.id,
        upc: byName.get(pNorm)!.upc,
        productName: product.name,
        upcName: byName.get(pNorm)!.name
      });
      continue;
    }
    
    // Strategy 2: Brand-aware matching with high word overlap
    const pBrand = extractBrand(product.name);
    if (pBrand && byBrand.has(pBrand)) {
      const pWords = getProductWords(product.name);
      let bestMatch: UpcEntry | null = null;
      let bestScore = 0;
      
      for (const entry of byBrand.get(pBrand)!) {
        const eWords = getProductWords(entry.name);
        const overlap = wordOverlap(pWords, eWords);
        const minSize = Math.min(pWords.size, eWords.size);
        
        // Require high overlap for brand-aware matching
        if (overlap >= 3 && overlap >= minSize * 0.7 && overlap > bestScore) {
          bestScore = overlap;
          bestMatch = entry;
        }
      }
      
      if (bestMatch) {
        matches.push({
          id: product.id,
          upc: bestMatch.upc,
          productName: product.name,
          upcName: bestMatch.name
        });
      }
    }
  }
  
  console.log(`New matches found: ${matches.length}\n`);
  
  // Apply matches
  for (const m of matches) {
    await db.update(supplies).set({ sku: m.upc }).where(sql`id = ${m.id}`);
  }
  
  // Update permanent file
  const permPath = '.local/state/memory/permanent_upc_matches.json';
  let perm: Record<string, string> = {};
  if (fs.existsSync(permPath)) {
    perm = JSON.parse(fs.readFileSync(permPath, 'utf-8'));
  }
  
  for (const m of matches) {
    perm[m.id.toString()] = m.upc;
  }
  
  fs.writeFileSync(permPath, JSON.stringify(perm, null, 2));
  
  // Final count
  const finalHasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  const total = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  
  console.log(`=== UPDATED BASELINE ===`);
  console.log(`Products with SKU: ${finalHasSku.length} / ${total[0].count}`);
  console.log(`Coverage: ${(finalHasSku.length / Number(total[0].count) * 100).toFixed(1)}%`);
  
  console.log(`\nSample matches:`);
  for (const m of matches.slice(0, 20)) {
    console.log(`  "${m.productName}" -> "${m.upcName}"`);
  }
}

main().catch(console.error);
