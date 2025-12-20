import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface UpcEntry { upc: string; name: string; normalized: string; expanded: string[] }

// Comprehensive abbreviation mappings
const abbreviations: Record<string, string[]> = {
  'sm': ['small'], 'md': ['medium'], 'lg': ['large'], 'xl': ['extra large'], 'xs': ['extra small'],
  '#': ['lb', 'lbs'], 'lb': ['lbs', '#'], 'lbs': ['lb', '#'], 'oz': ['ounce'],
  'pk': ['pack', 'ct'], 'ct': ['count', 'pk'],
  'ck': ['chicken', 'chkn'], 'chkn': ['chicken'], 'bf': ['beef'], 'lmb': ['lamb'],
  'slm': ['salmon'], 'trk': ['turkey'], 'tky': ['turkey'], 'fsh': ['fish'],
  'ven': ['venison'], 'dck': ['duck'], 'prk': ['pork'],
  'cllr': ['collar'], 'hrness': ['harness'], 'lsh': ['leash'],
  'trncllr': ['training collar'], 'bck': ['buckle', 'buck'],
  'fro': ['frozen'], 'nug': ['nuggets'], 'pron': ['pronto'],
  'pup': ['puppy'], 'kit': ['kitten'], 'sen': ['senior'], 'adlt': ['adult'],
  'blu': ['blue'], 'grn': ['green'], 'yel': ['yellow'], 'pnk': ['pink'],
  'prp': ['purple'], 'blk': ['black'], 'wht': ['white'], 'gry': ['gray', 'grey'],
  'brn': ['brown'], 'rd': ['red'], 'pkb': ['pink bright'],
  'dg': ['dog'], 'fd': ['food'], 'trt': ['treat', 'treats'], 'trts': ['treats'],
  'chw': ['chew'], 'bne': ['bone'], 'bns': ['bones'], 'cky': ['cookie'],
  'shmp': ['shampoo'], 'cond': ['conditioner'], 'con': ['conditioner'],
  'ent': ['entree'], 'pt': ['petite'], 'orig': ['original'], 'nat': ['natural'],
  'gf': ['grain free'], 'w': ['with'], 'ri': ['rice'],
  'fltr': ['filter'], 'pmp': ['pump'], 'htr': ['heater'], 'lght': ['light'],
  'bwl': ['bowl'], 'dsh': ['dish'], 'fdr': ['feeder'], 'wtr': ['water'],
  'sqk': ['squeak'], 'trpl': ['triple'], 'ext': ['extra', 'extreme'],
};

// Reverse mappings (full word -> abbreviation)
const reverseAbbr: Record<string, string[]> = {};
for (const [abbr, words] of Object.entries(abbreviations)) {
  for (const word of words) {
    if (!reverseAbbr[word]) reverseAbbr[word] = [];
    reverseAbbr[word].push(abbr);
  }
}

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandToVariants(name: string): string[] {
  const norm = normalize(name);
  const variants = new Set<string>([norm]);
  
  // Try expanding abbreviations
  for (const [abbr, words] of Object.entries(abbreviations)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    if (regex.test(norm)) {
      for (const word of words) {
        variants.add(norm.replace(regex, word));
      }
    }
  }
  
  // Try contracting to abbreviations
  for (const [word, abbrs] of Object.entries(reverseAbbr)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(norm)) {
      for (const abbr of abbrs) {
        variants.add(norm.replace(regex, abbr));
      }
    }
  }
  
  return [...variants];
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
      const normalized = normalize(name);
      all.push({ upc, name, normalized, expanded: expandToVariants(name) });
    }
  });
  
  const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  for (const line of csv.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = cleanUpc(parts[0]);
      const name = parts[1].trim();
      if (upc.length >= 10 && upc.length <= 14 && name.length > 2) {
        const normalized = normalize(name);
        all.push({ upc, name, normalized, expanded: expandToVariants(name) });
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
        const normalized = normalize(name);
        all.push({ upc, name, normalized, expanded: expandToVariants(name) });
      }
    }
  }
  
  return all;
}

async function main() {
  console.log('=== Smart Matching with Abbreviation Expansion ===\n');
  
  const noSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.sku));
  
  const hasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  const total = hasSku.length + noSku.length;
  
  console.log(`Current: ${hasSku.length}/${total} (${(hasSku.length/total*100).toFixed(1)}%)`);
  console.log(`Need for 90%: ${Math.ceil(total * 0.9)} | Gap: ${Math.ceil(total * 0.9) - hasSku.length}\n`);
  
  const allSources = await loadAllSources();
  console.log(`UPC entries: ${allSources.length}\n`);
  
  // Build index of all variants
  const variantIndex = new Map<string, UpcEntry>();
  for (const entry of allSources) {
    for (const variant of entry.expanded) {
      if (!variantIndex.has(variant)) {
        variantIndex.set(variant, entry);
      }
    }
  }
  console.log(`Variant index size: ${variantIndex.size}\n`);
  
  const matches: {id: number; upc: string; pName: string; uName: string}[] = [];
  
  for (const product of noSku) {
    const productVariants = expandToVariants(product.name);
    
    // Check each product variant against index
    for (const pv of productVariants) {
      if (variantIndex.has(pv)) {
        const entry = variantIndex.get(pv)!;
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
  
  console.log(`\nSample matches:`);
  for (const m of matches.slice(0, 20)) {
    console.log(`  "${m.pName}" -> "${m.uName}"`);
  }
}

main().catch(console.error);
