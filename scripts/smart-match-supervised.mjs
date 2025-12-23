import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq, isNull, and } from 'drizzle-orm';

// COMPREHENSIVE ABBREVIATION DICTIONARY
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
  
  // Sizes
  'sm': 'small', 'sml': 'small', 'mini': 'mini', 'mn': 'mini',
  'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large', 'lge': 'large',
  'xl': 'extra large', 'xlg': 'extra large', 'xlrg': 'extra large',
  'xxl': 'xx large', 'xxlg': 'xx large',
  'xs': 'extra small', 'xxs': 'xx small',
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
  'rbbt': 'rabbit', 'gpig': 'guinea pig', 'hstr': 'hamster', 'grbl': 'gerbil',
  'frrt': 'ferret', 'chnchl': 'chinchilla', 'hrmt': 'hermit',
  'trtl': 'turtle', 'tort': 'tortoise', 'lzrd': 'lizard', 'snk': 'snake',
  'drgn': 'dragon', 'brd drgn': 'bearded dragon', 'gecko': 'gecko',
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
  'pb': 'peanut butter', 'pnt btr': 'peanut butter', 'pntbtr': 'peanut butter',
  'bcn': 'bacon', 'chs': 'cheese', 'apl': 'apple', 'crrt': 'carrot',
  'pmpkn': 'pumpkin', 'swpot': 'sweet potato', 'bnna': 'banana',
  'blbry': 'blueberry', 'strwbry': 'strawberry',
  
  // Units
  'oz': 'oz', 'lb': 'lb', 'lbs': 'lbs', 'gm': 'gram', 'g': 'g',
  'ml': 'ml', 'l': 'liter', 'gal': 'gallon', 'qt': 'quart',
  'in': 'inch', 'ft': 'feet', 'pk': 'pack', 'ct': 'count', 'pc': 'piece',
  
  // Nylon patterns
  'nyl': 'nylon', 'lthr': 'leather', 'ctn': 'cotton', 'rbbn': 'ribbon',
  'sft': 'soft', 'cmfrt': 'comfort', 'adj': 'adjustable',
  
  // Product specific
  'dntl': 'dental', 'hlthy': 'healthy', 'edbl': 'edible',
  'orig': 'original', 'ntrl': 'natural', 'orgnic': 'organic',
  'prm': 'premium', 'dlx': 'deluxe', 'pro': 'pro',
  'glofsh': 'glofish', 'algae': 'algae', 'wtr': 'water',
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

// Extract size from name
function extractSize(name) {
  const lower = name.toLowerCase();
  const sizes = ['xx small', 'extra small', 'x small', 'small', 'mini', 
                 'medium', 'large', 'extra large', 'x large', 'xx large', 
                 'jumbo', 'giant'];
  for (const size of sizes) {
    if (lower.includes(size)) return size;
  }
  // Check abbreviations
  if (/\bxxs\b/i.test(name)) return 'xx small';
  if (/\bxs\b/i.test(name)) return 'extra small';
  if (/\bsm\b/i.test(name)) return 'small';
  if (/\bmd\b/i.test(name)) return 'medium';
  if (/\blg\b/i.test(name)) return 'large';
  if (/\bxl\b/i.test(name)) return 'extra large';
  if (/\bxxl\b/i.test(name)) return 'xx large';
  return null;
}

// Extract weight/volume
function extractWeight(name) {
  const patterns = [
    /(\d+\.?\d*)\s*oz/i,
    /(\d+\.?\d*)\s*lb/i,
    /(\d+\.?\d*)\s*#/,
    /(\d+\.?\d*)\s*g\b/i,
    /(\d+\.?\d*)\s*ml/i,
    /(\d+\.?\d*)\s*qt/i,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) return match[0].toLowerCase();
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
  // Check abbreviations
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

// Tokenize and get unique meaningful tokens
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !/^\d+$/.test(t));
}

