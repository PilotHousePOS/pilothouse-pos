import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, sql, isNull } from 'drizzle-orm';

const brandAbbreviations: Record<string, string[]> = {
  'a & e': ['ae', 'a&e', 'ande'],
  'prevue': ['prev'],
};

const wordAbbreviations: Record<string, string[]> = {
  'small': ['sm', 'sml'],
  'medium': ['md', 'med'],
  'large': ['lg', 'lrg'],
};

function normalizeText(text: string): string {
  let t = text.toLowerCase();
  t = t.replace(/(\d+\.?\d*)\s*(?:lb|lbs|#|pound|pounds|oz|ounce|ounces)/gi, '$1');
  t = t.replace(/[^a-z0-9\s]/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function expandAbbreviations(text: string): string {
  let expanded = normalizeText(text);
  for (const [full, abbrevs] of Object.entries(brandAbbreviations)) {
    for (const abbr of abbrevs) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  for (const [full, abbrevs] of Object.entries(wordAbbreviations)) {
    for (const abbr of abbrevs) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  return expanded.replace(/\s+/g, ' ').trim();
}

function getWords(text: string): Set<string> {
  return new Set(normalizeText(text).split(' ').filter(w => w.length > 1));
}

function calculateMatchScore(sourceExpanded: string, dbExpanded: string): number {
  const sourceWords = getWords(sourceExpanded);
  const dbWords = getWords(dbExpanded);
  if (sourceWords.size === 0 || dbWords.size === 0) return 0;
  let matchCount = 0;
  for (const word of sourceWords) {
    if (dbWords.has(word)) matchCount++;
  }
  const precision = matchCount / sourceWords.size;
  const recall = matchCount / dbWords.size;
  if (precision + recall === 0) return 0;
  return 2 * (precision * recall) / (precision + recall);
}

async function main() {
  const newUpcs = JSON.parse(fs.readFileSync('.local/state/memory/new_pdf_upcs.json', 'utf-8'));
  console.log(`Loaded ${newUpcs.length} new UPCs from PDF`);
  
  // Get unmatched products
  const unmatchedProducts = await db.select({ id: supplies.id, name: supplies.name })
    .from(supplies).where(isNull(supplies.sku));
  console.log(`Found ${unmatchedProducts.length} unmatched products`);
  
  const products = unmatchedProducts.map(p => ({
    id: p.id,
    name: p.name,
    expandedName: expandAbbreviations(p.name)
  }));
  
  // Find matches
  const matches: {upc: string, productId: number, score: number, srcName: string, dbName: string}[] = [];
  const usedProductIds = new Set<number>();
  const MIN_SCORE = 0.3;
  
  for (const source of newUpcs) {
    const srcExpanded = expandAbbreviations(source.name);
    let bestMatch: {productId: number, productName: string, score: number} | null = null;
    
    for (const product of products) {
      if (usedProductIds.has(product.id)) continue;
      const score = calculateMatchScore(srcExpanded, product.expandedName);
      if (score >= MIN_SCORE && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { productId: product.id, productName: product.name, score };
      }
    }
    
    if (bestMatch) {
      matches.push({ 
        upc: source.upc, 
        productId: bestMatch.productId, 
        score: bestMatch.score,
        srcName: source.name,
        dbName: bestMatch.productName
      });
      usedProductIds.add(bestMatch.productId);
    }
  }
  
  console.log(`Found ${matches.length} new matches`);
  
  // Apply matches
  if (matches.length > 0) {
    for (const m of matches) {
      await db.update(supplies).set({ sku: m.upc }).where(eq(supplies.id, m.productId));
    }
    console.log('Applied matches');
    
    // Show samples
    console.log('\nSample matches:');
    for (const m of matches.slice(0, 10)) {
      console.log(`  ${m.upc}: "${m.srcName}" -> "${m.dbName}" (${(m.score * 100).toFixed(0)}%)`);
    }
  }
  
  // Final stats
  const result = await db.execute(sql`SELECT COUNT(*) as total, COUNT(sku) as with_sku FROM supplies`);
  console.log('\nFinal:', result.rows[0]);
  
  process.exit(0);
}

main().catch(console.error);
