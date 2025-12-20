import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNotNull, eq, sql, inArray } from 'drizzle-orm';
import { expandAbbreviations } from './server/abbreviationExpansion';

// Normalize text for comparison - aggressive normalization
function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '');
}

// Extract key words from a product name (brand, size, type)
function extractKeyWords(name: string): Set<string> {
  const words = new Set<string>();
  const normalized = name.toLowerCase();
  
  // Extract words 3+ chars
  const matches = normalized.match(/[a-z]{3,}/g) || [];
  matches.forEach(w => words.add(w));
  
  // Extract numbers with units (like 10oz, 5lb, 2pk)
  const numMatches = normalized.match(/\d+(?:oz|lb|pk|ct|gal|ml|l|g|kg)?/g) || [];
  numMatches.forEach(w => words.add(w));
  
  return words;
}

// Calculate word overlap score
function wordOverlapScore(name1: string, name2: string): number {
  const words1 = extractKeyWords(name1);
  const words2 = extractKeyWords(name2);
  
  let matches = 0;
  for (const w of words1) {
    if (words2.has(w)) matches++;
  }
  
  const total = Math.max(words1.size, words2.size);
  return total > 0 ? matches / total : 0;
}

// Check if names are a STRICT match (high confidence)
function isStrictMatch(dbName: string, maybeName: string): boolean {
  const dbNorm = normalize(dbName);
  const maybeNorm = normalize(maybeName);
  
  // Exact match after normalization
  if (dbNorm === maybeNorm) return true;
  
  // One contains the other (for abbreviated versions)
  if (dbNorm.includes(maybeNorm) || maybeNorm.includes(dbNorm)) {
    const shorter = Math.min(dbNorm.length, maybeNorm.length);
    const longer = Math.max(dbNorm.length, maybeNorm.length);
    // Must be at least 60% of the longer string
    if (shorter / longer >= 0.6) return true;
  }
  
  // Word-based matching - need high overlap
  const wordScore = wordOverlapScore(dbName, maybeName);
  if (wordScore >= 0.7) return true;
  
  // Expand abbreviations in maybe name and check again
  const expandedMaybe = expandAbbreviations(maybeName);
  const expandedNorm = normalize(expandedMaybe);
  if (dbNorm === expandedNorm) return true;
  if (dbNorm.includes(expandedNorm) || expandedNorm.includes(dbNorm)) {
    const shorter = Math.min(dbNorm.length, expandedNorm.length);
    const longer = Math.max(dbNorm.length, expandedNorm.length);
    if (shorter / longer >= 0.6) return true;
  }
  
  return false;
}

async function main() {
  console.log('=== SKU CORRECTION SCRIPT ===\n');
  
  // Load InventoryMaybe for verification
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = workbook.getWorksheet('Sheet1');
  
  // Build UPC -> Name map from InventoryMaybe
  const maybeMap = new Map<string, string>();
  ws?.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name) maybeMap.set(upc, name);
  });
  
  console.log(`InventoryMaybe: ${maybeMap.size} UPCs loaded\n`);
  
  // Get ALL products WITH SKUs
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
  const sampleMismatches: Array<{id: number, dbName: string, sku: string, maybeName: string}> = [];
  
  for (const prod of productsWithSku) {
    const maybeName = maybeMap.get(prod.sku!);
    if (maybeName) {
      if (isStrictMatch(prod.name, maybeName)) {
        correct++;
      } else {
        incorrect++;
        wrongSkus.push(prod.id);
        if (sampleMismatches.length < 10) {
          sampleMismatches.push({id: prod.id, dbName: prod.name, sku: prod.sku!, maybeName});
        }
      }
    } else {
      // SKU not in InventoryMaybe - keep it (could be from invoices)
      notInMaybe++;
    }
  }
  
  console.log(`=== VERIFICATION RESULTS ===`);
  console.log(`Correct matches: ${correct}`);
  console.log(`INCORRECT (will clear): ${incorrect}`);
  console.log(`Not in InventoryMaybe (keeping): ${notInMaybe}`);
  
  if (sampleMismatches.length > 0) {
    console.log(`\n=== SAMPLE MISMATCHES ===`);
    for (const m of sampleMismatches) {
      console.log(`ID ${m.id}: "${m.dbName}"`);
      console.log(`  SKU ${m.sku} = "${m.maybeName}" (WRONG!)`);
    }
  }
  
  if (wrongSkus.length > 0) {
    console.log(`\n=== CLEARING ${wrongSkus.length} INCORRECT SKUs ===`);
    
    // Clear in batches of 100
    for (let i = 0; i < wrongSkus.length; i += 100) {
      const batch = wrongSkus.slice(i, i + 100);
      await db.update(supplies)
        .set({ sku: null })
        .where(inArray(supplies.id, batch));
      console.log(`Cleared batch ${Math.floor(i/100) + 1}/${Math.ceil(wrongSkus.length/100)}`);
    }
    
    console.log(`\nCleared ${wrongSkus.length} incorrect SKUs.`);
  }
  
  // Now get count of products still without SKUs
  const noSkuCount = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`${supplies.sku} IS NULL`);
  
  console.log(`\n=== FINAL STATUS ===`);
  console.log(`Products now without SKU: ${noSkuCount[0].count}`);
  
  const totalCount = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  const withSkuCount = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(isNotNull(supplies.sku));
  
  console.log(`Products with SKU: ${withSkuCount[0].count}`);
  console.log(`Total products: ${totalCount[0].count}`);
  console.log(`Coverage: ${((Number(withSkuCount[0].count) / Number(totalCount[0].count)) * 100).toFixed(1)}%`);
}

main().catch(console.error);
