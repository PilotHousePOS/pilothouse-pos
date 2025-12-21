const fs = require('fs');
const { Pool } = require('pg');

// Normalize name for matching
function normalize(name) {
  return (name || '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity between two strings
function similarity(a, b) {
  if (!a || !b) return 0;
  const s1 = normalize(a);
  const s2 = normalize(b);
  if (s1 === s2) return 1;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // Word overlap
  const words1 = new Set(s1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(s2.split(' ').filter(w => w.length > 2));
  
  let overlap = 0;
  for (const w of words1) {
    if (words2.has(w)) overlap++;
  }
  
  const total = Math.max(words1.size, words2.size);
  return total > 0 ? overlap / total : 0;
}

async function rematch() {
  // Load UPC reference
  const upcs = JSON.parse(fs.readFileSync('combined_upcs.json', 'utf8'));
  console.log(`Loaded ${upcs.length} UPCs from reference`);
  
  // Build lookup maps
  const exactMatch = new Map(); // normalized name -> upc
  const upcEntries = []; // for fuzzy matching
  
  for (const entry of upcs) {
    if (!entry.upc || entry.upc.length < 10) continue;
    const name = normalize(entry.name);
    exactMatch.set(name, entry.upc);
    upcEntries.push({ name, upc: entry.upc, original: entry.name });
  }
  
  console.log(`Built ${exactMatch.size} exact match entries`);
  
  // Connect to database
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Get products without UPCs
    const result = await client.query(`
      SELECT id, name, brand 
      FROM supplies 
      WHERE sku IS NULL OR sku = ''
      ORDER BY id
    `);
    
    console.log(`Found ${result.rows.length} products without UPCs`);
    
    let matched = 0;
    let updates = [];
    
    for (const row of result.rows) {
      const prodName = normalize(row.name);
      
      // Try exact match first
      if (exactMatch.has(prodName)) {
        updates.push({ id: row.id, upc: exactMatch.get(prodName), match: 'exact' });
        matched++;
        continue;
      }
      
      // Try with brand prefix removed
      if (row.brand) {
        const withoutBrand = prodName.replace(normalize(row.brand), '').trim();
        if (exactMatch.has(withoutBrand)) {
          updates.push({ id: row.id, upc: exactMatch.get(withoutBrand), match: 'no-brand' });
          matched++;
          continue;
        }
      }
      
      // Fuzzy match - find best similarity
      let best = null;
      let bestScore = 0;
      
      for (const entry of upcEntries) {
        const score = similarity(prodName, entry.name);
        if (score > bestScore && score >= 0.85) {
          bestScore = score;
          best = entry;
        }
      }
      
      if (best) {
        updates.push({ id: row.id, upc: best.upc, match: 'fuzzy', score: bestScore });
        matched++;
      }
    }
    
    console.log(`Found ${matched} matches`);
    console.log(`  Exact: ${updates.filter(u => u.match === 'exact').length}`);
    console.log(`  No-brand: ${updates.filter(u => u.match === 'no-brand').length}`);
    console.log(`  Fuzzy: ${updates.filter(u => u.match === 'fuzzy').length}`);
    
    // Apply updates
    for (const update of updates) {
      await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [update.upc, update.id]);
    }
    
    console.log(`Applied ${updates.length} UPC updates`);
    
    // Final count
    const finalCount = await client.query(`
      SELECT COUNT(*) as total, COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc
      FROM supplies
    `);
    console.log(`\nFinal: ${finalCount.rows[0].with_upc} / ${finalCount.rows[0].total} products have UPCs`);
    console.log(`Coverage: ${(finalCount.rows[0].with_upc / finalCount.rows[0].total * 100).toFixed(1)}%`);
    
  } finally {
    client.release();
    pool.end();
  }
}

rematch().catch(console.error);
