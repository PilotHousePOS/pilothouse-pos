const { Pool } = require('@neondatabase/serverless');
const fs = require('fs');

async function matchPennPlaxUPCs() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  // Load extracted UPCs
  const upcs = JSON.parse(fs.readFileSync('/tmp/pennplax_upcs.json', 'utf8'));
  console.log(`Loaded ${upcs.length} Penn Plax UPCs`);
  
  // Get all products without SKUs that could be Penn Plax
  const result = await pool.query(`
    SELECT id, name, brand, sku 
    FROM supplies 
    WHERE (sku IS NULL OR sku = '')
    AND (
      LOWER(name) LIKE '%penn%plax%' OR
      LOWER(name) LIKE '%cascade%' OR
      LOWER(name) LIKE '%smallworld%' OR
      LOWER(name) LIKE '%small world%' OR
      LOWER(name) LIKE '%reptology%' OR
      LOWER(name) LIKE '%action-air%' OR
      LOWER(name) LIKE '%action air%' OR
      LOWER(name) LIKE '%aquascaping%' OR
      LOWER(name) LIKE '%aqua-plant%' OR
      LOWER(name) LIKE '%tide & treasure%' OR
      LOWER(brand) = 'penn plax' OR
      LOWER(brand) = 'pennplax' OR
      LOWER(brand) = 'cascade'
    )
  `);
  
  console.log(`Found ${result.rows.length} potential Penn Plax products without SKUs`);
  
  // Also get products that already have Penn Plax UPCs to avoid duplicates
  const existingResult = await pool.query(`
    SELECT sku FROM supplies WHERE sku LIKE '030172%' OR sku LIKE '713733%'
  `);
  const existingUPCs = new Set(existingResult.rows.map(r => r.sku));
  console.log(`${existingUPCs.size} products already have Penn Plax UPCs`);
  
  // Normalize function
  function normalize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[™®©]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Build lookup from invoice UPCs
  const upcLookup = {};
  for (const entry of upcs) {
    if (existingUPCs.has(entry.upc)) continue;
    const normalized = normalize(entry.productName);
    upcLookup[normalized] = entry.upc;
  }
  
  // Match products
  const matches = [];
  const unmatched = [];
  
  for (const product of result.rows) {
    const normalizedName = normalize(product.name);
    
    // Try exact match first
    if (upcLookup[normalizedName]) {
      matches.push({
        id: product.id,
        name: product.name,
        upc: upcLookup[normalizedName]
      });
      continue;
    }
    
    // Try partial matching
    let bestMatch = null;
    let bestScore = 0;
    
    for (const entry of upcs) {
      if (existingUPCs.has(entry.upc)) continue;
      
      const invoiceName = normalize(entry.productName);
      
      // Extract key terms
      const productTerms = normalizedName.split(' ').filter(t => t.length > 2);
      const invoiceTerms = invoiceName.split(' ').filter(t => t.length > 2);
      
      // Count matching terms
      let matchingTerms = 0;
      for (const term of productTerms) {
        if (invoiceTerms.includes(term)) {
          matchingTerms++;
        }
      }
      
      const score = matchingTerms / Math.max(productTerms.length, 1);
      
      if (score > bestScore && score >= 0.5 && matchingTerms >= 2) {
        bestScore = score;
        bestMatch = { upc: entry.upc, invoiceName, score, matchingTerms };
      }
    }
    
    if (bestMatch) {
      matches.push({
        id: product.id,
        name: product.name,
        upc: bestMatch.upc,
        score: bestMatch.score
      });
    } else {
      unmatched.push(product.name);
    }
  }
  
  console.log(`\nMatched ${matches.length} products`);
  console.log(`Unmatched: ${unmatched.length} products`);
  
  // Show sample matches
  console.log('\nSample matches:');
  matches.slice(0, 10).forEach(m => {
    console.log(`  ${m.name.substring(0, 50)} -> ${m.upc}`);
  });
  
  // Update database
  let updated = 0;
  for (const match of matches) {
    try {
      await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [match.upc, match.id]);
      updated++;
    } catch (err) {
      console.error(`Error updating ${match.id}: ${err.message}`);
    }
  }
  
  console.log(`\nUpdated ${updated} products with Penn Plax UPCs`);
  
  // Final coverage report
  const coverageResult = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_sku
    FROM supplies
  `);
  
  const total = parseInt(coverageResult.rows[0].total);
  const withSku = parseInt(coverageResult.rows[0].with_sku);
  const coverage = ((withSku / total) * 100).toFixed(1);
  
  console.log(`\n=== FINAL COVERAGE ===`);
  console.log(`Total products: ${total}`);
  console.log(`With SKU: ${withSku}`);
  console.log(`Coverage: ${coverage}%`);
  
  await pool.end();
}

matchPennPlaxUPCs().catch(console.error);
