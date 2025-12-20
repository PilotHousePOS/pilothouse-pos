import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull, eq, sql, isNotNull, inArray } from 'drizzle-orm';
import { expandAbbreviations } from './server/abbreviationExpansion';

// Invoice abbreviations for expansion
const INVOICE_ABBREVS: Record<string, string> = {
  'froz': 'frozen', 'frzn': 'frozen',
  'chkn': 'chicken', 'chk': 'chicken', 'ck': 'chicken',
  'lam': 'lamb', 'bf': 'beef', 'slmn': 'salmon', 'trky': 'turkey',
  'brn': 'brown', 'br': 'brown', 'wht': 'white', 'sw': 'sweet', 'pot': 'potato',
  'vict': 'victor', 'tow': 'taste of the wild', 'sd': 'science diet',
  'nb': 'natural balance', 'diam': 'diamond', 'frm': 'fromm',
  'hik': 'hikari', 'tet': 'tetra', 'aqe': 'aqueon',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large',
  'sensi': 'sensitive', 'nat': 'natural',
};

function expandInvoice(name: string): string {
  let result = expandAbbreviations(name);
  for (const [abbr, full] of Object.entries(INVOICE_ABBREVS)) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  result = result.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb');
  return result;
}

function normalize(text: string): string {
  return expandInvoice(text).toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// Very strict match - must have high character overlap
function isVeryStrictMatch(name1: string, name2: string): boolean {
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  // Exact match
  if (n1 === n2) return true;
  
  // One must contain the other AND be at least 80% similar in length
  if (n1.includes(n2) && n2.length / n1.length >= 0.8) return true;
  if (n2.includes(n1) && n1.length / n2.length >= 0.8) return true;
  
  return false;
}

async function main() {
  console.log('=== STEP 1: CLEAR ALL UNVERIFIED SKUs ===\n');
  
  // Load all verification sources
  const sources = new Map<string, string>(); // UPC -> name
  
  // Load InventoryMaybe
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws1 = wb1.getWorksheet('Sheet1');
  ws1?.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name) sources.set(upc, name);
  });
  console.log(`InventoryMaybe: ${sources.size} UPCs`);
  
  // Load Final Inventory
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile('attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx');
  const ws2 = wb2.worksheets[0];
  let finalCount = 0;
  for (let i = 3; i <= ws2.rowCount; i++) {
    const row = ws2.getRow(i);
    const desc = String(row.getCell(2).value || '').trim();
    const sku = String(row.getCell(24).value || '').trim();
    if (desc && sku && sku !== 'null' && sku.length > 5) {
      if (!sources.has(sku)) {
        sources.set(sku, desc);
        finalCount++;
      }
    }
  }
  console.log(`Final Inventory (new): ${finalCount} UPCs`);
  console.log(`Total sources: ${sources.size} UPCs\n`);
  
  // Get all products with SKUs
  const productsWithSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
  }).from(supplies).where(isNotNull(supplies.sku));
  
  console.log(`Products with SKU: ${productsWithSku.length}\n`);
  
  // Verify each SKU
  let verified = 0;
  let unverified = 0;
  const badIds: number[] = [];
  
  for (const prod of productsWithSku) {
    const sourceName = sources.get(prod.sku!);
    if (sourceName && isVeryStrictMatch(prod.name, sourceName)) {
      verified++;
    } else {
      unverified++;
      badIds.push(prod.id);
    }
  }
  
  console.log(`Verified: ${verified}`);
  console.log(`Unverified (will clear): ${unverified}\n`);
  
  // Clear unverified
  if (badIds.length > 0) {
    for (let i = 0; i < badIds.length; i += 100) {
      const batch = badIds.slice(i, i + 100);
      await db.update(supplies).set({ sku: null }).where(inArray(supplies.id, batch));
    }
    console.log(`Cleared ${badIds.length} unverified SKUs.\n`);
  }
  
  // STEP 2: Match using exact normalized names
  console.log('=== STEP 2: STRICT MATCHING ===\n');
  
  // Build normalized name -> UPC map from sources
  const normToUpc = new Map<string, { upc: string, name: string }>();
  for (const [upc, name] of sources) {
    const norm = normalize(name);
    if (!normToUpc.has(norm)) {
      normToUpc.set(norm, { upc, name });
    }
  }
  console.log(`Unique normalized names: ${normToUpc.size}\n`);
  
  // Get products without SKU
  const productsWithoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Products without SKU: ${productsWithoutSku.length}\n`);
  
  // Match
  let matched = 0;
  const updates: Array<{ id: number, sku: string }> = [];
  
  for (const prod of productsWithoutSku) {
    const norm = normalize(prod.name);
    const match = normToUpc.get(norm);
    if (match) {
      matched++;
      updates.push({ id: prod.id, sku: match.upc });
    }
  }
  
  console.log(`Exact matches found: ${matched}\n`);
  
  // Apply updates
  if (updates.length > 0) {
    for (let i = 0; i < updates.length; i++) {
      await db.update(supplies).set({ sku: updates[i].sku }).where(eq(supplies.id, updates[i].id));
      if ((i + 1) % 500 === 0) console.log(`Updated ${i + 1}/${updates.length}...`);
    }
    console.log(`Applied ${updates.length} updates.\n`);
  }
  
  // Final stats
  const totalCount = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  const withSkuCount = await db.select({ count: sql<number>`count(*)` })
    .from(supplies).where(isNotNull(supplies.sku));
  
  console.log(`=== FINAL STATUS ===`);
  console.log(`Products with SKU: ${withSkuCount[0].count}`);
  console.log(`Total products: ${totalCount[0].count}`);
  console.log(`Coverage: ${((Number(withSkuCount[0].count) / Number(totalCount[0].count)) * 100).toFixed(1)}%`);
}

main().catch(console.error);
