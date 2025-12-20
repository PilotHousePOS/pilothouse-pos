import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface UpcEntry { upc: string; name: string; }

// Brand abbreviations used in invoices/docs
const brandAbbreviations: Record<string, string[]> = {
  'science diet': ['sd', 'sci diet', 'scidiet', 'hills sd', 'hill sd'],
  'taste of the wild': ['tow', 'totw', 'taste wild'],
  'blue buffalo': ['bb', 'blue b', 'bluebuff', 'blue buff'],
  'royal canin': ['rc', 'royalc'],
  'pro plan': ['pp', 'proplan', 'pro-plan', 'purina pp'],
  'nutrisource': ['ns', 'nutri source', 'nutrisrc'],
  'natural balance': ['nb', 'nat bal', 'natbal'],
  'kong': ['kg', 'kng'],
  'nylabone': ['nyla', 'nylab'],
  'coastal': ['cstl', 'coast'],
  'zoo med': ['zm', 'zoomed', 'zmd'],
  'exo terra': ['et', 'exoterra', 'exot'],
  'vital essentials': ['ve', 'vital ess'],
  'primal': ['prim', 'priml'],
  'fromm': ['frm', 'frmm'],
  'orijen': ['orj', 'orjn'],
  'acana': ['ac', 'acn'],
  'wellness': ['wlns', 'well'],
  'zignature': ['zig', 'zign'],
  'diamond': ['dmd', 'diamd'],
  'eukanuba': ['euk', 'eukan'],
  'iams': ['ia'],
  'nutro': ['ntr'],
  'redbarn': ['rb', 'red barn'],
  'midwest': ['mw', 'midw'],
  'petsafe': ['ps', 'petsf'],
  'prevue': ['pv', 'prev'],
  'penn-plax': ['pp', 'pennp', 'penn plax'],
  'ethical pet': ['ep', 'ethpet'],
  'smokehouse': ['sh', 'smoke'],
  'fieldcrest': ['fc', 'field'],
  'wholesome': ['wh', 'wholes'],
  'victor': ['vic', 'vctr'],
};

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Expand product name with brand abbreviation variants
function expandWithBrandAbbr(name: string, brand: string): string[] {
  const norm = normalize(name);
  const variants = [norm];
  
  const brandLower = brand.toLowerCase();
  for (const [fullBrand, abbrs] of Object.entries(brandAbbreviations)) {
    if (brandLower.includes(fullBrand.split(' ')[0])) {
      for (const abbr of abbrs) {
        // Replace brand with abbreviation
        const variant = norm.replace(new RegExp(fullBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), abbr);
        if (variant !== norm) variants.push(variant);
        
        // Also try just the first word of brand
        const firstWord = fullBrand.split(' ')[0];
        const variant2 = norm.replace(new RegExp(`\\b${firstWord}\\b`, 'gi'), abbr);
        if (variant2 !== norm) variants.push(variant2);
      }
    }
  }
  
  return [...new Set(variants)];
}

// Contract source name abbreviations to full words
function contractSourceAbbr(name: string): string[] {
  let norm = normalize(name);
  const variants = [norm];
  
  // Expand known brand abbreviations in source
  for (const [fullBrand, abbrs] of Object.entries(brandAbbreviations)) {
    for (const abbr of abbrs) {
      if (norm.includes(abbr)) {
        const expanded = norm.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), fullBrand);
        variants.push(expanded);
      }
    }
  }
  
  return [...new Set(variants)];
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

async function main() {
  console.log('=== Brand Abbreviation Matching ===\n');
  
  const noSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.sku));
  
  const hasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  const total = hasSku.length + noSku.length;
  
  console.log(`Current: ${hasSku.length}/${total} (${(hasSku.length/total*100).toFixed(1)}%)`);
  console.log(`Unmatched: ${noSku.length}\n`);
  
  const sources = await loadSources();
  console.log(`Source entries: ${sources.length}\n`);
  
  // Build index with all source variants
  const sourceIndex = new Map<string, UpcEntry>();
  for (const entry of sources) {
    const variants = contractSourceAbbr(entry.name);
    for (const v of variants) {
      if (!sourceIndex.has(v)) sourceIndex.set(v, entry);
    }
  }
  console.log(`Source index size: ${sourceIndex.size}\n`);
  
  const matches: {id: number; upc: string; pName: string; uName: string}[] = [];
  
  for (const product of noSku) {
    const brand = product.brand || '';
    const productVariants = expandWithBrandAbbr(product.name, brand);
    
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
  
  // Apply
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
  for (const m of matches.slice(0, 30)) {
    console.log(`  "${m.pName}" -> "${m.uName}"`);
  }
}

main().catch(console.error);
