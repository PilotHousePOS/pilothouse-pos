import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNotNull, eq, sql, inArray } from 'drizzle-orm';
import { expandAbbreviations } from './server/abbreviationExpansion';

// Expand invoice abbreviations
const INVOICE_ABBREVIATIONS: Record<string, string> = {
  'froz': 'frozen', 'frzn': 'frozen', 'frz': 'frozen',
  'chkn': 'chicken', 'chk': 'chicken', 'ck': 'chicken',
  'lam': 'lamb', 'lmb': 'lamb',
  'bf': 'beef', 'bff': 'beef',
  'slmn': 'salmon', 'salm': 'salmon', 'slm': 'salmon',
  'trky': 'turkey', 'trk': 'turkey',
  'vnson': 'venison', 'vnsn': 'venison',
  'brn': 'brown', 'br': 'brown',
  'wht': 'white', 'wh': 'white',
  'sw': 'sweet', 'swt': 'sweet',
  'pot': 'potato', 'potat': 'potato',
  'rc': 'rice', 'ric': 'rice',
  'vict': 'victor', 'tow': 'taste of the wild',
  'sd': 'science diet', 'nb': 'natural balance', 'diam': 'diamond',
  'hik': 'hikari', 'tet': 'tetra', 'aqe': 'aqueon',
  'frm': 'fromm', 'grn': 'greenies', 'natv': 'naturvet',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large',
  'xs': 'extra small', 'reg': 'regular', 'jmb': 'jumbo',
  'sensi': 'sensitive', 'sens': 'sensitive',
  'nat': 'natural', 'org': 'organic',
};

