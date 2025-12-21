const fs = require('fs');
const { Pool } = require('pg');

function normalize(name) {
  return (name || '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const s1 = normalize(a);
  const s2 = normalize(b);
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
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
  // Load all UPC sources
  const allUpcs = JSON.parse(fs.readFileSync('all_upcs.json', 'utf8'));
  console.log(`Loaded ${allUpcs.length} UPCs from all_upcs.json`);
  
  // Build lookup maps
  const exactMatch = new Map();
  const upcEntries = [];
  
  for (const entry of allUpcs) {
    if (!entry.upc || entry.upc.length < 10) continue;
    const name = normalize(entry.name);
    if (!exactMatch.has(name)) {
      exactMatch.set(name, entry.upc);
    }
    upcEntries.push({ name, upc: entry.upc, original: entry.name });
  }
  
  console.log(`Built ${exactMatch.size} unique name entries`);
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT id, name, brand 
      FROM supplies 
      WHERE sku IS NULL OR sku = ''
      ORDER BY id
    `);
    
    console.log(`Found ${result.rows.length} products without UPCs`);
    
    let updates = [];
    let exactCount = 0, fuzzyCount = 0;
    
    for (const row of result.rows) {
      const prodName = normalize(row.name);
      
      // Exact match
      if (exactMatch.has(prodName)) {
        updates.push({ id: row.id, upc: exactMatch.get(prodName) });
        exactCount++;
        continue;
      }
      
      // Remove brand prefix and try again
      if (row.brand) {
        const withoutBrand = prodName.replace(normalize(row.brand), '').trim();
        if (exactMatch.has(withoutBrand)) {
          updates.push({ id: row.id, upc: exactMatch.get(withoutBrand) });
          exactCount++;
          continue;
        }
      }
      
      // Fuzzy match (only for products we haven't matched yet)
      let best = null;
      let bestScore = 0;
      
      for (const entry of upcEntries) {
        const score = similarity(prodName, entry.name);
        if (score > bestScore && score >= 0.8) {
          bestScore = score;
          best = entry;
        }
      }
      
      if (best) {
        updates.push({ id: row.id, upc: best.upc });
        fuzzyCount++;
      }
    }
    
    console.log(`Matches: ${updates.length} (exact: ${exactCount}, fuzzy: ${fuzzyCount})`);
    
    for (const update of updates) {
      await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [update.upc, update.id]);
    }
    
    const final = await client.query(`
      SELECT COUNT(*) as total, COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc
      FROM supplies
    `);
    console.log(`\nFinal: ${final.rows[0].with_upc} / ${final.rows[0].total} products have UPCs`);
    console.log(`Coverage: ${(final.rows[0].with_upc / final.rows[0].total * 100).toFixed(1)}%`);
    
  } finally {
    client.release();
    pool.end();
  }
}

rematch().catch(console.error);
