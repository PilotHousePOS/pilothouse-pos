const fs = require('fs');
const { Pool } = require('pg');

function normalize(s) {
  return (s || '').toLowerCase().replace(/['".,\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getTokens(name) {
  const skip = new Set(['the', 'and', 'or', 'for', 'with', 'in', 'of', 'to', 'a', 'an']);
  return normalize(name).split(' ')
    .filter(w => w.length >= 2 && !skip.has(w));
}

function matchScore(t1, t2) {
  if (!t1.length || !t2.length) return 0;
  let matches = 0;
  for (const a of t1) {
    for (const b of t2) {
      if (a === b) { matches++; break; }
    }
  }
  return matches / Math.max(t1.length, t2.length);
}

async function main() {
  const allUpcs = JSON.parse(fs.readFileSync('all_upcs.json', 'utf8'));
  const excelUpcs = JSON.parse(fs.readFileSync('excel_upcs.json', 'utf8'));
  
  const refs = [...allUpcs, ...excelUpcs]
    .filter(e => e.upc && e.upc.length >= 10 && e.name)
    .map(e => ({
      upc: e.upc,
      name: normalize(e.name),
      tokens: getTokens(e.name)
    }));
  
  console.log(`${refs.length} reference entries`);
  
  // Build exact lookup
  const exactLookup = new Map();
  for (const r of refs) {
    if (!exactLookup.has(r.name)) exactLookup.set(r.name, r.upc);
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Get already used UPCs to avoid duplicates
    const existingUpcs = await client.query(`
      SELECT DISTINCT sku FROM supplies WHERE sku IS NOT NULL AND sku != ''
    `);
    const usedUpcs = new Set(existingUpcs.rows.map(r => r.sku));
    console.log(`${usedUpcs.size} UPCs already in use`);
    
    const result = await client.query(`
      SELECT id, name, brand FROM supplies 
      WHERE sku IS NULL OR sku = ''
    `);
    
    console.log(`${result.rows.length} products to match`);
    
    let matched = 0;
    
    for (const row of result.rows) {
      const prodName = normalize(row.name);
      const prodTokens = getTokens(row.name);
      
      // Try exact match first
      if (exactLookup.has(prodName) && !usedUpcs.has(exactLookup.get(prodName))) {
        const upc = exactLookup.get(prodName);
        await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [upc, row.id]);
        usedUpcs.add(upc);
        matched++;
        continue;
      }
      
      if (prodTokens.length < 2) continue;
      
      // Fuzzy match
      let best = null;
      let bestScore = 0;
      
      for (const ref of refs) {
        if (usedUpcs.has(ref.upc)) continue;
        
        const score = matchScore(prodTokens, ref.tokens);
        if (score > bestScore && score >= 0.6) {
          bestScore = score;
          best = ref;
        }
      }
      
      if (best) {
        await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [best.upc, row.id]);
        usedUpcs.add(best.upc);
        matched++;
      }
    }
    
    console.log(`Matched ${matched} products`);
    
    const final = await client.query(`
      SELECT COUNT(*) as total, COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc,
             (SELECT COUNT(*) FROM (SELECT sku FROM supplies WHERE sku IS NOT NULL GROUP BY sku HAVING COUNT(*) > 1) d) as dups
      FROM supplies
    `);
    console.log(`Total: ${final.rows[0].with_upc}/${final.rows[0].total}`);
    console.log(`Coverage: ${(final.rows[0].with_upc / final.rows[0].total * 100).toFixed(1)}%`);
    console.log(`Duplicates: ${final.rows[0].dups}`);
    
  } finally {
    client.release();
    pool.end();
  }
}

main().catch(console.error);
