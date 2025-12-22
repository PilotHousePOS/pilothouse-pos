import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq } from 'drizzle-orm';

// Expanded abbreviation mappings for Central Pet codes
const abbreviations = {
  // Oxbow abbreviations
  'oxb': 'oxbow', 'essntl': 'essential', 'tmthy': 'timothy', 'westrn': 'western',
  'adlt': 'adult', 'yng': 'young', 'rbbt': 'rabbit', 'gpig': 'guinea pig',
  'chinch': 'chinchilla', 'frrt': 'ferret', 'mse': 'mouse', 'orc': 'orchard',
  'grss': 'grass', 'trt': 'treat', 'bttl': 'bottle', 'lttr': 'litter',
  'bedng': 'bedding', 'cmft': 'comfort', 'wh': 'white', 'nat': 'natural',
  'clbrtn': 'celebration', 'wll': 'willow', 'ply': 'play', 'cb': 'cube',
  'appl': 'apple', 'stc': 'stick', 'bll': 'ball', 'rll': 'roll', 'h/s': 'hide seek',
  'twsts': 'twists', 'bkd': 'baked', 'crrt': 'carrot', 'pep': 'pepper',
  'grdn': 'garden', 'blks': 'blocks', 'flwrs': 'flowers', 'slc': 'slice',
  'or': 'orange', 'crnr': 'corner', 'hngr': 'hanger', 'lollipop': 'lollipop',
  'fdr': 'feeder', 'bouquet': 'bouquet', 'popsicle': 'popsicle', 'crnchy': 'crunchy',
  'hbt': 'habitat', 'eco': 'eco', 'strw': 'straw', 'omni': 'omnivore',
  'crnvr': 'carnivore', 'tumble': 'tumble', 'toss': 'toss', 'run': 'run',
  'hide': 'hide', 'crnch': 'crunch', 'chwy': 'chewy', 'poof': 'poof',
  'lava': 'lava', 'ldg': 'ledge', 'cvy': 'cave', 'cozy': 'cozy',
  
  // SmartBones abbreviations  
  'smbn': 'smartbones', 'pmx': 'petmatrix', 'smrt': 'smart', 'twst': 'twist',
  'chkn': 'chicken', 'stfd': 'stuffed', 'twistz': 'twistz', 'wrp': 'wrap',
  'pb': 'peanut butter', 'chamo': 'chamomile', 'lav': 'lavender',
  'churro': 'churro', 'smstck': 'smart stick',
  
  // Benebone abbreviations
  'ben': 'benebone', 'chw': 'chew', 'wshbn': 'wishbone', 'bcn': 'bacon',
  'mple': 'maple', 'zgglr': 'zaggler', 'fshbn': 'fishbone', 'slmn': 'salmon',
  'gnt': 'giant', 'pup': 'puppy',
  
  // General abbreviations
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large',
  'xs': 'extra small', 'ct': 'count', 'pk': 'pack', 'oz': 'oz', 'lb': 'lb',
};

