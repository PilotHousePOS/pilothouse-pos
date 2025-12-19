const { Pool } = require('@neondatabase/serverless');
const WebSocket = require('ws');
const fs = require('fs');

const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Load UPC database
const upcMap = JSON.parse(fs.readFileSync('/tmp/all_upcs.json', 'utf-8'));

// Coastal abbreviation expansion
const coastalAbbrevs = {
  'blk': 'black', 'bk': 'black',
  'rd': 'red', 'blu': 'blue', 'bl': 'blue',
  'grn': 'green', 'gr': 'green', 'grny': 'green',
  'pnk': 'pink', 'pk': 'pink', 'npk': 'neon pink', 'pkb': 'pink bright',
  'prp': 'purple', 'pur': 'purple',
  'wht': 'white', 'wh': 'white',
  'org': 'orange', 'or': 'orange', 'ornge': 'orange',
  'ylw': 'yellow', 'yl': 'yellow',
  'brn': 'brown', 'br': 'brown',
  'gry': 'grey', 'gy': 'grey', 'gray': 'grey',
  'sob': 'skulls', 'skz': 'skulls', 'sklz': 'skulls',
  'tig': 'tiger', 'tgr': 'tiger',
  'bne': 'bone', 'bns': 'bones',
  'mart': 'martingale', 'mrt': 'martingale',
  'harn': 'harness', 'hrns': 'harness', 'charness': 'charm harness',
  'coll': 'collar', 'col': 'collar',
  'lsh': 'leash', 'lesh': 'leash',
  'sm': 'small', 'sml': 'small',
  'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large',
  'xl': 'extra large', 'xlg': 'extra large',
  'xs': 'extra small', 'xsm': 'extra small',
  'xxs': 'extra extra small',
  'btd': 'butterfly dog', 'leb': 'leopard', 'zpk': 'zebra pink',
  'fmb': 'flamingo', 'lbp': 'ladybug pink',
  'sec': 'security',
  'buck': 'buckle',
  'combo': 'combo',
  'strp': 'stripe', 'wstrp': 'white stripe'
};

// Normalize with expansions
function normalize(str) {
  let norm = str.toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = norm.split(' ');
  const expanded = words.map(w => coastalAbbrevs[w] || w);
  return expanded.join(' ');
}

// Extract numeric sizes
function extractSizes(str) {
  const matches = str.match(/(\d+)/g) || [];
  return matches.map(Number);
}

// Token overlap score
function tokenScore(s1, s2) {
  const t1 = new Set(s1.split(' ').filter(w => w.length > 1));
  const t2 = new Set(s2.split(' ').filter(w => w.length > 1));
  
  let common = 0;
  for (const w of t1) if (t2.has(w)) common++;
  
  return (2 * common) / (t1.size + t2.size);
}

async function matchCoastal() {
  // Get Coastal products without SKU
  const { rows: products } = await pool.query(`
    SELECT id, name FROM supplies WHERE sku IS NULL AND brand = 'Coastal'
  `);
  
  console.log('Coastal products to match:', products.length);
  
  // Get Coastal UPCs
  const coastalUPCs = Object.entries(upcMap)
    .filter(([k,v]) => k.startsWith('076484') || k.startsWith('879213') || v.toLowerCase().includes('coastal'))
    .map(([upc, name]) => ({
      upc,
      original: name,
      norm: normalize(name),
      sizes: extractSizes(name)
    }));
  
  console.log('Coastal UPCs available:', coastalUPCs.length);
  
  const matches = [];
  
  for (const prod of products) {
    const prodNorm = normalize(prod.name);
    const prodSizes = extractSizes(prod.name);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const cand of coastalUPCs) {
      // Size must match if both have sizes
      if (prodSizes.length > 0 && cand.sizes.length > 0) {
        const sizeMatch = prodSizes.some(s => cand.sizes.includes(s));
        if (!sizeMatch) continue;
      }
      
      const score = tokenScore(prodNorm, cand.norm);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = cand;
      }
    }
    
    if (bestMatch && bestScore >= 0.5) {
      matches.push({
        id: prod.id,
        prodName: prod.name,
        upcName: bestMatch.original,
        upc: bestMatch.upc,
        score: bestScore
      });
    }
  }
  
  console.log('\nMatches found:', matches.length);
  
  // Group by confidence
  const high = matches.filter(m => m.score >= 0.65);
  const med = matches.filter(m => m.score >= 0.5 && m.score < 0.65);
  
  console.log('High confidence (65%+):', high.length);
  console.log('Medium confidence (50-64%):', med.length);
  
  // Apply high confidence matches
  for (const m of high) {
    await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [m.upc, m.id]);
  }
  console.log('\nApplied', high.length, 'high-confidence matches');
  
  // Show samples
  console.log('\nSample high matches:');
  high.slice(0, 10).forEach(m => {
    console.log('  ' + (m.score*100).toFixed(0) + '% | ' + m.prodName.substring(0,40) + ' => ' + m.upcName.substring(0,40));
  });
  
  console.log('\nSample medium matches:');
  med.slice(0, 10).forEach(m => {
    console.log('  ' + (m.score*100).toFixed(0) + '% | ' + m.prodName.substring(0,40) + ' => ' + m.upcName.substring(0,40));
  });
  
  await pool.end();
}

matchCoastal().catch(console.error);
