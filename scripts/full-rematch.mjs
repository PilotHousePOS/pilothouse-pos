import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq } from 'drizzle-orm';

// Complete prefix to brand mapping
const PREFIX_TO_BRAND = {
  // Verified mappings
  'COA': 'Coastal', 'CSTL': 'Coastal', 'CST': 'Coastal',
  'KON': 'Kong', 'KONG': 'Kong',
  'ZML': 'Zoo Med', 'ZMD': 'Zoo Med', 'ZOO': 'Zoo Med',
  'ETH': 'Ethical Products', 'ETHCL': 'Ethical Products',
  'ZIL': 'Zilla', 'ZILL': 'Zilla',
  'OXB': 'Oxbow',
  'AEC': 'Kaytee', // AEC is Kaytee/Super Pet line
  'TET': 'Tetra', 'TETR': 'Tetra',
  'KAY': 'Kaytee', 'KTEE': 'Kaytee',
  'AQE': 'Aqueon', 'AQN': 'Aqueon',
  'PTS': 'Penn-Plax', // PTS = Pets International (Penn-Plax)
  'TRO': 'TropiClean', 'TROP': 'TropiClean',
  'RBP': 'RedBarn', 'RDB': 'RedBarn', 'RED': 'RedBarn',
  'GRE': 'Greenies', 'GRNS': 'Greenies',
  'HIK': 'Hikari',
  'FAS': 'Fashion Pet',
  'DOS': 'Doskocil', 'DSK': 'Doskocil',
  'FLU': 'Fluval', 'FLVL': 'Fluval',
  'NYL': 'Nylabone',
  'API': 'API',
  'FOU': 'Four Paws', 'FRP': 'Four Paws',
  'GAR': 'Garmon', // Garmon Corp
  'LOV': 'Loving Pets',
  'NBP': 'Natural Balance',
  'MAM': 'Mammoth',
  'BEN': 'Benebone',
  'PMX': 'SmartBones', 'SMBN': 'SmartBones',
  'BWY': 'Barkworthies', 'BRKW': 'Barkworthies',
  'PPX': 'Penn-Plax', 'PEN': 'Penn-Plax',
  'MRN': 'Marineland', 'MARN': 'Marineland',
  'EXT': 'Exo Terra', 'EXO': 'Exo Terra',
  'PRV': 'Prevue',
  'SPT': 'Spot',
  'BRD': 'Birdlife',
  'SCD': 'Science Diet', 'HSD': 'Science Diet',
  'FRM': 'Fromm',
  'NUT': 'Nutrisource',
  'BLU': 'Blue Buffalo',
  'IAM': 'Iams',
  'JNS': 'Jones Natural Chews',
  'WHL': 'Whimzees',
  'LEE': 'Lee\'s',
  'CAR': 'Carefresh',
  'ARM': 'Arm & Hammer',
  'VAN': 'Van Ness',
  'JWP': 'JW Pet',
  'PET': 'Petmate',
  'RCH': 'Ranchhand',
  'OAS': 'Oasis',
  'VIT': 'Vitakraft',
};

// Brand name normalization (db name -> canonical name)
const BRAND_NORMALIZE = {
  'zoo med': 'Zoo Med', 'zoomed': 'Zoo Med',
  'exo terra': 'Exo Terra', 'exoterra': 'Exo Terra',
  'penn-plax': 'Penn-Plax', 'pennplax': 'Penn-Plax', 'penn plax': 'Penn-Plax',
  'li\'l pals': 'Coastal', 'lil pals': 'Coastal',
  'coastal': 'Coastal',
  'science diet': 'Science Diet',
  'blue buffalo': 'Blue Buffalo',
  'redbarn': 'RedBarn', 'red barn': 'RedBarn',
  'smartbones': 'SmartBones', 'smart bones': 'SmartBones',
  'barkworthies': 'Barkworthies',
  'tropiclean': 'TropiClean',
  'ethical products': 'Ethical Products', 'ethical': 'Ethical Products',
  'four paws': 'Four Paws',
  'natural balance': 'Natural Balance',
  'loving pets': 'Loving Pets',
  'kaytee': 'Kaytee',
  'super pet': 'Kaytee', // Super Pet is Kaytee brand
  'prevue': 'Prevue', 'prevue pet': 'Prevue',
  'fashion pet': 'Fashion Pet',
  'mammoth': 'Mammoth',
  'doskocil': 'Doskocil', 'petmate': 'Doskocil', // Doskocil = Petmate
  'spot': 'Spot',
  'fluval': 'Fluval',
  'hikari': 'Hikari',
  'tetra': 'Tetra',
  'kong': 'Kong',
  'nylabone': 'Nylabone',
  'greenies': 'Greenies',
  'api': 'API',
  'zilla': 'Zilla',
  'aqueon': 'Aqueon',
  'marineland': 'Marineland',
  'birdlife': 'Birdlife',
  'fromm': 'Fromm',
  'nutrisource': 'Nutrisource',
  'iams': 'Iams',
  'oxbow': 'Oxbow',
  'benebone': 'Benebone',
  'garmon': 'Garmon',
};

function normalizeBrand(brand) {
  if (!brand) return null;
  const lower = brand.toLowerCase().trim();
  return BRAND_NORMALIZE[lower] || brand;
}

