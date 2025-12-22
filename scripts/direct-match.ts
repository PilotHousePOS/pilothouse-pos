import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';
import * as fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[™®©'"#]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function main() {
  console.log('=== RESETTING ALL SKUs ===\n');
  await db.update(supplies).set({ sku: null });
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name
  }).from(supplies);
  
  console.log(`Total products in database: ${products.length}`);
  
  const productMap = new Map<string, number>();
  for (const p of products) {
    const norm = normalize(p.name);
    if (norm && !productMap.has(norm)) {
      productMap.set(norm, p.id);
    }
  }
  console.log(`Unique normalized product names: ${productMap.size}\n`);
  
  console.log('=== STEP 1: Apply Maybe Inventory (first 3171 good entries) ===');
  const allMaybe: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
  const goodMaybe = allMaybe.slice(0, 3171);
  
  let maybeMatched = 0;
  for (const entry of goodMaybe) {
    const norm = normalize(entry.name);
    const productId = productMap.get(norm);
    if (productId) {
      await db.update(supplies)
        .set({ sku: entry.upc })
        .where(eq(supplies.id, productId));
      maybeMatched++;
      productMap.delete(norm);
    }
  }
  console.log(`Maybe Inventory exact matches: ${maybeMatched}`);
  
  let current = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  let withSku = current.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`Coverage: ${withSku}/${current.length} (${((withSku / current.length) * 100).toFixed(1)}%)\n`);
  
  console.log('=== STEP 2: Apply Google Sheet (1412 entries) ===');
  const master: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
  const googleSheet = master.filter(e => e.source === 'google_sheet');
  
  let googleMatched = 0;
  for (const entry of googleSheet) {
    const norm = normalize(entry.name);
    const productId = productMap.get(norm);
    if (productId) {
      await db.update(supplies)
        .set({ sku: entry.upc })
        .where(eq(supplies.id, productId));
      googleMatched++;
      productMap.delete(norm);
    }
  }
  console.log(`Google Sheet exact matches: ${googleMatched}`);
  
  current = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  withSku = current.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`Coverage: ${withSku}/${current.length} (${((withSku / current.length) * 100).toFixed(1)}%)\n`);
  
  console.log('=== STEP 3: Apply PDF Invoices (2639 entries) ===');
  const pdfInvoices = master.filter(e => e.source.includes('.txt'));
  
  let pdfMatched = 0;
  for (const entry of pdfInvoices) {
    const norm = normalize(entry.name);
    const productId = productMap.get(norm);
    if (productId) {
      await db.update(supplies)
        .set({ sku: entry.upc })
        .where(eq(supplies.id, productId));
      pdfMatched++;
      productMap.delete(norm);
    }
  }
  console.log(`PDF Invoice exact matches: ${pdfMatched}`);
  
  current = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  withSku = current.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`Coverage: ${withSku}/${current.length} (${((withSku / current.length) * 100).toFixed(1)}%)\n`);
  
  console.log('=== REMAINING UNMATCHED ===');
  console.log(`Products still without UPC: ${productMap.size}`);
  
  const unmatched = [...productMap.keys()].slice(0, 50);
  console.log('\nSample unmatched products:');
  for (const name of unmatched) {
    console.log(`  - ${name}`);
  }
  
  console.log(`\n=== FINAL: ${withSku}/${current.length} (${((withSku / current.length) * 100).toFixed(1)}%) ===`);
}

main().catch(console.error);
