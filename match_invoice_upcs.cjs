const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Brand code to full name mapping
const BRAND_CODES = {
  'AQE': 'Aqueon', 'API': 'API', 'HIK': 'Hikari', 'TET': 'Tetra',
  'SLI': 'Seachem', 'COA': 'Coastal', 'ZML': 'Zoo Med', 'ZIL': 'Zilla',
  'KAY': 'Kaytee', 'FLU': 'Fluval', 'GAL': 'Gal', 'SFB': 'San Francisco Bay',
  'OME': 'Omega One', 'CRS': 'CaribSea', 'WWI': 'Worldwide Imports',
  'EXO': 'Exo Terra', 'MAR': 'Marineland', 'PEN': 'Penn Plax', 'LGM': 'Leogem',
  'TDK': 'Tetra', 'ETO': 'Eaton', 'KNG': 'Kong', 'NYL': 'Nylabone',
  'FKS': 'Fluker', 'GRN': 'Greenies', 'PUR': 'Purina', 'NTB': 'Natural Balance',
  'IMS': 'Iams', 'NUT': 'Nutro', 'BLD': 'Blue Buffalo', 'VCT': 'Victor',
  'DIA': 'Diamond', 'WEL': 'Wellness', 'ACN': 'Acana', 'ORI': 'Orijen',
  'MRK': 'Merrick', 'FRM': 'Fromm', 'EUK': 'Eukanuba', 'PRO': 'Pro Plan'
};

// Abbreviation expansions
const ABBREVS = {
  'food': 'food', 'fd': 'food', 'gf': 'goldfish', 'grnlrs': 'granules',
  'crtrdg': 'cartridge', 'q-flow': 'quietflow', 'clnr': 'cleaner',
  'algae': 'algae', 'mag': 'magnet', 'shrmp': 'shrimp', 'pllts': 'pellets',
  'grvl': 'gravel', 'vac': 'vacuum', 'kit': 'kit', 'led': 'led',
  'cond': 'conditioner', 'wtr': 'water', 'tap': 'tap', 'splmt': 'supplement',
  'tabs': 'tablets', 'fltr': 'filter', 'hetr': 'heater', 'therm': 'thermometer',
  'dcor': 'decor', 'ornmt': 'ornament', 'grv': 'gravel', 'subst': 'substrate',
  'lght': 'light', 'bkpk': 'backpack', 'crvd': 'curved', 'bwl': 'bowl',
  'repl': 'replacement', 'med': 'medium', 'sm': 'small', 'lg': 'large',
  'xlg': 'extra large', 'ck': 'chicken', 'bf': 'beef', 'lam': 'lamb',
  'slm': 'salmon', 'trky': 'turkey', 'dk': 'duck', 'tna': 'tuna',
  'whtfsh': 'whitefish', 'vens': 'venison', 'pork': 'pork',
  'grn': 'grain', 'fr': 'free', 'pup': 'puppy', 'kit': 'kitten',
  'sen': 'senior', 'ad': 'adult', 'nat': 'natural', 'org': 'organic',
  'can': 'canned', 'dry': 'dry', 'trt': 'treat', 'trts': 'treats',
  'bne': 'bone', 'chw': 'chew', 'toy': 'toy', 'cllr': 'collar',
  'lsh': 'leash', 'hrns': 'harness', 'crt': 'crate', 'bed': 'bed'
};

function expandAbbrevs(text) {
  let result = text.toLowerCase();
  for (const [abbr, full] of Object.entries(ABBREVS)) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  return result;
}

function extractFirstDescription(fullDesc, upc) {
  // The description starts after the UPC and goes until we hit EA/DZ/CS/BX/PK
  const match = fullDesc.match(/^([A-Z]{2,4}\s+[A-Z0-9\s\-\/\.]+?)\s+(EA|DZ|CS|BX|PK)\s+/i);
  if (match) {
    return match[1].trim();
  }
  // Fallback: take first 50 chars that look like a description
  const cleaned = fullDesc.replace(/\d{12,14}/g, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 8);
  return words.join(' ');
}

