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

// Levenshtein distance for fuzzy matching
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

// Get first N chars as prefix for grouping
function getPrefix(name: string, n: number): string {
  return normalize(name).substring(0, n);
}

async function main() {
  console.log('=== Fuzzy Matching with 70%+ Similarity ===\n');
  
  const noSku = await db.select({
    id: supplies.id,
    name: supplies.name
  }).from(supplies).where(isNull(supplies.sku));
  
  const hasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  
  console.log(`Products with SKU: ${hasSku.length}`);
  console.log(`Products needing SKU: ${noSku.length}\n`);
  
  const allSources = await loadAllSources();
  console.log(`Total UPC entries: ${allSources.length}\n`);
  
  // Group by prefix for faster matching
  const byPrefix = new Map<string, UpcEntry[]>();
  for (const e of allSources) {
    const pfx = getPrefix(e.name, 3);
    if (pfx.length >= 3) {
      if (!byPrefix.has(pfx)) byPrefix.set(pfx, []);
      byPrefix.get(pfx)!.push(e);
    }
  }
  
  console.log(`Unique prefixes: ${byPrefix.size}\n`);
  
  const matches: {id: number; upc: string; productName: string; upcName: string; sim: number}[] = [];
  let processed = 0;
  
  for (const product of noSku) {
    const pNorm = normalize(product.name);
    const pfx = getPrefix(product.name, 3);
    
    if (pfx.length >= 3 && byPrefix.has(pfx)) {
      const candidates = byPrefix.get(pfx)!;
      let best: UpcEntry | null = null;
      let bestSim = 0.7; // minimum threshold
      
      for (const c of candidates) {
        const cNorm = normalize(c.name);
        const sim = similarity(pNorm, cNorm);
        if (sim > bestSim) {
          bestSim = sim;
          best = c;
        }
      }
      
      if (best) {
        matches.push({
          id: product.id,
          upc: best.upc,
          productName: product.name,
          upcName: best.name,
          sim: bestSim
        });
      }
    }
    
    processed++;
    if (processed % 500 === 0) {
      console.log(`Processed ${processed}/${noSku.length}...`);
    }
  }
  
  console.log(`\nNew matches found: ${matches.length}\n`);
  
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
  const total = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  
  console.log(`=== UPDATED BASELINE ===`);
  console.log(`Products with SKU: ${finalHasSku.length} / ${total[0].count}`);
  console.log(`Coverage: ${(finalHasSku.length / Number(total[0].count) * 100).toFixed(1)}%`);
  
  console.log(`\nSample matches (sorted by similarity):`);
  matches.sort((a, b) => b.sim - a.sim);
  for (const m of matches.slice(0, 15)) {
    console.log(`  ${(m.sim * 100).toFixed(0)}% "${m.productName}" -> "${m.upcName}"`);
  }
}

main().catch(console.error);
