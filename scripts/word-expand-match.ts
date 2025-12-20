import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface UpcEntry { upc: string; name: string; }

// Word-level abbreviation expansions
const wordExpand: Record<string, string> = {
  'sd': 'science diet', 'tow': 'taste of the wild', 'kon': 'kong', 'kng': 'kong',
  'nyl': 'nylabone', 'zil': 'zilla', 'flu': 'fluker', 'gre': 'greenies',
  'iam': 'iams', 'mw': 'midwest', 'rb': 'redbarn', 'eth': 'ethical',
  'kay': 'kaytee', 'tet': 'tetra', 'hik': 'hikari', 'aqe': 'aqueon',
  'fou': 'four paws', 'tro': 'tropiclean', 've': 'vital essentials',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large',
  'xs': 'extra small', 'br': 'breed', 'ck': 'chicken', 'chk': 'chicken',
  'bf': 'beef', 'lam': 'lamb', 'lmb': 'lamb', 'slm': 'salmon', 'sal': 'salmon',
  'trk': 'turkey', 'tky': 'turkey', 'dck': 'duck', 'fsh': 'fish',
  'pup': 'puppy', 'kit': 'kitten', 'sen': 'senior', 'adlt': 'adult',
  'fd': 'food', 'trt': 'treat', 'trts': 'treats', 'chw': 'chew',
  'bne': 'bone', 'cllr': 'collar', 'hrns': 'harness', 'lsh': 'leash',
  'wt': 'weight', 'perf': 'perfect', 'hlth': 'health', 'hlthy': 'healthy',
  'nat': 'natural', 'orig': 'original', 'gf': 'grain free',
  'stw': 'stew', 'cnd': 'canned', 'dry': 'dry', 'wet': 'wet',
  '#': 'lb', 'oz': 'oz', 'ct': 'count', 'pk': 'pack',
  'urny': 'urinary', 'hrbl': 'hairball', 'cntrl': 'control',
  'snsv': 'sensitive', 'dgstn': 'digestion', 'skn': 'skin',
  'indor': 'indoor', 'outdr': 'outdoor', 'actv': 'active',
};

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^\w\s#]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Expand all abbreviations in a string
function expandAll(s: string): string {
  let result = normalize(s);
  
  // Replace # with lb (handle "4.5#" -> "4.5lb")
  result = result.replace(/(\d+\.?\d*)#/g, '$1lb');
  result = result.replace(/#/g, 'lb');
  
  // Split and expand each word
  const words = result.split(' ');
  const expanded = words.map(w => wordExpand[w] || w);
  
  return expanded.join(' ');
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
  console.log('=== Word-Level Expansion Matching ===\n');
  
  const noSku = await db.select({ id: supplies.id, name: supplies.name }).from(supplies).where(isNull(supplies.sku));
  const hasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  const total = hasSku.length + noSku.length;
  
  console.log(`Current: ${hasSku.length}/${total} (${(hasSku.length/total*100).toFixed(1)}%)`);
  console.log(`Gap to 90%: ${Math.ceil(total * 0.9) - hasSku.length}\n`);
  
  const sources = await loadSources();
  
  // Build expanded index
  const expandedIndex = new Map<string, UpcEntry>();
  for (const entry of sources) {
    const expanded = expandAll(entry.name);
    if (!expandedIndex.has(expanded)) {
      expandedIndex.set(expanded, entry);
    }
  }
  
  console.log(`Sources: ${sources.length}, Expanded index: ${expandedIndex.size}`);
  
  // Show expansion examples
  console.log('\nExpansion examples:');
  let count = 0;
  for (const entry of sources) {
    const expanded = expandAll(entry.name);
    if (expanded !== normalize(entry.name) && count < 10) {
      console.log(`  "${entry.name}" -> "${expanded}"`);
      count++;
    }
  }
  
  const matches: {id: number; upc: string; pName: string; uName: string}[] = [];
  
  for (const product of noSku) {
    const pExpanded = expandAll(product.name);
    if (expandedIndex.has(pExpanded)) {
      matches.push({
        id: product.id,
        upc: expandedIndex.get(pExpanded)!.upc,
        pName: product.name,
        uName: expandedIndex.get(pExpanded)!.name
      });
    }
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
  console.log(`Coverage: ${finalHasSku.length}/${total} (${(finalHasSku.length/total*100).toFixed(1)}%)`);
  
  for (const m of matches.slice(0, 20)) {
    console.log(`  "${m.pName}" -> "${m.uName}"`);
  }
}

main().catch(console.error);
