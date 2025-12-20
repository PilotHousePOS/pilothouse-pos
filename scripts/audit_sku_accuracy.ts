import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, and, ne, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcEntry {
  upc: string;
  productName: string;
}

// Comprehensive abbreviation expansion map
const ABBREVIATIONS: Record<string, string> = {
  // Common abbreviations
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large', 'xxl': 'extra extra large',
  'xs': 'extra small', 'xsm': 'extra small',
  'oz': 'ounce', 'lb': 'pound', 'lbs': 'pounds', 'gal': 'gallon', 'qt': 'quart', 'pt': 'pint',
  'pk': 'pack', 'ct': 'count', 'pc': 'piece', 'pcs': 'pieces',
  'in': 'inch', 'ft': 'foot', 'yd': 'yard', 'mm': 'millimeter', 'cm': 'centimeter',
  'w': 'with', 'w/': 'with', 'wo': 'without', 'w/o': 'without',
  
  // Pet food abbreviations
  'fd': 'food', 'fod': 'food', 'trt': 'treat', 'trts': 'treats',
  'ckn': 'chicken', 'chkn': 'chicken', 'bf': 'beef', 'slmn': 'salmon', 'salm': 'salmon',
  'trky': 'turkey', 'turk': 'turkey', 'lmb': 'lamb', 'vnson': 'venison', 'ven': 'venison',
  'dck': 'duck', 'fsh': 'fish', 'whfsh': 'whitefish', 'whtfsh': 'whitefish',
  
  // Aquarium abbreviations
  'aqe': 'aqueon', 'aq': 'aquarium', 'aquar': 'aquarium',
  'fltr': 'filter', 'flt': 'filter', 'crtrdg': 'cartridge', 'crtdg': 'cartridge',
  'htr': 'heater', 'htrs': 'heaters', 'thrmtr': 'thermometer', 'thrm': 'thermometer',
  'pump': 'pump', 'pmp': 'pump', 'airpmp': 'air pump',
  'cchld': 'cichlid', 'cich': 'cichlid', 'btta': 'betta', 'gldfish': 'goldfish', 'gldfsh': 'goldfish',
  'trpcl': 'tropical', 'trop': 'tropical', 'marn': 'marine', 'sltw': 'saltwater', 'frsw': 'freshwater',
  'fw': 'freshwater', 'sw': 'saltwater',
  'grvl': 'gravel', 'sbstrt': 'substrate', 'sub': 'substrate',
  'plnt': 'plant', 'plnts': 'plants', 'dcor': 'decor', 'decr': 'decor', 'ornmnt': 'ornament',
  
  // Reptile abbreviations
  'rptl': 'reptile', 'rept': 'reptile', 'rptls': 'reptiles',
  'uvb': 'uvb', 'uva': 'uva', 'bsking': 'basking', 'bask': 'basking',
  'terrm': 'terrarium', 'terr': 'terrarium', 'viv': 'vivarium',
  'htpd': 'heat pad', 'htmat': 'heat mat', 'htlmp': 'heat lamp',
  
  // Dog/Cat abbreviations
  'dg': 'dog', 'ct': 'cat', 'pup': 'puppy', 'ktn': 'kitten', 'kit': 'kitten',
  'chw': 'chew', 'chws': 'chews', 'bne': 'bone', 'bns': 'bones',
  'lsh': 'leash', 'cllr': 'collar', 'hrns': 'harness',
  'shmp': 'shampoo', 'shmpoo': 'shampoo', 'cndtnr': 'conditioner', 'cond': 'conditioner',
  'bwl': 'bowl', 'bwls': 'bowls', 'fdr': 'feeder', 'wtr': 'water', 'wtrr': 'waterer',
  
  // Bird abbreviations
  'brd': 'bird', 'prrt': 'parrot', 'prkt': 'parakeet', 'keet': 'parakeet', 'ccktel': 'cockatiel',
  'fnch': 'finch', 'cnry': 'canary',
  'prch': 'perch', 'swng': 'swing', 'lddr': 'ladder', 'cage': 'cage', 'cg': 'cage',
  
  // Small animal abbreviations
  'hmstr': 'hamster', 'grbl': 'gerbil', 'gnpg': 'guinea pig', 'gp': 'guinea pig',
  'rbbt': 'rabbit', 'rbt': 'rabbit', 'frrt': 'ferret', 'hdghg': 'hedgehog',
  
  // General product abbreviations
  'clnr': 'cleaner', 'cln': 'clean', 'cndtnr': 'conditioner', 'cond': 'conditioner',
  'med': 'medicated', 'medctd': 'medicated', 'trtmnt': 'treatment', 'trmt': 'treatment',
  'rplcmnt': 'replacement', 'rplc': 'replacement', 'repl': 'replacement',
  'adj': 'adjustable', 'adjstbl': 'adjustable',
  'prtbl': 'portable', 'port': 'portable',
  'auto': 'automatic', 'autmtc': 'automatic',
  'btry': 'battery', 'bat': 'battery',
  'elec': 'electric', 'elctrc': 'electric',
  'stl': 'steel', 'stnls': 'stainless', 'ss': 'stainless steel',
  'plstc': 'plastic', 'pls': 'plastic',
  'nyl': 'nylon', 'nyln': 'nylon',
  'lthr': 'leather', 'lth': 'leather',
  'fbrc': 'fabric', 'fab': 'fabric',
  
  // Brands
  'hik': 'hikari', 'api': 'api', 'tet': 'tetra',
  'flvl': 'fluval', 'aqu': 'aqueon', 'mrln': 'marineland',
  'zmd': 'zoo med', 'exo': 'exo terra', 'zla': 'zilla',
  'kng': 'kong', 'nyla': 'nylabone', 'cstl': 'coastal',
  
  // Actions/Features
  'fxtr': 'fixture', 'fix': 'fixture',
  'bulb': 'bulb', 'blb': 'bulb',
  'led': 'led', 'flrscnt': 'fluorescent', 'fluor': 'fluorescent',
  'bkgd': 'background', 'bkgrnd': 'background',
  'mntr': 'monitor', 'mon': 'monitor',
  'tst': 'test', 'kit': 'kit',
};

