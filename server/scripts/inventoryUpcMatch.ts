import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, sql, isNull, or, and } from 'drizzle-orm';
import ExcelJS from 'exceljs';

interface InventoryItem {
  upc: string;
  name: string;
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©\-'"&,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWeight(name: string): string | null {
  const lower = name.toLowerCase();
  const match = lower.match(/(\d+\.?\d*)\s*(lb|lbs|#|oz|pound|pounds)/);
  if (match) {
    const num = parseFloat(match[1]);
    const unit = match[2].includes('oz') ? 'oz' : 'lb';
    return `${num}${unit}`;
  }
  return null;
}

function tokenize(name: string): string[] {
  return normalize(name).split(' ').filter(t => t.length > 1);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

async function run() {
  console.log('=== Inventory UPC Matching ===\n');
  
  // Load Excel data
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const sheet = workbook.worksheets[0];
  
  const inventory: InventoryItem[] = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name && upc.length >= 10) {
      inventory.push({ upc, name });
    }
  });
  
  console.log(`Loaded ${inventory.length} items from Excel\n`);
  
  // Get unmatched supplies from database
  const unmatched = await db.select({ id: supplies.id, name: supplies.name, brand: supplies.brand })
    .from(supplies)
    .where(or(isNull(supplies.sku), sql`sku = ''`));
  
  console.log(`Found ${unmatched.length} unmatched supplies in database\n`);
  
  // Get already used UPCs
  const existing = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const usedUpcs = new Set(existing.map(s => s.sku!));
  
  // Create lookup map from inventory
  const inventoryByNorm = new Map<string, InventoryItem[]>();
  for (const item of inventory) {
    const norm = normalize(item.name);
    if (!inventoryByNorm.has(norm)) {
      inventoryByNorm.set(norm, []);
    }
    inventoryByNorm.get(norm)!.push(item);
  }
  
  let matchCount = 0;
  let skipped = 0;
  const matches: string[] = [];
  
  for (const supply of unmatched) {
    const supplyNorm = normalize(supply.name);
    const supplyTokens = tokenize(supply.name);
    const supplyWeight = extractWeight(supply.name);
    
    // Try exact normalized match first
    if (inventoryByNorm.has(supplyNorm)) {
      const candidates = inventoryByNorm.get(supplyNorm)!;
      for (const item of candidates) {
        if (!usedUpcs.has(item.upc)) {
          await db.update(supplies)
            .set({ sku: item.upc })
            .where(eq(supplies.id, supply.id));
          usedUpcs.add(item.upc);
          matchCount++;
          matches.push(`EXACT: "${supply.name}" -> ${item.upc}`);
          break;
        }
      }
      continue;
    }
    
    // Try fuzzy match
    let bestMatch: { item: InventoryItem; score: number } | null = null;
    
    for (const item of inventory) {
      if (usedUpcs.has(item.upc)) continue;
      
      const invTokens = tokenize(item.name);
      let score = jaccardSimilarity(supplyTokens, invTokens);
      
      // Boost score if weight matches
      const invWeight = extractWeight(item.name);
      if (supplyWeight && invWeight && supplyWeight === invWeight) {
        score += 0.15;
      }
      
      // Penalize if weight differs
      if (supplyWeight && invWeight && supplyWeight !== invWeight) {
        score -= 0.2;
      }
      
      if (score > 0.7 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { item, score };
      }
    }
    
    if (bestMatch) {
      await db.update(supplies)
        .set({ sku: bestMatch.item.upc })
        .where(eq(supplies.id, supply.id));
      usedUpcs.add(bestMatch.item.upc);
      matchCount++;
      matches.push(`FUZZY (${bestMatch.score.toFixed(2)}): "${supply.name}" -> ${bestMatch.item.upc} ("${bestMatch.item.name}")`);
    }
  }
  
  // Print sample matches
  console.log('=== Sample Matches ===');
  for (const m of matches.slice(0, 50)) {
    console.log(m);
  }
  
  // Final stats
  const final = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const total = await db.select({ count: sql<number>`count(*)` })
    .from(supplies);
  
  const coverage = (Number(final[0].count) / Number(total[0].count) * 100).toFixed(1);
  
  console.log(`\n=== RESULTS ===`);
  console.log(`New matches: ${matchCount}`);
  console.log(`Total with SKU: ${final[0].count}/${total[0].count} (${coverage}%)`);
}

run().catch(console.error);
