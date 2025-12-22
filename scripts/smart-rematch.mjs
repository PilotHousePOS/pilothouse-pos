import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq } from 'drizzle-orm';

// Invoice prefix to brand mapping
const PREFIX_TO_BRAND = {
  'AQE': 'Aqueon', 'AQN': 'Aqueon',
  'API': 'API',
  'HIK': 'Hikari',
  'TET': 'Tetra', 'TETR': 'Tetra',
  'FLV': 'Fluval', 'FLVL': 'Fluval',
  'ZMD': 'Zoo Med', 'ZOO': 'Zoo Med', 'ZMED': 'Zoo Med',
  'EXT': 'Exo Terra', 'EXTR': 'Exo Terra', 'EXO': 'Exo Terra',
  'ZIL': 'Zilla', 'ZILL': 'Zilla',
  'KNG': 'Kong', 'KONG': 'Kong',
  'NYL': 'Nylabone',
  'KAY': 'Kaytee', 'KTEE': 'Kaytee',
  'CST': 'Coastal', 'CSTL': 'Coastal',
  'OXB': 'Oxbow',
  'BEN': 'Benebone',
  'PMX': 'SmartBones', 'SMBN': 'SmartBones',
  'GRN': 'Greenies', 'GRNS': 'Greenies',
  'RDB': 'RedBarn', 'RED': 'RedBarn',
  'PPX': 'Penn-Plax', 'PPLX': 'Penn-Plax', 'PEN': 'Penn-Plax',
  'MRN': 'Marineland', 'MARN': 'Marineland',
  'FRM': 'Fromm',
  'SPT': 'Spot',
  'TRP': 'TropiClean',
  'PRV': 'Prevue',
  'BRD': 'Birdlife',
  'BLU': 'Blue Buffalo',
  'NUT': 'Nutrisource',
  'SCD': 'Science Diet', 'HSD': 'Science Diet',
  'IAM': 'Iams',
  'WHL': 'Whimzees',
  'JNS': 'Jones Natural Chews',
  'BWY': 'Barkworthies', 'BRKW': 'Barkworthies',
};

// Brand name normalization
const BRAND_NORMALIZE = {
  'zoo med': 'Zoo Med', 'zoomed': 'Zoo Med', 'zoomedoo': 'Zoo Med',
  'exo terra': 'Exo Terra', 'exoterra': 'Exo Terra',
  'penn-plax': 'Penn-Plax', 'pennplax': 'Penn-Plax', 'penn plax': 'Penn-Plax',
  'li\'l pals': 'Coastal', 'lil pals': 'Coastal',  // Li'l Pals is Coastal brand
  'coastal': 'Coastal',
  'science diet': 'Science Diet', 'sciencediet': 'Science Diet',
  'blue buffalo': 'Blue Buffalo', 'bluebuffalo': 'Blue Buffalo',
  'redbarn': 'RedBarn', 'red barn': 'RedBarn',
  'smartbones': 'SmartBones', 'smart bones': 'SmartBones',
  'barkworthies': 'Barkworthies',
};

function normalizeBrand(brand) {
  if (!brand) return null;
  const lower = brand.toLowerCase().trim();
  return BRAND_NORMALIZE[lower] || brand;
}

