import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq } from 'drizzle-orm';

// Comprehensive abbreviation expansions
const ABBREVIATIONS = {
  // Brands
  'oxb': 'oxbow', 'ben': 'benebone', 'smbn': 'smartbones', 'pmx': 'petmatrix',
  'nyl': 'nylabone', 'ktee': 'kaytee', 'cstl': 'coastal', 'flvl': 'fluval',
  'zmoo': 'zoomedoo', 'hik': 'hikari', 'api': 'api', 'tetr': 'tetra',
  'kong': 'kong', 'grns': 'greenies', 'brkw': 'barkworthies', 'pplx': 'pennplax',
  'extr': 'exoterra', 'zill': 'zilla', 'rptl': 'reptology', 'aqun': 'aqueon',
  
  // Product types
  'chw': 'chew', 'trt': 'treat', 'fd': 'food', 'fod': 'food', 'clr': 'collar',
  'lsh': 'leash', 'hrns': 'harness', 'bwl': 'bowl', 'fdr': 'feeder',
  'btl': 'bottle', 'bttl': 'bottle', 'tnk': 'tank', 'flthr': 'filter',
  'htr': 'heater', 'pmp': 'pump', 'lght': 'light', 'ldg': 'lodge',
  'hut': 'hut', 'hse': 'house', 'cage': 'cage', 'bed': 'bed', 'bddng': 'bedding',
  'toy': 'toy', 'shmp': 'shampoo', 'spry': 'spray', 'wps': 'wipes',
  
  // Sizes
  'xs': 'extra small', 'sm': 'small', 'md': 'medium', 'lg': 'large',
  'xlg': 'extra large', 'gnt': 'giant', 'tn': 'tiny', 'pup': 'puppy',
  'jmb': 'jumbo', 'reg': 'regular', 'mini': 'mini',
  
  // Animals
  'dg': 'dog', 'ct': 'cat', 'rbbt': 'rabbit', 'gpig': 'guinea pig',
  'hstr': 'hamster', 'grbl': 'gerbil', 'chnchl': 'chinchilla', 'frrt': 'ferret',
  'fsh': 'fish', 'rptl': 'reptile', 'brd': 'bird', 'trtl': 'turtle',
  'lzrd': 'lizard', 'snk': 'snake', 'frog': 'frog',
  
  // Oxbow specific
  'tmthy': 'timothy', 'orc': 'orchard', 'alflf': 'alfalfa', 'wstrn': 'western',
  'essntl': 'essential', 'adlt': 'adult', 'yng': 'young', 'grdn': 'garden',
  'hrvst': 'harvest', 'stck': 'stack', 'blnd': 'blend', 'critcl': 'critical',
  'cr': 'care', 'ntrl': 'natural', 'crnvr': 'carnivore', 'herb': 'herbal',
  'sim': 'simple', 'rwds': 'rewards', 'prcmfrt': 'pure comfort', 'cmft': 'comfort',
  'purcmfrt': 'pure comfort', 'lttr': 'litter', 'pan': 'pan', 'rct': 'rectangle',
  'crner': 'corner', 'wll': 'willow', 'appl': 'apple', 'stc': 'stick',
  'bndl': 'bundle', 'bnqt': 'bouquet', 'cb': 'cube', 'ply': 'play',
  'yd': 'yard', 'cvr': 'cover', 'flr': 'floor', 'mat': 'mat', 'twst': 'twist',
  'twsts': 'twists', 'rll': 'roll', 'arnd': 'around', 'ball': 'ball',
  'crzy': 'crazy', 'loco': 'loco', 'enrchd': 'enriched', 'lf': 'life',
  'run': 'run', 'hd': 'hide', 'sk': 'seek', 'hngr': 'hanger', 'pyrmid': 'pyramid',
  'blcks': 'blocks', 'hdbx': 'hide box', 'bnglow': 'bungalow', 'tnnl': 'tunnel',
  'clb': 'club', 'tmmy': 'timmy', 'pops': 'pops', 'dngly': 'dangly', 'colr': 'color',
  'wffl': 'waffle', 'crrt': 'carrot', 'dill': 'dill', 'crnbry': 'cranberry',
  'bkd': 'baked', 'btncl': 'botanical', 'scnc': 'science', 'urnry': 'urinary',
  'sprt': 'support', 'dgsv': 'digestive', 'jnt': 'joint', 'snr': 'senior',
  'immn': 'immune', 'mltv': 'multi vitamin', 'ppya': 'papaya', 'skn': 'skin',
  'ct': 'coat', 'wght': 'weight', 'mgmt': 'management',
  
  // Benebone specific
  'wshbn': 'wishbone', 'zgglr': 'zaggler', 'fshbn': 'fishbone', 'mple': 'maple',
  'bcn': 'bacon', 'pb': 'peanut butter', 'chkn': 'chicken', 'slmn': 'salmon',
  'bf': 'beef', 'trp': 'tripe', 'bn': 'bone', 'rng': 'ring', 'pwplxr': 'pawplexer',
  
  // SmartBones specific  
  'smrt': 'smart', 'bns': 'bones', 'churro': 'churro', 'kabob': 'kabob',
  'kabobz': 'kabobs', 'stfd': 'stuffed', 'twistz': 'twists', 'wrp': 'wrap',
  'stck': 'stick', 'smstck': 'smartstick', 'chamo': 'chamomile', 'lav': 'lavender',
  'hp': 'hip', 'ct': 'count', 'pk': 'pack', 'prtn': 'protein',
  
  // Units/quantities
  'oz': 'oz', 'lb': 'lb', 'gal': 'gallon', 'qt': 'quart', 'pt': 'pint',
  'ml': 'ml', 'l': 'liter', 'ct': 'count', 'pk': 'pack', 'pc': 'piece',
};

