#!/usr/bin/env node
/**
 * Analyze Production Corrections to Learn UPC Matching Patterns
 * 
 * Compares production export with development database to find:
 * 1. UPCs that were moved between products
 * 2. UPCs that were corrected (wrong attributes)
 * 3. Patterns in what attributes caused mismatches
 */

import fs from 'fs';
import { extractAttributes, compareProducts } from './upc-learning-system.mjs';

// Load the production export
const exportPath = process.argv[2] || 'attached_assets/supplies-export-1766779071052_1766779081946.json';

if (!fs.existsSync(exportPath)) {
  console.error(`Export file not found: ${exportPath}`);
  process.exit(1);
}

const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
const products = exportData.data.supplies;

console.log(`Analyzing ${products.length} products from production export\n`);

// Group products by UPC to find duplicates or moves
const upcToProducts = new Map();
for (const product of products) {
  if (product.sku && product.sku.length >= 10) {
    if (!upcToProducts.has(product.sku)) {
      upcToProducts.set(product.sku, []);
    }
    upcToProducts.get(product.sku).push(product);
  }
}

// Find UPCs assigned to multiple products (potential errors)
console.log('=== DUPLICATE UPCs (same UPC on multiple products) ===\n');
let duplicateCount = 0;
for (const [upc, prods] of upcToProducts.entries()) {
  if (prods.length > 1) {
    duplicateCount++;
    console.log(`UPC ${upc}:`);
    for (const p of prods) {
      const attrs = extractAttributes(p.name, p.description);
      console.log(`  - ID ${p.id}: ${p.brand} ${p.name}`);
      console.log(`    Attributes: ${JSON.stringify(attrs)}`);
    }
    
    // Compare the products to understand the difference
    if (prods.length === 2) {
      const comparison = compareProducts(prods[0], prods[1]);
      if (comparison.differences.length > 0) {
        console.log(`    Differences: ${JSON.stringify(comparison.differences)}`);
      }
    }
    console.log('');
  }
}
console.log(`Found ${duplicateCount} UPCs assigned to multiple products\n`);

// Analyze attribute distribution
console.log('=== ATTRIBUTE ANALYSIS ===\n');

const attributeStats = {
  withWeight: 0,
  withSize: 0,
  withWattage: 0,
  withColor: 0,
  withDimension: 0,
  withSpecies: 0,
  withProductType: 0
};

const sizeDistribution = {};
const colorDistribution = {};
const speciesDistribution = {};

for (const product of products) {
  const attrs = extractAttributes(product.name, product.description);
  
  if (attrs.weight) attributeStats.withWeight++;
  if (attrs.size) {
    attributeStats.withSize++;
    sizeDistribution[attrs.size] = (sizeDistribution[attrs.size] || 0) + 1;
  }
  if (attrs.wattage) attributeStats.withWattage++;
  if (attrs.colors) {
    attributeStats.withColor++;
    for (const c of attrs.colors) {
      colorDistribution[c] = (colorDistribution[c] || 0) + 1;
    }
  }
  if (attrs.dimension) attributeStats.withDimension++;
  if (attrs.species) {
    attributeStats.withSpecies++;
    for (const s of attrs.species) {
      speciesDistribution[s] = (speciesDistribution[s] || 0) + 1;
    }
  }
  if (attrs.productTypes) attributeStats.withProductType++;
}

console.log('Attribute coverage:');
console.log(`  Products with weight: ${attributeStats.withWeight} (${(100*attributeStats.withWeight/products.length).toFixed(1)}%)`);
console.log(`  Products with size: ${attributeStats.withSize} (${(100*attributeStats.withSize/products.length).toFixed(1)}%)`);
console.log(`  Products with wattage: ${attributeStats.withWattage} (${(100*attributeStats.withWattage/products.length).toFixed(1)}%)`);
console.log(`  Products with color: ${attributeStats.withColor} (${(100*attributeStats.withColor/products.length).toFixed(1)}%)`);
console.log(`  Products with dimension: ${attributeStats.withDimension} (${(100*attributeStats.withDimension/products.length).toFixed(1)}%)`);
console.log(`  Products with species keywords: ${attributeStats.withSpecies} (${(100*attributeStats.withSpecies/products.length).toFixed(1)}%)`);
console.log(`  Products with product type: ${attributeStats.withProductType} (${(100*attributeStats.withProductType/products.length).toFixed(1)}%)`);

console.log('\nSize distribution:');
Object.entries(sizeDistribution).sort((a, b) => b[1] - a[1]).forEach(([size, count]) => {
  console.log(`  ${size}: ${count}`);
});

console.log('\nTop colors:');
Object.entries(colorDistribution).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([color, count]) => {
  console.log(`  ${color}: ${count}`);
});

console.log('\nSpecies distribution:');
Object.entries(speciesDistribution).sort((a, b) => b[1] - a[1]).forEach(([species, count]) => {
  console.log(`  ${species}: ${count}`);
});

// Find products without UPCs and suggest matches
console.log('\n=== PRODUCTS WITHOUT UPCs ===\n');

const productsWithUPC = products.filter(p => p.sku && p.sku.length >= 10);
const productsWithoutUPC = products.filter(p => !p.sku || p.sku.length < 10);

console.log(`Products with UPC: ${productsWithUPC.length}`);
console.log(`Products without UPC: ${productsWithoutUPC.length}`);

// Group products without UPC by brand
const noUpcByBrand = {};
for (const p of productsWithoutUPC) {
  noUpcByBrand[p.brand] = (noUpcByBrand[p.brand] || 0) + 1;
}

console.log('\nProducts without UPC by brand:');
Object.entries(noUpcByBrand).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([brand, count]) => {
  console.log(`  ${brand}: ${count}`);
});

// Save learned patterns
const learnedPatterns = {
  exportDate: exportData.exportDate,
  totalProducts: products.length,
  withUPC: productsWithUPC.length,
  withoutUPC: productsWithoutUPC.length,
  duplicateUPCs: duplicateCount,
  attributeStats,
  sizeDistribution,
  colorDistribution: Object.fromEntries(Object.entries(colorDistribution).sort((a, b) => b[1] - a[1]).slice(0, 20)),
  speciesDistribution,
  noUpcByBrand
};

fs.writeFileSync('scripts/learned-patterns.json', JSON.stringify(learnedPatterns, null, 2));
console.log('\nSaved learned patterns to scripts/learned-patterns.json');
