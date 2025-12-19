const { Pool } = require('@neondatabase/serverless');
const WebSocket = require('ws');
const fs = require('fs');

const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upcMap = JSON.parse(fs.readFileSync('/tmp/all_upcs.json', 'utf-8'));

// Abbreviation expansion
const abbrevs = {
  'chkn': 'chicken', 'chk': 'chicken', 'ck': 'chicken',
  'bf': 'beef', 'slmn': 'salmon', 'sal': 'salmon',
  'lmb': 'lamb', 'lam': 'lamb',
  'trky': 'turkey', 'turk': 'turkey', 'tk': 'turkey',
  'dck': 'duck', 'dk': 'duck',
  'pup': 'puppy', 'sen': 'senior', 'ad': 'adult',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large',
  'xs': 'extra small',
  'oz': 'oz', 'lb': 'lb', 'lbs': 'lb',
  'frmmb': 'fromm bites', 'fromb': 'fromm bites',
  'bnls': 'boneless', 'bne': 'bone',
  'trt': 'treat', 'trts': 'treats',
  'fd': 'food', 'dry': 'dry food', 'wet': 'wet food',
  'can': 'canned', 'cnnd': 'canned',
  'orig': 'original', 'orig': 'original',
  'nat': 'natural', 'ntrl': 'natural',
  'gf': 'grain free', 'wg': 'whole grain',
  'hlthy': 'healthy', 'edbl': 'edible',
  'vit': 'vital', 'ess': 'essentials',
  'blk': 'black', 'rd': 'red', 'blu': 'blue', 'grn': 'green',
  'pnk': 'pink', 'prp': 'purple', 'wht': 'white', 'org': 'orange',
  'ylw': 'yellow', 'brn': 'brown', 'gry': 'grey'
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
  const matches = str.match(/(\d+\.?\d*)\s*(oz|lb|lbs|#|g|kg)/gi) || [];
  return matches.map(m => m.replace(/\s+/g, '').toLowerCase());
}

function tokenScore(s1, s2) {
  const t1 = new Set(s1.split(' ').filter(w => w.length > 2));
  const t2 = new Set(s2.split(' ').filter(w => w.length > 2));
  
  let common = 0;
  for (const w of t1) if (t2.has(w)) common++;
  
  return (2 * common) / (t1.size + t2.size);
}

async function matchBrands() {
  const brands = ['Nutrisource', 'Nylabone', 'Kong', 'RedBarn', 'Blue Buffalo', 'Diamond', 
                  'Benebone', 'Primal', 'Vital Essentials', 'JW Pet', 'Fromm', 'Wholesome'];
  
  for (const brand of brands) {
    const { rows: products } = await pool.query(
      "SELECT id, name FROM supplies WHERE sku IS NULL AND brand = $1",
      [brand]
    );
    
    if (products.length === 0) continue;
    
    // Find UPCs for this brand
    const brandLower = brand.toLowerCase().split(' ')[0];
    const brandUPCs = Object.entries(upcMap)
      .filter(([k, v]) => v.toLowerCase().includes(brandLower))
      .map(([upc, name]) => ({
        upc,
        original: name,
        norm: normalize(name),
        sizes: extractSizes(name)
      }));
    
    if (brandUPCs.length === 0) continue;
    
    console.log(brand + ': ' + products.length + ' to match, ' + brandUPCs.length + ' UPCs available');
    
    let matched = 0;
    for (const prod of products) {
      const prodNorm = normalize(prod.name);
      const prodSizes = extractSizes(prod.name);
      
      let bestMatch = null;
      let bestScore = 0;
      
      for (const cand of brandUPCs) {
        // Size must match if both have sizes
        if (prodSizes.length > 0 && cand.sizes.length > 0) {
          const sizeMatch = prodSizes.some(ps => cand.sizes.some(cs => ps === cs));
          if (!sizeMatch) continue;
        }
        
        const score = tokenScore(prodNorm, cand.norm);
        if (score > bestScore && score >= 0.6) {
          bestScore = score;
          bestMatch = cand;
        }
      }
      
      if (bestMatch && bestScore >= 0.65) {
        await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [bestMatch.upc, prod.id]);
        matched++;
        if (matched <= 2) {
          console.log('  ' + (bestScore*100).toFixed(0) + '% | ' + prod.name.substring(0,35) + ' => ' + bestMatch.original.substring(0,35));
        }
      }
    }
    console.log('  Applied:', matched);
  }
  
  await pool.end();
}

matchBrands().catch(console.error);
