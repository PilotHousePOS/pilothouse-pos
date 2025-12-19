import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, sql, isNull, or } from 'drizzle-orm';
import ExcelJS from 'exceljs';

interface InventoryItem {
  upc: string;
  name: string;
  nameLower: string;
  normalized: string;
}

const WEIGHT_PATTERNS = [
  /(\d+\.?\d*)\s*(lb|lbs|#|pound|pounds)/gi,
  /(\d+\.?\d*)\s*(oz|ounce|ounces)/gi,
];

function normalizeWeight(name: string): string {
  let result = name.toLowerCase();
  result = result.replace(/(\d+\.?\d*)\s*#/g, '$1lb');
  result = result.replace(/(\d+\.?\d*)\s*lbs/g, '$1lb');
  result = result.replace(/(\d+\.?\d*)\s*pounds?/g, '$1lb');
  result = result.replace(/(\d+\.?\d*)\s*ounces?/g, '$1oz');
  return result;
}

function normalize(name: string): string {
  let result = name.toLowerCase();
  result = normalizeWeight(result);
  result = result.replace(/[™®©\-'"&,()]/g, ' ');
  result = result.replace(/\s+/g, ' ');
  return result.trim();
}

function extractBrandAndProduct(name: string): { brand: string; product: string } {
  const lower = name.toLowerCase();
  const words = lower.split(/\s+/);
  
  const brands = ['fromm', 'primal', 'coastal', 'lupine', 'fluval', 'oxbow', 
    'kaytee', 'pro plan', 'science diet', 'blue buffalo', 'zignature', 
    'nutrisource', 'diamond', 'taste of the wild', 'freshpet', 'wellness',
    'seachem', 'penn-plax', 'prevue', 'redbar', 'fussie cat', 'sunburst'];
  
  for (const brand of brands) {
    if (lower.includes(brand)) {
      const product = lower.replace(brand, '').trim();
      return { brand, product };
    }
  }
  
  return { brand: words[0] || '', product: words.slice(1).join(' ') };
}

function getMatchScore(supply: string, inventory: string): number {
  const supNorm = normalize(supply);
  const invNorm = normalize(inventory);
  
  if (supNorm === invNorm) return 1.0;
  
  const supWords = new Set(supNorm.split(' ').filter(w => w.length > 1));
  const invWords = new Set(invNorm.split(' ').filter(w => w.length > 1));
  
  const intersection = [...supWords].filter(w => invWords.has(w)).length;
  const union = new Set([...supWords, ...invWords]).size;
  
  let jaccard = union > 0 ? intersection / union : 0;
  
  const supBP = extractBrandAndProduct(supply);
  const invBP = extractBrandAndProduct(inventory);
  
  if (supBP.brand === invBP.brand && supBP.brand !== '') {
    jaccard += 0.15;
  }
  
  const supWeight = supNorm.match(/(\d+\.?\d*)(lb|oz)/);
  const invWeight = invNorm.match(/(\d+\.?\d*)(lb|oz)/);
  if (supWeight && invWeight) {
    if (supWeight[0] === invWeight[0]) {
      jaccard += 0.1;
    } else {
      jaccard -= 0.15;
    }
  }
  
  return Math.min(jaccard, 1.0);
}

async function run() {
  console.log('=== Inventory UPC Matching V2 ===\n');
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const sheet = workbook.worksheets[0];
  
  const inventory: InventoryItem[] = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name && upc.length >= 10) {
      inventory.push({ 
        upc, 
        name, 
        nameLower: name.toLowerCase(),
        normalized: normalize(name)
      });
    }
  });
  
  console.log(`Loaded ${inventory.length} items from Excel\n`);
  
  const unmatched = await db.select({ id: supplies.id, name: supplies.name, brand: supplies.brand })
    .from(supplies)
    .where(or(isNull(supplies.sku), sql`sku = ''`));
  
  console.log(`Found ${unmatched.length} unmatched supplies in database\n`);
  
  const existing = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const usedUpcs = new Set(existing.map(s => s.sku!));
  
  const invByNorm = new Map<string, InventoryItem[]>();
  for (const item of inventory) {
    if (!invByNorm.has(item.normalized)) {
      invByNorm.set(item.normalized, []);
    }
    invByNorm.get(item.normalized)!.push(item);
  }
  
  let matchCount = 0;
  const matches: { type: string; supply: string; upc: string; inv: string; score: number }[] = [];
  
  for (const supply of unmatched) {
    const supplyNorm = normalize(supply.name);
    
    if (invByNorm.has(supplyNorm)) {
      const candidates = invByNorm.get(supplyNorm)!;
      for (const item of candidates) {
        if (!usedUpcs.has(item.upc)) {
          await db.update(supplies)
            .set({ sku: item.upc })
            .where(eq(supplies.id, supply.id));
          usedUpcs.add(item.upc);
          matchCount++;
          matches.push({ type: 'EXACT', supply: supply.name, upc: item.upc, inv: item.name, score: 1.0 });
          break;
        }
      }
      continue;
    }
    
    let bestMatch: { item: InventoryItem; score: number } | null = null;
    
    for (const item of inventory) {
      if (usedUpcs.has(item.upc)) continue;
      
      const score = getMatchScore(supply.name, item.name);
      
      if (score >= 0.60 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { item, score };
      }
    }
    
    if (bestMatch && bestMatch.score >= 0.60) {
      await db.update(supplies)
        .set({ sku: bestMatch.item.upc })
        .where(eq(supplies.id, supply.id));
      usedUpcs.add(bestMatch.item.upc);
      matchCount++;
      matches.push({ 
        type: 'FUZZY', 
        supply: supply.name, 
        upc: bestMatch.item.upc, 
        inv: bestMatch.item.name,
        score: bestMatch.score 
      });
    }
  }
  
  console.log('=== Sample Matches ===');
  for (const m of matches.slice(0, 60)) {
    console.log(`${m.type} (${m.score.toFixed(2)}): "${m.supply}" -> ${m.upc} ("${m.inv}")`);
  }
  
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