function expandAbbreviations(text: string): string {
  let result = text.toLowerCase();
  
  // Replace abbreviations with expanded forms
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    // Match abbreviation as whole word
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  
  return result;
}

function normalizeForComparison(str: string): string {
  let result = str.toLowerCase();
  
  // Expand abbreviations first
  result = expandAbbreviations(result);
  
  // Remove special characters and extra spaces
  result = result
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return result;
}

function extractWords(str: string): string[] {
  return normalizeForComparison(str).split(' ').filter(w => w.length > 1);
}

function calculateAccuracyScore(invoiceName: string, dbName: string): number {
  const invoiceWords = extractWords(invoiceName);
  const dbWords = extractWords(dbName);
  
  if (invoiceWords.length === 0 || dbWords.length === 0) return 0;
  
  let exactMatches = 0;
  let partialMatches = 0;
  
  for (const invWord of invoiceWords) {
    // Exact match
    if (dbWords.includes(invWord)) {
      exactMatches++;
    } 
    // Partial match (one contains the other, min 4 chars)
    else if (invWord.length >= 4 && dbWords.some(dw => dw.length >= 4 && (dw.includes(invWord) || invWord.includes(dw)))) {
      partialMatches += 0.7;
    }
  }
  
  const totalScore = exactMatches + partialMatches;
  const maxPossible = Math.max(invoiceWords.length, dbWords.length);
  
  return totalScore / maxPossible;
}

