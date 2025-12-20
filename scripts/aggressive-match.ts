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

// Create a signature from important words
function createSignature(name: string): string {
  const words = normalize(name).split(' ').filter(w => w.length >= 2);
  // Remove common size/color words for matching
  const ignore = new Set(['small', 'medium', 'large', 'sm', 'md', 'lg', 'xl', 'pk', 'oz', 'lb', 'lbs', 'ct', 'pack', 'count']);
  return words.filter(w => !ignore.has(w) && !/^\d+$/.test(w)).slice(0, 4).sort().join('_');
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
  console.log('=== Aggressive Matching with Word Signature ===\n');
  
  const noSku = await db.select({
    id: supplies.id,
    name: supplies.name
  }).from(supplies).where(isNull(supplies.sku));
  
  const hasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  
  console.log(`Products with SKU: ${hasSku.length}`);
  console.log(`Products needing SKU: ${noSku.length}\n`);
  
  const allSources = await loadAllSources();
  console.log(`Total UPC entries: ${allSources.length}\n`);
  
  // Build signature index
  const bySignature = new Map<string, UpcEntry[]>();
  for (const e of allSources) {
    const sig = createSignature(e.name);
    if (sig.length >= 5) {
      if (!bySignature.has(sig)) bySignature.set(sig, []);
      bySignature.get(sig)!.push(e);
    }
  }
  
  console.log(`Unique signatures: ${bySignature.size}\n`);
  
  const matches: {id: number; upc: string; productName: string; upcName: string}[] = [];
  
  for (const product of noSku) {
    const pSig = createSignature(product.name);
    
    if (pSig.length >= 5 && bySignature.has(pSig)) {
      const candidates = bySignature.get(pSig)!;
      // Pick the one with closest length
      const pLen = product.name.length;
      let best = candidates[0];
      let bestDiff = Math.abs(best.name.length - pLen);
      
      for (const c of candidates) {
        const diff = Math.abs(c.name.length - pLen);
        if (diff < bestDiff) {
          best = c;
          bestDiff = diff;
        }
      }
      
      matches.push({
        id: product.id,
        upc: best.upc,
        productName: product.name,
        upcName: best.name
      });
    }
  }
  
  console.log(`New matches found: ${matches.length}\n`);
  
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
  
  console.log(`\nSample matches:`);
  for (const m of matches.slice(0, 15)) {
    console.log(`  "${m.productName}" -> "${m.upcName}"`);
  }
}

main().catch(console.error);
