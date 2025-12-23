import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq, isNull, and } from 'drizzle-orm';

// ===== BRAND PREFIX EXPANSIONS =====
const BRAND_PREFIXES = {
  'aqe': 'aqueon', 'aqa': 'aqueon',
  'kon': 'kong', 'kng': 'kong',
  'aec': 'ae cage',
  'zmd': 'zoo med', 'zm': 'zoo med', 'zoomed': 'zoo med',
  'exo': 'exo terra', 'exoterra': 'exo terra',
  'zil': 'zilla',
  'kay': 'kaytee',
  'cst': 'coastal',
  'ppx': 'penn plax', 'pennplax': 'penn plax',
  'flk': 'flukers',
  'hkr': 'hikari',
  'tet': 'tetra',
  'mar': 'marineland',
  'flv': 'fluval',
  'scm': 'seachem',
  'nyl': 'nylabone',
  'oxb': 'oxbow',
  'ben': 'benebone',
  'smb': 'smartbones', 'smbn': 'smartbones',
  'bwi': 'barkworthies',
  'llp': 'lil pals', 'lilpals': 'lil pals',
  'spt': 'spot',
  'tit': 'titan',
  'prv': 'prevue', 'ph': 'prevue hendrix',
  'jwp': 'jw pet', 'jw': 'jw',
  'saf': 'safari',
  'trc': 'tropiclean',
  'frp': 'four paws', 'fourpaws': 'four paws',
  'nvt': 'naturvet',
  'brd': 'birdlife',
  'kmd': 'komodo',
  'vtk': 'vitakraft',
  'mrp': 'multipet',
  'tuf': 'tuffy',
  'pge': 'pangea',
};

// ===== ABBREVIATION DICTIONARY =====
const ABBREVS = {
  // Products
  'fd': 'food', 'fod': 'food', 'trt': 'treat', 'trts': 'treats',
  'chw': 'chew', 'chws': 'chews', 'chwr': 'chewer',
  'cllr': 'collar', 'clr': 'collar', 'lsh': 'leash',
  'hrns': 'harness', 'harn': 'harness', 'hrn': 'harness',
  'bwl': 'bowl', 'fdr': 'feeder', 'wtr': 'water', 'wtrer': 'waterer',
  'tys': 'toys', 'bal': 'ball', 'bll': 'ball',
  'crt': 'crate', 'tnk': 'tank', 'aqua': 'aquarium',
  'fltr': 'filter', 'crtrdg': 'cartridge', 'crtrd': 'cartridge',
  'pmp': 'pump', 'htr': 'heater', 'lght': 'light', 'lmp': 'lamp',
  'blb': 'bulb', 'fxtr': 'fixture',
  'dcr': 'decor', 'ornmt': 'ornament', 'plnt': 'plant',
  'grvl': 'gravel', 'sbstrt': 'substrate', 'bdng': 'bedding',
  'shmp': 'shampoo', 'cond': 'conditioner', 'spry': 'spray',
  'brsh': 'brush', 'cmb': 'comb', 'clpr': 'clipper', 'grmg': 'grooming',
  'splmt': 'supplement', 'vit': 'vitamin',
  'dsh': 'dish', 'crnr': 'corner', 'wtrfl': 'waterfall',
  'brch': 'branch', 'branchh': 'branch', 'mstr': 'mister',
  'fnrm': 'faunarium', 'slk': 'silk', 'jngl': 'jungle',
  'rck': 'rock', 'glw': 'glow', 'crckt': 'cricket',
  'pn': 'pen', 'strtr': 'starter', 'whl': 'wheel',
  'spnnr': 'spinner', 'mllt': 'millet', 'gtwy': 'getaway',
  'clnr': 'cleaner', 'vac': 'vacuum', 'scrpr': 'scraper',
  'hngd': 'hinged', 'stnd': 'stand', 'pwr': 'power',
  'dntl': 'dental', 'stc': 'stick', 'stck': 'stick',
  'comft': 'comfort', 'cmft': 'comfort',
  'asst': 'assorted', 'nat': 'natural',
  'dspnsr': 'dispenser', 'wrpz': 'wraps',
  
  // Sizes
  'sm': 'small', 'sml': 'small',
  'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large', 'lge': 'large',
  'xlg': 'xlarge', 'xlrg': 'xlarge',
  'xsm': 'xsmall',
  'mini': 'mini', 'mn': 'mini',
  'jmb': 'jumbo', 'gnt': 'giant', 'reg': 'regular',
  
  // Colors
  'blk': 'black', 'blu': 'blue', 'wht': 'white', 'rd': 'red',
  'grn': 'green', 'ylw': 'yellow', 'org': 'orange', 'pnk': 'pink',
  'prp': 'purple', 'gry': 'gray', 'brn': 'brown', 'tn': 'tan',
  'pk': 'pink', 'pr': 'purple', 'or': 'orange',
  
  // Animals
  'dg': 'dog', 'pup': 'puppy', 'ct': 'cat', 'ktn': 'kitten',
  'fsh': 'fish', 'brd': 'bird', 'rptl': 'reptile',
  'rbbt': 'rabbit', 'gpig': 'guineapig', 'hstr': 'hamster',
  'frrt': 'ferret', 'trtl': 'turtle', 'lzrd': 'lizard',
  'snk': 'snake', 'gecko': 'gecko', 'leo': 'leopard',
  'betta': 'betta', 'gldfish': 'goldfish',
  'ham': 'hamster', 'tiel': 'cockatiel', 'keet': 'parakeet',
  
  // Food
  'pllt': 'pellet', 'pllts': 'pellets', 'flk': 'flake', 'flks': 'flakes',
  'stck': 'stick', 'wfr': 'wafer', 'tmthy': 'timothy', 'hay': 'hay',
  'veg': 'vegetable', 'frt': 'fruit', 'hrbl': 'herbal',
  'ban': 'banana', 'strw': 'strawberry',
  
  // Measurements
  'pk': 'pack', 'ct': 'count', 'pc': 'piece',
  '1pk': '1pack', '2pk': '2pack', '3pk': '3pack', '4pk': '4pack',
  '1ct': '1count', '2ct': '2count', '4ct': '4count',
  'gph': 'gph', 'gal': 'gallon',
  
  // Product specific
  'dntl': 'dental', 'orig': 'original', 'ntrl': 'natural',
  'prm': 'premium', 'dlx': 'deluxe',
  'uvb': 'uvb', 'uva': 'uva', 'cmbo': 'combo',
  'halo': 'halogen', 'trm': 'terrarium', 'pldrm': 'paludarium',
  'ctnp': 'catnip', 'scratcher': 'scratcher', 'scrtr': 'scratcher',
  'ftch': 'fetch', 'ftball': 'football', 'bne': 'bone',
  
  // W/ expansions
  'w/': 'with', 'w': 'with',
};

