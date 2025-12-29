import fs from 'fs';

const data = JSON.parse(fs.readFileSync('backups/rollback-inventory-2025-12-29.json', 'utf8'));

console.log('=== LEARNING FROM YOUR CORRECTED DATA ===\n');

// Kong products with verified UPCs
const kongProducts = data.filter(p => p.brand?.toLowerCase() === 'kong' && p.sku);
console.log(`Kong products with UPCs: ${kongProducts.length}`);
if (kongProducts.length > 0) {
  console.log('Sample Kong UPC prefixes:');
  const prefixes = new Set(kongProducts.slice(0, 20).map(p => p.sku?.substring(0, 6)));
  prefixes.forEach(p => console.log(`  ${p}`));
}

// Products with complete extended info (features + ingredients + description)
const complete = data.filter(p => p.features && p.ingredients && p.description && p.description.length > 50);
console.log(`\nProducts with complete info (features + ingredients + description): ${complete.length}`);

// Analyze image URL patterns
const imagePatterns = {};
data.filter(p => p.imageUrl).forEach(p => {
  if (p.imageUrl.includes('object-storage')) imagePatterns['object-storage'] = (imagePatterns['object-storage'] || 0) + 1;
  else if (p.imageUrl.includes('chewy.com')) imagePatterns['chewy'] = (imagePatterns['chewy'] || 0) + 1;
  else if (p.imageUrl.includes('amazon')) imagePatterns['amazon'] = (imagePatterns['amazon'] || 0) + 1;
  else imagePatterns['other'] = (imagePatterns['other'] || 0) + 1;
});
console.log('\nImage source breakdown:');
Object.entries(imagePatterns).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

// Analyze brand distribution with UPCs
const brandUpcCounts = {};
data.filter(p => p.sku).forEach(p => {
  const brand = p.brand || 'Unknown';
  brandUpcCounts[brand] = (brandUpcCounts[brand] || 0) + 1;
});
const topBrands = Object.entries(brandUpcCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log('\nTop 15 brands by UPC count:');
topBrands.forEach(([brand, count]) => console.log(`  ${brand}: ${count}`));

// Check UPC prefix patterns
const upcPrefixes = {};
data.filter(p => p.sku && p.sku.length >= 6).forEach(p => {
  const prefix = p.sku.substring(0, 6);
  if (!upcPrefixes[prefix]) upcPrefixes[prefix] = { count: 0, brands: new Set() };
  upcPrefixes[prefix].count++;
  if (p.brand) upcPrefixes[prefix].brands.add(p.brand);
});
const topPrefixes = Object.entries(upcPrefixes)
  .filter(([_, v]) => v.count >= 20)
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 20);
console.log('\nTop UPC prefixes (20+ products):');
topPrefixes.forEach(([prefix, v]) => {
  const brands = Array.from(v.brands).slice(0, 3).join(', ');
  console.log(`  ${prefix}: ${v.count} products (${brands})`);
});

// Sample of well-described products
console.log('\n=== SAMPLE OF COMPLETE PRODUCT ENTRIES ===');
const samples = data.filter(p => p.features && p.ingredients && p.sku && p.imageUrl).slice(0, 3);
samples.forEach(p => {
  console.log(`\nProduct: ${p.name}`);
  console.log(`  Brand: ${p.brand}`);
  console.log(`  SKU/UPC: ${p.sku}`);
  console.log(`  Category: ${p.category}`);
  console.log(`  Has Image: ${p.imageUrl ? 'Yes' : 'No'}`);
  console.log(`  Description length: ${p.description?.length || 0} chars`);
  console.log(`  Has Features: ${p.features ? 'Yes' : 'No'}`);
  console.log(`  Has Ingredients: ${p.ingredients ? 'Yes' : 'No'}`);
});
