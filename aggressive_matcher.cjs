const fs = require('fs');
const { Pool } = require('pg');

function normalize(s) {
  return (s || '').toLowerCase().replace(/['".,\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getKeywords(name) {
  // Extract meaningful keywords (skip common words)
  const skip = new Set(['the', 'and', 'or', 'for', 'with', 'in', 'of', 'to', 'a', 'an']);
  return normalize(name).split(' ')
    .filter(w => w.length >= 3 && !skip.has(w))
    .slice(0, 5);  // First 5 significant words
}

function matchScore(prodKeywords, refKeywords) {
  if (!prodKeywords.length || !refKeywords.length) return 0;
  
  let matches = 0;
  for (const pk of prodKeywords) {
    for (const rk of refKeywords) {
      if (pk === rk || pk.includes(rk) || rk.includes(pk)) {
        matches++;
        break;
      }
    }
  }
  return matches / Math.max(prodKeywords.length, refKeywords.length);
}

async function main() {
  const allUpcs = JSON.parse(fs.readFileSync('all_upcs.json', 'utf8'));
  const excelUpcs = JSON.parse(fs.readFileSync('excel_upcs.json', 'utf8'));
  
  const refs = [...allUpcs, ...excelUpcs]
    .filter(e => e.upc && e.upc.length >= 10 && e.name)
    .map(e => ({
      upc: e.upc,
      name: e.name,
      keywords: getKeywords(e.name)
    }));
  
  console.log(`${refs.length} reference entries`);
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT id, name, brand FROM supplies 
      WHERE sku IS NULL OR sku = ''
      LIMIT 1500
    `);
    
    console.log(`${result.rows.length} products to match`);
    
    let matched = 0;
    for (const row of result.rows) {
      const prodKeywords = getKeywords(row.name);
      if (prodKeywords.length < 2) continue;
      
      let best = null;
      let bestScore = 0;
      
      for (const ref of refs) {
        const score = matchScore(prodKeywords, ref.keywords);
        if (score > bestScore && score >= 0.6) {
          bestScore = score;
          best = ref;
        }
      }
      
      if (best) {
        await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [best.upc, row.id]);
        matched++;
      }
    }
    
    console.log(`Matched ${matched} products`);
    
    const final = await client.query(`
      SELECT COUNT(*) as total, COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc
      FROM supplies
    `);
    console.log(`Coverage: ${(final.rows[0].with_upc / final.rows[0].total * 100).toFixed(1)}%`);
    
  } finally {
    client.release();
    pool.end();
  }
}

main().catch(console.error);
