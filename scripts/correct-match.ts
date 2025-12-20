import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

// Brand abbreviation -> full name
const brandAbbr: Record<string, string> = {
  'sd': 'science diet', 'tow': 'taste of the wild', 'totw': 'taste of the wild',
  'bb': 'blue buffalo', 'blue b': 'blue buffalo', 'rc': 'royal canin',
  'pp': 'pro plan', 'ns': 'nutrisource', 'nb': 'natural balance',
  'nbp': 'natural balance', 'kon': 'kong', 'kng': 'kong', 'nyl': 'nylabone', 
  'zil': 'zilla', 'zm': 'zoo med', 'zml': 'zoo med', 'et': 'exo terra',
  'exot': 'exo terra', 'flu': 'fluker', 'gre': 'greenies', 'iam': 'iams',
  'mw': 'midwest', 'rb': 'redbarn', 'rbp': 'redbarn', 'eth': 'ethical',
  'kay': 'kaytee', 'kt': 'kaytee', 'tet': 'tetra', 'hik': 'hikari',
  'aqe': 'aqueon', 'fou': 'four paws', 'tro': 'tropiclean', 've': 'vital essentials',
  'frm': 'fromm', 'orj': 'orijen', 'ac': 'acana', 'vic': 'victor',
  'gal': 'galapagos', 'kom': 'komodo', 'fmn': 'furminator', 'mam': 'mammoth',
  'jwp': 'jw pet', 'api': 'api', 'sea': 'seachem', 'sli': 'seachem',
};

// Word abbreviation -> full word
const wordAbbr: Record<string, string> = {
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large',
  'xs': 'extra small', 'br': 'breed', 'ck': 'chicken', 'chk': 'chicken',
  'bf': 'beef', 'lam': 'lamb', 'lmb': 'lamb', 'slm': 'salmon', 'sal': 'salmon',
  'trk': 'turkey', 'tky': 'turkey', 'dck': 'duck', 'fsh': 'fish',
  'pup': 'puppy', 'sen': 'senior', 'adlt': 'adult',
  'wt': 'weight', 'perf': 'perfect', 'hlth': 'health', 'hlthy': 'healthy',
  'stw': 'stew', 'gf': 'grain free', 'indor': 'indoor',
};

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^\w\s#\.]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Expand ALL abbreviations in a source name to match product full names
function expandSourceFully(name: string): string {
  let result = normalize(name);
  
  // Convert # to lb (e.g., "30#" -> "30lb")
  result = result.replace(/(\d+\.?\d*)#/g, '$1lb');
  
  const words = result.split(' ');
  const expanded: string[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // Check brand abbreviations (usually first word)
    if (i === 0 && brandAbbr[word]) {
      expanded.push(brandAbbr[word]);
      continue;
    }
    
    // Check two-word brand
    if (i === 0 && words.length > 1) {
      const twoWord = word + ' ' + words[1];
      if (brandAbbr[twoWord]) {
        expanded.push(brandAbbr[twoWord]);
        i++; // Skip next word
        continue;
      }
    }
    
    // Check word abbreviations
    if (wordAbbr[word]) {
      expanded.push(wordAbbr[word]);
    } else {
      expanded.push(word);
    }
  }
  
  return expanded.join(' ');
}

async function loadSources(): Promise<{upc: string; original: string; expanded: string}[]> {
  const all: {upc: string; original: string; expanded: string}[] = [];
  
  // Excel
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = wb.worksheets[0];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const upc = cleanUpc(String(row.getCell(1).value || ''));
    const name = String(row.getCell(2).value || '').trim();
    if (upc.length >= 10 && name.length > 2) {
      all.push({ upc, original: name, expanded: expandSourceFully(name) });
    }
  });
  
  // Google Sheet
  const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  for (const line of csv.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = cleanUpc(parts[0]);
      const name = parts[1].trim();
      if (upc.length >= 10 && name.length > 2) {
        all.push({ upc, original: name, expanded: expandSourceFully(name) });
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
      if (upc.length >= 10 && name.length > 3) {
        all.push({ upc, original: name, expanded: expandSourceFully(name) });
      }
    }
  }
  
  return all;
}

async function main() {
  console.log('=== Correct Abbreviation Expansion Matching ===\n');
  
  // Get unmatched products
  const noSku = await db.select({ id: supplies.id, name: supplies.name }).from(supplies).where(isNull(supplies.sku));
  const hasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  const total = hasSku.length + noSku.length;
  
  console.log(`Current: ${hasSku.length}/${total} (${(hasSku.length/total*100).toFixed(1)}%)`);
  console.log(`Unmatched: ${noSku.length}\n`);
  
  // Build product index (normalized product name -> product)
  const productIndex = new Map<string, {id: number; name: string}>();
  for (const p of noSku) {
    const norm = normalize(p.name);
    if (!productIndex.has(norm)) {
      productIndex.set(norm, { id: p.id, name: p.name });
    }
  }
  console.log(`Product index: ${productIndex.size}\n`);
  
  // Load and expand sources
  const sources = await loadSources();
  console.log(`Sources: ${sources.length}\n`);
  
  // Show some expansion examples
  console.log('Expansion examples:');
  for (const s of sources.slice(0, 5)) {
    if (s.expanded !== normalize(s.original)) {
      console.log(`  "${s.original}" -> "${s.expanded}"`);
    }
  }
  
  const matches: {id: number; upc: string; pName: string; sOrig: string; sExpanded: string}[] = [];
  
  // For each source, expand and look up in product index
  for (const source of sources) {
    if (productIndex.has(source.expanded)) {
      const product = productIndex.get(source.expanded)!;
      matches.push({
        id: product.id,
        upc: source.upc,
        pName: product.name,
        sOrig: source.original,
        sExpanded: source.expanded
      });
      productIndex.delete(source.expanded); // Remove to avoid duplicates
    }
  }
  
  console.log(`\nNew matches: ${matches.length}\n`);
  
  // Apply matches
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
  
  console.log(`\nMatches:`);
  for (const m of matches.slice(0, 25)) {
    console.log(`  "${m.pName}" <- "${m.sOrig}"`);
  }
}

main().catch(console.error);
