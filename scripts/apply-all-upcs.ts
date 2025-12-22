import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

console.log('=== RESETTING ALL SKUs ===');

async function main() {
  await db.update(supplies).set({ sku: null });
  console.log('All SKUs reset to null');
  
  const allMaybe: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
  const goodMaybe = allMaybe.slice(0, 3171);
  console.log(`\nGood Maybe Inventory: ${goodMaybe.length} entries`);
  
  const master: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
  const googleSheet = master.filter(e => e.source === 'google_sheet');
  const pdfInvoices = master.filter(e => e.source.includes('.txt'));
  console.log(`Google Sheet: ${googleSheet.length} entries`);
  console.log(`PDF Invoices: ${pdfInvoices.length} entries`);
  
  function normalize(text: string): string {
    return text.toLowerCase()
      .replace(/[™®©'"#]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }
  
  const upcMap = new Map<string, string>();
  
  for (const entry of goodMaybe) {
    const norm = normalize(entry.name);
    if (norm && !upcMap.has(norm)) {
      upcMap.set(norm, entry.upc);
    }
  }
  console.log(`After Maybe: ${upcMap.size} unique names`);
  
  for (const entry of googleSheet) {
    const norm = normalize(entry.name);
    if (norm && !upcMap.has(norm)) {
      upcMap.set(norm, entry.upc);
    }
  }
  console.log(`After Google Sheet: ${upcMap.size} unique names`);
  
  for (const entry of pdfInvoices) {
    const norm = normalize(entry.name);
    if (norm && !upcMap.has(norm)) {
      upcMap.set(norm, entry.upc);
    }
  }
  console.log(`After PDF Invoices: ${upcMap.size} unique names`);
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name
  }).from(supplies);
  
  console.log(`\nTotal products: ${products.length}`);
  
  let matched = 0;
  for (const product of products) {
    const norm = normalize(product.name);
    const upc = upcMap.get(norm);
    if (upc) {
      await db.update(supplies)
        .set({ sku: upc })
        .where(eq(supplies.id, product.id));
      matched++;
    }
  }
  
  console.log(`\nExact name matches: ${matched}`);
  
  const afterExact = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  let withSku = afterExact.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`Coverage: ${withSku}/${afterExact.length} (${((withSku / afterExact.length) * 100).toFixed(1)}%)`);
  
  console.log('\n=== TOKEN MATCHING FOR REMAINING ===');
  
  const allSources = [...goodMaybe, ...googleSheet, ...pdfInvoices];
  
  function tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[™®©'"#]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }
  
  const remaining = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku
  }).from(supplies);
  
  const noSku = remaining.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Products still without SKU: ${noSku.length}`);
  
  let tokenMatched = 0;
  for (const product of noSku) {
    const productTokens = tokenize(product.name);
    if (productTokens.length < 2) continue;
    
    let bestMatch: UPCEntry | null = null;
    let bestScore = 0;
    
    for (const entry of allSources) {
      const entryTokens = tokenize(entry.name);
      if (entryTokens.length < 2) continue;
      
      let matches = 0;
      for (const pt of productTokens) {
        for (const et of entryTokens) {
          if (pt === et || (pt.length > 3 && et.includes(pt)) || (et.length > 3 && pt.includes(et))) {
            matches++;
            break;
          }
        }
      }
      
      const score = matches / Math.max(productTokens.length, entryTokens.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }
    
    if (bestMatch && bestScore >= 0.6) {
      await db.update(supplies)
        .set({ sku: bestMatch.upc })
        .where(eq(supplies.id, product.id));
      tokenMatched++;
    }
  }
  
  console.log(`Token matches (60%+): ${tokenMatched}`);
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\n=== FINAL: ${withSku}/${final.length} (${((withSku / final.length) * 100).toFixed(1)}%) ===`);
}

main().catch(console.error);