function expandName(name) {
  let expanded = name;
  for (const [abbr, full] of Object.entries(abbreviations)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  return expanded;
}

function normalizeForMatch(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(name) {
  return normalizeForMatch(name).split(' ').filter(t => t.length > 2);
}

function calculateSimilarity(tokens1, tokens2) {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  const intersection = tokens1.filter(t => set2.has(t)).length;
  const union = new Set([...tokens1, ...tokens2]).size;
  return intersection / Math.max(union, 1);
}

async function main() {
  console.log('=== REBUILD MASTER AND REMATCH ===\n');
  
  // Load invoice UPCs
  const invoiceData = JSON.parse(fs.readFileSync('scripts/all_invoice_upcs.json', 'utf-8'));
  console.log(`Loaded ${invoiceData.length} invoice UPCs`);
  
  // Expand names and build index
  const invoiceIndex = invoiceData.map(item => {
    const expandedName = expandName(item.name);
    return {
      ...item,
      expandedName,
      normalizedName: normalizeForMatch(expandedName),
      tokens: tokenize(expandedName)
    };
  });
  
  // Get all supplies
  const allSupplies = await db.select().from(supplies);
  console.log(`Found ${allSupplies.length} supplies\n`);
  
  // Clear existing UPCs for fresh matching
  await db.execute(sql`UPDATE supplies SET upc = NULL`);
  console.log('Cleared existing UPCs');
  
  const matches = [];
  const usedUpcs = new Set();
  
  for (const supply of allSupplies) {
    const supplyExpanded = expandName(supply.name);
    const supplyNorm = normalizeForMatch(supplyExpanded);
    const supplyTokens = tokenize(supplyExpanded);
    const supplyBrand = (supply.brand || '').toLowerCase().replace(/[^a-z]/g, '');
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const invoice of invoiceIndex) {
      if (usedUpcs.has(invoice.upc)) continue;
      
      // Brand match check
      const brandMatch = supplyBrand && invoice.brand === supplyBrand;
      
      // Token similarity
      const similarity = calculateSimilarity(supplyTokens, invoice.tokens);
      
      // Containment check
      const matchingTokens = supplyTokens.filter(t => 
        invoice.normalizedName.includes(t) || invoice.tokens.includes(t)
      );
      const containment = matchingTokens.length / Math.max(supplyTokens.length, 1);
      
      // Combined score
      let score = similarity * 0.5 + containment * 0.5;
      if (brandMatch) score += 0.3;
      
      // Size/weight matching bonus
      const sizePattern = /(\d+(?:\.\d+)?)\s*(lb|oz|#|l)\b/i;
      const supplySize = supplyNorm.match(sizePattern);
      const invoiceSize = invoice.normalizedName.match(sizePattern);
      if (supplySize && invoiceSize && supplySize[1] === invoiceSize[1]) {
        score += 0.15;
      }
      
      // Threshold
      if (score > bestScore && score >= 0.45) {
        bestScore = score;
        bestMatch = invoice;
      }
    }
    
    if (bestMatch) {
      matches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        matchedName: bestMatch.expandedName,
        upc: bestMatch.upc,
        score: bestScore,
        brand: bestMatch.brand
      });
      usedUpcs.add(bestMatch.upc);
    }
  }
  
  console.log(`\nFound ${matches.length} matches`);
  
  // Apply matches
  console.log('Applying matches to database...');
  let applied = 0;
  for (const m of matches) {
    await db.update(supplies)
      .set({ upc: m.upc })
      .where(eq(supplies.id, m.supplyId));
    applied++;
  }
  console.log(`Applied ${applied} UPCs`);
  
  // Check coverage
  const finalCount = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(upc) as with_upc FROM supplies
  `);
  const total = parseInt(finalCount.rows[0].total);
  const withUpc = parseInt(finalCount.rows[0].with_upc);
  console.log(`\n=== COVERAGE: ${withUpc}/${total} (${(withUpc/total*100).toFixed(1)}%) ===`);
  
  // Target brand stats
  const brandStats = await db.execute(sql`
    SELECT brand, COUNT(*) as total, COUNT(upc) as matched
    FROM supplies
    WHERE brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies', 'Penn-Plax')
    GROUP BY brand ORDER BY total DESC
  `);
  console.log('\n=== TARGET BRANDS ===');
  for (const row of brandStats.rows) {
    const pct = Math.round(parseInt(row.matched) / parseInt(row.total) * 100);
    console.log(`  ${row.brand}: ${row.matched}/${row.total} (${pct}%)`);
  }
  
  // Save confirmed matches
  const confirmedMatches = matches.map(m => ({ supplyId: m.supplyId, upc: m.upc }));
  fs.writeFileSync('scripts/confirmed_upc_matches.json', JSON.stringify({ matches: confirmedMatches }, null, 2));
  console.log(`\nSaved ${confirmedMatches.length} matches to confirmed_upc_matches.json`);
  
  process.exit(0);
}

main().catch(console.error);
