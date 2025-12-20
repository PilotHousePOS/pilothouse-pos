import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface ParsedItem {
  original: string;
  brand: string;
  descriptor: string;
  weight: { value: number; unit: string } | null;
  species: string | null;
}

// Brand abbreviation mappings (verified from invoices)
const brandAbbr: Record<string, string> = {
  'sd': 'science diet', 'tow': 'taste of the wild', 'totw': 'taste of the wild',
  'bb': 'blue buffalo', 'blue b': 'blue buffalo', 'rc': 'royal canin',
  'pp': 'pro plan', 'ns': 'nutrisource', 'nb': 'natural balance',
  'kon': 'kong', 'kng': 'kong', 'nyl': 'nylabone', 'zil': 'zilla',
  'zm': 'zoo med', 'zml': 'zoo med', 'et': 'exo terra', 'flu': 'fluker',
  'gre': 'greenies', 'iam': 'iams', 'mw': 'midwest', 'rb': 'redbarn',
  'rbp': 'redbarn', 'eth': 'ethical', 'kay': 'kaytee', 'kt': 'kaytee',
  'tet': 'tetra', 'hik': 'hikari', 'aqe': 'aqueon', 'fou': 'four paws',
  'tro': 'tropiclean', 've': 'vital essentials', 'frm': 'fromm',
  'orj': 'orijen', 'ac': 'acana', 'vic': 'victor', 'gal': 'galapagos',
  'kom': 'komodo', 'fmn': 'furminator', 'mam': 'mammoth', 'jwp': 'jw pet',
  'api': 'api', 'sea': 'seachem', 'sli': 'seachem',
};

// Word abbreviation mappings (verified from invoices)
const wordAbbr: Record<string, string> = {
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large',
  'xs': 'extra small', 'br': 'breed', 'ck': 'chicken', 'chk': 'chicken',
  'bf': 'beef', 'lam': 'lamb', 'lmb': 'lamb', 'slm': 'salmon',
  'trk': 'turkey', 'tky': 'turkey', 'dck': 'duck', 'fsh': 'fish',
  'pup': 'puppy', 'sen': 'senior', 'adlt': 'adult',
  'wt': 'weight', 'perf': 'perfect', 'hlth': 'health',
  'stw': 'stew', 'gf': 'grain free',
};

