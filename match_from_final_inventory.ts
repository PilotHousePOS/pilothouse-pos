import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull, eq, sql, isNotNull } from 'drizzle-orm';
import { expandAbbreviations } from './server/abbreviationExpansion';

// Normalize for comparison
function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract tokens
function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const words = normalize(text).split(' ');
  for (const word of words) {
    if (word.length >= 2) {
      tokens.add(word);
    }
  }
  return tokens;
}

// Check if two product names match
function isExactMatch(name1: string, name2: string): boolean {
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  // Exact match
  if (n1 === n2) return true;
  
  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) {
    const shorter = Math.min(n1.length, n2.length);
    const longer = Math.max(n1.length, n2.length);
    if (shorter / longer >= 0.7) return true;
  }
  
  // Token overlap
  const tokens1 = tokenize(name1);
  const tokens2 = tokenize(name2);
  const intersection = [...tokens1].filter(t => tokens2.has(t));
  const score = intersection.length / Math.max(tokens1.size, tokens2.size);
  
  return score >= 0.8;
}

async function main() {
  console.log('=== MATCH FROM FINAL INVENTORY ===\n');
  
  // Load Final Inventory
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx');
  const ws = workbook.worksheets[0];
  
  // Build name -> SKU map (normalized name)
  const nameToSku = new Map<string, string>();
  const skuToName = new Map<string, string>();
  
  for (let i = 3; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const desc = String(row.getCell(2).value || '').trim();
    const sku = String(row.getCell(24).value || '').trim();
    
    if (desc && sku && sku !== 'null' && sku.length > 5) {
      const normalized = normalize(desc);
      nameToSku.set(normalized, sku);
      skuToName.set(sku, desc);
    }
  }
  
  console.log(`Final Inventory: ${nameToSku.size} products with SKUs loaded\n`);
  
  // Get products WITHOUT SKUs
  const productsWithoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Products without SKU: ${productsWithoutSku.length}\n`);
  
  // Match products
  let matched = 0;
  let unmatched = 0;
  const updates: Array<{id: number, sku: string, dbName: string, invName: string}> = [];
  
  for (const prod of productsWithoutSku) {
    const normalized = normalize(prod.name);
    
    // First try exact normalized match
    let foundSku = nameToSku.get(normalized);
    let foundName = foundSku ? skuToName.get(foundSku) : null;
    
    // If no exact match, try fuzzy matching
    if (!foundSku) {
      for (const [invNorm, sku] of nameToSku) {
        if (isExactMatch(prod.name, invNorm)) {
          foundSku = sku;
          foundName = skuToName.get(sku);
          break;
        }
      }
    }
    
    if (foundSku && foundName) {
      matched++;
      updates.push({
        id: prod.id,
        sku: foundSku,
        dbName: prod.name,
        invName: foundName
      });
    } else {
      unmatched++;
    }
  }
  
  console.log(`=== MATCHING RESULTS ===`);
  console.log(`Matched: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  
  // Show sample matches
  console.log(`\n=== SAMPLE MATCHES ===`);
  const sampleMatches = updates.slice(0, 15);
  for (const m of sampleMatches) {
    console.log(`"${m.dbName}" -> SKU ${m.sku}`);
    console.log(`  (Inventory: "${m.invName}")`);
  }
  
  // Apply updates
  if (updates.length > 0) {
    console.log(`\n=== APPLYING ${updates.length} UPC UPDATES ===`);
    
    for (let i = 0; i < updates.length; i++) {
      const u = updates[i];
      await db.update(supplies)
        .set({ sku: u.sku })
        .where(eq(supplies.id, u.id));
      
      if ((i + 1) % 500 === 0) {
        console.log(`Updated ${i + 1}/${updates.length}...`);
      }
    }
    
    console.log(`Applied ${updates.length} UPC updates.`);
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
