const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function normalize(text) {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTokens(text) {
  return normalize(text).split(' ').filter(t => t.length > 1);
}

function tokenScore(tokens1, tokens2) {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  let matches = 0;
  for (const t of set1) {
    if (set2.has(t)) matches++;
  }
  return matches / Math.min(set1.size, set2.size);
}

async function main() {
  const sources = ['./all_pdf_upcs.json', './all_upcs.json', './maybe_upcs.json', './all_invoice_upcs.json'];
  
  const upcMap = new Map();
  for (const file of sources) {
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const item of data) {
      if (item.upc && item.name && !upcMap.has(item.upc)) {
        upcMap.set(item.upc, item);
      }
    }
  }
  
  const allRefs = Array.from(upcMap.values());
  console.log(`Unique UPCs: ${allRefs.length}`);
  
  const { rows: existing } = await pool.query(`SELECT sku FROM supplies WHERE sku IS NOT NULL AND sku != ''`);
  const usedUpcs = new Set(existing.map(r => r.sku));
  console.log(`Used: ${usedUpcs.size}`);
  
  const refs = [];
  for (const item of allRefs) {
    if (!usedUpcs.has(item.upc)) {
      refs.push({ upc: item.upc, name: item.name, tokens: getTokens(item.name), norm: normalize(item.name) });
    }
  }
  console.log(`Available: ${refs.length}`);
  
  const { rows: products } = await pool.query(`SELECT id, name, brand FROM supplies WHERE sku IS NULL OR sku = ''`);
  console.log(`Need: ${products.length}`);
  
  let matched = 0;
  const updates = [];
  
  // Very aggressive - 15% threshold
  for (const prod of products) {
    const prodNorm = normalize(prod.name);
    const prodTokens = getTokens(prod.name);
    
    let bestScore = 0;
    let bestRef = null;
    
    for (const ref of refs) {
      if (usedUpcs.has(ref.upc)) continue;
      
      if (ref.norm === prodNorm) {
        bestScore = 1;
        bestRef = ref;
        break;
      }
      
      const score = tokenScore(prodTokens, ref.tokens);
      if (score > bestScore && score >= 0.15) {
        bestScore = score;
        bestRef = ref;
      }
    }
    
    if (bestRef) {
      usedUpcs.add(bestRef.upc);
      updates.push({ id: prod.id, upc: bestRef.upc });
      matched++;
    }
  }
  
  console.log(`Matched: ${matched}`);
  
  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100);
    for (const u of batch) {
      await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [u.upc, u.id]);
    }
    console.log(`Applied ${Math.min(i + 100, updates.length)} / ${updates.length}`);
  }
  
  const { rows: [stats] } = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc
    FROM supplies
  `);
  
  const pct = ((stats.with_upc / stats.total) * 100).toFixed(1);
  console.log(`\nFinal: ${stats.with_upc} / ${stats.total} (${pct}%)`);
  
  await pool.end();
}

main().catch(console.error);
