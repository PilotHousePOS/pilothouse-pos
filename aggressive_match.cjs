const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const invoiceUPCs = JSON.parse(fs.readFileSync('/tmp/extracted_invoice_upcs.json', 'utf8'));
  
  const { rows: products } = await pool.query(`
    SELECT id, name, brand, category FROM supplies WHERE sku IS NULL OR sku = ''
  `);
  
  const { rows: existingSkus } = await pool.query(`
    SELECT sku FROM supplies WHERE sku IS NOT NULL AND sku != ''
  `);
  const existingSKUSet = new Set(existingSkus.map(r => r.sku));
  
  console.log(`Products without SKU: ${products.length}`);
  const newUPCs = invoiceUPCs.filter(u => !existingSKUSet.has(u.upc));
  console.log(`New UPCs to match: ${newUPCs.length}`);
  
  const brandPatterns = {
    'AQE': ['aqueon'], 'API': ['api '], 'HIK': ['hikari'], 'TET': ['tetra'],
    'SLI': ['seachem'], 'ZML': ['zoo med', 'zoomed'], 'ZIL': ['zilla'],
    'KAY': ['kaytee'], 'FLU': ['fluval'], 'OME': ['omega one', 'omega'],
    'EXO': ['exo terra', 'exo-terra'], 'COA': ['coastal'], 'KON': ['kong'],
    'ZUP': ['zupreem'], 'KMP': ['kaylor', 'sweet harvest'], 'FMN': ['furminator'],
    'EAR': ['earthbath'], 'RBP': ['redbarn'], 'LAF': ['lafeber'], 'ETH': ['ethical', 'spot'],
    'OXB': ['oxbow'], 'JWP': ['jw pet', 'jw '], 'LIX': ['lixit'], 'ORI': ['orijen'],
  };
  
  let matchCount = 0;
  const matches = [];
  const matchedProductIds = new Set();
  
  for (const upc of newUPCs) {
    if (!upc.description) continue;
    const brandCode = upc.description.substring(0, 3).toUpperCase();
    const brandPatternList = brandPatterns[brandCode];
    if (!brandPatternList) continue;
    
    for (const product of products) {
      if (matchedProductIds.has(product.id)) continue;
      const productName = (product.name || '').toLowerCase();
      const productBrand = (product.brand || '').toLowerCase();
      const brandMatch = brandPatternList.some(p => productName.includes(p) || productBrand.includes(p));
      if (!brandMatch) continue;
      
      const descWords = upc.description.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
      const matchingWords = descWords.filter(w => productName.includes(w));
      
      if (matchingWords.length >= 3) {
        matches.push({ upc: upc.upc, productId: product.id, name: product.name });
        matchedProductIds.add(product.id);
        matchCount++;
        break;
      }
    }
  }
  
  console.log(`Found ${matchCount} additional matches`);
  
  if (matches.length > 0) {
    for (const m of matches) {
      await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [m.upc, m.productId]);
    }
    console.log(`Updated ${matches.length} products`);
  }
  
  const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) as count FROM supplies WHERE sku IS NOT NULL AND sku != ''`);
  const { rows: [{ total }] } = await pool.query(`SELECT COUNT(*) as total FROM supplies`);
  console.log(`Final coverage: ${count}/${total} (${(count/total*100).toFixed(1)}%)`);
  
  await pool.end();
}

run().catch(console.error);
