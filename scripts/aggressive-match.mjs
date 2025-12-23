import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, isNull } from 'drizzle-orm';

const ABBREVS = {
  'fd': 'food', 'trt': 'treat', 'chw': 'chew', 'bwl': 'bowl', 'dsh': 'dish',
  'fltr': 'filter', 'htr': 'heater', 'lmp': 'lamp', 'blb': 'bulb', 'pmp': 'pump',
  'shmp': 'shampoo', 'spry': 'spray', 'brsh': 'brush', 'clnr': 'cleaner',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'xlarge',
  'blk': 'black', 'blu': 'blue', 'wht': 'white', 'rd': 'red', 'grn': 'green',
  'ck': 'chicken', 'bf': 'beef', 'lmb': 'lamb', 'slm': 'salmon', 'trky': 'turkey',
  'pup': 'puppy', 'sen': 'senior', 'adlt': 'adult', 'ktn': 'kitten',
};

function normalize(text) {
  if (!text) return '';
  let result = text.toLowerCase()
    .replace(/(\d+\.?\d*)\s*["'']/g, '$1inch')
    .replace(/(\d+\.?\d*)\s*in\b/gi, '$1inch')
    .replace(/(\d+\.?\d*)\s*#/g, '$1lb')
    .replace(/&/g, ' and ')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [abbr, full] of Object.entries(ABBREVS)) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  return result;
}

function extractSize(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (/\b(xxs|xx-?small)\b/i.test(lower)) return 'xxsmall';
  if (/\b(xs|x-?small)\b/i.test(lower)) return 'xsmall';
  if (/\b(xxl|xx-?large)\b/i.test(lower)) return 'xxlarge';
  if (/\b(xl|x-?large)\b/i.test(lower)) return 'xlarge';
  if (/\b(sm|small)\b/i.test(lower) && !/x-?sm/i.test(lower)) return 'small';
  if (/\b(md|med|medium)\b/i.test(lower)) return 'medium';
  if (/\b(lg|large)\b/i.test(lower) && !/x-?l/i.test(lower)) return 'large';
  if (/\bmini\b/i.test(lower)) return 'mini';
  return null;
}

function extractWeight(name) {
  if (!name) return null;
  const m = name.match(/(\d+\.?\d*)\s*(oz|lb|#|g)\b/i);
  if (m) return { value: parseFloat(m[1]), unit: m[2] === '#' ? 'lb' : m[2].toLowerCase() };
  return null;
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function scoreMatch(supply, upc) {
  const sNorm = normalize(supply.name);
  const uNorm = normalize(upc.name_original);
  
  // Size must match if both have it
  const sSize = extractSize(supply.name);
  const uSize = extractSize(upc.name_original);
  if (sSize && uSize && sSize !== uSize) return 0;
  
  // Weight must match if both have it
  const sWeight = extractWeight(supply.name);
  const uWeight = extractWeight(upc.name_original);
  if (sWeight && uWeight && (sWeight.value !== uWeight.value || sWeight.unit !== uWeight.unit)) return 0;
  
  const sTokens = new Set(tokenize(sNorm));
  const uTokens = new Set(tokenize(uNorm));
  if (sTokens.size === 0 || uTokens.size === 0) return 0;
  
  let matches = 0;
  for (const t of sTokens) if (uTokens.has(t)) matches++;
  
  const coverage = matches / Math.max(sTokens.size, uTokens.size);
  const sizeBonus = (sSize && uSize && sSize === uSize) ? 0.15 : 0;
  const weightBonus = (sWeight && uWeight) ? 0.15 : 0;
  
  return Math.min(1.0, coverage + sizeBonus + weightBonus);
}

async function main() {
  const threshold = 0.70;
  
  const allUpcs = JSON.parse(fs.readFileSync('scripts/ALL_UPCS_EXPANDED.json', 'utf-8'));
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  const queue = JSON.parse(fs.readFileSync('scripts/match_queue.json', 'utf-8'));
  const processedIds = new Set(Object.values(queue.matches).map(m => m.supplyId));
  
  const availableUpcs = allUpcs.filter(u => !usedUpcs.has(u.upc));
  console.log(`Available UPCs: ${availableUpcs.length}`);
  
  const unmatched = await db.select().from(supplies).where(isNull(supplies.upc));
  const toProcess = unmatched.filter(s => !processedIds.has(s.id));
  console.log(`Unmatched supplies to process: ${toProcess.length}`);
  
  let matches = [];
  const assignedUpcs = new Set();
  
  for (const supply of toProcess) {
    let best = null;
    let bestScore = 0;
    
    for (const upc of availableUpcs) {
      if (assignedUpcs.has(upc.upc)) continue;
      const score = scoreMatch(supply, upc);
      if (score >= threshold && score > bestScore) {
        bestScore = score;
        best = { upc, score };
      }
    }
    
    if (best) {
      assignedUpcs.add(best.upc.upc);
      matches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        brand: supply.brand,
        upc: best.upc.upc,
        upcName: best.upc.name_original,
        upcBrand: best.upc.brand,
        score: best.score
      });
    }
  }
  
  matches.sort((a, b) => b.score - a.score);
  console.log(`\nMatches found (>= ${threshold}): ${matches.length}`);
  
  fs.writeFileSync('scripts/aggressive_matches.json', JSON.stringify(matches, null, 2));
  
  console.log('\nTop 20 samples for review:');
  matches.slice(0, 20).forEach((m, i) => {
    console.log(`${(i+1).toString().padStart(2)}. [${(m.score*100).toFixed(0)}%] DB: ${m.brand} | UPC: ${m.upcBrand}`);
    console.log(`    DB:  ${m.supplyName}`);
    console.log(`    UPC: ${m.upcName}`);
  });
  
  process.exit(0);
}

main().catch(console.error);
