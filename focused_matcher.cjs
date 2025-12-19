const { Pool } = require('@neondatabase/serverless');
const WebSocket = require('ws');
const fs = require('fs');

const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Load UPC database
const upcMap = JSON.parse(fs.readFileSync('/tmp/all_upcs.json', 'utf-8'));

// Normalize name for matching
function normalize(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract key features for comparison
function extractFeatures(name) {
  const norm = normalize(name);
  const words = norm.split(' ').filter(w => w.length > 1);
  
  // Extract sizes
  const sizes = [];
  const sizePatterns = [
    /(\d+)\s*(inch|in|"|ft|lb|lbs|oz|gal|ml|l|pk|pack|count|ct)/gi,
    /(\d+\.?\d*)\s*(inch|in|"|ft|lb|lbs|oz|gal|ml|l)/gi
  ];
  for (const pat of sizePatterns) {
    let m;
    while ((m = pat.exec(norm)) !== null) {
      sizes.push(m[1]);
    }
  }
  
  // Extract colors
  const colors = ['black', 'red', 'blue', 'green', 'pink', 'purple', 'white', 'orange', 'yellow', 'brown', 'grey', 'gray', 'tan'];
  const foundColors = colors.filter(c => norm.includes(c));
  
  return { words, sizes, colors: foundColors };
}

// Calculate similarity
function similarity(name1, name2) {
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  const w1 = new Set(n1.split(' ').filter(w => w.length > 2));
  const w2 = new Set(n2.split(' ').filter(w => w.length > 2));
  
  let common = 0;
  for (const w of w1) {
    if (w2.has(w)) common++;
  }
  
  return (2 * common) / (w1.size + w2.size);
}

// Check size and color match
function featuresMatch(f1, f2) {
  // Sizes must match if both have sizes
  if (f1.sizes.length > 0 && f2.sizes.length > 0) {
    const sizeMatch = f1.sizes.some(s => f2.sizes.includes(s));
    if (!sizeMatch) return false;
  }
  
  // Colors must match if both have colors
  if (f1.colors.length > 0 && f2.colors.length > 0) {
    const colorMatch = f1.colors.some(c => f2.colors.includes(c));
    if (!colorMatch) return false;
  }
  
  return true;
}

async function matchProducts() {
  // Get products without SKU
  const { rows: products } = await pool.query(`
    SELECT id, name, brand FROM supplies 
    WHERE sku IS NULL 
    AND brand IN ('Coastal', 'Nutrisource', 'Penn-Plax', 'Prevue', 'Nylabone', 
                  'Aquatop', 'Kong', 'RedBarn', 'Blue Buffalo', 'Diamond', 
                  'Benebone', 'Primal', 'JW Pet', 'Tetra')
    ORDER BY brand
  `);
  
  console.log('Products to match:', products.length);
  
  // Build index by brand
  const upcByBrand = {};
  for (const [upc, name] of Object.entries(upcMap)) {
    const normName = normalize(name);
    const brands = ['coastal', 'nutrisource', 'penn-plax', 'prevue', 'nylabone', 
                    'aquatop', 'kong', 'redbarn', 'blue', 'diamond', 
                    'benebone', 'primal', 'jw', 'tetra'];
    for (const b of brands) {
      if (normName.includes(b)) {
        if (!upcByBrand[b]) upcByBrand[b] = [];
        upcByBrand[b].push({ upc, name });
        break;
      }
    }
  }
  
  console.log('UPCs indexed by brand:');
  for (const [b, items] of Object.entries(upcByBrand)) {
    console.log('  ' + b + ': ' + items.length);
  }
  
  const matches = [];
  
  for (const prod of products) {
    const brandKey = (prod.brand || '').toLowerCase().split(' ')[0];
    const candidates = upcByBrand[brandKey] || [];
    
    const prodFeatures = extractFeatures(prod.name);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const cand of candidates) {
      const candFeatures = extractFeatures(cand.name);
      
      // Check features match
      if (!featuresMatch(prodFeatures, candFeatures)) continue;
      
      const score = similarity(prod.name, cand.name);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = cand;
      }
    }
    
    if (bestMatch) {
      matches.push({
        id: prod.id,
        prodName: prod.name,
        upcName: bestMatch.name,
        upc: bestMatch.upc,
        score: bestScore
      });
    }
  }
  
  console.log('\nMatches found:', matches.length);
  
  // Group by confidence
  const high = matches.filter(m => m.score >= 0.7);
  const med = matches.filter(m => m.score >= 0.5 && m.score < 0.7);
  
  console.log('High confidence (70%+):', high.length);
  console.log('Medium confidence (50-69%):', med.length);
  
  // Apply high confidence
  for (const m of high) {
    await pool.query('UPDATE supplies SET sku = $1 WHERE id = $2', [m.upc, m.id]);
  }
  console.log('Applied', high.length, 'high-confidence matches');
  
  // Sample medium matches
  console.log('\nSample medium confidence matches:');
  med.slice(0, 5).forEach(m => {
    console.log('  ' + (m.score*100).toFixed(0) + '% | ' + m.prodName.substring(0,40) + ' => ' + m.upcName.substring(0,40));
  });
  
  await pool.end();
}

matchProducts().catch(console.error);