// ===== CRITICAL PRODUCT TYPE EXCLUSIONS =====
const CRITICAL_EXCLUSIONS = [
  ['wheel', 'millet'], ['wheel', 'spray'], ['wheel', 'food'],
  ['spinner', 'millet'], ['spinner', 'food'],
  ['dish', 'mat'], ['dish', 'heater'], ['dish', 'lamp'],
  ['bowl', 'mat'], ['bowl', 'heater'],
  ['cage', 'food'], ['cage', 'treat'],
  ['tank', 'food'], ['tank', 'treat'],
  ['bulb', 'mat'], ['bulb', 'dish'],
  ['lamp', 'dish'], ['lamp', 'bowl'],
  ['feeder', 'heater'], ['feeder', 'lamp'],
  ['getaway', 'millet'], ['getaway', 'spray'],
  ['comfort', 'millet'], ['comfort', 'spray'],
  ['toy', 'food'], ['toy', 'treat'],
  ['collar', 'food'], ['collar', 'treat'],
  ['leash', 'food'], ['leash', 'treat'],
];

// ===== NORMALIZER =====
function normalize(text) {
  let result = text.toLowerCase()
    // Normalize dimensions FIRST: 5" -> 5inch, 5in -> 5inch, 5' -> 5ft
    .replace(/(\d+\.?\d*)\s*["'']/g, '$1inch ')
    .replace(/(\d+\.?\d*)\s*in\b/gi, '$1inch')
    .replace(/(\d+\.?\d*)\s*inch(?:es)?\b/gi, '$1inch')
    .replace(/(\d+\.?\d*)\s*[']/g, '$1ft ')
    .replace(/(\d+\.?\d*)\s*ft\b/gi, '$1ft')
    .replace(/(\d+\.?\d*)\s*feet\b/gi, '$1ft')
    // Normalize x dimensions: 20x10 -> 20by10
    .replace(/(\d+)\s*x\s*(\d+)/gi, '$1by$2')
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/['']/g, '')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Expand brand prefixes first
  const words = result.split(' ');
  if (words.length > 0 && BRAND_PREFIXES[words[0]]) {
    words[0] = BRAND_PREFIXES[words[0]];
    result = words.join(' ');
  }
  
  // Expand abbreviations
  const sorted = Object.entries(ABBREVS).sort((a,b) => b[0].length - a[0].length);
  for (const [abbr, full] of sorted) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  
  return result;
}

// ===== EXTRACTORS =====
function extractSize(name) {
  const lower = name.toLowerCase();
  if (/\b(xx-?small|xxs)\b/i.test(lower)) return 'xxsmall';
  if (/\b(x-?small|xsm|xs)\b/i.test(lower)) return 'xsmall';
  if (/\b(extra\s*small)\b/i.test(lower)) return 'xsmall';
  if (/\b(xx-?large|xxl|xxlg)\b/i.test(lower)) return 'xxlarge';
  if (/\b(x-?large|xlg?|xl)\b/i.test(lower)) return 'xlarge';
  if (/\b(extra\s*large)\b/i.test(lower)) return 'xlarge';
  if (/\b(small|sm|sml)\b/i.test(lower) && !/x-?sm|extra/i.test(lower)) return 'small';
  if (/\b(medium|med|md)\b/i.test(lower)) return 'medium';
  if (/\b(large|lg|lrg)\b/i.test(lower) && !/x-?l|extra/i.test(lower)) return 'large';
  if (/\b(mini|mn)\b/i.test(lower)) return 'mini';
  if (/\b(jumbo|jmb)\b/i.test(lower)) return 'jumbo';
  if (/\b(giant|gnt)\b/i.test(lower)) return 'giant';
  return null;
}

function extractWattage(name) {
  const match = name.match(/(\d+)\s*w\b/i);
  return match ? parseInt(match[1]) : null;
}

function extractWeight(name) {
  const patterns = [
    { regex: /(\d+\.?\d*)\s*oz\b/i, unit: 'oz' },
    { regex: /(\d+\.?\d*)\s*lb\b/i, unit: 'lb' },
    { regex: /(\d+\.?\d*)\s*#/, unit: 'lb' },
    { regex: /(\d+\.?\d*)\s*g\b/i, unit: 'g' },
    { regex: /(\d+\.?\d*)\s*ml\b/i, unit: 'ml' },
    { regex: /(\d+\.?\d*)\s*qt\b/i, unit: 'qt' },
    { regex: /(\d+\.?\d*)\s*gal\b/i, unit: 'gal' },
  ];
  for (const p of patterns) {
    const match = name.match(p.regex);
    if (match) return { value: parseFloat(match[1]), unit: p.unit };
  }
  return null;
}

function extractColor(name) {
  const colors = ['black', 'blue', 'red', 'green', 'yellow', 'orange', 
                  'pink', 'purple', 'white', 'gray', 'brown', 'tan',
                  'silver', 'gold', 'clear'];
  const lower = name.toLowerCase();
  for (const color of colors) {
    if (lower.includes(color)) return color;
  }
  return null;
}

// Tokenize - PRESERVE numeric tokens
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1); // Keep numbers now
}

// ===== STRICT VALIDATION =====
function validateMatch(supplyName, upcName) {
  const supplyNorm = normalize(supplyName);
  const upcNorm = normalize(upcName);
  const supplyLower = supplyNorm.toLowerCase();
  const upcLower = upcNorm.toLowerCase();
  
  // 1. SIZE MUST MATCH
  const supplySize = extractSize(supplyName);
  const upcSize = extractSize(upcName);
  if (supplySize && upcSize && supplySize !== upcSize) {
    return { reject: true, reason: `Size: ${supplySize} vs ${upcSize}` };
  }
  
  // 2. WATTAGE MUST MATCH
  const supplyWatt = extractWattage(supplyName);
  const upcWatt = extractWattage(upcName);
  if (supplyWatt && upcWatt && supplyWatt !== upcWatt) {
    return { reject: true, reason: `Wattage: ${supplyWatt}W vs ${upcWatt}W` };
  }
  
  // 3. WEIGHT MUST MATCH
  const supplyWeight = extractWeight(supplyName);
  const upcWeight = extractWeight(upcName);
  if (supplyWeight && upcWeight) {
    if (supplyWeight.unit !== upcWeight.unit || supplyWeight.value !== upcWeight.value) {
      return { reject: true, reason: `Weight: ${supplyWeight.value}${supplyWeight.unit} vs ${upcWeight.value}${upcWeight.unit}` };
    }
  }
  
  // 4. CRITICAL EXCLUSIONS
  for (const [word1, word2] of CRITICAL_EXCLUSIONS) {
    const supplyHas1 = supplyLower.includes(word1);
    const supplyHas2 = supplyLower.includes(word2);
    const upcHas1 = upcLower.includes(word1);
    const upcHas2 = upcLower.includes(word2);
    
    if ((supplyHas1 && upcHas2 && !upcHas1) || (supplyHas2 && upcHas1 && !supplyHas1)) {
      return { reject: true, reason: `Exclusion: ${word1}/${word2}` };
    }
  }
  
  // 5. CORNER keyword
  const supplyCorner = supplyLower.includes('corner');
  const upcCorner = upcLower.includes('corner');
  if (supplyCorner !== upcCorner) {
    return { reject: true, reason: 'Corner mismatch' };
  }
  
  // Calculate token score
  const supplyTokens = new Set(tokenize(supplyNorm));
  const upcTokens = new Set(tokenize(upcNorm));
  
  if (supplyTokens.size === 0) return { reject: true, reason: 'No tokens' };
  
  let tokenMatches = 0;
  for (const token of supplyTokens) {
    if (upcTokens.has(token)) tokenMatches++;
  }
  const tokenScore = tokenMatches / supplyTokens.size;
  
  const sizeBonus = (supplySize && upcSize && supplySize === upcSize) ? 0.2 : 
                    (!supplySize && !upcSize) ? 0.1 : 0.05;
  const wattBonus = (supplyWatt && upcWatt && supplyWatt === upcWatt) ? 0.1 : 0;
  const weightBonus = (supplyWeight && upcWeight) ? 0.1 : 0;
  
  const score = (tokenScore * 0.6) + sizeBonus + wattBonus + weightBonus;
  
  return {
    reject: false,
    score,
    details: {
      tokens: tokenScore.toFixed(2),
      size: supplySize || upcSize ? `${supplySize||'?'}=${upcSize||'?'}` : '-',
      watt: supplyWatt || upcWatt ? `${supplyWatt||'?'}=${upcWatt||'?'}` : '-',
      weight: supplyWeight ? `${supplyWeight.value}${supplyWeight.unit}` : '-',
    }
  };
}

async function main() {
  const brand = process.argv[2];
  const threshold = parseFloat(process.argv[3]) || 0.60;
  const limit = parseInt(process.argv[4]) || 50;
  
  if (!brand) {
    console.log('Usage: node smart-match-v2.mjs <brand> [threshold] [limit]');
    process.exit(1);
  }
  
  console.log(`\n=== SMART MATCH V2: ${brand} (threshold: ${threshold}) ===\n`);
  
  const allUpcs = JSON.parse(fs.readFileSync('scripts/FLAGGED_ALL_UPCS.json', 'utf-8'));
  const brandUpcs = allUpcs.filter(u => u.brand === brand);
  console.log(`UPCs for ${brand}: ${brandUpcs.length}`);
  
  const unmatched = await db.select().from(supplies)
    .where(and(eq(supplies.brand, brand), isNull(supplies.upc)));
  console.log(`Unmatched supplies: ${unmatched.length}`);
  
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  
  let availableUpcs = brandUpcs.filter(u => !usedUpcs.has(u.upc));
  console.log(`Available UPCs: ${availableUpcs.length}\n`);
  
  const matches = [];
  const assignedUpcs = new Set();
  
  for (const supply of unmatched) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const upcItem of availableUpcs) {
      if (assignedUpcs.has(upcItem.upc)) continue;
      
      const result = validateMatch(supply.name, upcItem.name);
      if (result.reject) continue;
      
      if (result.score > bestScore && result.score >= threshold) {
        bestScore = result.score;
        bestMatch = { upc: upcItem, score: result.score, details: result.details };
      }
    }
    
    if (bestMatch) {
      assignedUpcs.add(bestMatch.upc.upc);
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
  
  console.log(`=== VERIFIED MATCHES (${Math.min(limit, matches.length)}/${matches.length}) ===\n`);
  
  matches.slice(0, limit).forEach((m, i) => {
    console.log(`[${i+1}] ${m.score.toFixed(2)} | ${m.details.size} | ${m.details.watt} | ${m.details.weight}`);
    console.log(`    DB:  ${m.supplyName}`);
    console.log(`    UPC: ${m.upc} | ${m.upcName}`);
    console.log('');
  });
  
  console.log(`Total: ${matches.length} verified matches`);
  
  fs.writeFileSync('scripts/pending_matches.json', JSON.stringify(matches, null, 2));
  console.log('Saved to scripts/pending_matches.json');
  
  process.exit(0);
}

main().catch(console.error);
