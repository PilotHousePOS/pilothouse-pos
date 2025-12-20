import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, and, isNull, or, sql } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcEntry {
  upc: string;
  productName: string;
}

function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMatchingWords(a: string, b: string): number {
  const aWords = normalizeForMatching(a).split(' ').filter(w => w.length > 2);
  const bWords = normalizeForMatching(b).split(' ').filter(w => w.length > 2);
  let matches = 0;
  for (const word of aWords) {
    if (bWords.some(bw => bw === word || (word.length > 4 && bw.includes(word)) || (bw.length > 4 && word.includes(bw)))) {
      matches++;
    }
  }
  return matches;
}

function calculateScore(invoiceName: string, dbName: string): number {
  const matches = getMatchingWords(invoiceName, dbName);
  const aLen = normalizeForMatching(invoiceName).split(' ').filter(w => w.length > 2).length;
  const bLen = normalizeForMatching(dbName).split(' ').filter(w => w.length > 2).length;
  if (aLen === 0 || bLen === 0) return 0;
  return matches / Math.max(aLen, bLen);
}

async function main() {
  console.log('=== Final UPC Matching Pass ===\n');
  
  // Load all UPC sources
  const allUpcs = new Map<string, string>();
  
  // Central Pet UPCs
  const centralData = JSON.parse(fs.readFileSync('/tmp/clean_upcs.json', 'utf-8'));
  for (const [upc, name] of Object.entries(centralData)) {
    allUpcs.set(upc, name as string);
  }
  console.log(`Loaded ${Object.keys(centralData).length} Central Pet UPCs`);
  
  // Phillips Pet UPCs
  const phillipsData = JSON.parse(fs.readFileSync('/tmp/phillips_upcs_v3.json', 'utf-8'));
  const phillipsArray = Array.isArray(phillipsData) ? phillipsData : Object.entries(phillipsData).map(([upc, name]) => ({ upc, productName: name }));
  for (const item of phillipsArray) {
    if (!allUpcs.has(item.upc)) {
      allUpcs.set(item.upc, item.productName);
    }
  }
  console.log(`Loaded ${phillipsArray.length} Phillips Pet UPCs`);
  
  // Penn-Plax UPCs
  const pennplaxData = JSON.parse(fs.readFileSync('/tmp/pennplax_upcs.json', 'utf-8'));
  for (const item of pennplaxData) {
    if (!allUpcs.has(item.upc)) {
      allUpcs.set(item.upc, item.productName);
    }
  }
  console.log(`Loaded ${pennplaxData.length} Penn-Plax UPCs`);
  
  // UPC Mapping
  const mappingData = JSON.parse(fs.readFileSync('/tmp/upc_mapping.json', 'utf-8'));
  for (const [upc, name] of Object.entries(mappingData)) {
    if (!allUpcs.has(upc)) {
      allUpcs.set(upc, name as string);
    }
  }
  console.log(`Loaded ${Object.keys(mappingData).length} from mapping file`);
  
  console.log(`\nTotal unique UPCs available: ${allUpcs.size}`);
  
  // Get products without SKU
  const products = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  console.log(`Products without SKU: ${products.length}`);
  
  // Get already used SKUs
  const existingSkus = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(and(sql`sku IS NOT NULL`, sql`sku != ''`));
  const usedSkus = new Set(existingSkus.map(s => s.sku).filter(Boolean));
  console.log(`Already assigned SKUs: ${usedSkus.size}`);
  
  // Filter available UPCs
  const availableUpcs = Array.from(allUpcs.entries()).filter(([upc]) => !usedSkus.has(upc));
  console.log(`Available UPCs for matching: ${availableUpcs.length}\n`);
  
  // Match with 30% threshold
  const matches: Array<{id: number; name: string; brand: string; upc: string; invoiceName: string; score: number}> = [];
  const matchedUpcs = new Set<string>();
  
  for (const product of products) {
    let best: {upc: string; name: string; score: number} | null = null;
    
    for (const [upc, invoiceName] of availableUpcs) {
      if (matchedUpcs.has(upc)) continue;
      
      const score = calculateScore(invoiceName, product.name);
      if (score >= 0.30 && (!best || score > best.score)) {
        best = { upc, name: invoiceName, score };
      }
    }
    
    if (best) {
      matches.push({
        id: product.id,
        name: product.name,
        brand: product.brand || '',
        upc: best.upc,
        invoiceName: best.name,
        score: best.score
      });
      matchedUpcs.add(best.upc);
    }
  }
  
  console.log(`Found ${matches.length} matches at 30%+ threshold`);
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  // Apply matches with 35%+ confidence
  const toApply = matches.filter(m => m.score >= 0.35);
  console.log(`Applying ${toApply.length} matches with 35%+ confidence...\n`);
  
  let applied = 0;
  for (const match of toApply) {
    await db.update(supplies)
      .set({ sku: match.upc })
      .where(eq(supplies.id, match.id));
    applied++;
  }
  
  console.log(`Applied ${applied} UPC matches`);
  
  // Final stats
  const stats = await db.select({
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(case when sku is not null and sku != '' then 1 end)`
  }).from(supplies);
  
  const coverage = (stats[0].withSku / stats[0].total * 100).toFixed(2);
  console.log(`\n=== Final Coverage ===`);
  console.log(`Products with SKU: ${stats[0].withSku}/${stats[0].total} (${coverage}%)`);
  
  // Top brands still missing
  const brandStats = await db.select({
    brand: supplies.brand,
    total: sql<number>`count(*)`,
    missing: sql<number>`count(case when sku is null or sku = '' then 1 end)`
  })
  .from(supplies)
  .groupBy(supplies.brand)
  .having(sql`count(case when sku is null or sku = '' then 1 end) > 0`)
  .orderBy(sql`count(case when sku is null or sku = '' then 1 end) desc`);
  
  console.log('\nBrands still needing SKUs:');
  for (const stat of brandStats.slice(0, 15)) {
    if (stat.brand) {
      const pct = ((stat.total - stat.missing) / stat.total * 100).toFixed(0);
      console.log(`  ${stat.brand}: ${stat.missing} missing (${pct}% coverage)`);
    }
  }
}

main().catch(console.error);
