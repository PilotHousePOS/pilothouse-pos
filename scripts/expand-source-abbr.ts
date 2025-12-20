import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface UpcEntry { upc: string; name: string; expanded: string }

// Abbreviation -> Full brand name (as used in our database)
const abbrToFull: Record<string, string> = {
  'sd': 'Science Diet',
  'tow': 'Taste of the Wild',
  'totw': 'Taste of the Wild',
  'bb': 'Blue Buffalo',
  'blue b': 'Blue Buffalo',
  'rc': 'Royal Canin',
  'pp': 'Pro Plan',
  'proplan': 'Pro Plan',
  'ns': 'Nutrisource',
  'nb': 'Natural Balance',
  'nbp': 'Natural Balance',
  'kon': 'Kong',
  'kng': 'Kong',
  'kc': 'Kong',
  'nyl': 'Nylabone',
  'cst': 'Coastal',
  'coast': 'Coastal',
  'zm': 'Zoo Med',
  'zml': 'Zoo Med',
  'zoomed': 'Zoo Med',
  'et': 'Exo Terra',
  'exot': 'Exo Terra',
  've': 'Vital Essentials',
  'prim': 'Primal',
  'priml': 'Primal',
  'frm': 'Fromm',
  'orj': 'Orijen',
  'ac': 'Acana',
  'acn': 'Acana',
  'wlns': 'Wellness',
  'well': 'Wellness',
  'zig': 'Zignature',
  'dmd': 'Diamond',
  'dmf': 'Diamond',
  'euk': 'Eukanuba',
  'iam': 'Iams',
  'ia': 'Iams',
  'ntr': 'Nutro',
  'rb': 'Redbarn',
  'rbp': 'Redbarn',
  'mw': 'MidWest',
  'midw': 'MidWest',
  'ps': 'PetSafe',
  'pv': 'Prevue',
  'prev': 'Prevue',
  'pennp': 'Penn-Plax',
  'eth': 'Ethical Pet',
  'ep': 'Ethical Pet',
  'sh': 'Smokehouse',
  'vic': 'Victor',
  'zil': 'Zilla',
  'flu': 'Fluker',
  'gal': 'Galapagos',
  'kom': 'Komodo',
  'gre': 'Greenies',
  'fmn': 'Furminator',
  'fur': 'Furminator',
  'tro': 'Tropiclean',
  'tropi': 'Tropiclean',
  'mam': 'Mammoth',
  'kay': 'Kaytee',
  'kt': 'Kaytee',
  'jwp': 'JW Pet',
  'jw': 'JW Pet',
  'tet': 'Tetra',
  'sli': 'Seachem',
  'sea': 'Seachem',
  'hik': 'Hikari',
  'api': 'API',
  'ar': 'API',
  'aqe': 'Aqueon',
  'aq': 'Aqueon',
  'fou': 'Four Paws',
  'fp': 'Four Paws',
  '4p': 'Four Paws',
  'hrz': 'Hartz',
  'htz': 'Hartz',
  'ptm': 'Petmate',
  'smb': 'Smartbones',
  'zup': 'Zupreem',
  'epc': 'Litter Genie',
  'n/m': "Nature's Miracle",
  'nm': "Nature's Miracle",
};

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^\w\s\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Expand abbreviation at start of source name
function expandSourceName(name: string): string {
  const norm = normalize(name);
  const words = norm.split(' ');
  
  if (words.length === 0) return norm;
  
  // Check if first word is an abbreviation
  const firstWord = words[0];
  if (abbrToFull[firstWord]) {
    words[0] = abbrToFull[firstWord].toLowerCase();
    return words.join(' ');
  }
  
  // Check first two words combined
  if (words.length >= 2) {
    const twoWords = words[0] + ' ' + words[1];
    if (abbrToFull[twoWords]) {
      return abbrToFull[twoWords].toLowerCase() + ' ' + words.slice(2).join(' ');
    }
  }
  
  return norm;
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
    if (upc.length >= 10 && name.length > 2) {
      all.push({ upc, name, expanded: expandSourceName(name) });
    }
  });
  
  const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  for (const line of csv.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = cleanUpc(parts[0]);
      const name = parts[1].trim();
      if (upc.length >= 10 && name.length > 2) {
        all.push({ upc, name, expanded: expandSourceName(name) });
      }
    }
  }
  
  const inv = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
  for (const line of inv.split('\n').slice(1)) {
    const parts = line.split('|');
    if (parts.length >= 3) {
      const upc = cleanUpc(parts[0]);
      const name = parts[2].trim();
      if (upc.length >= 10 && name.length > 3) {
        all.push({ upc, name, expanded: expandSourceName(name) });
      }
    }
  }
  
  return all;
}

async function main() {
  console.log('=== Expanding Source Abbreviations ===\n');
  
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
  console.log(`Sources loaded: ${sources.length}`);
  
  // Show some expanded examples
  console.log('\nExpansion examples:');
  for (const s of sources.slice(0, 10)) {
    if (s.expanded !== normalize(s.name)) {
      console.log(`  "${s.name}" -> "${s.expanded}"`);
    }
  }
  
  // Build index with expanded names
  const expandedIndex = new Map<string, UpcEntry>();
  for (const entry of sources) {
    if (!expandedIndex.has(entry.expanded)) {
      expandedIndex.set(entry.expanded, entry);
    }
  }
  console.log(`\nExpanded index size: ${expandedIndex.size}\n`);
  
  const matches: {id: number; upc: string; pName: string; uName: string; expanded: string}[] = [];
  
  for (const product of noSku) {
    const pNorm = normalize(product.name);
    
    if (expandedIndex.has(pNorm)) {
      const entry = expandedIndex.get(pNorm)!;
      matches.push({
        id: product.id,
        upc: entry.upc,
        pName: product.name,
        uName: entry.name,
        expanded: entry.expanded
      });
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
  
  console.log(`\nMatches found:`);
  for (const m of matches.slice(0, 30)) {
    console.log(`  "${m.pName}" -> "${m.uName}" (expanded: "${m.expanded}")`);
  }
}

main().catch(console.error);
