import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq, isNull, and } from 'drizzle-orm';

const BRAND_PREFIXES = {
  'aqe': 'aqueon', 'aqa': 'aqueon', 'tet': 'tetra', 'mar': 'marineland', 'flv': 'fluval',
  'scm': 'seachem', 'sli': 'seachem', 'hkr': 'hikari', 'hik': 'hikari',
  'zmd': 'zoo med', 'zm': 'zoo med', 'exo': 'exo terra', 'exoterra': 'exo terra',
  'zil': 'zilla', 'flk': 'flukers', 'pge': 'pangea',
  'kon': 'kong', 'kng': 'kong', 'cst': 'coastal', 'coa': 'coastal',
  'nyl': 'nylabone', 'ben': 'benebone', 'smb': 'smartbones',
  'rdb': 'redbarn', 'rbp': 'redbarn', 'grn': 'greenies', 'gre': 'greenies',
  'spt': 'spot', 'jwp': 'jw pet', 'saf': 'safari',
  'trc': 'tropiclean', 'frp': 'four paws', 'fou': 'four paws',
  'nvt': 'naturvet', 'pts': 'petmate', 'dos': 'petmate',
  'mps': 'multipet', 'mrp': 'multipet', 'tit': 'titan', 'prv': 'prevue',
  'llp': 'lil pals', 'tuf': 'tuffy', 'catit': 'catit',
  'kay': 'kaytee', 'oxb': 'oxbow', 'vtk': 'vitakraft',
  'aec': 'ae cage', 'brd': 'birdlife', 'zup': 'zupreem',
  'sd': 'science diet', 'hsd': 'science diet',
  'bb': 'blue buffalo', 'blu': 'blue buffalo', 'bl': 'blue buffalo',
  'rc': 'royal canin', 'nut': 'nutrisource', 'nbs': 'nutrisource',
  'frm': 'fromm', 'dia': 'diamond', 'pp': 'pro plan',
  'tas': 'taste of the wild', 'ins': 'instinct', 'prim': 'primal',
  'circle': 'circle t', 'api': 'api', 'marina': 'marina',
  'lov': 'loving pets', 'ela': 'elanco', 'far': 'farnam',
  'vict': 'victor', 'zign': 'zignature', 'health': 'health extensions',
};

const ABBREVS = {
  'fd': 'food', 'trt': 'treat', 'trts': 'treats', 'chw': 'chew', 'chws': 'chews',
  'cllr': 'collar', 'lsh': 'leash', 'bwl': 'bowl', 'dsh': 'dish',
  'fltr': 'filter', 'pmp': 'pump', 'htr': 'heater', 'lmp': 'lamp', 'blb': 'bulb',
  'shmp': 'shampoo', 'spry': 'spray', 'brsh': 'brush',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'xlarge',
  'blk': 'black', 'blu': 'blue', 'wht': 'white', 'rd': 'red', 'grn': 'green',
  'dg': 'dog', 'ct': 'cat', 'pup': 'puppy', 'ck': 'chicken', 'bf': 'beef',
  'pllt': 'pellet', 'flk': 'flake', 'stck': 'stick',
  'sen': 'senior', 'adlt': 'adult', 'jr': 'junior',
};