function extractBrandFromInvoice(name) {
  // Try prefix first
  const prefix = name.split(' ')[0].toUpperCase();
  if (PREFIX_TO_BRAND[prefix]) {
    return PREFIX_TO_BRAND[prefix];
  }
  
  // Try 3-letter prefix
  const prefix3 = prefix.substring(0, 3);
  if (PREFIX_TO_BRAND[prefix3]) {
    return PREFIX_TO_BRAND[prefix3];
  }
  
  // Try brand patterns in name
  const patterns = [
    { pattern: /aqueon/i, brand: 'Aqueon' },
    { pattern: /fluval/i, brand: 'Fluval' },
    { pattern: /tetra\b/i, brand: 'Tetra' },
    { pattern: /hikari/i, brand: 'Hikari' },
    { pattern: /zoo\s*med/i, brand: 'Zoo Med' },
    { pattern: /exo\s*terra/i, brand: 'Exo Terra' },
    { pattern: /zilla/i, brand: 'Zilla' },
    { pattern: /kong\b/i, brand: 'Kong' },
    { pattern: /nylabone/i, brand: 'Nylabone' },
    { pattern: /kaytee/i, brand: 'Kaytee' },
    { pattern: /coastal/i, brand: 'Coastal' },
    { pattern: /oxbow/i, brand: 'Oxbow' },
    { pattern: /benebone/i, brand: 'Benebone' },
    { pattern: /smartbones/i, brand: 'SmartBones' },
    { pattern: /greenies/i, brand: 'Greenies' },
    { pattern: /redbarn/i, brand: 'RedBarn' },
    { pattern: /penn.?plax/i, brand: 'Penn-Plax' },
    { pattern: /marineland/i, brand: 'Marineland' },
    { pattern: /api\b/i, brand: 'API' },
    { pattern: /prevue/i, brand: 'Prevue' },
    { pattern: /barkworth/i, brand: 'Barkworthies' },
    { pattern: /science.?diet/i, brand: 'Science Diet' },
    { pattern: /blue.?buffalo/i, brand: 'Blue Buffalo' },
    { pattern: /fromm/i, brand: 'Fromm' },
    { pattern: /iams/i, brand: 'Iams' },
    { pattern: /nutrisource/i, brand: 'Nutrisource' },
    { pattern: /tropiclean/i, brand: 'TropiClean' },
    { pattern: /spot\b/i, brand: 'Spot' },
  ];
  
  for (const { pattern, brand } of patterns) {
    if (pattern.test(name)) return brand;
  }
  
  return null;
}

// Abbreviation expansions
const ABBREVS = {
  'fd': 'food', 'fod': 'food', 'trt': 'treat', 'chw': 'chew',
  'clr': 'collar', 'lsh': 'leash', 'hrns': 'harness',
  'cchld': 'cichlid', 'gld': 'gold', 'stpl': 'staple',
  'pllt': 'pellet', 'flk': 'flake', 'stck': 'stick',
  'cond': 'conditioner', 'clnr': 'cleaner', 'flthr': 'filter',
  'grvl': 'gravel', 'vac': 'vacuum', 'blb': 'bulb',
  'fxtr': 'fixture', 'strp': 'strip', 'lght': 'light',
  'htr': 'heater', 'pmp': 'pump', 'dcr': 'decor',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xlg': 'extra large',
  'mn': 'mini', 'jmb': 'jumbo', 'reg': 'regular',
  'wht': 'white', 'blk': 'black', 'blu': 'blue', 'grn': 'green',
  'oz': 'oz', 'lb': 'lb', 'gal': 'gallon', 'in': 'inch',
  'pk': 'pack', 'ct': 'count', 'pc': 'piece',
  'tmthy': 'timothy', 'orc': 'orchard', 'hay': 'hay',
  'rbbt': 'rabbit', 'gpig': 'guinea pig', 'hstr': 'hamster',
  'fsh': 'fish', 'rptl': 'reptile', 'brd': 'bird',
  'dg': 'dog', 'ct': 'cat', 'pup': 'puppy',
  'wshbn': 'wishbone', 'zgglr': 'zaggler', 'bcn': 'bacon',
  'pb': 'peanut butter', 'chkn': 'chicken', 'slmn': 'salmon',
  'mple': 'maple', 'bf': 'beef',
};

function expand(text) {
  let result = text.toLowerCase();
  for (const [abbr, full] of Object.entries(ABBREVS)) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  return result;
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().split(/\s+/).filter(t => t.length > 1);
}

function matchScore(supplyName, invoiceName) {
  const supplyExpanded = expand(supplyName);
  const invoiceExpanded = expand(invoiceName);
  
  const supplyTokens = tokenize(supplyExpanded);
  const invoiceTokens = tokenize(invoiceExpanded);
  
  if (supplyTokens.length === 0 || invoiceTokens.length === 0) return 0;
  
  let matches = 0;
  for (const token of supplyTokens) {
    if (invoiceTokens.includes(token)) {
      matches++;
    } else {
      for (const invToken of invoiceTokens) {
        if (invToken.includes(token) || token.includes(invToken)) {
          matches += 0.5;
          break;
        }
      }
    }
  }
  
  return matches / Math.max(supplyTokens.length, 1);
}

