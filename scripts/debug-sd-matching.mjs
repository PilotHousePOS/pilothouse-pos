import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, isNull, eq, and } from 'drizzle-orm';

const ABBREVS = {
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'xlarge',
  'br': 'breed', 'ck': 'chicken', 'lam': 'lamb', 'bf': 'beef',
  'pup': 'puppy', 'sen': 'senior', 'adlt': 'adult',
  'sd': 'science diet', 'hsd': 'science diet',
};

function normalize(text) {
  if (!text) return '';
  let result = text.toLowerCase()
    .replace(/science\s*diet/gi, 'sd')
    .replace(/(\d+\.?\d*)\s*#/g, '$1lb')
    .replace(/(\d+\.?\d*)\s*lb\b/gi, '$1lb')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return result;
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
  const allUpcs = JSON.parse(fs.readFileSync('scripts/ALL_UPCS_EXPANDED.json', 'utf-8'));
  const sdUpcs = allUpcs.filter(u => u.brand === 'Science Diet');
  console.log('Science Diet UPCs in master:', sdUpcs.length);
  
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  
  const availableSd = sdUpcs.filter(u => !usedUpcs.has(u.upc));
  console.log('Available (not used):', availableSd.length);
  
  const unmatched = await db.select().from(supplies)
    .where(and(eq(supplies.brand, 'Science Diet'), isNull(supplies.upc)));
  console.log('Unmatched SD supplies:', unmatched.length);
  
  console.log('\n=== SAMPLE UNMATCHED SD SUPPLIES ===\n');
  unmatched.slice(0, 20).forEach((s, i) => {
    console.log((i+1) + '. [ID:' + s.id + '] ' + s.name);
    
    // Find best match in available UPCs
    let bestMatch = null;
    let bestScore = 0;
    
    const sTokens = new Set(tokenize(s.name));
    const sWeight = extractWeight(s.name);
    
    for (const upc of availableSd) {
      const uTokens = new Set(tokenize(upc.name_original));
      const uWeight = extractWeight(upc.name_original);
      
      // Weight must match
      if (sWeight && uWeight && (sWeight.value !== uWeight.value || sWeight.unit !== uWeight.unit)) continue;
      
      let matches = 0;
      for (const t of sTokens) if (uTokens.has(t)) matches++;
      const score = matches / Math.max(sTokens.size, uTokens.size);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = upc;
      }
    }
    
    if (bestMatch) {
      console.log('   Best: [' + (bestScore*100).toFixed(0) + '%] ' + bestMatch.upc + ' | ' + bestMatch.name_original);
    } else {
      console.log('   No match found');
    }
    console.log('');
  });
  
  process.exit(0);
}

main().catch(console.error);