function normalize(text) {
  if (!text) return '';
  let result = text.toLowerCase()
    .replace(/(\d+\.?\d*)\s*["'']/g, '$1inch ')
    .replace(/(\d+\.?\d*)\s*in\b/gi, '$1inch')
    .replace(/(\d+)\s*x\s*(\d+)/gi, '$1by$2')
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = result.split(' ');
  if (words.length > 0 && BRAND_PREFIXES[words[0]]) {
    words[0] = BRAND_PREFIXES[words[0]];
    result = words.join(' ');
  }
  for (const [abbr, full] of Object.entries(ABBREVS)) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  return result;
}

function extractSize(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (/\b(xx-?small|xxs)\b/i.test(lower)) return 'xxsmall';
  if (/\b(x-?small|xsm|xs)\b/i.test(lower)) return 'xsmall';
  if (/\b(xx-?large|xxl)\b/i.test(lower)) return 'xxlarge';
  if (/\b(x-?large|xlg?|xl)\b/i.test(lower)) return 'xlarge';
  if (/\b(small|sm|sml)\b/i.test(lower) && !/x-?sm/i.test(lower)) return 'small';
  if (/\b(medium|med|md)\b/i.test(lower)) return 'medium';
  if (/\b(large|lg|lrg)\b/i.test(lower) && !/x-?l/i.test(lower)) return 'large';
  if (/\b(mini|mn)\b/i.test(lower)) return 'mini';
  if (/\b(jumbo|jmb)\b/i.test(lower)) return 'jumbo';
  return null;
}

function extractWeight(name) {
  if (!name) return null;
  const patterns = [
    { regex: /(\d+\.?\d*)\s*oz\b/i, unit: 'oz' },
    { regex: /(\d+\.?\d*)\s*lb\b/i, unit: 'lb' },
    { regex: /(\d+\.?\d*)\s*#/, unit: 'lb' },
  ];
  for (const p of patterns) {
    const match = name.match(p.regex);
    if (match) return { value: parseFloat(match[1]), unit: p.unit };
  }
  return null;
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function validateMatch(supplyName, upcName) {
  const supplyNorm = normalize(supplyName);
  const upcNorm = normalize(upcName);
  
  const supplySize = extractSize(supplyName);
  const upcSize = extractSize(upcName);
  if (supplySize && upcSize && supplySize !== upcSize) {
    return { reject: true, reason: `Size: ${supplySize} vs ${upcSize}` };
  }
  
  const supplyWeight = extractWeight(supplyName);
  const upcWeight = extractWeight(upcName);
  if (supplyWeight && upcWeight) {
    if (supplyWeight.unit !== upcWeight.unit || supplyWeight.value !== upcWeight.value) {
      return { reject: true, reason: `Weight mismatch` };
    }
  }
  
  const supplyTokens = new Set(tokenize(supplyNorm));
  const upcTokens = new Set(tokenize(upcNorm));
  if (supplyTokens.size === 0) return { reject: true, reason: 'No tokens' };
  
  let tokenMatches = 0;
  for (const token of supplyTokens) {
    if (upcTokens.has(token)) tokenMatches++;
  }
  const tokenScore = tokenMatches / supplyTokens.size;
  const sizeBonus = (supplySize && upcSize && supplySize === upcSize) ? 0.2 : 0.1;
  const weightBonus = (supplyWeight && upcWeight) ? 0.1 : 0;
  const score = (tokenScore * 0.6) + sizeBonus + weightBonus;
  
  return { reject: false, score };
}

async function main() {
  const threshold = 0.55;  // Lower threshold to find more
  
  const allUpcs = JSON.parse(fs.readFileSync('scripts/ALL_UPCS_EXPANDED.json', 'utf-8'));
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  
  // Load queue to skip already processed
  const queue = JSON.parse(fs.readFileSync('scripts/match_queue.json', 'utf-8'));
  const processedSupplyIds = new Set(Object.values(queue.matches).map(m => m.supplyId));
  
  const brandCounts = {};
  allUpcs.forEach(u => {
    if (u.brand && u.brand !== 'UNKNOWN') {
      brandCounts[u.brand] = (brandCounts[u.brand] || 0) + 1;
    }
  });
  
  const brands = Object.keys(brandCounts).sort((a,b) => brandCounts[b] - brandCounts[a]);
  
  let allMatches = [];
  const assignedUpcs = new Set();
  
  for (const brand of brands) {
    const brandUpcs = allUpcs.filter(u => u.brand === brand && !usedUpcs.has(u.upc) && !assignedUpcs.has(u.upc));
    if (brandUpcs.length === 0) continue;
    
    const unmatched = await db.select().from(supplies)
      .where(and(eq(supplies.brand, brand), isNull(supplies.upc)));
    
    // Filter out already processed
    const toProcess = unmatched.filter(s => !processedSupplyIds.has(s.id));
    if (toProcess.length === 0) continue;
    
    for (const supply of toProcess) {
      let bestMatch = null;
      let bestScore = 0;
      
      for (const upcItem of brandUpcs) {
        if (assignedUpcs.has(upcItem.upc)) continue;
        const result = validateMatch(supply.name, upcItem.name_original);
        if (result.reject) continue;
        if (result.score > bestScore && result.score >= threshold) {
          bestScore = result.score;
          bestMatch = { upc: upcItem, score: result.score };
        }
      }
      
      if (bestMatch) {
        assignedUpcs.add(bestMatch.upc.upc);
        allMatches.push({
          supplyId: supply.id,
          supplyName: supply.name,
          brand,
          upc: bestMatch.upc.upc,
          upcName: bestMatch.upc.name_original,
          score: bestMatch.score,
        });
      }
    }
  }
  
  allMatches.sort((a, b) => b.score - a.score);
  
  console.log(`\n=== LOWER THRESHOLD MATCHING (>= ${threshold}) ===\n`);
  console.log(`New matches found: ${allMatches.length}`);
  
  // Group by score range
  const ranges = {
    '70-79%': allMatches.filter(m => m.score >= 0.70 && m.score < 0.80).length,
    '60-69%': allMatches.filter(m => m.score >= 0.60 && m.score < 0.70).length,
    '55-59%': allMatches.filter(m => m.score >= 0.55 && m.score < 0.60).length,
  };
  console.log('\nBy score range:');
  Object.entries(ranges).forEach(([range, count]) => console.log(`  ${range}: ${count}`));
  
  fs.writeFileSync('scripts/lower_threshold_matches.json', JSON.stringify(allMatches, null, 2));
  console.log(`\nSaved to scripts/lower_threshold_matches.json`);
  
  // Show samples from 70-79% range for review
  console.log('\n=== SAMPLES FROM 70-79% RANGE ===\n');
  allMatches.filter(m => m.score >= 0.70 && m.score < 0.80).slice(0, 15).forEach((m, i) => {
    console.log(`${(i+1).toString().padStart(2)}. [${(m.score*100).toFixed(0)}%] ${m.brand}`);
    console.log(`    DB:  ${m.supplyName}`);
    console.log(`    UPC: ${m.upc} | ${m.upcName}`);
  });
  
  process.exit(0);
}

main().catch(console.error);