function cleanUpc(upc: string): string { return upc.replace(/[^0-9]/g, ''); }

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^\w\s#\.]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Extract weight with unit normalization
function extractWeight(name: string): { value: number; unit: string } | null {
  // Match patterns like "5lb", "5.5#", "12oz", "4.5 lb"
  const match = name.match(/(\d+\.?\d*)\s*(lb|lbs|#|oz|kg|g)\b/i);
  if (match) {
    const value = parseFloat(match[1]);
    let unit = match[2].toLowerCase();
    if (unit === '#' || unit === 'lbs') unit = 'lb';
    return { value, unit };
  }
  return null;
}

// Extract species
function extractSpecies(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes('cat') || lower.includes('kitten') || lower.includes('feline')) return 'cat';
  if (lower.includes('dog') || lower.includes('puppy') || lower.includes('canine')) return 'dog';
  if (lower.includes('bird') || lower.includes('parrot')) return 'bird';
  if (lower.includes('fish') || lower.includes('aqua')) return 'fish';
  if (lower.includes('reptile') || lower.includes('turtle') || lower.includes('snake')) return 'reptile';
  return null;
}

// Expand abbreviations in source name
function expandSource(name: string): string {
  let norm = normalize(name);
  
  // Handle weight notation (5# -> 5lb)
  norm = norm.replace(/(\d+\.?\d*)#/g, '$1lb');
  
  // Split into words
  const words = norm.split(' ');
  
  // Expand brand (first word or two)
  if (words.length > 0 && brandAbbr[words[0]]) {
    words[0] = brandAbbr[words[0]];
  }
  if (words.length > 1) {
    const twoWord = words[0] + ' ' + words[1];
    if (brandAbbr[twoWord]) {
      words.splice(0, 2, brandAbbr[twoWord]);
    }
  }
  
  // Expand word abbreviations (skip first word which is brand)
  for (let i = 1; i < words.length; i++) {
    if (wordAbbr[words[i]]) {
      words[i] = wordAbbr[words[i]];
    }
  }
  
  return words.join(' ');
}

// Parse product into structured fields
function parseProduct(name: string): ParsedItem {
  const norm = normalize(name);
  const weight = extractWeight(name);
  const species = extractSpecies(name);
  
  // Extract brand (first word or two)
  const words = norm.split(' ');
  let brand = '';
  let descriptorStart = 0;
  
  // Check common multi-word brands
  const multiWordBrands = ['science diet', 'taste of the wild', 'blue buffalo', 'royal canin', 
    'pro plan', 'natural balance', 'zoo med', 'exo terra', 'four paws', 'vital essentials',
    'jw pet', 'penn plax'];
  
  for (const mb of multiWordBrands) {
    if (norm.startsWith(mb)) {
      brand = mb;
      descriptorStart = mb.split(' ').length;
      break;
    }
  }
  
  if (!brand && words.length > 0) {
    brand = words[0];
    descriptorStart = 1;
  }
  
  const descriptor = words.slice(descriptorStart).join(' ');
  
  return { original: name, brand, descriptor, weight, species };
}

// Check if two items match (strict validation)
function isMatch(product: ParsedItem, source: ParsedItem): boolean {
  // Brand must match exactly
  if (product.brand !== source.brand) return false;
  
  // Weight must match if both have weights
  if (product.weight && source.weight) {
    if (product.weight.unit !== source.weight.unit) return false;
    if (Math.abs(product.weight.value - source.weight.value) > 0.5) return false;
  }
  
  // Descriptor must match closely
  if (product.descriptor !== source.descriptor) return false;
  
  return true;
}

async function loadSources(): Promise<{upc: string; parsed: ParsedItem; expanded: string}[]> {
  const all: {upc: string; parsed: ParsedItem; expanded: string}[] = [];
  
  // Excel
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = wb.worksheets[0];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const upc = cleanUpc(String(row.getCell(1).value || ''));
    const name = String(row.getCell(2).value || '').trim();
    if (upc.length >= 10 && name.length > 2) {
      const expanded = expandSource(name);
      all.push({ upc, parsed: parseProduct(expanded), expanded });
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
        const expanded = expandSource(name);
        all.push({ upc, parsed: parseProduct(expanded), expanded });
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
        const expanded = expandSource(name);
        all.push({ upc, parsed: parseProduct(expanded), expanded });
      }
    }
  }
  
  return all;
}

async function main() {
  console.log('=== Structured Matching with Validation ===\n');
  
  const noSku = await db.select({ id: supplies.id, name: supplies.name }).from(supplies).where(isNull(supplies.sku));
  const hasSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  const total = hasSku.length + noSku.length;
  
  console.log(`Current: ${hasSku.length}/${total} (${(hasSku.length/total*100).toFixed(1)}%)`);
  console.log(`Unmatched: ${noSku.length}\n`);
  
  const sources = await loadSources();
  console.log(`Sources: ${sources.length}\n`);
  
  // Build index by expanded name for exact matching
  const exactIndex = new Map<string, {upc: string; parsed: ParsedItem}>();
  for (const s of sources) {
    if (!exactIndex.has(s.expanded)) {
      exactIndex.set(s.expanded, { upc: s.upc, parsed: s.parsed });
    }
  }
  
  console.log(`Exact index size: ${exactIndex.size}\n`);
  
  const matches: {id: number; upc: string; pName: string; sExpanded: string}[] = [];
  
  for (const product of noSku) {
    const pNorm = normalize(product.name);
    const pParsed = parseProduct(pNorm);
    
    // Look for exact match in expanded index
    if (exactIndex.has(pNorm)) {
      const source = exactIndex.get(pNorm)!;
      // Validate the match
      if (isMatch(pParsed, source.parsed)) {
        matches.push({ id: product.id, upc: source.upc, pName: product.name, sExpanded: pNorm });
      }
    }
  }
  
  console.log(`Validated matches: ${matches.length}\n`);
  
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
  for (const m of matches.slice(0, 20)) {
    console.log(`  "${m.pName}" matched to "${m.sExpanded}"`);
  }
}

main().catch(console.error);