function expandName(name: string): string {
  let result = expandAbbreviations(name);
  for (const [abbrev, full] of Object.entries(INVOICE_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  result = result.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb');
  return result.toLowerCase();
}

// Extract size/weight from product name
function extractSize(name: string): string | null {
  const normalized = name.toLowerCase();
  
  // Weight patterns: 5lb, 15#, 3.5oz, 12.2oz
  const weightMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:lb|#|oz|gal|ml|l|g|kg)/);
  if (weightMatch) {
    let size = weightMatch[0].replace('#', 'lb').replace(/\s+/g, '');
    return size;
  }
  
  // Size patterns: small, medium, large, xl, etc.
  const sizePatterns = [
    { pattern: /\bextra\s*small\b|\bxs\b|\bxsm\b/i, value: 'xs' },
    { pattern: /\bsmall\b|\bsm\b/i, value: 'small' },
    { pattern: /\bmedium\b|\bmed\b|\bmd\b/i, value: 'medium' },
    { pattern: /\blarge\b|\blg\b/i, value: 'large' },
    { pattern: /\bextra\s*large\b|\bxl\b|\bxlg\b/i, value: 'xl' },
    { pattern: /\bjumbo\b|\bjmb\b|\bjmbo\b/i, value: 'jumbo' },
    { pattern: /\bgiant\b|\bgnt\b/i, value: 'giant' },
    { pattern: /\bmini\b|\bmin\b/i, value: 'mini' },
  ];
  
  for (const { pattern, value } of sizePatterns) {
    if (pattern.test(normalized)) {
      return value;
    }
  }
  
  // Dimension patterns: 9", 24", etc.
  const dimMatch = normalized.match(/(\d+)"/);
  if (dimMatch) {
    return dimMatch[0];
  }
  
  return null;
}

// Extract key protein/ingredient from food product names
function extractProtein(name: string): string | null {
  const normalized = expandName(name);
  
  const proteins = [
    'chicken', 'beef', 'lamb', 'salmon', 'turkey', 'duck', 'venison',
    'pork', 'fish', 'whitefish', 'tuna', 'rabbit', 'bison', 'boar',
    'liver', 'trout', 'herring', 'anchovy', 'sardine', 'mackerel'
  ];
  
  for (const protein of proteins) {
    if (normalized.includes(protein)) {
      return protein;
    }
  }
  return null;
}

// Strict match: requires same brand, same size (if specified), same protein (for food)
function isStrictMatch(dbName: string, maybeName: string): boolean {
  const dbExpanded = expandName(dbName);
  const maybeExpanded = expandName(maybeName);
  
  // Extract sizes
  const dbSize = extractSize(dbName);
  const maybeSize = extractSize(maybeName);
  
  // If both have sizes, they MUST match
  if (dbSize && maybeSize && dbSize !== maybeSize) {
    return false;
  }
  
  // Extract proteins (for food products)
  const dbProtein = extractProtein(dbName);
  const maybeProtein = extractProtein(maybeName);
  
  // If both have proteins, they MUST match
  if (dbProtein && maybeProtein && dbProtein !== maybeProtein) {
    return false;
  }
  
  // Tokenize and compare
  const dbTokens = new Set(dbExpanded.match(/[a-z]{3,}|\d+(?:\.\d+)?(?:lb|oz|gal)?/g) || []);
  const maybeTokens = new Set(maybeExpanded.match(/[a-z]{3,}|\d+(?:\.\d+)?(?:lb|oz|gal)?/g) || []);
  
  // Calculate overlap
  const intersection = [...dbTokens].filter(t => maybeTokens.has(t));
  const score = intersection.length / Math.max(dbTokens.size, maybeTokens.size);
  
  return score >= 0.6;
}

async function main() {
  console.log('=== VERIFY AND FIX MATCHES ===\n');
  
  // Load InventoryMaybe
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = workbook.getWorksheet('Sheet1');
  
  const maybeMap = new Map<string, string>();
  ws?.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name) maybeMap.set(upc, name);
  });
  
  console.log(`InventoryMaybe: ${maybeMap.size} UPCs loaded\n`);
  
  // Get all products with SKUs
  const productsWithSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
  }).from(supplies).where(isNotNull(supplies.sku));
  
  console.log(`Checking ${productsWithSku.length} products with SKUs...\n`);
  
  let correct = 0;
  let incorrect = 0;
  let notInMaybe = 0;
  const wrongSkus: number[] = [];
  const sampleMismatches: Array<{id: number, dbName: string, sku: string, maybeName: string, dbSize: string | null, maybeSize: string | null}> = [];
  
  for (const prod of productsWithSku) {
    const maybeName = maybeMap.get(prod.sku!);
    if (maybeName) {
      if (isStrictMatch(prod.name, maybeName)) {
        correct++;
      } else {
        incorrect++;
        wrongSkus.push(prod.id);
        if (sampleMismatches.length < 20) {
          sampleMismatches.push({
            id: prod.id, 
            dbName: prod.name, 
            sku: prod.sku!, 
            maybeName,
            dbSize: extractSize(prod.name),
            maybeSize: extractSize(maybeName)
          });
        }
      }
    } else {
      notInMaybe++;
    }
  }
  
  console.log(`=== VERIFICATION RESULTS ===`);
  console.log(`Correct: ${correct}`);
  console.log(`Incorrect: ${incorrect}`);
  console.log(`Not in InventoryMaybe (keeping): ${notInMaybe}`);
  
  if (sampleMismatches.length > 0) {
    console.log(`\n=== SAMPLE MISMATCHES ===`);
    for (const m of sampleMismatches) {
      console.log(`ID ${m.id}: "${m.dbName}" (size: ${m.dbSize})`);
      console.log(`  SKU ${m.sku} = "${m.maybeName}" (size: ${m.maybeSize}) - MISMATCH`);
    }
  }
  
  if (wrongSkus.length > 0) {
    console.log(`\n=== CLEARING ${wrongSkus.length} INCORRECT SKUs ===`);
    
    for (let i = 0; i < wrongSkus.length; i += 100) {
      const batch = wrongSkus.slice(i, i + 100);
      await db.update(supplies)
        .set({ sku: null })
        .where(inArray(supplies.id, batch));
    }
    
    console.log(`Cleared ${wrongSkus.length} incorrect SKUs.`);
  }
  
  // Final stats
  const totalCount = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  const withSkuCount = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(isNotNull(supplies.sku));
  
  console.log(`\n=== FINAL STATUS ===`);
  console.log(`Products with SKU: ${withSkuCount[0].count}`);
  console.log(`Total products: ${totalCount[0].count}`);
  console.log(`Coverage: ${((Number(withSkuCount[0].count) / Number(totalCount[0].count)) * 100).toFixed(1)}%`);
}

main().catch(console.error);