// Calculate match score with weighted criteria
function smartMatch(supplyName, upcName) {
  const supplyExpanded = expand(supplyName);
  const upcExpanded = expand(upcName);
  
  const supplyTokens = new Set(tokenize(supplyExpanded));
  const upcTokens = new Set(tokenize(upcExpanded));
  
  if (supplyTokens.size === 0) return { score: 0, details: {} };
  
  // Token overlap
  let tokenMatches = 0;
  for (const token of supplyTokens) {
    if (upcTokens.has(token)) tokenMatches++;
  }
  const tokenScore = tokenMatches / supplyTokens.size;
  
  // Size match (important)
  const supplySize = extractSize(supplyName);
  const upcSize = extractSize(upcName);
  const sizeMatch = (supplySize && upcSize && supplySize === upcSize) ? 1 : 
                    (!supplySize || !upcSize) ? 0.5 : 0;
  
  // Weight match (important)
  const supplyWeight = extractWeight(supplyName);
  const upcWeight = extractWeight(upcName);
  const weightMatch = (supplyWeight && upcWeight && supplyWeight === upcWeight) ? 1 :
                      (!supplyWeight || !upcWeight) ? 0.5 : 0;
  
  // Color match
  const supplyColor = extractColor(supplyName);
  const upcColor = extractColor(upcName);
  const colorMatch = (supplyColor && upcColor && supplyColor === upcColor) ? 1 :
                     (!supplyColor || !upcColor) ? 0.5 : 0;
  
  // Weighted score: tokens 50%, size 20%, weight 20%, color 10%
  const score = (tokenScore * 0.5) + (sizeMatch * 0.2) + (weightMatch * 0.2) + (colorMatch * 0.1);
  
  return {
    score,
    details: {
      tokenScore: tokenScore.toFixed(2),
      sizeMatch: `${supplySize || 'none'} vs ${upcSize || 'none'}`,
      weightMatch: `${supplyWeight || 'none'} vs ${upcWeight || 'none'}`,
      colorMatch: `${supplyColor || 'none'} vs ${upcColor || 'none'}`,
    }
  };
}

async function main() {
  const brand = process.argv[2];
  const threshold = parseFloat(process.argv[3]) || 0.55;
  const limit = parseInt(process.argv[4]) || 20;
  
  if (!brand) {
    console.log('Usage: node smart-match-supervised.mjs <brand> [threshold] [limit]');
    console.log('Example: node smart-match-supervised.mjs "Zoo Med" 0.55 20');
    process.exit(1);
  }
  
  console.log(`\n=== SMART MATCHING: ${brand} (threshold: ${threshold}) ===\n`);
  
  // Load flagged UPCs for this brand
  const allUpcs = JSON.parse(fs.readFileSync('scripts/FLAGGED_ALL_UPCS.json', 'utf-8'));
  const brandUpcs = allUpcs.filter(u => u.brand === brand);
  console.log(`Found ${brandUpcs.length} UPCs for ${brand}`);
  
  // Get unmatched supplies for this brand
  const unmatched = await db.select().from(supplies)
    .where(and(
      eq(supplies.brand, brand),
      isNull(supplies.upc)
    ));
  console.log(`Found ${unmatched.length} unmatched supplies for ${brand}\n`);
  
  // Get already used UPCs
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  
  // Available UPCs (not yet used)
  const availableUpcs = brandUpcs.filter(u => !usedUpcs.has(u.upc));
  console.log(`Available (unused) UPCs: ${availableUpcs.length}\n`);
  
  // Find matches
  const matches = [];
  
  for (const supply of unmatched) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const upcItem of availableUpcs) {
      const result = smartMatch(supply.name, upcItem.name);
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
  
  // Sort by score desc and show top matches for review
  matches.sort((a, b) => b.score - a.score);
  
  console.log(`=== TOP ${Math.min(limit, matches.length)} MATCHES FOR REVIEW ===\n`);
  
  matches.slice(0, limit).forEach((m, i) => {
    console.log(`[${i+1}] Score: ${m.score.toFixed(3)}`);
    console.log(`    DB:  ${m.supplyName}`);
    console.log(`    UPC: ${m.upc} | ${m.upcName}`);
    console.log(`    Size: ${m.details.sizeMatch} | Weight: ${m.details.weightMatch} | Color: ${m.details.colorMatch}`);
    console.log('');
  });
  
  console.log(`\nTotal potential matches: ${matches.length}`);
  console.log('Review above and confirm to apply.\n');
  
  // Save matches for application
  fs.writeFileSync('scripts/pending_matches.json', JSON.stringify(matches, null, 2));
  console.log('Saved to scripts/pending_matches.json');
  
  process.exit(0);
}

main().catch(console.error);
