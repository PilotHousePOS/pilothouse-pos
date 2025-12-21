const fs = require('fs');
const { Pool } = require('pg');

function normalize(name) {
  return (name || '')
    .toLowerCase()
    .replace(/['".,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokenize for better matching
function tokenize(name) {
  return normalize(name).split(' ').filter(w => w.length > 1);
}

// Better similarity using token overlap
function tokenSimilarity(a, b) {
  const t1 = tokenize(a);
  const t2 = tokenize(b);
  if (t1.length === 0 || t2.length === 0) return 0;
  
  const set1 = new Set(t1);
  const set2 = new Set(t2);
  
  let overlap = 0;
  for (const w of set1) {
    if (set2.has(w)) overlap++;
  }
  
  // Jaccard similarity
  const union = new Set([...set1, ...set2]).size;
  return overlap / union;
}

async function rematch() {
  // Load all UPC sources
  const allUpcs = JSON.parse(fs.readFileSync('all_upcs.json', 'utf8'));
  const excelUpcs = JSON.parse(fs.readFileSync('excel_upcs.json', 'utf8'));
  
  // Combine all sources
  const combined = [...allUpcs, ...excelUpcs];
  console.log(`Loaded ${combined.length} total UPC entries`);
  
  // Build lookup maps
  const exactMatch = new Map();
  const upcEntries = [];
  
  for (const entry of combined) {
    if (!entry.upc || entry.upc.length < 10) continue;
    const name = normalize(entry.name);
    if (!exactMatch.has(name)) {
      exactMatch.set(name, entry.upc);
    }
    upcEntries.push({ name, upc: entry.upc, tokens: tokenize(entry.name) });
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
      
      // Try removing brand prefix
      if (row.brand) {
        const withoutBrand = prodName.replace(normalize(row.brand), '').trim();
        if (exactMatch.has(withoutBrand)) {
          updates.push({ id: row.id, upc: exactMatch.get(withoutBrand) });
          exactCount++;
          continue;
        }
      }
      
      // Fuzzy match with lower threshold
      let best = null;
      let bestScore = 0;
      
      for (const entry of upcEntries) {
        const score = tokenSimilarity(prodName, entry.name);
        if (score > bestScore && score >= 0.7) {
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