function expandAbbreviations(text) {
  let result = text.toLowerCase();
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  return result;
}

function normalize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalize(text).split(' ').filter(t => t.length > 1);
}

function extractBrand(name) {
  const brandPatterns = [
    { pattern: /oxbow|oxb\b/i, brand: 'Oxbow' },
    { pattern: /benebone|ben\b/i, brand: 'Benebone' },
    { pattern: /smartbones|smbn|pmx|petmatrix/i, brand: 'SmartBones' },
    { pattern: /barkworthies|brkw/i, brand: 'Barkworthies' },
    { pattern: /kaytee|ktee/i, brand: 'Kaytee' },
    { pattern: /coastal|cstl/i, brand: 'Coastal' },
    { pattern: /fluval|flvl/i, brand: 'Fluval' },
    { pattern: /hikari|hik\b/i, brand: 'Hikari' },
    { pattern: /tetra\b/i, brand: 'Tetra' },
    { pattern: /kong\b/i, brand: 'Kong' },
    { pattern: /nylabone|nyl\b/i, brand: 'Nylabone' },
    { pattern: /greenies|grns/i, brand: 'Greenies' },
    { pattern: /penn.?plax|pplx/i, brand: 'Penn-Plax' },
    { pattern: /zoo.?med|zmoo/i, brand: 'ZooMed' },
    { pattern: /exo.?terra|extr/i, brand: 'Exo Terra' },
    { pattern: /zilla/i, brand: 'Zilla' },
    { pattern: /aqueon|aqun/i, brand: 'Aqueon' },
    { pattern: /api\b/i, brand: 'API' },
    { pattern: /marineland/i, brand: 'Marineland' },
    { pattern: /seachem/i, brand: 'SeaChem' },
  ];
  
  for (const { pattern, brand } of brandPatterns) {
    if (pattern.test(name)) return brand;
  }
  return null;
}

