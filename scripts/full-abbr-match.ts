import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface UpcEntry { upc: string; name: string; }

// Complete brand abbreviations from invoices/docs
const brandAbbr: Record<string, string[]> = {
  'science diet': ['sd', 'sci diet'],
  'taste of the wild': ['tow', 'totw'],
  'blue buffalo': ['bb', 'blue b'],
  'royal canin': ['rc'],
  'pro plan': ['pp', 'proplan'],
  'nutrisource': ['ns'],
  'natural balance': ['nb', 'nbp'],
  'kong': ['kon', 'kng', 'kc'],
  'nylabone': ['nyl'],
  'coastal': ['cst', 'coast'],
  'zoo med': ['zm', 'zml', 'zoomed'],
  'exo terra': ['et', 'exot'],
  'vital essentials': ['ve'],
  'primal': ['prim', 'priml'],
  'fromm': ['frm'],
  'orijen': ['orj'],
  'acana': ['ac', 'acn'],
  'wellness': ['wlns', 'well'],
  'zignature': ['zig'],
  'diamond': ['dmd', 'dmf'],
  'eukanuba': ['euk'],
  'iams': ['iam', 'ia'],
  'nutro': ['ntr'],
  'redbarn': ['rb', 'rbp'],
  'midwest': ['mw', 'midw'],
  'petsafe': ['ps'],
  'prevue': ['pv', 'prev'],
  'penn-plax': ['pennp'],
  'ethical pet': ['eth', 'ep'],
  'smokehouse': ['sh'],
  'victor': ['vic'],
  'zilla': ['zil'],
  'fluker': ['flu'],
  'galapagos': ['gal'],
  'komodo': ['kom'],
  'greenies': ['gre'],
  'furminator': ['fmn', 'fur'],
  'tropiclean': ['tro', 'tropi'],
  'mammoth': ['mam'],
  'kaytee': ['kay', 'kt'],
  'jw pet': ['jwp', 'jw'],
  'tetra': ['tet'],
  'seachem': ['sli', 'sea'],
  'hikari': ['hik'],
  'api': ['api', 'ar'],
  'aqueon': ['aqe', 'aq'],
  'four paws': ['fou', 'fp', '4p'],
  'hartz': ['hrz', 'htz'],
  'petmate': ['ptm'],
  'smartbones': ['smb'],
  'zupreem': ['zup'],
};

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function loadSources(): Promise<UpcEntry[]> {
  const all: UpcEntry[] = [];
  
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = wb.worksheets[0];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const upc = cleanUpc(String(row.getCell(1).value || ''));
    const name = String(row.getCell(2).value || '').trim();
    if (upc.length >= 10 && name.length > 2) all.push({ upc, name });
  });
  
  const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  for (const line of csv.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = cleanUpc(parts[0]);
      const name = parts[1].trim();
      if (upc.length >= 10 && name.length > 2) all.push({ upc, name });
    }
  }
  
  const inv = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
  for (const line of inv.split('\n').slice(1)) {
    const parts = line.split('|');
    if (parts.length >= 3) {
      const upc = cleanUpc(parts[0]);
      const name = parts[2].trim();
      if (upc.length >= 10 && name.length > 3) all.push({ upc, name });
    }
  }
  
  return all;
}

// Build all variants of a product name
function buildVariants(name: string, brand: string): string[] {
  const norm = normalize(name);
  const variants = new Set<string>([norm]);
  
  const brandLower = brand.toLowerCase();
  
  // Try replacing brand with abbreviations
  for (const [fullBrand, abbrs] of Object.entries(brandAbbr)) {
    if (brandLower.includes(fullBrand.split(' ')[0]) || norm.includes(fullBrand.split(' ')[0])) {
      for (const abbr of abbrs) {
        // Replace full brand name
        let v = norm.replace(new RegExp(fullBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), abbr);
        variants.add(v);
        
        // Replace first word of brand
        const firstWord = fullBrand.split(' ')[0];
        v = norm.replace(new RegExp(`\\b${firstWord}\\b`, 'gi'), abbr);
        variants.add(v);
      }
    }
  }
  
  return [...variants];
}

// Build all expansions of a source name
function expandSource(name: string): string[] {
  let norm = normalize(name);
  const variants = new Set<string>([norm]);
  
  for (const [fullBrand, abbrs] of Object.entries(brandAbbr)) {
    for (const abbr of abbrs) {
      const regex = new RegExp(`^${abbr}\\b`, 'gi');
      if (regex.test(norm)) {
        variants.add(norm.replace(regex, fullBrand));
        variants.add(norm.replace(regex, fullBrand.split(' ')[0]));
      }
    }
  }
  
  return [...variants];
}

async function main() {
  console.log('=== Full Abbreviation Matching ===\n');
  
  const noSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.sku));
  
  const hasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  const total = hasSku.length + noSku.length;
  
  console.log(`Current: ${hasSku.length}/${total} (${(hasSku.length/total*100).toFixed(1)}%)`);
  console.log(`Unmatched: ${noSku.length}`);
  console.log(`Need for 90%: ${Math.ceil(total * 0.9)} (gap: ${Math.ceil(total * 0.9) - hasSku.length})\n`);
  
  const sources = await loadSources();
  console.log(`Sources: ${sources.length}\n`);
  
  // Build index with expanded source names
  const sourceIndex = new Map<string, UpcEntry>();
  for (const entry of sources) {
    const variants = expandSource(entry.name);
    for (const v of variants) {
      if (!sourceIndex.has(v)) sourceIndex.set(v, entry);
    }
  }
  console.log(`Source index: ${sourceIndex.size}\n`);
  
  const matches: {id: number; upc: string; pName: string; uName: string}[] = [];
  
  for (const product of noSku) {
    const brand = product.brand || '';
    const productVariants = buildVariants(product.name, brand);
    
    for (const pv of productVariants) {
      if (sourceIndex.has(pv)) {
        const entry = sourceIndex.get(pv)!;
        matches.push({
          id: product.id,
          upc: entry.upc,
          pName: product.name,
          uName: entry.name
        });
        break;
      }
    }
  }
  
  console.log(`New matches: ${matches.length}\n`);
  
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
  console.log(`Coverage: ${finalHasSku.length} / ${total} (${(finalHasSku.length / total * 100).toFixed(1)}%)`);
  
  console.log(`\nMatches:`);
  for (const m of matches.slice(0, 25)) {
    console.log(`  "${m.pName}" -> "${m.uName}"`);
  }
}

main().catch(console.error);
