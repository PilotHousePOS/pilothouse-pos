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

// More aggressive word extraction - includes size/weight words
function getWords(name: string): string[] {
  return normalize(name).split(' ').filter(w => w.length >= 2);
}

// Jaccard similarity on words
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Check if key product identifiers match
function hasKeyMatch(pWords: string[], uWords: string[]): boolean {
  const pSet = new Set(pWords);
  const uSet = new Set(uWords);
  
  // Must share at least 2 significant words
  let shared = 0;
  for (const w of pSet) {
    if (uSet.has(w) && w.length >= 3) shared++;
  }
  return shared >= 2;
}

async function loadAllSources(): Promise<UpcEntry[]> {
  const all: UpcEntry[] = [];
  
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

async function main() {
  console.log('=== Targeted Matching for 90% Coverage ===\n');
  
  const noSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.sku));
  
  const hasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  const total = hasSku.length + noSku.length;
  
  console.log(`Current: ${hasSku.length}/${total} (${(hasSku.length/total*100).toFixed(1)}%)`);
  console.log(`Need for 90%: ${Math.ceil(total * 0.9)}`);
  console.log(`Gap: ${Math.ceil(total * 0.9) - hasSku.length} more matches\n`);
  
  const allSources = await loadAllSources();
  console.log(`UPC sources: ${allSources.length}\n`);
  
  // Index by first 2-3 significant words
  const index = new Map<string, UpcEntry[]>();
  for (const e of allSources) {
    const words = getWords(e.name);
    if (words.length >= 2) {
      const key = words.slice(0, 2).sort().join('_');
      if (!index.has(key)) index.set(key, []);
      index.get(key)!.push(e);
    }
  }
  
  const matches: {id: number; upc: string; pName: string; uName: string; score: number}[] = [];
  
  for (const product of noSku) {
    const pWords = getWords(product.name);
    if (pWords.length < 2) continue;
    
    const key = pWords.slice(0, 2).sort().join('_');
    const candidates = index.get(key) || [];
    
    let best: UpcEntry | null = null;
    let bestScore = 0.5; // Lower threshold
    
    for (const c of candidates) {
      const cWords = getWords(c.name);
      if (!hasKeyMatch(pWords, cWords)) continue;
      
      const score = jaccardSimilarity(pWords, cWords);
      if (score > bestScore) {
        bestScore = score;
        best = c;
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
  
  console.log(`New matches: ${matches.length}\n`);
  
  // Apply
  for (const m of matches) {
    await db.update(supplies).set({ sku: m.upc }).where(sql`id = ${m.id}`);
  }
  
  // Update permanent
  const permPath = '.local/state/memory/permanent_upc_matches.json';
  let perm: Record<string, string> = {};
  if (fs.existsSync(permPath)) perm = JSON.parse(fs.readFileSync(permPath, 'utf-8'));
  for (const m of matches) perm[m.id.toString()] = m.upc;
  fs.writeFileSync(permPath, JSON.stringify(perm, null, 2));
  
  // Final
  const finalHasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  console.log(`=== RESULT ===`);
  console.log(`Products with SKU: ${finalHasSku.length} / ${total}`);
  console.log(`Coverage: ${(finalHasSku.length / total * 100).toFixed(1)}%`);
  
  console.log(`\nSample matches:`);
  matches.sort((a, b) => b.score - a.score);
  for (const m of matches.slice(0, 15)) {
    console.log(`  ${(m.score*100).toFixed(0)}% "${m.pName}" -> "${m.uName}"`);
  }
}

main().catch(console.error);