function normalizeForMatch(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateSimilarity(s1, s2) {
  const set1 = new Set(s1.split(' '));
  const set2 = new Set(s2.split(' '));
  const intersection = [...set1].filter(x => set2.has(x));
  const union = new Set([...set1, ...set2]);
  return intersection.length / union.size;
}

async function matchUPCs() {
  const invoiceUPCs = JSON.parse(fs.readFileSync('/tmp/extracted_invoice_upcs.json', 'utf8'));
  console.log(`Loaded ${invoiceUPCs.length} invoice UPCs`);
  
  // Get products without SKU
  const { rows: products } = await pool.query(`
    SELECT id, name, brand, category, description
    FROM supplies
    WHERE sku IS NULL OR sku = ''
  `);
  console.log(`Found ${products.length} products without SKU`);
  
  // Get products already with SKU to avoid duplicates
  const { rows: existingSkus } = await pool.query(`
    SELECT sku FROM supplies WHERE sku IS NOT NULL AND sku != ''
  `);
  const existingSKUSet = new Set(existingSkus.map(r => r.sku));
  console.log(`Existing SKUs in database: ${existingSKUSet.size}`);
  
  const matches = [];
  const matchedProductIds = new Set();
  
  for (const invoice of invoiceUPCs) {
    // Skip if UPC already exists
    if (existingSKUSet.has(invoice.upc)) continue;
    
    // Extract brand code and description
    const firstDesc = extractFirstDescription(invoice.description, invoice.upc);
    const brandCode = firstDesc.substring(0, 3).toUpperCase();
    const brandName = BRAND_CODES[brandCode] || '';
    
    // Normalize for matching
    const invoiceNormalized = normalizeForMatch(expandAbbrevs(firstDesc));
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const product of products) {
      if (matchedProductIds.has(product.id)) continue;
      
      // Score based on brand match
      let score = 0;
      if (brandName && product.brand && 
          product.brand.toLowerCase().includes(brandName.toLowerCase())) {
        score += 0.3;
      }
      
      // Score based on name similarity
      const productNormalized = normalizeForMatch(product.name || '');
      const nameSim = calculateSimilarity(invoiceNormalized, productNormalized);
      score += nameSim * 0.5;
      
      // Score based on description similarity
      if (product.description) {
        const descNormalized = normalizeForMatch(product.description);
        const descSim = calculateSimilarity(invoiceNormalized, descNormalized);
        score += descSim * 0.2;
      }
      
      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestMatch = { product, score };
      }
    }
    
    if (bestMatch) {
      matches.push({
        productId: bestMatch.product.id,
        productName: bestMatch.product.name,
        upc: invoice.upc,
        invoiceDesc: firstDesc,
        score: bestMatch.score.toFixed(2)
      });
      matchedProductIds.add(bestMatch.product.id);
    }
  }
  
  console.log(`\nMatched ${matches.length} products to UPCs`);
  
  // Apply updates in batches
  let updated = 0;
  for (const match of matches) {
    try {
      await pool.query(`UPDATE supplies SET sku = $1 WHERE id = $2 AND (sku IS NULL OR sku = '')`,
        [match.upc, match.productId]);
      updated++;
    } catch (err) {
      console.error(`Error updating ${match.productId}:`, err.message);
    }
  }
  
  console.log(`Updated ${updated} products with SKUs`);
  
  // Report new coverage
  const { rows: [stats] } = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_sku
    FROM supplies
  `);
  
  const coverage = (stats.with_sku / stats.total * 100).toFixed(1);
  console.log(`\nNew coverage: ${stats.with_sku}/${stats.total} (${coverage}%)`);
  
  // Save match report
  fs.writeFileSync('/tmp/upc_match_report.json', JSON.stringify(matches, null, 2));
  console.log('Match report saved to /tmp/upc_match_report.json');
  
  // Show sample matches
  console.log('\nSample matches:');
  matches.slice(0, 10).forEach(m => {
    console.log(`  ${m.upc} -> ${m.productName.substring(0, 40)}... (score: ${m.score})`);
  });
  
  await pool.end();
}

matchUPCs().catch(console.error);
