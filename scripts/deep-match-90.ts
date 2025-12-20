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

// Get significant words only
function getSigWords(name: string): string[] {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'of', 'in', 'a', 'an', 'to', 'oz', 'lb', 'lbs', 'pk', 'ct', 'pack']);
  return normalize(name).split(' ')
    .filter(w => w.length >= 2 && !stopWords.has(w) && !/^\d+$/.test(w));
}

// Levenshtein distance
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + cost);
    }
  }
  return d[m][n];
}

function similarity(a: string, b: string): number {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
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
  console.log('=== Deep Matching for 90% ===\n');
  
  const noSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.sku));
  
  const hasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  const total = hasSku.length + noSku.length;
  
  console.log(`Current: ${hasSku.length}/${total} (${(hasSku.length/total*100).toFixed(1)}%)`);
  console.log(`Need: ${Math.ceil(total * 0.9)} | Gap: ${Math.ceil(total * 0.9) - hasSku.length}\n`);
  
  const allSources = await loadAllSources();
  
  // Index by first word
  const byFirst = new Map<string, UpcEntry[]>();
  for (const e of allSources) {
    const first = normalize(e.name).split(' ')[0];
    if (first && first.length >= 2) {
      if (!byFirst.has(first)) byFirst.set(first, []);
      byFirst.get(first)!.push(e);
    }
  }
  
  const matches: {id: number; upc: string; pName: string; uName: string; score: number}[] = [];
  let processed = 0;
  
  for (const product of noSku) {
    const pNorm = normalize(product.name);
    const first = pNorm.split(' ')[0];
    
    if (first && first.length >= 2 && byFirst.has(first)) {
      const candidates = byFirst.get(first)!;
      let best: UpcEntry | null = null;
      let bestScore = 0.6; // 60% threshold
      
      for (const c of candidates) {
        const cNorm = normalize(c.name);
        const score = similarity(pNorm, cNorm);
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
    
    processed++;
    if (processed % 200 === 0) console.log(`Processed ${processed}/${noSku.length}...`);
  }
  
  console.log(`\nNew matches: ${matches.length}\n`);
  
  for (const m of matches) {
    await db.update(supplies).set({ sku: m.upc }).where(sql`id = ${m.id}`);
  }
  
  const permPath = '.local/state/memory/permanent_upc_matches.json';
  let perm: Record<string, string> = {};
  if (fs.existsSync(permPath)) perm = JSON.parse(fs.readFileSync(permPath, 'utf-8'));
  for (const m of matches) perm[m.id.toString()] = m.upc;
  fs.writeFileSync(permPath, JSON.stringify(perm, null, 2));
  
  const finalHasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  console.log(`=== RESULT ===`);
  console.log(`Products with SKU: ${finalHasSku.length} / ${total}`);
  console.log(`Coverage: ${(finalHasSku.length / total * 100).toFixed(1)}%`);
  
  console.log(`\nSample matches:`);
  matches.sort((a, b) => b.score - a.score);
  for (const m of matches.slice(0, 20)) {
    console.log(`  ${(m.score*100).toFixed(0)}% "${m.pName}" -> "${m.uName}"`);
  }
}

main().catch(console.error);
