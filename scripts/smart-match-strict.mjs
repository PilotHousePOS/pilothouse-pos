import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq, isNull, and } from 'drizzle-orm';

// COMPREHENSIVE ABBREVIATION DICTIONARY - EXPANDED
const ABBREVS = {
  // Products
  'fd': 'food', 'fod': 'food', 'trt': 'treat', 'trts': 'treats',
  'chw': 'chew', 'chws': 'chews', 'chwr': 'chewer',
  'cllr': 'collar', 'clr': 'collar', 'lsh': 'leash', 'lead': 'leash',
  'hrns': 'harness', 'harn': 'harness',
  'bwl': 'bowl', 'fdr': 'feeder', 'wtr': 'water', 'wtrer': 'waterer',
  'toy': 'toy', 'tys': 'toys', 'bal': 'ball', 'bll': 'ball',
  'bed': 'bed', 'mat': 'mat', 'pad': 'pad',
  'cage': 'cage', 'crt': 'crate', 'crate': 'crate',
  'tank': 'tank', 'tnk': 'tank', 'aqua': 'aquarium',
  'fltr': 'filter', 'flthr': 'filter', 'crtrdg': 'cartridge',
  'pmp': 'pump', 'htr': 'heater', 'lght': 'light', 'lmp': 'lamp',
  'bulb': 'bulb', 'blb': 'bulb', 'fxtr': 'fixture',
  'dcr': 'decor', 'ornmt': 'ornament', 'plnt': 'plant',
  'grvl': 'gravel', 'sbstrt': 'substrate', 'bdng': 'bedding', 'bedng': 'bedding',
  'shmp': 'shampoo', 'cond': 'conditioner', 'spry': 'spray',
  'brsh': 'brush', 'cmb': 'comb', 'clpr': 'clipper', 'trmr': 'trimmer',
  'splmt': 'supplement', 'vit': 'vitamin', 'med': 'medicine',
  'dsh': 'dish', 'crnr': 'corner', 'wtrfl': 'waterfall',
  'vnm': 'vine', 'brch': 'branch', 'branchh': 'branch',
  'mstr': 'mister', 'ccts': 'cactus', 'sgrd': 'saguaro',
  'fnrm': 'faunarium', 'ficus': 'ficus', 'slk': 'silk',
  'mndrn': 'mandarin', 'abtln': 'abutilon', 'jngl': 'jungle',
  'rck': 'rock', 'wtrl': 'waterfall', 'glw': 'glow',
  'crckt': 'cricket', 'pn': 'pen', 'strtr': 'starter',
  
  // Sizes - STRICT MAPPING
  'sm': 'small', 'sml': 'small',
  'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large', 'lge': 'large',
  'xlg': 'xlarge', 'xlrg': 'xlarge', 'x-lg': 'xlarge', 'x-large': 'xlarge',
  'xxlg': 'xxlarge', 'xxl': 'xxlarge', 'xx-large': 'xxlarge',
  'xsm': 'xsmall', 'x-sm': 'xsmall', 'x-small': 'xsmall',
  'xxs': 'xxsmall', 'xx-small': 'xxsmall',
  'mini': 'mini', 'mn': 'mini',
  'jmb': 'jumbo', 'gnt': 'giant', 'reg': 'regular',
  
  // Colors
  'blk': 'black', 'bk': 'black', 'bl': 'blue', 'blu': 'blue',
  'wh': 'white', 'wht': 'white', 'rd': 'red', 'grn': 'green',
  'gn': 'green', 'yl': 'yellow', 'ylw': 'yellow',
  'org': 'orange', 'or': 'orange', 'pk': 'pink', 'pnk': 'pink',
  'pr': 'purple', 'prp': 'purple', 'gy': 'gray', 'gry': 'gray',
  'brn': 'brown', 'tn': 'tan', 'slvr': 'silver', 'gld': 'gold',
  
  // Animals
  'dg': 'dog', 'pup': 'puppy', 'ct': 'cat', 'ktn': 'kitten', 'kit': 'kitten',
  'fsh': 'fish', 'brd': 'bird', 'rptl': 'reptile', 'rept': 'reptile',
  'rbbt': 'rabbit', 'gpig': 'guineapig', 'hstr': 'hamster', 'grbl': 'gerbil',
  'frrt': 'ferret', 'chnchl': 'chinchilla', 'hrmt': 'hermit',
  'trtl': 'turtle', 'tort': 'tortoise', 'lzrd': 'lizard', 'snk': 'snake',
  'drgn': 'dragon', 'gecko': 'gecko', 'leo': 'leopard',
  'betta': 'betta', 'gldfish': 'goldfish', 'gf': 'goldfish',
  'cchld': 'cichlid', 'trpcl': 'tropical',
  
  // Food types
  'pllt': 'pellet', 'pllts': 'pellets', 'flk': 'flake', 'flks': 'flakes',
  'stck': 'stick', 'stcks': 'sticks', 'grn': 'grain', 'grnls': 'granules',
  'wfr': 'wafer', 'wfrs': 'wafers', 'frz': 'freeze', 'frzn': 'frozen',
  'dry': 'dry', 'wet': 'wet', 'can': 'canned',
  'tmthy': 'timothy', 'alf': 'alfalfa', 'hay': 'hay',
  'orc': 'orchard', 'mddw': 'meadow',
  
  // Flavors/Ingredients
  'chkn': 'chicken', 'bf': 'beef', 'lmb': 'lamb', 'slmn': 'salmon',
  'trky': 'turkey', 'dck': 'duck', 'vnsn': 'venison',
  'pb': 'peanutbutter', 'pntbtr': 'peanutbutter',
  'bcn': 'bacon', 'chs': 'cheese', 'apl': 'apple', 'crrt': 'carrot',
  'pmpkn': 'pumpkin', 'swpot': 'sweetpotato', 'bnna': 'banana',
  'blbry': 'blueberry', 'strwbry': 'strawberry',
  
  // Units
  'oz': 'oz', 'lb': 'lb', 'lbs': 'lb', 'gm': 'g', 
  'ml': 'ml', 'l': 'liter', 'gal': 'gallon', 'qt': 'qt', 'qrt': 'qt',
  'in': 'inch', 'ft': 'feet', 'pk': 'pack', 'ct': 'count', 'pc': 'piece',
  
  // Nylon patterns
  'nyl': 'nylon', 'lthr': 'leather', 'ctn': 'cotton', 'rbbn': 'ribbon',
  'sft': 'soft', 'cmfrt': 'comfort', 'adj': 'adjustable',
  
  // Product specific
  'dntl': 'dental', 'hlthy': 'healthy', 'edbl': 'edible',
  'orig': 'original', 'ntrl': 'natural', 'orgnic': 'organic',
  'prm': 'premium', 'dlx': 'deluxe', 'pro': 'pro',
  'glofsh': 'glofish', 'algae': 'algae',
  'uvb': 'uvb', 'uva': 'uva', 'cmbo': 'combo',
  'halo': 'halogen', 'halogen': 'halogen',
  'trm': 'terrarium', 'pldrm': 'paludarium',
  'rptbrk': 'reptibark', 'aspn': 'aspen',
  'splshpro': 'splashproof', 'rptitff': 'reptituff',
  'tllndsa': 'tillandsia',
};

