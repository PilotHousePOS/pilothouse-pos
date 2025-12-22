import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

const allMaybe: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
const goodMaybe = allMaybe.slice(0, 3171);
console.log(`Good Maybe entries: ${goodMaybe.length}`);

const master: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
const googleSheet = master.filter(e => e.source === 'google_sheet');
const pdfInvoices = master.filter(e => e.source.includes('.txt'));
console.log(`Google Sheet: ${googleSheet.length}`);
console.log(`PDF Invoices: ${pdfInvoices.length}`);

const cleanSources = [...goodMaybe, ...googleSheet, ...pdfInvoices];
console.log(`Total clean sources: ${cleanSources.length}`);

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[™®©'"]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function tokenize(text: string): Set<string> {
  const tokens = text.toLowerCase()
    .replace(/[™®©'"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
  return new Set(tokens);
}

const upcByNorm = new Map<string, UPCEntry>();
for (const entry of cleanSources) {
  const norm = normalize(entry.name);
  if (!upcByNorm.has(norm)) {
    upcByNorm.set(norm, entry);
  }
}
console.log(`Unique normalized names: ${upcByNorm.size}`);

async function main() {
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
    brand: supplies.brand
  }).from(supplies);
  
  console.log(`\nTotal products: ${products.length}`);
  
  const noSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Without SKU: ${noSku.length}`);
  
  const exactMatches: { id: number; upc: string; dbName: string; srcName: string }[] = [];
  
  for (const product of noSku) {
    const norm = normalize(product.name);
    const entry = upcByNorm.get(norm);
    if (entry) {
      exactMatches.push({
        id: product.id,
        upc: entry.upc,
        dbName: product.name,
        srcName: entry.name
      });
    }
  }
  
  console.log(`\nExact normalized matches: ${exactMatches.length}`);
  
  if (exactMatches.length > 0) {
    console.log('\nApplying exact matches...');
    for (const m of exactMatches) {
      await db.update(supplies)
        .set({ sku: m.upc })
        .where(eq(supplies.id, m.id));
    }
    console.log(`Applied ${exactMatches.length} exact matches`);
  }
  
  let final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  let withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\nAfter exact: ${withSku}/${final.length} (${((withSku / final.length) * 100).toFixed(1)}%)`);
  
  const stillNoSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku
  }).from(supplies);
  
  const remaining = stillNoSku.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`\nRemaining without SKU: ${remaining.length}`);
  
  const tokenMatches: { id: number; upc: string; dbName: string; srcName: string; score: number }[] = [];
  
  for (const product of remaining) {
    const productTokens = tokenize(product.name);
    if (productTokens.size < 2) continue;
    
    let bestMatch: UPCEntry | null = null;
    let bestScore = 0;
    
    for (const entry of cleanSources) {
      const entryTokens = tokenize(entry.name);
      if (entryTokens.size < 2) continue;
      
      let matches = 0;
      for (const t of productTokens) {
        if (entryTokens.has(t)) matches++;
      }
      
      const score = matches / Math.max(productTokens.size, entryTokens.size);
      
      if (score > bestScore && score >= 0.7) {
        bestScore = score;
        bestMatch = entry;
      }
    }
    
    if (bestMatch && bestScore >= 0.7) {
      tokenMatches.push({
        id: product.id,
        upc: bestMatch.upc,
        dbName: product.name,
        srcName: bestMatch.name,
        score: bestScore
      });
    }
  }
  
  console.log(`\nToken matches (70%+ overlap): ${tokenMatches.length}`);
  
  tokenMatches.sort((a, b) => b.score - a.score);
  console.log('\nTop 20 token matches:');
  for (const m of tokenMatches.slice(0, 20)) {
    console.log(`  [${(m.score * 100).toFixed(0)}%] "${m.dbName}" => "${m.srcName}"`);
  }
  
  if (tokenMatches.length > 0) {
    console.log('\nApplying token matches...');
    for (const m of tokenMatches) {
      await db.update(supplies)
        .set({ sku: m.upc })
        .where(eq(supplies.id, m.id));
    }
    console.log(`Applied ${tokenMatches.length} token matches`);
  }
  
  final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\n=== FINAL: ${withSku}/${final.length} (${((withSku / final.length) * 100).toFixed(1)}%) ===`);
}

main().catch(console.error);