async function main() {
  console.log('=== SKU ACCURACY AUDIT ===\n');
  
  // Load all UPC data for verification
  const allUpcs = new Map<string, string>();
  
  try {
    const centralData = JSON.parse(fs.readFileSync('/tmp/clean_upcs.json', 'utf-8'));
    for (const [upc, name] of Object.entries(centralData)) {
      allUpcs.set(upc, name as string);
    }
  } catch (e) {}
  
  try {
    const phillipsData = JSON.parse(fs.readFileSync('/tmp/phillips_upcs_v3.json', 'utf-8'));
    const arr = Array.isArray(phillipsData) ? phillipsData : Object.entries(phillipsData).map(([upc, name]) => ({ upc, productName: name }));
    for (const item of arr) {
      if (!allUpcs.has(item.upc)) allUpcs.set(item.upc, item.productName);
    }
  } catch (e) {}
  
  try {
    const pennplaxData = JSON.parse(fs.readFileSync('/tmp/pennplax_upcs.json', 'utf-8'));
    for (const item of pennplaxData) {
      if (!allUpcs.has(item.upc)) allUpcs.set(item.upc, item.productName);
    }
  } catch (e) {}
  
  try {
    const mappingData = JSON.parse(fs.readFileSync('/tmp/upc_mapping.json', 'utf-8'));
    for (const [upc, name] of Object.entries(mappingData)) {
      if (!allUpcs.has(upc)) allUpcs.set(upc, name as string);
    }
  } catch (e) {}
  
  console.log(`Loaded ${allUpcs.size} UPCs for verification\n`);
  
  // Get all products with SKUs
  const productsWithSku = await db.select()
    .from(supplies)
    .where(and(isNotNull(supplies.sku), ne(supplies.sku, '')));
  
  console.log(`Checking ${productsWithSku.length} products with SKUs...\n`);
  
  const issues: Array<{id: number; name: string; brand: string; sku: string; invoiceName: string; score: number}> = [];
  const verified: Array<{id: number; name: string; sku: string; score: number}> = [];
  let noInvoiceMatch = 0;
  
  for (const product of productsWithSku) {
    const invoiceName = allUpcs.get(product.sku || '');
    
    if (!invoiceName) {
      // SKU not found in invoice data - could be from POS import or other source
      noInvoiceMatch++;
      continue;
    }
    
    const score = calculateAccuracyScore(invoiceName, product.name);
    
    if (score < 0.40) {
      issues.push({
        id: product.id,
        name: product.name,
        brand: product.brand || '',
        sku: product.sku || '',
        invoiceName,
        score
      });
    } else {
      verified.push({
        id: product.id,
        name: product.name,
        sku: product.sku || '',
        score
      });
    }
  }
  
  console.log('=== AUDIT RESULTS ===');
  console.log(`Total products with SKU: ${productsWithSku.length}`);
  console.log(`SKUs from invoices: ${productsWithSku.length - noInvoiceMatch}`);
  console.log(`SKUs not in invoice data: ${noInvoiceMatch} (likely from POS or other sources)`);
  console.log(`\nVerified matches (40%+): ${verified.length}`);
  console.log(`Potential issues (<40%): ${issues.length}`);
  
  if (issues.length > 0) {
    console.log('\n=== POTENTIAL MISMATCHES ===');
    issues.sort((a, b) => a.score - b.score);
    
    for (const issue of issues.slice(0, 50)) {
      console.log(`\n[${(issue.score * 100).toFixed(0)}%] ID: ${issue.id}`);
      console.log(`  DB Name: "${issue.name}"`);
      console.log(`  Invoice: "${issue.invoiceName}"`);
      console.log(`  Brand: ${issue.brand} | SKU: ${issue.sku}`);
    }
    
    // Save issues to file for fixing
    fs.writeFileSync('/tmp/sku_issues.json', JSON.stringify(issues, null, 2));
    console.log(`\nSaved ${issues.length} issues to /tmp/sku_issues.json`);
  }
  
  // Score distribution
  const allScored = [...verified, ...issues].filter(v => v.score > 0);
  const above80 = allScored.filter(v => v.score >= 0.80).length;
  const above60 = allScored.filter(v => v.score >= 0.60 && v.score < 0.80).length;
  const above40 = allScored.filter(v => v.score >= 0.40 && v.score < 0.60).length;
  const below40 = allScored.filter(v => v.score < 0.40).length;
  
  console.log('\n=== SCORE DISTRIBUTION ===');
  console.log(`80%+ (excellent): ${above80}`);
  console.log(`60-79% (good): ${above60}`);
  console.log(`40-59% (acceptable): ${above40}`);
  console.log(`<40% (needs review): ${below40}`);
}

main().catch(console.error);