// Expand abbreviations in text
function expand(text) {
  let result = text.toLowerCase();
  // Sort by length desc to match longer abbreviations first
  const sorted = Object.entries(ABBREVS).sort((a,b) => b[0].length - a[0].length);
  for (const [abbr, full] of sorted) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  return result;
}

// Extract STRICT size - normalize all sizes to standard form
function extractSize(name) {
  const lower = name.toLowerCase();
  
  // Check for X-sizes first (more specific)
  if (/\b(xx-?small|xxs)\b/i.test(lower)) return 'xxsmall';
  if (/\b(x-?small|xsm|xs)\b/i.test(lower)) return 'xsmall';
  if (/\b(xx-?large|xxl|xxlg)\b/i.test(lower)) return 'xxlarge';
  if (/\b(x-?large|xlg?|xl)\b/i.test(lower)) return 'xlarge';
  if (/\b(extra\s*small)\b/i.test(lower)) return 'xsmall';
  if (/\b(extra\s*large)\b/i.test(lower)) return 'xlarge';
  
  // Standard sizes
  if (/\b(small|sm|sml)\b/i.test(lower) && !/x-?sm|extra/i.test(lower)) return 'small';
  if (/\b(medium|med|md)\b/i.test(lower)) return 'medium';
  if (/\b(large|lg|lrg)\b/i.test(lower) && !/x-?l|extra/i.test(lower)) return 'large';
  if (/\b(mini|mn)\b/i.test(lower)) return 'mini';
  if (/\b(jumbo|jmb)\b/i.test(lower)) return 'jumbo';
  if (/\b(giant|gnt)\b/i.test(lower)) return 'giant';
  
  return null;
}

