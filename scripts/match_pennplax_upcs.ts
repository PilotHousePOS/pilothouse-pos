import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, and, isNull, or, sql } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcEntry {
  upc: string;
  productName: string;
  source: string;
  orderId: string;
}

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
  const stopWords = ['the', 'a', 'an', 'and', 'or', 'for', 'of', 'to', 'in', 'with', 'size', 'color', 'pack', 'pk'];
  return normalized.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
}

function calculateMatchScore(invoiceName: string, dbName: string): number {
  const invoiceWords = extractKeyWords(invoiceName);
  const dbWords = extractKeyWords(dbName);
  
  if (invoiceWords.length === 0 || dbWords.length === 0) return 0;
  
  let matchingWords = 0;
  for (const word of invoiceWords) {
    if (dbWords.some(dbWord => dbWord.includes(word) || word.includes(dbWord))) {
      matchingWords++;
    }
  }
  
  const score = matchingWords / Math.max(invoiceWords.length, dbWords.length);
  return score;
}

async function main() {
  console.log('Loading Penn-Plax UPCs...');
  const upcsData: UpcEntry[] = JSON.parse(fs.readFileSync('/tmp/pennplax_upcs.json', 'utf-8'));
  console.log(`Loaded ${upcsData.length} UPC entries`);
  
  console.log('\nFetching Penn-Plax products without SKU...');
  const products = await db.select()
    .from(supplies)
    .where(
      and(
        eq(supplies.brand, 'Penn-Plax'),
        or(isNull(supplies.sku), eq(supplies.sku, ''))
      )
    );
  
  console.log(`Found ${products.length} Penn-Plax products without SKU`);
  
  const matches: Array<{productId: number; productName: string; upc: string; invoiceName: string; score: number}> = [];
  const usedUpcs = new Set<string>();
  
  for (const product of products) {
    let bestMatch: UpcEntry | null = null;
    let bestScore = 0;
    
    for (const upcEntry of upcsData) {
      if (usedUpcs.has(upcEntry.upc)) continue;
      
      const score = calculateMatchScore(upcEntry.productName, product.name);
      
      if (score > bestScore && score >= 0.35) {
        bestScore = score;
        bestMatch = upcEntry;
      }
    }
    
    if (bestMatch && bestScore >= 0.35) {
      matches.push({
        productId: product.id,
        productName: product.name,
        upc: bestMatch.upc,
        invoiceName: bestMatch.productName,
        score: bestScore
      });
      usedUpcs.add(bestMatch.upc);
    }
  }
  
  console.log(`\nFound ${matches.length} matches at 35%+ threshold`);
  
  matches.sort((a, b) => b.score - a.score);
  
  console.log('\nTop 20 matches:');
  for (const match of matches.slice(0, 20)) {
    console.log(`  [${(match.score * 100).toFixed(0)}%] "${match.productName}" -> "${match.invoiceName}" (${match.upc})`);
  }
  
  console.log('\n\nApplying matches to database...');
  let updated = 0;
  
  for (const match of matches) {
    await db.update(supplies)
      .set({ sku: match.upc })
      .where(eq(supplies.id, match.productId));
    updated++;
  }
  
  console.log(`\nUpdated ${updated} Penn-Plax products with UPCs`);
  
  const remaining = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(
      and(
        eq(supplies.brand, 'Penn-Plax'),
        or(isNull(supplies.sku), eq(supplies.sku, ''))
      )
    );
  
  console.log(`Penn-Plax products still without SKU: ${remaining[0].count}`);
  
  const total = await db.select({ 
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(case when sku is not null and sku != '' then 1 end)`
  }).from(supplies);
  
  const coverage = (total[0].withSku / total[0].total * 100).toFixed(2);
  console.log(`\nOverall coverage: ${total[0].withSku}/${total[0].total} (${coverage}%)`);
}

main().catch(console.error);
