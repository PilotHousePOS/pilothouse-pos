import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull, isNotNull, inArray } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface UpcEntry { upc: string; name: string; }

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Get core product identifier words (skip brand, sizes, weights)
function getCoreWords(name: string): Set<string> {
  const norm = normalize(name);
  const skipWords = new Set(['small', 'medium', 'large', 'sm', 'md', 'lg', 'xl', 'xs', 
    'oz', 'lb', 'lbs', 'pk', 'ct', 'pack', 'count', 'for', 'with', 'the', 'and', 'a', 'an']);
  const skipPatterns = [/^\d+$/, /^\d+oz$/, /^\d+lb$/, /^\d+lbs$/, /^\d+pk$/];
  
  return new Set(norm.split(' ').filter(w => {
    if (w.length < 3) return false;
    if (skipWords.has(w)) return false;
    if (skipPatterns.some(p => p.test(w))) return false;
    return true;
  }));
}

// Calculate word match score
function matchScore(a: Set<string>, b: Set<string>): number {
  let matches = 0;
  for (const w of a) if (b.has(w)) matches++;
  const maxPossible = Math.min(a.size, b.size);
  return maxPossible === 0 ? 0 : matches / maxPossible;
}

// Matchable brands with enough source data
const matchableBrands = [
  'Kong', 'Coastal', 'Blue Buffalo', 'Taste of the Wild', 'Nylabone',
  'RedBarn', 'Pets First', 'Primal', 'Natural Balance', 'Vital Essentials',
  'MidWest Homes For Pets', 'PetSafe', 'PetCrest', 'Fromm', 'Royal Canin',
  'Orijen', 'Acana', 'Wellness', 'Pro Plan'
];

async function loadSources(): Promise<Map<string, UpcEntry[]>> {
  const byBrand = new Map<string, UpcEntry[]>();
  
  const addEntry = (upc: string, name: string) => {
    const lower = name.toLowerCase();
    for (const brand of matchableBrands) {
      if (lower.includes(brand.toLowerCase().split(' ')[0])) {
        if (!byBrand.has(brand)) byBrand.set(brand, []);
        byBrand.get(brand)!.push({ upc, name });
      }
    }
  };
  
  // Excel
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = wb.worksheets[0];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const upc = cleanUpc(String(row.getCell(1).value || ''));
    const name = String(row.getCell(2).value || '').trim();
    if (upc.length >= 10 && name.length > 2) addEntry(upc, name);
  });
  
  // Google Sheet
  const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  for (const line of csv.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = cleanUpc(parts[0]);
      const name = parts[1].trim();
      if (upc.length >= 10 && name.length > 2) addEntry(upc, name);
    }
  }
  
  // Invoices
  const inv = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
  for (const line of inv.split('\n').slice(1)) {
    const parts = line.split('|');
    if (parts.length >= 3) {
      const upc = cleanUpc(parts[0]);
      const name = parts[2].trim();
      if (upc.length >= 10 && name.length > 3) addEntry(upc, name);
    }
  }
  
  return byBrand;
}

async function main() {
  console.log('=== Targeted Matching for Matchable Brands ===\n');
  
  // Get unmatched products from matchable brands
  const noSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.sku));
  
  const matchableProducts = noSku.filter(p => 
    matchableBrands.some(b => p.brand?.toLowerCase().includes(b.toLowerCase().split(' ')[0]))
  );
  
  console.log(`Total unmatched: ${noSku.length}`);
  console.log(`From matchable brands: ${matchableProducts.length}\n`);
  
  const sources = await loadSources();
  
  for (const [brand, entries] of sources) {
    console.log(`  ${brand}: ${entries.length} source entries`);
  }
  
  const matches: {id: number; upc: string; pName: string; uName: string; score: number}[] = [];
  
  for (const product of matchableProducts) {
    const pBrand = product.brand || '';
    const matchingBrand = matchableBrands.find(b => 
      pBrand.toLowerCase().includes(b.toLowerCase().split(' ')[0])
    );
    
    if (!matchingBrand || !sources.has(matchingBrand)) continue;
    
    const brandSources = sources.get(matchingBrand)!;
    const pCore = getCoreWords(product.name);
    
    if (pCore.size < 2) continue;
    
    let best: UpcEntry | null = null;
    let bestScore = 0.7; // 70% threshold
    
    for (const entry of brandSources) {
      const eCore = getCoreWords(entry.name);
      const score = matchScore(pCore, eCore);
      
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    
    if (best) {
      matches.push({
        id: product.id,
        upc: best.upc,
        pName: product.name,
        uName: best.name,
        score: bestScore
      });
    }
  }
  
  console.log(`\nNew matches found: ${matches.length}\n`);
  
  // Apply
  for (const m of matches) {
    await db.update(supplies).set({ sku: m.upc }).where(sql`id = ${m.id}`);
  }
  
  // Update permanent file
  const permPath = '.local/state/memory/permanent_upc_matches.json';
  let perm: Record<string, string> = {};
  if (fs.existsSync(permPath)) perm = JSON.parse(fs.readFileSync(permPath, 'utf-8'));
  for (const m of matches) perm[m.id.toString()] = m.upc;
  fs.writeFileSync(permPath, JSON.stringify(perm, null, 2));
  
  // Final stats
  const finalHasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  const total = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  
  console.log(`=== RESULT ===`);
  console.log(`Products with SKU: ${finalHasSku.length} / ${total[0].count}`);
  console.log(`Coverage: ${(finalHasSku.length / Number(total[0].count) * 100).toFixed(1)}%`);
  
  console.log(`\nSample matches:`);
  matches.sort((a, b) => b.score - a.score);
  for (const m of matches.slice(0, 20)) {
    console.log(`  ${(m.score*100).toFixed(0)}% "${m.pName}" -> "${m.uName}"`);
  }
}

main().catch(console.error);