// Extract weight/volume - normalize
function extractWeight(name) {
  const patterns = [
    { regex: /(\d+\.?\d*)\s*oz/i, unit: 'oz' },
    { regex: /(\d+\.?\d*)\s*lb/i, unit: 'lb' },
    { regex: /(\d+\.?\d*)\s*#/, unit: 'lb' },
    { regex: /(\d+\.?\d*)\s*g\b/i, unit: 'g' },
    { regex: /(\d+\.?\d*)\s*gm\b/i, unit: 'g' },
    { regex: /(\d+\.?\d*)\s*ml/i, unit: 'ml' },
    { regex: /(\d+\.?\d*)\s*qt/i, unit: 'qt' },
    { regex: /(\d+)\s*gal/i, unit: 'gal' },
  ];
  for (const p of patterns) {
    const match = name.match(p.regex);
    if (match) return { value: parseFloat(match[1]), unit: p.unit };
  }
  return null;
}

// Extract color
function extractColor(name) {
  const colors = ['black', 'blue', 'red', 'green', 'yellow', 'orange', 
                  'pink', 'purple', 'white', 'gray', 'brown', 'tan',
                  'silver', 'gold', 'clear', 'rainbow'];
  const lower = name.toLowerCase();
  for (const color of colors) {
    if (lower.includes(color)) return color;
  }
  const colorAbbrevs = {
    'blk': 'black', 'bk': 'black', 'blu': 'blue', 'bl': 'blue',
    'wht': 'white', 'wh': 'white', 'rd': 'red', 'grn': 'green',
    'pnk': 'pink', 'pk': 'pink', 'prp': 'purple', 'org': 'orange',
  };
  for (const [abbr, color] of Object.entries(colorAbbrevs)) {
    if (new RegExp(`\\b${abbr}\\b`, 'i').test(name)) return color;
  }
  return null;
}

// Tokenize
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !/^\d+$/.test(t));
}

// STRICT match - sizes MUST match if both have them
function strictMatch(supplyName, upcName) {
  const supplyExpanded = expand(supplyName);
  const upcExpanded = expand(upcName);
  
  const supplyTokens = new Set(tokenize(supplyExpanded));
  const upcTokens = new Set(tokenize(upcExpanded));
  
  if (supplyTokens.size === 0) return { score: 0, reject: true, reason: 'No tokens' };
  
  // STRICT SIZE CHECK - if both have sizes, they MUST match exactly
  const supplySize = extractSize(supplyName);
  const upcSize = extractSize(upcName);
  
  if (supplySize && upcSize && supplySize !== upcSize) {
    return { score: 0, reject: true, reason: `Size mismatch: ${supplySize} vs ${upcSize}` };
  }
  
  // STRICT WEIGHT CHECK - if both have weights, they must match
  const supplyWeight = extractWeight(supplyName);
  const upcWeight = extractWeight(upcName);
  
  if (supplyWeight && upcWeight) {
    if (supplyWeight.unit !== upcWeight.unit || supplyWeight.value !== upcWeight.value) {
      return { score: 0, reject: true, reason: `Weight mismatch: ${supplyWeight.value}${supplyWeight.unit} vs ${upcWeight.value}${upcWeight.unit}` };
    }
  }
  
  // Token overlap
  let tokenMatches = 0;
  for (const token of supplyTokens) {
    if (upcTokens.has(token)) tokenMatches++;
  }
  const tokenScore = tokenMatches / supplyTokens.size;
  
  // Size bonus
  const sizeMatch = (supplySize && upcSize && supplySize === upcSize) ? 1 : 
                    (!supplySize && !upcSize) ? 0.5 : 
                    (!supplySize || !upcSize) ? 0.3 : 0;
  
  // Weight bonus
  const weightMatch = (supplyWeight && upcWeight) ? 1 : 
                      (!supplyWeight && !upcWeight) ? 0.5 : 0.3;
  
  // Color match
  const supplyColor = extractColor(supplyName);
  const upcColor = extractColor(upcName);
  const colorMatch = (supplyColor && upcColor && supplyColor === upcColor) ? 1 :
                     (!supplyColor && !upcColor) ? 0.5 : 
                     (!supplyColor || !upcColor) ? 0.3 : 0;
  
  // Check for critical word mismatches (corner vs non-corner, etc)
  const supplyHasCorner = /corner/i.test(supplyExpanded);
  const upcHasCorner = /corner/i.test(upcExpanded);
  if (supplyHasCorner !== upcHasCorner) {
    return { score: 0, reject: true, reason: 'Corner mismatch' };
  }
  
  // Weighted score
  const score = (tokenScore * 0.5) + (sizeMatch * 0.2) + (weightMatch * 0.2) + (colorMatch * 0.1);
  
  return {
    score,
    reject: false,
    details: {
      tokenScore: tokenScore.toFixed(2),
      sizeMatch: `${supplySize || 'none'} vs ${upcSize || 'none'}`,
      weightMatch: supplyWeight ? `${supplyWeight.value}${supplyWeight.unit}` : 'none' + 
                   ' vs ' + (upcWeight ? `${upcWeight.value}${upcWeight.unit}` : 'none'),
      colorMatch: `${supplyColor || 'none'} vs ${upcColor || 'none'}`,
    }
  };
}

