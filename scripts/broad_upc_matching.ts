import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, and, isNull, or, sql, inArray } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcEntry {
  upc: string;
  productName: string;
  source?: string;
  brand?: string;
}

const BRAND_PREFIX_MAP: Record<string, string[]> = {
  'Fluval': ['015561'],
  'Exo Terra': ['015561'],
  'Marina': ['015561'],
  'Aqueon': ['015905'],
  'API': ['317163'],
  'Hikari': ['042055'],
  'Tetra': ['046798'],
  'GloFish': ['046798'],
  'Kaytee': ['071859'],
  'Kong': ['035585'],
  'Zilla': ['096316'],
  'Zoo Med': ['097612'],
  'Fluker\'s': ['091197'],
  'Coastal': ['076484', '744845'],
  'Li\'l Pals': ['744845', '076484'],
  'Fromm': ['660204'],
  'Science Diet': ['797801'],
  'Nutrisource': ['066380'],
  'Blue Buffalo': ['842982'],
  'Catit': ['879213'],
  'RedBarn': ['785184'],
  'Petmate': ['073893'],
  'Prevue': ['073725'],
  'Penn-Plax': ['030172'],
  'Marineland': ['047431'],
  'Nylabone': ['018214'],
  'TropiClean': ['645095'],
  'Spot': ['077234'],
  'Titan': ['076158'],
};

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeyWords(name: string): string[] {
  const normalized = normalizeString(name);
  const stopWords = ['the', 'a', 'an', 'and', 'or', 'for', 'of', 'to', 'in', 'with', 'size', 'color', 'pack', 'pk', 'oz', 'lb', 'lbs', 'inch', 'inches'];
  return normalized.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
}

function calculateMatchScore(invoiceName: string, dbName: string, invoiceBrand?: string, dbBrand?: string): number {
  const invoiceWords = extractKeyWords(invoiceName);
  const dbWords = extractKeyWords(dbName);
  
  if (invoiceWords.length === 0 || dbWords.length === 0) return 0;
  
  let matchingWords = 0;
  for (const word of invoiceWords) {
    if (dbWords.some(dbWord => 
      dbWord === word || 
      (word.length > 4 && dbWord.includes(word)) || 
      (dbWord.length > 4 && word.includes(dbWord))
    )) {
      matchingWords++;
    }
  }
  
  let score = matchingWords / Math.max(invoiceWords.length, dbWords.length);
  
  if (invoiceBrand && dbBrand && normalizeString(invoiceBrand) === normalizeString(dbBrand)) {
    score += 0.15;
  }
  
  return Math.min(score, 1.0);
}