function matchScore(supplyName, invoiceName) {
  const supplyExpanded = expandAbbreviations(supplyName);
  const invoiceExpanded = expandAbbreviations(invoiceName);
  
  const supplyTokens = tokenize(supplyExpanded);
  const invoiceTokens = tokenize(invoiceExpanded);
  
  if (supplyTokens.length === 0 || invoiceTokens.length === 0) return 0;
  
  // Count matching tokens
  let matches = 0;
  for (const token of supplyTokens) {
    if (invoiceTokens.includes(token)) {
      matches++;
    } else {
      // Check if token is substring of any invoice token
      for (const invToken of invoiceTokens) {
        if (invToken.includes(token) || token.includes(invToken)) {
          matches += 0.5;
          break;
        }
      }
    }
  }
  
  // Calculate score based on both directions
  const supplyScore = matches / supplyTokens.length;
  const invoiceScore = matches / invoiceTokens.length;
  
  return (supplyScore + invoiceScore) / 2;
}

async function main() {
  console.log('=== COMPREHENSIVE LINE-BY-LINE REMATCH ===\n');
  
  // Load all invoice UPCs
  const invoiceData = JSON.parse(fs.readFileSync('scripts/all_invoice_upcs.json', 'utf-8'));
  console.log(`Loaded ${invoiceData.length} invoice UPCs\n`);
  
  // Get all supplies without UPC
  const unmatchedSupplies = await db.select().from(supplies)
    .where(sql`upc IS NULL`);
  console.log(`${unmatchedSupplies.length} supplies need matching\n`);
  
  // Get existing UPCs to avoid duplicates
  const existingUpcs = await db.execute(sql`
    SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL
  `);
  const usedUpcs = new Set(existingUpcs.rows.map(r => r.upc));
  console.log(`${usedUpcs.size} UPCs already in use\n`);
  
  // Process each invoice UPC
  let matched = 0;
  let skipped = 0;
  const matchLog = [];
  
  for (const invoice of invoiceData) {
    if (usedUpcs.has(invoice.upc)) {
      skipped++;
      continue;
    }
    
    const invoiceBrand = extractBrand(invoice.name);
    if (!invoiceBrand) continue;
    
    // Find best matching supply with same brand
    let bestSupply = null;
    let bestScore = 0;
    
    for (const supply of unmatchedSupplies) {
      // Must be same brand
      if (supply.brand !== invoiceBrand) continue;
      
      const score = matchScore(supply.name, invoice.name);
      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestSupply = supply;
      }
    }
    
    if (bestSupply) {
      await db.update(supplies)
        .set({ upc: invoice.upc })
        .where(eq(supplies.id, bestSupply.id));
      
      usedUpcs.add(invoice.upc);
      
      // Remove from unmatched list
      const idx = unmatchedSupplies.findIndex(s => s.id === bestSupply.id);
      if (idx > -1) unmatchedSupplies.splice(idx, 1);
      
      matched++;
      matchLog.push({
        supply: bestSupply.name,
        invoice: invoice.name,
        upc: invoice.upc,
        score: bestScore,
        brand: invoiceBrand
      });
      
      if (matched % 100 === 0) {
        console.log(`Matched ${matched}...`);
      }
    }
  }
  
  console.log(`\nMatched ${matched} new items, skipped ${skipped} already used UPCs\n`);
  
  // Show sample matches by brand
  const byBrand = {};
  for (const m of matchLog) {
    byBrand[m.brand] = byBrand[m.brand] || [];
    byBrand[m.brand].push(m);
  }
  
  console.log('=== MATCHES BY BRAND ===');
  for (const [brand, matches] of Object.entries(byBrand)) {
    console.log(`\n${brand}: ${matches.length} matches`);
    matches.slice(0, 3).forEach(m => {
      console.log(`  ${m.supply} <- ${m.invoice} (${(m.score*100).toFixed(0)}%)`);
    });
  }
  
  // Final stats
  const final = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(upc) as with_upc, COUNT(DISTINCT upc) as unique_upcs
    FROM supplies
  `);
  
  console.log('\n=== FINAL STATS ===');
  console.log(`Total: ${final.rows[0].total}`);
  console.log(`With UPC: ${final.rows[0].with_upc}`);
  console.log(`Unique UPCs: ${final.rows[0].unique_upcs}`);
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
  
  process.exit(0);
}

main().catch(console.error);