async function main() {
  const brand = process.argv[2];
  const threshold = parseFloat(process.argv[3]) || 0.60;
  const limit = parseInt(process.argv[4]) || 30;
  
  if (!brand) {
    console.log('Usage: node smart-match-strict.mjs <brand> [threshold] [limit]');
    process.exit(1);
  }
  
  console.log(`\n=== STRICT MATCHING: ${brand} (threshold: ${threshold}) ===\n`);
  
  const allUpcs = JSON.parse(fs.readFileSync('scripts/FLAGGED_ALL_UPCS.json', 'utf-8'));
  const brandUpcs = allUpcs.filter(u => u.brand === brand);
  console.log(`Found ${brandUpcs.length} UPCs for ${brand}`);
  
  const unmatched = await db.select().from(supplies)
    .where(and(eq(supplies.brand, brand), isNull(supplies.upc)));
  console.log(`Found ${unmatched.length} unmatched supplies for ${brand}\n`);
  
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  
  const availableUpcs = brandUpcs.filter(u => !usedUpcs.has(u.upc));
  console.log(`Available (unused) UPCs: ${availableUpcs.length}\n`);
  
  const matches = [];
  const rejected = [];
  
  for (const supply of unmatched) {
    let bestMatch = null;
    let bestScore = 0;
    let rejections = [];
    
    for (const upcItem of availableUpcs) {
      const result = strictMatch(supply.name, upcItem.name);
      
      if (result.reject) {
        rejections.push({ upc: upcItem.upc, name: upcItem.name, reason: result.reason });
        continue;
      }
      
      if (result.score > bestScore && result.score >= threshold) {
        bestScore = result.score;
        bestMatch = { upc: upcItem, score: result.score, details: result.details };
      }
    }
    
    if (bestMatch) {
      matches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        upc: bestMatch.upc.upc,
        upcName: bestMatch.upc.name,
        score: bestMatch.score,
        details: bestMatch.details,
      });
    }
  }
  
  matches.sort((a, b) => b.score - a.score);
  
  console.log(`=== TOP ${Math.min(limit, matches.length)} VERIFIED MATCHES ===\n`);
  
  matches.slice(0, limit).forEach((m, i) => {
    console.log(`[${i+1}] Score: ${m.score.toFixed(3)}`);
    console.log(`    DB:  ${m.supplyName}`);
    console.log(`    UPC: ${m.upc} | ${m.upcName}`);
    console.log(`    ${m.details.sizeMatch} | ${m.details.weightMatch} | ${m.details.colorMatch}`);
    console.log('');
  });
  
  console.log(`\nTotal verified matches: ${matches.length}`);
  
  fs.writeFileSync('scripts/pending_matches.json', JSON.stringify(matches, null, 2));
  console.log('Saved to scripts/pending_matches.json');
  
  process.exit(0);
}

main().catch(console.error);
