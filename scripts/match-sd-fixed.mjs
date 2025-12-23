import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, isNull, eq, and } from 'drizzle-orm';

function normalize(text) {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/science\s*diet/gi, 'sd')
    .replace(/(\d+\.?\d*)\s*#/g, '$1lb')
    .replace(/(\d+\.?\d*)\s*lb\b/gi, '$1lb')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWeight(name) {
  if (!name) return null;
  const m = name.match(/(\d+\.?\d*)\s*(oz|lb|#)\b/i);
  if (m) return { value: parseFloat(m[1]), unit: m[2] === '#' ? 'lb' : m[2].toLowerCase() };
  return null;
}

function tokenize(text) {
  return normalize(text).split(/\s+/).filter(t => t.length > 0);
}

async function main() {
  const threshold = 0.70;
  
  const allUpcs = JSON.parse(fs.readFileSync('scripts/ALL_UPCS_EXPANDED.json', 'utf-8'));
  const sdUpcs = allUpcs.filter(u => u.brand === 'Science Diet');
  
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  
  const queue = JSON.parse(fs.readFileSync('scripts/match_queue.json', 'utf-8'));
  const processedIds = new Set(Object.values(queue.matches).map(m => m.supplyId));
  
  const availableSd = sdUpcs.filter(u => !usedUpcs.has(u.upc));
  console.log('Available SD UPCs:', availableSd.length);
  
  const unmatched = await db.select().from(supplies)
    .where(and(eq(supplies.brand, 'Science Diet'), isNull(supplies.upc)));
  
  // Filter out already processed
  const toProcess = unmatched.filter(s => !processedIds.has(s.id));
  console.log('SD supplies to process:', toProcess.length);
  
  let matches = [];
  const assignedUpcs = new Set();
  
  for (const supply of toProcess) {
    const sTokens = new Set(tokenize(supply.name));
    const sWeight = extractWeight(supply.name);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const upc of availableSd) {
      if (assignedUpcs.has(upc.upc)) continue;
      
      const uTokens = new Set(tokenize(upc.name_original));
      const uWeight = extractWeight(upc.name_original);
      
      // Weight must match if both present
      if (sWeight && uWeight && (sWeight.value !== uWeight.value || sWeight.unit !== uWeight.unit)) continue;
      
      let tokenMatches = 0;
      for (const t of sTokens) if (uTokens.has(t)) tokenMatches++;
      
      const score = tokenMatches / Math.max(sTokens.size, uTokens.size);
      const weightBonus = (sWeight && uWeight) ? 0.1 : 0;
      const finalScore = Math.min(1.0, score + weightBonus);
      
      if (finalScore >= threshold && finalScore > bestScore) {
        bestScore = finalScore;
        bestMatch = { upc, score: finalScore };
      }
    }
    
    if (bestMatch) {
      assignedUpcs.add(bestMatch.upc.upc);
      matches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        brand: 'Science Diet',
        upc: bestMatch.upc.upc,
        upcName: bestMatch.upc.name_original,
        score: bestMatch.score
      });
    }
  }
  
  matches.sort((a, b) => b.score - a.score);
  console.log('\nMatches found (>= 70%):', matches.length);
  
  if (matches.length > 0) {
    fs.writeFileSync('scripts/sd_matches.json', JSON.stringify(matches, null, 2));
    
    console.log('\nSamples:');
    matches.slice(0, 15).forEach((m, i) => {
      console.log((i+1) + '. [' + (m.score*100).toFixed(0) + '%] ' + m.supplyName);
      console.log('   UPC: ' + m.upcName);
    });
  }
  
  process.exit(0);
}

main().catch(console.error);