function extractBrandFromInvoice(name) {
  const prefix = name.split(' ')[0].toUpperCase();
  if (PREFIX_TO_BRAND[prefix]) return PREFIX_TO_BRAND[prefix];
  
  const prefix3 = prefix.substring(0, 3);
  if (PREFIX_TO_BRAND[prefix3]) return PREFIX_TO_BRAND[prefix3];
  
  return null;
}

const ABBREVS = {
  'fd': 'food', 'fod': 'food', 'trt': 'treat', 'chw': 'chew',
  'clr': 'collar', 'cllr': 'collar', 'lsh': 'leash', 'lead': 'leash',
  'hrns': 'harness', 'bwl': 'bowl', 'fdr': 'feeder',
  'cchld': 'cichlid', 'gld': 'gold', 'stpl': 'staple',
  'pllt': 'pellet', 'flk': 'flake', 'stck': 'stick',
  'cond': 'conditioner', 'clnr': 'cleaner', 'flthr': 'filter',
  'grvl': 'gravel', 'vac': 'vacuum', 'blb': 'bulb', 'bulb': 'bulb',
  'fxtr': 'fixture', 'strp': 'strip', 'lght': 'light',
  'htr': 'heater', 'pmp': 'pump', 'dcr': 'decor', 'ornmt': 'ornament',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xlg': 'extra large',
  'mn': 'mini', 'jmb': 'jumbo', 'reg': 'regular',
  'wht': 'white', 'blk': 'black', 'blu': 'blue', 'grn': 'green',
  'pk': 'pink', 'rd': 'red', 'yl': 'yellow', 'org': 'orange',
  'oz': 'oz', 'lb': 'lb', 'in': 'inch', 'ft': 'feet',
  'pk': 'pack', 'ct': 'count', 'pc': 'piece',
  'tmthy': 'timothy', 'orc': 'orchard',
  'rbbt': 'rabbit', 'gpig': 'guinea pig', 'hstr': 'hamster',
  'fsh': 'fish', 'rptl': 'reptile', 'brd': 'bird',
  'dg': 'dog', 'pup': 'puppy', 'cat': 'cat',
  'wshbn': 'wishbone', 'zgglr': 'zaggler', 'bcn': 'bacon',
  'pb': 'peanut butter', 'chkn': 'chicken', 'slmn': 'salmon',
  'shmp': 'shampoo', 'spry': 'spray', 'brsh': 'brush',
  'rbbn': 'ribbon', 'nyl': 'nylon', 'lthr': 'leather',
  'fshn': 'fashion', 'brght': 'bright', 'prnt': 'print',
  'scrttls': 'scratches', 'teasr': 'teaser',
  'dntl': 'dental', 'hlthy': 'healthy', 'edbl': 'edible',
  'glofsh': 'glofish', 'betta': 'betta',
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
  
  if (supplyTokens.length === 0) return 0;
  
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
  
  return matches / supplyTokens.length;
}

async function main() {
  console.log('=== FULL REMATCH WITH ALL PREFIXES ===\n');
  
  const invoiceData = JSON.parse(fs.readFileSync('scripts/all_invoice_upcs.json', 'utf-8'));
  console.log(`Loaded ${invoiceData.length} invoice items\n`);
  
  // Assign brands to all invoice items
  let assigned = 0;
  for (const inv of invoiceData) {
    const detected = extractBrandFromInvoice(inv.name);
    if (detected) {
      inv.detectedBrand = detected;
      assigned++;
    }
  }
  console.log(`Assigned brands to ${assigned}/${invoiceData.length} invoice items\n`);
  
  const allSupplies = await db.select().from(supplies);
  const unmatchedSupplies = allSupplies.filter(s => !s.upc);
  console.log(`${unmatchedSupplies.length} supplies need matching\n`);
  
  const usedUpcs = new Set(allSupplies.filter(s => s.upc).map(s => s.upc));
  
  let matched = 0;
  const matchedIds = new Set();
  const brandMatches = {};
  
  for (const inv of invoiceData) {
    if (usedUpcs.has(inv.upc)) continue;
    if (!inv.detectedBrand) continue;
    
    let bestSupply = null;
    let bestScore = 0;
    
    for (const supply of unmatchedSupplies) {
      if (matchedIds.has(supply.id)) continue;
      
      const supplyBrand = normalizeBrand(supply.brand);
      if (supplyBrand !== inv.detectedBrand) continue;
      
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
      
      brandMatches[inv.detectedBrand] = (brandMatches[inv.detectedBrand] || 0) + 1;
      
      if (matched <= 10) {
        console.log(`[${matched}] ${inv.detectedBrand}: ${bestSupply.name} <- ${inv.name}`);
      }
    }
  }
  
  console.log(`\nMatched ${matched} items\n`);
  
  console.log('=== MATCHES BY BRAND ===');
  Object.entries(brandMatches).sort((a,b) => b[1] - a[1]).forEach(([brand, count]) => {
    console.log(`  ${brand}: ${count}`);
  });
  
  const final = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(upc) as with_upc, COUNT(DISTINCT upc) as unique_upcs
    FROM supplies
  `);
  
  console.log('\n=== FINAL STATS ===');
  console.log(`Total: ${final.rows[0].total}`);
  console.log(`With UPC: ${final.rows[0].with_upc}`);
  console.log(`Coverage: ${(parseInt(final.rows[0].with_upc) / parseInt(final.rows[0].total) * 100).toFixed(1)}%`);
  
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
