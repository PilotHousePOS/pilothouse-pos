const fs = require('fs');

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

const allUpcs = JSON.parse(fs.readFileSync('./all_upcs.json', 'utf8'));
console.log(`Loaded ${allUpcs.length} UPCs`);

const upcByName = new Map();
const upcByTokens = [];

for (const item of allUpcs) {
  if (!item.upc || !item.name) continue;
  const normName = normalize(item.name);
  const tokens = getTokens(item.name);
  
  if (!upcByName.has(normName)) {
    upcByName.set(normName, item.upc);
  }
  upcByTokens.push({ upc: item.upc, name: item.name, normName, tokens });
}

console.log(`Built lookup with ${upcByName.size} unique names`);

// Read products from exported JSON
const products = JSON.parse(fs.readFileSync('./products_no_upc.json', 'utf8'));
console.log(`Loaded ${products.length} products without UPC`);

const usedUpcs = new Set();
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
      continue;
    }
  }
  
  // Token match (50% threshold)
  let bestScore = 0;
  let bestUpc = null;
  
  for (const ref of upcByTokens) {
    if (usedUpcs.has(ref.upc)) continue;
    const score = tokenScore(prodTokens, ref.tokens);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestUpc = ref.upc;
    }
  }
  
  if (bestUpc) {
    usedUpcs.add(bestUpc);
    updates.push({ id: prod.id, upc: bestUpc });
  }
}

console.log(`Matched ${updates.length} products`);

// Generate SQL
const sqlLines = updates.map(u => 
  `UPDATE supplies SET sku = '${u.upc}' WHERE id = ${u.id};`
);

fs.writeFileSync('./upc_updates.sql', sqlLines.join('\n'));
console.log(`Generated ${sqlLines.length} SQL updates in upc_updates.sql`);
