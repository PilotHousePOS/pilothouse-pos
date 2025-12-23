import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, isNull, eq, and } from 'drizzle-orm';

function normalize(text) {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/(\d+\.?\d*)\s*["'']/g, '$1inch')
    .replace(/(\d+\.?\d*)\s*in\b/gi, '$1inch')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalize(text).split(/\s+/).filter(t => t.length > 1);
}

function extractSize(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  // Look for dimension patterns like 14", 30", etc.
  const dimMatch = lower.match(/(\d+)["'']/);
  if (dimMatch) return dimMatch[1] + 'inch';
  
  if (/\b(xxs|xx-?small)\b/i.test(lower)) return 'xxsmall';
  if (/\b(xs|x-?small)\b/i.test(lower)) return 'xsmall';
  if (/\b(xxl|xx-?large)\b/i.test(lower)) return 'xxlarge';
  if (/\b(xl|x-?large)\b/i.test(lower)) return 'xlarge';
  if (/\b(sm|small)\b/i.test(lower) && !/x-?sm/i.test(lower)) return 'small';
  if (/\b(md|med|medium)\b/i.test(lower)) return 'medium';
  if (/\b(lg|large)\b/i.test(lower) && !/x-?l/i.test(lower)) return 'large';
  return null;
}

function scoreMatch(supply, upc) {
  const sNorm = normalize(supply.name);
  const uNorm = normalize(upc.name_original);
  
  // Dimension/size must match
  const sSize = extractSize(supply.name);
  const uSize = extractSize(upc.name_original);
  if (sSize && uSize && sSize !== uSize) return 0;
  
  const sTokens = new Set(tokenize(supply.name));
  const uTokens = new Set(tokenize(upc.name_original));
  if (sTokens.size === 0 || uTokens.size === 0) return 0;
  
  let matches = 0;
  for (const t of sTokens) if (uTokens.has(t)) matches++;
  
  const coverage = matches / Math.max(sTokens.size, uTokens.size);
  const sizeBonus = (sSize && uSize && sSize === uSize) ? 0.2 : 0;
  
  return Math.min(1.0, coverage + sizeBonus);
}

async function main() {
  const threshold = 0.70;
  
  const allUpcs = JSON.parse(fs.readFileSync('scripts/ALL_UPCS_EXPANDED.json', 'utf-8'));
  const coastalUpcs = allUpcs.filter(u => u.brand === 'Coastal');
  console.log('Coastal UPCs:', coastalUpcs.length);
  
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  
  const availableUpcs = coastalUpcs.filter(u => !usedUpcs.has(u.upc));
  console.log('Available Coastal UPCs:', availableUpcs.length);
  
  const unmatched = await db.select().from(supplies)
    .where(and(eq(supplies.brand, 'Coastal'), isNull(supplies.upc)));
  console.log('Unmatched Coastal supplies:', unmatched.length);
  
  let matches = [];
  const assignedUpcs = new Set();
  
  for (const supply of unmatched) {
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
        brand: 'Coastal',
        upc: best.upc.upc,
        upcName: best.upc.name_original,
        score: best.score
      });
    }
  }
  
  matches.sort((a, b) => b.score - a.score);
  console.log('\nMatches found:', matches.length);
  
  if (matches.length > 0) {
    fs.writeFileSync('scripts/coastal_matches.json', JSON.stringify(matches, null, 2));
    console.log('\nSamples:');
    matches.slice(0, 15).forEach((m, i) => {
      console.log((i+1) + '. [' + (m.score*100).toFixed(0) + '%] ' + m.supplyName.substring(0, 50));
      console.log('   UPC: ' + m.upcName);
    });
  }
  
  process.exit(0);
}

main().catch(console.error);
