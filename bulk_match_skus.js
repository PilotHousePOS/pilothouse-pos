const fs = require('fs');
const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Load UPC database
const upcData = fs.readFileSync('.local/state/memory/inventory_maybe_upcs.txt', 'utf8')
  .split('\n')
  .filter(line => line.includes('|'))
  .map(line => {
    const [upc, name] = line.split('|');
    return { upc: upc.trim(), name: name ? name.trim() : '' };
  })
  .filter(entry => entry.upc && entry.name);

console.log(`Loaded ${upcData.length} UPC entries`);

// Normalize text for matching
function normalize(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build UPC lookup by normalized name
const upcByName = new Map();
for (const entry of upcData) {
  const normalizedName = normalize(entry.name);
  if (normalizedName && !upcByName.has(normalizedName)) {
    upcByName.set(normalizedName, entry.upc);
  }
}
console.log(`Built lookup with ${upcByName.size} unique names`);

async function matchProducts() {
  // Get products without SKUs
  const { rows: products } = await pool.query(`
    SELECT id, name, brand FROM supplies WHERE sku IS NULL ORDER BY id
  `);
  console.log(`Found ${products.length} products without SKUs`);
  
  const exactMatches = [];
  
  for (const product of products) {
    const productName = normalize(product.name);
    
    // Try exact match
    if (upcByName.has(productName)) {
      exactMatches.push({ id: product.id, sku: upcByName.get(productName), name: product.name });
    }
  }
  
  console.log(`Exact matches: ${exactMatches.length}`);
  
  // Apply exact matches
  for (const match of exactMatches) {
    await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [match.sku, match.id]);
  }
  console.log(`Applied ${exactMatches.length} exact matches`);
  
  // Check new coverage
  const { rows: coverage } = await pool.query(`
    SELECT COUNT(*) as total, COUNT(sku) as with_sku FROM supplies
  `);
  console.log(`New coverage: ${coverage[0].with_sku}/${coverage[0].total} (${(coverage[0].with_sku/coverage[0].total*100).toFixed(1)}%)`);
  
  await pool.end();
}

matchProducts().catch(console.error);
