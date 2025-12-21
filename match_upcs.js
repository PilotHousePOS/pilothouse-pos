const { Pool } = require('@neondatabase/serverless');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Normalize text for matching
function normalize(text) {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get tokens from text
function getTokens(text) {
  return normalize(text).split(' ').filter(t => t.length > 1);
}

// Calculate token overlap score
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
  console.log('Loading UPC sources...');
  
  // Load all UPC sources
  const allUpcs = JSON.parse(fs.readFileSync('./all_upcs.json', 'utf8'));
  console.log(`Loaded ${allUpcs.length} UPCs from all_upcs.json`);
  
  // Build UPC lookup by normalized name
  const upcByName = new Map();
  const upcByTokens = [];
  const usedUpcs = new Set();
  
  for (const item of allUpcs) {
    if (!item.upc || !item.name) continue;
    const normName = normalize(item.name);
    const tokens = getTokens(item.name);
    
    if (!upcByName.has(normName)) {
      upcByName.set(normName, item.upc);
    }
    upcByTokens.push({ upc: item.upc, name: item.name, tokens });
  }
  
  console.log(`Built lookup with ${upcByName.size} unique names`);
  
  // Get products without UPC
  const { rows: products } = await pool.query(`
    SELECT id, name, brand 
    FROM supplies 
    WHERE sku IS NULL OR sku = ''
    ORDER BY id
  `);
  
  console.log(`Found ${products.length} products without UPC`);
  
  let matched = 0;
  let updates = [];
  
  for (const prod of products) {
    const prodName = prod.name;
    const normProdName = normalize(prodName);
    const prodTokens = getTokens(prodName);
    
    // 1. Exact normalized name match
    if (upcByName.has(normProdName)) {
      const upc = upcByName.get(normProdName);
      if (!usedUpcs.has(upc)) {
        usedUpcs.add(upc);
        updates.push({ id: prod.id, upc });
        matched++;
        continue;
      }
    }
    
    // 2. Find best token match (60% threshold)
    let bestScore = 0;
    let bestUpc = null;
    
    for (const ref of upcByTokens) {
      if (usedUpcs.has(ref.upc)) continue;
      const score = tokenScore(prodTokens, ref.tokens);
      if (score > bestScore && score >= 0.6) {
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
  
  console.log(`Matched ${matched} products`);
  
  // Apply updates in batches
  if (updates.length > 0) {
    console.log('Applying updates...');
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);
      for (const u of batch) {
        await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [u.upc, u.id]);
      }
      console.log(`Updated ${Math.min(i + 100, updates.length)} / ${updates.length}`);
    }
  }
  
  // Check final coverage
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
