const { Pool } = require('@neondatabase/serverless');
const WebSocket = require('ws');
const fs = require('fs');

const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upcMap = JSON.parse(fs.readFileSync('/tmp/all_upcs.json', 'utf-8'));

// Extended abbreviations
const abbrevs = {
  'chkn': 'chicken', 'chk': 'chicken', 'ck': 'chicken', 'chick': 'chicken',
  'bf': 'beef', 'slmn': 'salmon', 'sal': 'salmon', 'salm': 'salmon',
  'lmb': 'lamb', 'lam': 'lamb', 'trky': 'turkey', 'turk': 'turkey', 'tk': 'turkey',
  'dck': 'duck', 'dk': 'duck', 'vnisn': 'venison', 'veni': 'venison',
  'pup': 'puppy', 'sen': 'senior', 'ad': 'adult',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large', 'xs': 'extra small',
  'blk': 'black', 'rd': 'red', 'blu': 'blue', 'grn': 'green', 'pnk': 'pink',
  'prp': 'purple', 'wht': 'white', 'org': 'orange', 'ylw': 'yellow',
  'nat': 'natural', 'ntrl': 'natural', 'orig': 'original',
  'gf': 'grain free', 'wg': 'whole grain',
  'trt': 'treat', 'trts': 'treats', 'fd': 'food',
  'bne': 'bone', 'bns': 'bones', 'bnls': 'boneless',
  'cart': 'cart', 'carrt': 'carrot',
  'appel': 'apple', 'app': 'apple', 'pb': 'peanut butter',
  'swpot': 'sweet potato', 'swpt': 'sweet potato',
  'pot': 'potato', 'ptta': 'potato',
  'frz': 'freeze', 'frzn': 'frozen', 'dri': 'dried',
  'harn': 'harness', 'coll': 'collar', 'lsh': 'leash',
  'flvr': 'flavor', 'flv': 'flavor'
};

function normalize(str) {
  let norm = str.toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = norm.split(' ');
  return words.map(w => abbrevs[w] || w).join(' ');
}

function extractSizes(str) {
  const matches = str.match(/(\d+\.?\d*)\s*(oz|lb|lbs|#|g|kg|in|"|inch)/gi) || [];
  return matches.map(m => m.replace(/\s+/g, '').toLowerCase().replace('"', 'in'));
}

function extractNumbers(str) {
  const matches = str.match(/(\d+)/g) || [];
  return matches.map(Number);
}

function tokenScore(s1, s2) {
  const t1 = new Set(s1.split(' ').filter(w => w.length > 2));
  const t2 = new Set(s2.split(' ').filter(w => w.length > 2));
  
  let common = 0;
  for (const w of t1) if (t2.has(w)) common++;
  
  return (2 * common) / (t1.size + t2.size);
}

// Check critical size match
function sizesCompatible(prodSizes, candSizes) {
  if (prodSizes.length === 0 || candSizes.length === 0) return true;
  return prodSizes.some(ps => candSizes.some(cs => ps === cs));
}

// Check number compatibility
function numbersCompatible(prodNums, candNums) {
  if (prodNums.length === 0 || candNums.length === 0) return true;
  return prodNums.some(pn => candNums.includes(pn));
}

async function finalMatch() {
  // Get all products without SKU
  const { rows: products } = await pool.query(`
    SELECT id, name, brand FROM supplies WHERE sku IS NULL
  `);
  
  console.log('Products to match:', products.length);
  
  // Normalize all UPCs
  const normalizedUPCs = Object.entries(upcMap).map(([upc, name]) => ({
    upc,
    original: name,
    norm: normalize(name),
    sizes: extractSizes(name),
    nums: extractNumbers(name)
  }));
  
  console.log('UPCs in database:', normalizedUPCs.length);
  
  let matched = 0;
  const samples = [];
  
  for (const prod of products) {
    const prodNorm = normalize(prod.name);
    const prodSizes = extractSizes(prod.name);
    const prodNums = extractNumbers(prod.name);
    const prodBrand = (prod.brand || '').toLowerCase().split(' ')[0];
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const cand of normalizedUPCs) {
      // Brand filter - UPC should contain brand name
      if (prodBrand && prodBrand.length > 3 && !cand.norm.includes(prodBrand.substring(0, 4))) {
        continue;
      }
      
      // Size compatibility check
      if (!sizesCompatible(prodSizes, cand.sizes)) continue;
      
      // Number compatibility check
      if (!numbersCompatible(prodNums, cand.nums)) continue;
      
      const score = tokenScore(prodNorm, cand.norm);
      if (score > bestScore && score >= 0.6) {
        bestScore = score;
        bestMatch = cand;
      }
    }
    
    // Only apply 65%+ confidence matches
    if (bestMatch && bestScore >= 0.65) {
      await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [bestMatch.upc, prod.id]);
      matched++;
      if (samples.length < 10) {
        samples.push({
          score: bestScore,
          prod: prod.name,
          upc: bestMatch.original
        });
      }
    }
  }
  
  console.log('\nMatched:', matched);
  console.log('\nSamples:');
  samples.forEach(s => {
    console.log('  ' + (s.score*100).toFixed(0) + '% | ' + s.prod.substring(0,35) + ' => ' + s.upc.substring(0,35));
  });
  
  await pool.end();
}

finalMatch().catch(console.error);
