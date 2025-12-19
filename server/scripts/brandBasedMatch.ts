import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, sql, isNull, or } from 'drizzle-orm';
import ExcelJS from 'exceljs';

interface InventoryItem {
  upc: string;
  name: string;
}

function extractKeyTerms(name: string): string[] {
  let normalized = name.toLowerCase()
    .replace(/[™®©\-'"&,()#]/g, ' ')
    .replace(/(\d+\.?\d*)\s*(lb|lbs|pound|pounds)/gi, '$1lb')
    .replace(/\s+/g, ' ')
    .trim();
    
  const terms = normalized.split(' ').filter(t => t.length > 2);
  
  const stopWords = new Set(['the', 'and', 'for', 'with', 'pet', 'dog', 'cat', 'size']);
  return terms.filter(t => !stopWords.has(t));
}

function extractWeight(name: string): string | null {
  const lower = name.toLowerCase();
  const match = lower.match(/(\d+\.?\d*)\s*(lb|lbs|#|oz)/);
  if (match) {
    return match[1] + (match[2].includes('oz') ? 'oz' : 'lb');
  }
  return null;
}

function matchScore(supplyTerms: Set<string>, invTerms: Set<string>, supWeight: string | null, invWeight: string | null): number {
  let matchCount = 0;
  for (const t of supplyTerms) {
    if (invTerms.has(t)) matchCount++;
  }
  
  const minSize = Math.min(supplyTerms.size, invTerms.size);
  if (minSize === 0) return 0;
  
  let score = matchCount / minSize;
  
  if (supWeight && invWeight) {
    if (supWeight === invWeight) {
      score += 0.2;
    } else {
      score -= 0.3;
    }
  }
  
  return score;
}

async function run() {
  console.log('=== Brand-Based Matching ===\n');
  
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
  
  const unmatched = await db.select({ id: supplies.id, name: supplies.name, brand: supplies.brand })
    .from(supplies)
    .where(or(isNull(supplies.sku), sql`sku = ''`));
  
  console.log(`Found ${unmatched.length} unmatched supplies\n`);
  
  const existing = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const usedUpcs = new Set(existing.map(s => s.sku!));
  
  const invByBrand = new Map<string, { item: InventoryItem; terms: Set<string>; weight: string | null }[]>();
  
  const brandPatterns = [
    'coastal', 'science diet', 'fromm', 'penn-plax', 'fluval', 'blue buffalo',
    'nutrisource', 'pro plan', 'marineland', 'prevue', 'redbar', 'aquatop',
    'taste of the wild', 'benebone', 'kaytee', 'diamond', 'oxbow', 'primal',
    'wellness', 'seachem', 'valhoma', 'lupine', 'zignature', 'victor', 
    'fussie cat', 'sunburst', 'tuffy', 'happy dog', 'titan', 'lilpals',
    'mamm', 'safari', 'durvet', 'omega one', 'petag', 'earthbath',
    'cascade', 'marina', 'kong', 'nylabone', 'hikari', 'api', 'tetra'
  ];
  
  for (const item of inventory) {
    const lower = item.name.toLowerCase();
    for (const brand of brandPatterns) {
      if (lower.includes(brand.replace('-', ' ').replace('-', ''))) {
        if (!invByBrand.has(brand)) {
          invByBrand.set(brand, []);
        }
        invByBrand.get(brand)!.push({
          item,
          terms: new Set(extractKeyTerms(item.name)),
          weight: extractWeight(item.name)
        });
        break;
      }
    }
  }
  
  console.log('Inventory by brand:');
  for (const [brand, items] of invByBrand) {
    console.log(`  ${brand}: ${items.length}`);
  }
  
  let matchCount = 0;
  const matches: string[] = [];
  
  for (const supply of unmatched) {
    const supplyLower = supply.name.toLowerCase();
    const supplyBrand = supply.brand?.toLowerCase() || '';
    
    let targetBrand = '';
    for (const brand of brandPatterns) {
      const brandNorm = brand.replace('-', ' ').replace('-', '');
      if (supplyLower.includes(brandNorm) || supplyBrand.includes(brandNorm)) {
        targetBrand = brand;
        break;
      }
    }
    
    if (!targetBrand || !invByBrand.has(targetBrand)) continue;
    
    const supplyTerms = new Set(extractKeyTerms(supply.name));
    const supplyWeight = extractWeight(supply.name);
    
    let bestMatch: { item: InventoryItem; score: number } | null = null;
    
    for (const { item, terms, weight } of invByBrand.get(targetBrand)!) {
      if (usedUpcs.has(item.upc)) continue;
      
      const score = matchScore(supplyTerms, terms, supplyWeight, weight);
      
      if (score >= 0.55 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { item, score };
      }
    }
    
    if (bestMatch) {
      await db.update(supplies)
        .set({ sku: bestMatch.item.upc })
        .where(eq(supplies.id, supply.id));
      usedUpcs.add(bestMatch.item.upc);
      matchCount++;
      matches.push(`[${targetBrand}] (${bestMatch.score.toFixed(2)}): "${supply.name}" -> "${bestMatch.item.name}"`);
    }
  }
  
  console.log('\n=== Sample Matches ===');
  for (const m of matches.slice(0, 50)) {
    console.log(m);
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
