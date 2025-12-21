const { Pool } = require('pg');
const fs = require('fs');

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
  return matches / Math.max(set1.size, set2.size);
}

async function main() {
  // Load all UPC sources
  const allUpcs = JSON.parse(fs.readFileSync('./all_upcs.json', 'utf8'));
  const maybeUpcs = JSON.parse(fs.readFileSync('./maybe_upcs.json', 'utf8'));
  
  // Combine - prefer maybe (newer)
  const upcMap = new Map();
  for (const item of allUpcs) {
    if (item.upc && item.name) upcMap.set(item.upc, item);
  }
  for (const item of maybeUpcs) {
    if (item.upc && item.name) upcMap.set(item.upc, item);
  }
  
  const combined = Array.from(upcMap.values());
  console.log(`Combined ${combined.length} unique UPCs`);
  
  // Build lookup
  const upcByName = new Map();
  const upcByTokens = [];
  const usedUpcs = new Set();
  
  for (const item of combined) {
    const normName = normalize(item.name);
    const tokens = getTokens(item.name);
    if (!upcByName.has(normName)) {
      upcByName.set(normName, item.upc);
    }
    upcByTokens.push({ upc: item.upc, name: item.name, tokens });
  }
  
  // Get existing UPCs to mark as used
  const { rows: existing } = await pool.query(`SELECT sku FROM supplies WHERE sku IS NOT NULL AND sku != ''`);
  for (const row of existing) {
    usedUpcs.add(row.sku);
  }
  console.log(`${usedUpcs.size} UPCs already assigned`);
  
  // Get products without UPC
  const { rows: products } = await pool.query(`SELECT id, name, brand FROM supplies WHERE sku IS NULL OR sku = ''`);
  console.log(`${products.length} products still need UPC`);
  
  let matched = 0;
  const updates = [];
  
  for (const prod of products) {
    const normProdName = normalize(prod.name);
    const prodTokens = getTokens(prod.name);
    
    // Exact match
    if (upcByName.has(normProdName)) {
      const upc = upcByName.get(normProdName);
      if (!usedUpcs.has(upc)) {
        usedUpcs.add(upc);
        updates.push({ id: prod.id, upc });
        matched++;
        continue;
      }
    }
    
    // Token match (40% threshold for more matches)
    let bestScore = 0;
    let bestUpc = null;
    
    for (const ref of upcByTokens) {
      if (usedUpcs.has(ref.upc)) continue;
      const score = tokenScore(prodTokens, ref.tokens);
      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestUpc = ref.upc;
      }
    }
    
    if (bestUpc) {
      usedUpcs.add(bestUpc);
      updates.push({ id: prod.id, upc: bestUpc });
      matched++;
    }
  }
  
  console.log(`Matched ${matched} more products`);
  
  // Apply updates
  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100);
    for (const u of batch) {
      await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [u.upc, u.id]);
    }
    console.log(`Applied ${Math.min(i + 100, updates.length)} / ${updates.length}`);
  }
  
  // Check final stats
  const { rows: [stats] } = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc
    FROM supplies
  `);
  
  const pct = ((stats.with_upc / stats.total) * 100).toFixed(1);
  console.log(`\nFinal coverage: ${stats.with_upc} / ${stats.total} (${pct}%)`);
  
  await pool.end();
}

main().catch(console.error);