async function main() {
  console.log('Loading all UPC data...');
  
  const allUpcs: UpcEntry[] = [];
  
  // Clean UPCs is an object {upc: productName}
  const cleanUpcsObj = JSON.parse(fs.readFileSync('/tmp/clean_upcs.json', 'utf-8'));
  const cleanUpcs = Object.entries(cleanUpcsObj).map(([upc, name]) => ({ upc, productName: name as string }));
  console.log(`Central Pet UPCs: ${cleanUpcs.length}`);
  allUpcs.push(...cleanUpcs);
  
  // Phillips UPCs - check if array or object
  const phillipsData = JSON.parse(fs.readFileSync('/tmp/phillips_upcs_v3.json', 'utf-8'));
  const phillipsUpcs = Array.isArray(phillipsData) 
    ? phillipsData 
    : Object.entries(phillipsData).map(([upc, name]) => ({ upc, productName: name as string }));
  console.log(`Phillips Pet UPCs: ${phillipsUpcs.length}`);
  allUpcs.push(...phillipsUpcs);
  
  // Penn-Plax UPCs should be an array
  const pennplaxUpcs = JSON.parse(fs.readFileSync('/tmp/pennplax_upcs.json', 'utf-8'));
  console.log(`Penn-Plax UPCs: ${pennplaxUpcs.length}`);
  allUpcs.push(...pennplaxUpcs);
  
  const upcMap = new Map<string, UpcEntry>();
  for (const entry of allUpcs) {
    if (!upcMap.has(entry.upc)) {
      upcMap.set(entry.upc, entry);
    }
  }
  console.log(`\nTotal unique UPCs: ${upcMap.size}`);
  
  console.log('\nFetching products without SKU...');
  const products = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`Found ${products.length} products without SKU`);
  
  const existingSkus = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(and(
      sql`${supplies.sku} IS NOT NULL`,
      sql`${supplies.sku} != ''`
    ));
  
  const usedUpcs = new Set(existingSkus.map(s => s.sku).filter(s => s));
  console.log(`Already used UPCs: ${usedUpcs.size}`);
  
  const upcEntries = Array.from(upcMap.values()).filter(e => !usedUpcs.has(e.upc));
  console.log(`Available UPCs for matching: ${upcEntries.length}`);
  
  const matches: Array<{productId: number; productName: string; productBrand: string; upc: string; invoiceName: string; score: number}> = [];
  
  for (const product of products) {
    const brand = product.brand || '';
    const brandPrefixes = BRAND_PREFIX_MAP[brand] || [];
    
    const relevantUpcs = brandPrefixes.length > 0 
      ? upcEntries.filter(e => brandPrefixes.some(prefix => e.upc.startsWith(prefix)))
      : upcEntries;
    
    let bestMatch: UpcEntry | null = null;
    let bestScore = 0;
    
    for (const upcEntry of relevantUpcs) {
      if (usedUpcs.has(upcEntry.upc)) continue;
      
      const score = calculateMatchScore(upcEntry.productName, product.name, upcEntry.brand, brand);
      
      if (score > bestScore && score >= 0.30) {
        bestScore = score;
        bestMatch = upcEntry;
      }
    }
    
    if (bestMatch && bestScore >= 0.30) {
      matches.push({
        productId: product.id,
        productName: product.name,
        productBrand: brand,
        upc: bestMatch.upc,
        invoiceName: bestMatch.productName,
        score: bestScore
      });
      usedUpcs.add(bestMatch.upc);
    }
  }
  
  console.log(`\nFound ${matches.length} matches at 30%+ threshold`);
  
  matches.sort((a, b) => b.score - a.score);
  
  console.log('\nTop 30 matches:');
  for (const match of matches.slice(0, 30)) {
    console.log(`  [${(match.score * 100).toFixed(0)}%] [${match.productBrand}] "${match.productName}" -> "${match.invoiceName}" (${match.upc})`);
  }
  
  const highConfidence = matches.filter(m => m.score >= 0.40);
  console.log(`\n\nApplying ${highConfidence.length} high-confidence matches (40%+) to database...`);
  
  let updated = 0;
  for (const match of highConfidence) {
    await db.update(supplies)
      .set({ sku: match.upc })
      .where(eq(supplies.id, match.productId));
    updated++;
  }
  
  console.log(`Updated ${updated} products with UPCs`);
  
  const total = await db.select({ 
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(case when sku is not null and sku != '' then 1 end)`
  }).from(supplies);
  
  const coverage = (total[0].withSku / total[0].total * 100).toFixed(2);
  console.log(`\nOverall coverage: ${total[0].withSku}/${total[0].total} (${coverage}%)`);
  
  const brandStats = await db.select({
    brand: supplies.brand,
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(case when sku is not null and sku != '' then 1 end)`
  })
  .from(supplies)
  .groupBy(supplies.brand)
  .orderBy(sql`count(*) desc`);
  
  console.log('\nTop brands still needing SKUs:');
  for (const stat of brandStats.slice(0, 20)) {
    const missing = stat.total - stat.withSku;
    if (missing > 0 && stat.brand) {
      console.log(`  ${stat.brand}: ${missing}/${stat.total} missing (${((stat.withSku/stat.total)*100).toFixed(0)}% coverage)`);
    }
  }
}

main().catch(console.error);
