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
  return normalize(text).split(' ').filter(t => t.length > 2);
}

function tokenScore(tokens1, tokens2) {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  let matches = 0;
  for (const t of set1) {
    if (set2.has(t)) matches++;
  }
  return matches / Math.min(set1.size, set2.size);  // Use min for more lenient scoring
}

async function main() {
  // Load all UPC sources
  const sources = JSON.parse(fs.readFileSync('./all_sources_upcs.json', 'utf8'));
  console.log(`Loaded ${sources.length} UPC sources`);
  
  // Get existing UPCs
  const { rows: existing } = await pool.query(`SELECT sku FROM supplies WHERE sku IS NOT NULL AND sku != ''`);
  const usedUpcs = new Set(existing.map(r => r.sku));
  console.log(`${usedUpcs.size} UPCs already in use`);
  
  // Build reference with unused UPCs
  const refs = [];
  for (const item of sources) {
    if (!usedUpcs.has(item.upc)) {
      refs.push({ upc: item.upc, name: item.name, tokens: getTokens(item.name), norm: normalize(item.name) });
    }
  }
  console.log(`${refs.length} unused UPCs available`);
  
  // Get products without UPC
  const { rows: products } = await pool.query(`SELECT id, name, brand FROM supplies WHERE sku IS NULL OR sku = ''`);
  console.log(`${products.length} products need UPC`);
  
  let matched = 0;
  const updates = [];
  
  for (const prod of products) {
    const prodNorm = normalize(prod.name);
    const prodTokens = getTokens(prod.name);
    
    // Find best match
    let bestScore = 0;
    let bestRef = null;
    
    for (const ref of refs) {
      if (usedUpcs.has(ref.upc)) continue;
      
      // Exact normalized match
      if (ref.norm === prodNorm) {
        bestScore = 1;
        bestRef = ref;
        break;
      }
      
      // Token overlap (30% threshold)
      const score = tokenScore(prodTokens, ref.tokens);
      if (score > bestScore && score >= 0.3) {
        bestScore = score;
        bestRef = ref;
      }
    }
    
    if (bestRef) {
      usedUpcs.add(bestRef.upc);
      updates.push({ id: prod.id, upc: bestRef.upc, name: prod.name, refName: bestRef.name, score: bestScore });
      matched++;
    }
  }
  
  console.log(`\nMatched ${matched} products`);
  
  // Show sample matches
  console.log('\nSample matches:');
  for (let i = 0; i < 5 && i < updates.length; i++) {
    const u = updates[i];
    console.log(`  DB: "${u.name}" -> REF: "${u.refName}" (score: ${u.score.toFixed(2)})`);
  }
  
  // Apply updates
  if (updates.length > 0) {
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);
      for (const u of batch) {
        await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [u.upc, u.id]);
      }
      console.log(`Applied ${Math.min(i + 100, updates.length)} / ${updates.length}`);
    }
  }
  
  // Final stats
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
