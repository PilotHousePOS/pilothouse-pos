import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull, eq, like, ilike } from 'drizzle-orm';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

async function main() {
  console.log('=== UPC AUDIT AND MATCHING ===\n');

  // Load master UPCs
  const masterPath = 'scripts/master_verified_upcs.json';
  const masterUPCs: UPCEntry[] = JSON.parse(fs.readFileSync(masterPath, 'utf-8'));
  console.log(`Master verified UPCs: ${masterUPCs.length}`);

  // Build UPC lookup
  const upcLookup = new Map<string, UPCEntry>();
  for (const entry of masterUPCs) {
    upcLookup.set(entry.upc, entry);
  }

  // Get all products from database
  console.log('\n=== DATABASE STATS ===');
  const allProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
    brand: supplies.brand,
  }).from(supplies);

  console.log(`Total products: ${allProducts.length}`);
  
  const withUPC = allProducts.filter(p => p.sku && p.sku.length >= 10);
  const withoutUPC = allProducts.filter(p => !p.sku || p.sku.length < 10);
  
  console.log(`Products with UPC: ${withUPC.length}`);
  console.log(`Products without UPC: ${withoutUPC.length}`);

  // CHECK 1: Verify existing UPCs are valid (in our master list)
  console.log('\n=== CHECKING EXISTING UPCs ===');
  let validExisting = 0;
  let invalidExisting = 0;
  const invalidProducts: any[] = [];

  for (const product of withUPC) {
    const cleanUPC = product.sku!.replace(/[^0-9]/g, '').padStart(12, '0');
    if (upcLookup.has(cleanUPC)) {
      validExisting++;
    } else {
      invalidExisting++;
      if (invalidExisting <= 10) {
        invalidProducts.push({
          id: product.id,
          name: product.name,
          sku: product.sku
        });
      }
    }
  }

  console.log(`Valid (in master list): ${validExisting}`);
  console.log(`Not in master list: ${invalidExisting}`);
  if (invalidProducts.length > 0) {
    console.log('Sample products with UPCs not in master list:');
    invalidProducts.forEach(p => console.log(`  ${p.sku}: ${p.name}`));
  }

  // CHECK 2: Look for duplicate UPCs in database
  console.log('\n=== CHECKING FOR DUPLICATE UPCs IN DATABASE ===');
  const upcToProducts = new Map<string, any[]>();
  for (const product of withUPC) {
    const cleanUPC = product.sku!.replace(/[^0-9]/g, '').padStart(12, '0');
    if (!upcToProducts.has(cleanUPC)) {
      upcToProducts.set(cleanUPC, []);
    }
    upcToProducts.get(cleanUPC)!.push(product);
  }

  let duplicateUPCs = 0;
  const duplicateDetails: any[] = [];
  for (const [upc, products] of upcToProducts) {
    if (products.length > 1) {
      duplicateUPCs++;
      // Check if these are likely variants (same brand, different size)
      const brands = new Set(products.map(p => p.brand?.toLowerCase()));
      const isVariant = brands.size === 1;
      
      if (!isVariant && duplicateDetails.length < 5) {
        duplicateDetails.push({ upc, products });
      }
    }
  }

  console.log(`UPCs used by multiple products: ${duplicateUPCs}`);
  if (duplicateDetails.length > 0) {
    console.log('Sample non-variant duplicates:');
    for (const d of duplicateDetails) {
      console.log(`  UPC ${d.upc}:`);
      d.products.forEach((p: any) => console.log(`    - [${p.brand}] ${p.name}`));
    }
  }

  // MATCH: Try to match products without UPCs
  console.log('\n=== MATCHING PRODUCTS WITHOUT UPCs ===');
  
  const matches: { productId: number; productName: string; upc: string; upcName: string; score: number }[] = [];
  const unmatched: any[] = [];

  // Token-based matching function
  function getTokens(str: string): Set<string> {
    return new Set(
      str.toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2)
    );
  }

  function matchScore(productName: string, upcName: string): number {
    const prodTokens = getTokens(productName);
    const upcTokens = getTokens(upcName);
    
    if (prodTokens.size === 0 || upcTokens.size === 0) return 0;
    
    let matches = 0;
    for (const token of prodTokens) {
      if (upcTokens.has(token)) matches++;
    }
    
    return matches / Math.max(prodTokens.size, upcTokens.size);
  }

  for (const product of withoutUPC) {
    let bestMatch: UPCEntry | null = null;
    let bestScore = 0;

    for (const upcEntry of masterUPCs) {
      const score = matchScore(product.name, upcEntry.name);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = upcEntry;
      }
    }

    if (bestMatch && bestScore >= 0.5) {
      matches.push({
        productId: product.id,
        productName: product.name,
        upc: bestMatch.upc,
        upcName: bestMatch.name,
        score: bestScore
      });
    } else {
      unmatched.push(product);
    }
  }

  console.log(`Matched: ${matches.length}`);
  console.log(`Unmatched: ${unmatched.length}`);
  
  console.log('\nSample matches:');
  matches.slice(0, 10).forEach(m => {
    console.log(`  [${(m.score * 100).toFixed(0)}%] "${m.productName}" -> ${m.upc} (${m.upcName})`);
  });

  // Save matches for review
  const matchesPath = 'scripts/upc_matches.json';
  fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));
  console.log(`\nSaved ${matches.length} matches to ${matchesPath}`);

  // Save unmatched for review
  const unmatchedPath = 'scripts/unmatched_products.json';
  fs.writeFileSync(unmatchedPath, JSON.stringify(unmatched.map(p => ({
    id: p.id,
    name: p.name,
    brand: p.brand
  })), null, 2));
  console.log(`Saved ${unmatched.length} unmatched to ${unmatchedPath}`);

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total products: ${allProducts.length}`);
  console.log(`Already have UPC: ${withUPC.length} (${(withUPC.length / allProducts.length * 100).toFixed(1)}%)`);
  console.log(`Can match: ${matches.length}`);
  console.log(`Potential coverage after matching: ${withUPC.length + matches.length} (${((withUPC.length + matches.length) / allProducts.length * 100).toFixed(1)}%)`);

  process.exit(0);
}

main().catch(console.error);
