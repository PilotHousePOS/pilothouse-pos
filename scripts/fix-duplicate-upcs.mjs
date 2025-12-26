#!/usr/bin/env node
/**
 * Fix Duplicate UPCs - Clear UPCs from products where they don't belong
 * 
 * Uses brand-prefix validation and attribute matching to determine
 * which product should keep the UPC and which should have it cleared.
 */

import fs from 'fs';
import { extractAttributes } from './upc-learning-system.mjs';

// Load brand prefixes
const brandPrefixes = JSON.parse(fs.readFileSync('scripts/brand-upc-prefixes.json', 'utf8'));

// Load production export
const exportPath = process.argv[2] || 'attached_assets/supplies-export-1766779071052_1766779081946.json';
const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
const products = exportData.data.supplies;

// Group products by UPC
const upcToProducts = new Map();
for (const product of products) {
  if (product.sku && product.sku.length >= 10) {
    if (!upcToProducts.has(product.sku)) {
      upcToProducts.set(product.sku, []);
    }
    upcToProducts.get(product.sku).push(product);
  }
}

// Get expected prefix for a brand
function getExpectedPrefix(brand) {
  if (!brand) return null;
  const prefix = brandPrefixes.prefixes[brand];
  if (Array.isArray(prefix)) return prefix;
  if (prefix) return [prefix];
  return null;
}

// Score how well a UPC matches a product (higher = better match)
function scoreMatch(product, upc) {
  let score = 0;
  const prefix = upc.substring(0, 6);
  const expectedPrefixes = getExpectedPrefix(product.brand);
  
  // Brand prefix match is critical
  if (expectedPrefixes && expectedPrefixes.includes(prefix)) {
    score += 100;
  } else if (expectedPrefixes) {
    // Wrong prefix = likely wrong product
    score -= 50;
  }
  
  // Extract attributes
  const attrs = extractAttributes(product.name, product.description);
  
  // Product type keywords in name suggest correct match
  if (attrs.productTypes && attrs.productTypes.length > 0) {
    score += attrs.productTypes.length * 5;
  }
  
  // Specific species match
  if (attrs.species && attrs.species.length > 0) {
    // If product mentions reptile/turtle/fish but UPC prefix is reptile brand = good
    const reptilePrefixes = ['097612', '015561', '096316', '091197', '759834'];
    const aquaticPrefixes = ['046798', '015905', '042055', '317163', '000116'];
    
    const hasReptileSpecies = attrs.species.some(s => 
      ['reptile', 'turtle', 'snake', 'gecko', 'tortoise', 'bearded dragon', 'hermit crab', 'frog'].includes(s)
    );
    const hasAquaticSpecies = attrs.species.some(s => 
      ['fish', 'aquatic', 'betta', 'goldfish', 'tropical', 'marine'].includes(s)
    );
    
    if (hasReptileSpecies && reptilePrefixes.includes(prefix)) score += 30;
    if (hasAquaticSpecies && aquaticPrefixes.includes(prefix)) score += 30;
  }
  
  return score;
}

// Find duplicates and determine which product should keep the UPC
const clearCommands = [];
const keepDecisions = [];

for (const [upc, prods] of upcToProducts.entries()) {
  if (prods.length > 1) {
    // Score each product
    const scored = prods.map(p => ({
      product: p,
      score: scoreMatch(p, upc)
    })).sort((a, b) => b.score - a.score);
    
    // Keep UPC on highest scoring product, clear from others
    const keeper = scored[0];
    const toClear = scored.slice(1);
    
    keepDecisions.push({
      upc,
      keeper: { id: keeper.product.id, name: keeper.product.name, brand: keeper.product.brand, score: keeper.score },
      cleared: toClear.map(t => ({ id: t.product.id, name: t.product.name, brand: t.product.brand, score: t.score }))
    });
    
    for (const item of toClear) {
      // Only clear if score is significantly lower or negative
      if (item.score < keeper.score - 20 || item.score < 0) {
        clearCommands.push({
          id: item.product.id,
          name: item.product.name,
          brand: item.product.brand,
          upc: upc,
          reason: `Score ${item.score} vs keeper score ${keeper.score}`
        });
      }
    }
  }
}

console.log('=== DUPLICATE UPC RESOLUTION ===\n');
console.log(`Found ${keepDecisions.length} duplicate UPCs\n`);

for (const decision of keepDecisions) {
  console.log(`UPC ${decision.upc}:`);
  console.log(`  KEEP: ID ${decision.keeper.id} - ${decision.keeper.brand} ${decision.keeper.name} (score: ${decision.keeper.score})`);
  for (const cleared of decision.cleared) {
    console.log(`  CLEAR: ID ${cleared.id} - ${cleared.brand} ${cleared.name} (score: ${cleared.score})`);
  }
  console.log('');
}

// Generate SQL to clear duplicates
console.log('\n=== SQL TO CLEAR DUPLICATE UPCs ===\n');
for (const cmd of clearCommands) {
  console.log(`-- ${cmd.brand} ${cmd.name} (${cmd.reason})`);
  console.log(`UPDATE supplies SET sku = NULL, upc = NULL WHERE id = ${cmd.id};`);
}

// Save decisions for review
fs.writeFileSync('scripts/duplicate-upc-decisions.json', JSON.stringify(keepDecisions, null, 2));
console.log(`\nSaved ${keepDecisions.length} decisions to scripts/duplicate-upc-decisions.json`);
console.log(`Generated ${clearCommands.length} clear commands`);
