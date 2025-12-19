const { Pool } = require('@neondatabase/serverless');
const WebSocket = require('ws');
const fs = require('fs');

const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Load UPC database
const upcMap = JSON.parse(fs.readFileSync('/tmp/all_upcs.json', 'utf-8'));

// Abbreviation expansion map
const abbrevs = {
  'blk': 'black', 'bk': 'black',
  'rd': 'red', 'blu': 'blue', 'bl': 'blue',
  'grn': 'green', 'gr': 'green',
  'pnk': 'pink', 'pk': 'pink',
  'prp': 'purple', 'pur': 'purple',
  'wht': 'white', 'wh': 'white',
  'org': 'orange', 'or': 'orange',
  'ylw': 'yellow', 'yl': 'yellow',
  'brn': 'brown', 'br': 'brown',
  'gry': 'grey', 'gy': 'grey', 'gray': 'grey',
  'sm': 'small', 'sml': 'small',
  'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large',
  'xlg': 'extra large', 'xl': 'extra large',
  'xxl': 'extra extra large',
  'xs': 'extra small', 'xsm': 'extra small',
  'xxs': 'extra extra small',
  'pwrwalker': 'power walker', 'pwr': 'power',
  'coll': 'collar', 'col': 'collar',
  'harn': 'harness', 'hrns': 'harness',
  'lsh': 'leash', 'lsh': 'leash',
  'trn': 'training', 'train': 'training',
  'ctn': 'cotton', 'cot': 'cotton',
  'dns': 'dinosaur', 'dino': 'dinosaur',
  'mart': 'martingale',
  'sec': 'security',
  'strp': 'stripe', 'str': 'stripe'
};

// Normalize with abbreviation expansion
function normalize(str) {
  let norm = str.toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Expand abbreviations
  const words = norm.split(' ');
  const expanded = words.map(w => abbrevs[w] || w);
  return expanded.join(' ');
}

// Extract size numbers
function extractSizes(str) {
  const matches = str.match(/\d+/g) || [];
  return matches.map(Number);
}

// Jaccard similarity on words
function wordSim(s1, s2) {
  const w1 = new Set(s1.split(' ').filter(w => w.length > 1));
  const w2 = new Set(s2.split(' ').filter(w => w.length > 1));
  
  let common = 0;
  for (const w of w1) {
    if (w2.has(w)) common++;
  }
  
  return (2 * common) / (w1.size + w2.size);
}

async function matchProducts() {
  // Get products without SKU
  const { rows: products } = await pool.query(`
    SELECT id, name, brand FROM supplies WHERE sku IS NULL
  `);
  
  console.log('Products to match:', products.length);
  
  // Normalize all UPCs
  const normalizedUPCs = Object.entries(upcMap).map(([upc, name]) => ({
    upc,
    original: name,
    norm: normalize(name),
    sizes: extractSizes(name)
  }));
  
  console.log('UPCs in database:', normalizedUPCs.length);
  
  const matches = [];
  
  for (const prod of products) {
    const prodNorm = normalize(prod.name);
    const prodSizes = extractSizes(prod.name);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const cand of normalizedUPCs) {
      // Quick brand filter - skip if brands don't match
      const prodBrand = (prod.brand || '').toLowerCase().split(' ')[0];
      if (prodBrand && cand.norm.indexOf(prodBrand) === -1) {
        // Check for special cases like Coastal/Turbo
        if (prodBrand === 'coastal' && !cand.upc.startsWith('076484') && !cand.upc.startsWith('879213')) {
          continue;
        }
      }
      
      // Check size compatibility
      if (prodSizes.length > 0 && cand.sizes.length > 0) {
        const sizeMatch = prodSizes.some(s => cand.sizes.includes(s));
        if (!sizeMatch) continue;
      }
      
      const score = wordSim(prodNorm, cand.norm);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = cand;
      }
    }
    
    if (bestMatch && bestScore >= 0.6) {
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
  const high = matches.filter(m => m.score >= 0.75);
  const med = matches.filter(m => m.score >= 0.6 && m.score < 0.75);
  
  console.log('High confidence (75%+):', high.length);
  console.log('Medium confidence (60-74%):', med.length);
  
  // Apply high confidence matches
  for (const m of high) {
    await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [m.upc, m.id]);
  }
  console.log('\nApplied', high.length, 'high-confidence matches');
  
  // Show samples
  console.log('\nSample high matches:');
  high.slice(0, 5).forEach(m => {
    console.log('  ' + (m.score*100).toFixed(0) + '% | ' + m.prodName.substring(0,45) + ' => ' + m.upcName.substring(0,45));
  });
  
  console.log('\nSample medium matches:');
  med.slice(0, 5).forEach(m => {
    console.log('  ' + (m.score*100).toFixed(0) + '% | ' + m.prodName.substring(0,45) + ' => ' + m.upcName.substring(0,45));
  });
  
  await pool.end();
}

matchProducts().catch(console.error);
