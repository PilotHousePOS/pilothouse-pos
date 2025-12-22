import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

function normalizeText(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSignificantWords(text: string): Set<string> {
  const normalized = normalizeText(text);
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'by']);
  return new Set(
    normalized.split(' ')
      .filter(w => w.length > 2 && !stopWords.has(w))
  );
}

function calculateSimilarity(productName: string, masterName: string): number {
  const productWords = getSignificantWords(productName);
  const masterWords = getSignificantWords(masterName);
  
  if (productWords.size === 0 || masterWords.size === 0) return 0;
  
  let matches = 0;
  for (const word of productWords) {
    for (const mWord of masterWords) {
      if (word === mWord || word.includes(mWord) || mWord.includes(word)) {
        matches++;
        break;
      }
    }
  }
  
  return matches / Math.max(productWords.size, masterWords.size);
}

async function main() {
  console.log('=== CLEANING DUPLICATE UPCs ===\n');

  const masterPath = 'scripts/master_verified_upcs.json';
  const masterUPCs: UPCEntry[] = JSON.parse(fs.readFileSync(masterPath, 'utf-8'));
  console.log(`Master verified UPCs: ${masterUPCs.length}`);

  const upcLookup = new Map<string, UPCEntry>();
  for (const entry of masterUPCs) {
    upcLookup.set(entry.upc, entry);
  }

  const allProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
    brand: supplies.brand,
  }).from(supplies);

  console.log(`Total products: ${allProducts.length}`);
  
  const withUPC = allProducts.filter(p => p.sku && p.sku.length >= 10);
  console.log(`Products with UPC: ${withUPC.length}`);

  const upcToProducts = new Map<string, typeof withUPC>();
  for (const product of withUPC) {
    const cleanUPC = product.sku!.replace(/[^0-9]/g, '').padStart(12, '0');
    if (!upcToProducts.has(cleanUPC)) {
      upcToProducts.set(cleanUPC, []);
    }
    upcToProducts.get(cleanUPC)!.push(product);
  }

  let duplicateCount = 0;
  const toClear: number[] = [];
  const decisions: Array<{upc: string, kept: string, cleared: string[]}> = [];

  for (const [upc, products] of upcToProducts) {
    if (products.length <= 1) continue;
    
    const brands = new Set(products.map(p => p.brand?.toLowerCase().trim()));
    if (brands.size === 1) continue;
    
    duplicateCount++;
    
    const masterEntry = upcLookup.get(upc);
    
    if (masterEntry) {
      let bestMatch = products[0];
      let bestScore = 0;
      
      for (const product of products) {
        const score = calculateSimilarity(product.name, masterEntry.name);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = product;
        }
      }
      
      for (const product of products) {
        if (product.id !== bestMatch.id) {
          toClear.push(product.id);
        }
      }
      
      if (decisions.length < 10) {
        decisions.push({
          upc,
          kept: `[${bestMatch.brand}] ${bestMatch.name} (score: ${bestScore.toFixed(2)})`,
          cleared: products.filter(p => p.id !== bestMatch.id).map(p => `[${p.brand}] ${p.name}`)
        });
      }
    } else {
      for (const product of products.slice(1)) {
        toClear.push(product.id);
      }
    }
  }

  console.log(`\nDuplicate UPCs (different brands): ${duplicateCount}`);
  console.log(`Products to clear UPC from: ${toClear.length}`);
  
  console.log('\nSample decisions:');
  for (const d of decisions) {
    console.log(`  UPC ${d.upc}:`);
    console.log(`    KEEP: ${d.kept}`);
    d.cleared.forEach(c => console.log(`    CLEAR: ${c}`));
  }

  if (toClear.length > 0) {
    console.log(`\nClearing UPCs from ${toClear.length} products...`);
    
    let cleared = 0;
    for (const id of toClear) {
      await db.update(supplies)
        .set({ sku: null })
        .where(eq(supplies.id, id));
      cleared++;
      if (cleared % 100 === 0) {
        console.log(`  Cleared ${cleared}/${toClear.length}`);
      }
    }
    
    console.log(`\nDone! Cleared UPCs from ${cleared} products.`);
  }

  const remainingWithUPC = await db.select({ id: supplies.id })
    .from(supplies)
    .where(eq(supplies.sku, null));
  
  console.log(`\nProducts now without UPC: ${remainingWithUPC.length + 886}`);
}

main().catch(console.error);