async function main() {
  console.log('=== SMART BRAND-AWARE REMATCH ===\n');
  
  // Load invoice data
  const invoiceData = JSON.parse(fs.readFileSync('scripts/all_invoice_upcs.json', 'utf-8'));
  console.log(`Loaded ${invoiceData.length} invoice items\n`);
  
  // Extract/assign brands to invoice items
  let brandAssigned = 0;
  for (const inv of invoiceData) {
    if (!inv.brand || inv.brand === 'unknown') {
      const detectedBrand = extractBrandFromInvoice(inv.name);
      if (detectedBrand) {
        inv.detectedBrand = detectedBrand;
        brandAssigned++;
      }
    } else {
      inv.detectedBrand = normalizeBrand(inv.brand) || inv.brand;
    }
  }
  console.log(`Assigned brands to ${brandAssigned} previously unknown items\n`);
  
  // Get all supplies
  const allSupplies = await db.select().from(supplies);
  const unmatchedSupplies = allSupplies.filter(s => !s.upc);
  console.log(`${unmatchedSupplies.length} supplies need matching\n`);
  
  // Get existing UPCs
  const usedUpcs = new Set(allSupplies.filter(s => s.upc).map(s => s.upc));
  console.log(`${usedUpcs.size} UPCs already used\n`);
  
  // Match by brand
  let matched = 0;
  const matchedIds = new Set();
  
  for (const inv of invoiceData) {
    if (usedUpcs.has(inv.upc)) continue;
    
    const invBrand = inv.detectedBrand;
    if (!invBrand) continue;
    
    let bestSupply = null;
    let bestScore = 0;
    
    for (const supply of unmatchedSupplies) {
      if (matchedIds.has(supply.id)) continue;
      
      const supplyBrand = normalizeBrand(supply.brand);
      if (supplyBrand !== invBrand) continue;
      
      const score = matchScore(supply.name, inv.name);
      if (score > bestScore && score >= 0.35) {
        bestScore = score;
        bestSupply = supply;
      }
    }
    
    if (bestSupply) {
      await db.update(supplies)
        .set({ upc: inv.upc })
        .where(eq(supplies.id, bestSupply.id));
      
      usedUpcs.add(inv.upc);
      matchedIds.add(bestSupply.id);
      matched++;
      
      if (matched <= 20 || matched % 100 === 0) {
        console.log(`[${matched}] ${bestSupply.brand}: ${bestSupply.name} <- ${inv.name} (${(bestScore*100).toFixed(0)}%)`);
      }
    }
  }
  
  console.log(`\nMatched ${matched} items by brand\n`);
  
  // Final stats
  const final = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(upc) as with_upc, COUNT(DISTINCT upc) as unique_upcs
    FROM supplies
  `);
  
  console.log('=== FINAL STATS ===');
  console.log(`Total: ${final.rows[0].total}`);
  console.log(`With UPC: ${final.rows[0].with_upc}`);
  console.log(`Coverage: ${(parseInt(final.rows[0].with_upc) / parseInt(final.rows[0].total) * 100).toFixed(1)}%`);
  
  // Target brands
  const targetBrands = await db.execute(sql`
    SELECT brand, COUNT(*) as total, COUNT(upc) as matched
    FROM supplies
    WHERE brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies')
    GROUP BY brand ORDER BY total DESC
  `);
  
  console.log('\nTarget brands:');
  for (const row of targetBrands.rows) {
    const pct = Math.round(parseInt(row.matched) / parseInt(row.total) * 100);
    console.log(`  ${row.brand}: ${row.matched}/${row.total} (${pct}%)`);
  }
  
  // Cross-brand check
  const crossCheck = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM (
      SELECT upc FROM supplies 
      WHERE upc IS NOT NULL AND brand IS NOT NULL AND brand != ''
      GROUP BY upc HAVING COUNT(DISTINCT brand) > 1
    ) t
  `);
  console.log(`\nCross-brand errors: ${crossCheck.rows[0].cnt}`);
  
  process.exit(0);
}

main().catch(console.error);
