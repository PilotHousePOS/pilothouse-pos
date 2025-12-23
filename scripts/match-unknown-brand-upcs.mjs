import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, isNull } from 'drizzle-orm';

function normalize(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('\n=== MATCHING UNKNOWN BRAND UPCs BY NAME ===\n');
  
  const allUpcs = JSON.parse(fs.readFileSync('scripts/ALL_UPCS_EXPANDED.json', 'utf-8'));
  const unknownUpcs = allUpcs.filter(u => u.brand === 'UNKNOWN');
  console.log(`UNKNOWN brand UPCs: ${unknownUpcs.length}`);
  
  // Get used UPCs
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  
  const availableUnknown = unknownUpcs.filter(u => !usedUpcs.has(u.upc));
  console.log(`Available (not used): ${availableUnknown.length}`);
  
  // Get unmatched supplies
  const unmatched = await db.select().from(supplies).where(isNull(supplies.upc));
  console.log(`Unmatched supplies: ${unmatched.length}`);
  
  // Build name index for fast lookup
  const supplyByNormName = new Map();
  for (const s of unmatched) {
    const normName = normalize(s.name);
    if (!supplyByNormName.has(normName)) {
      supplyByNormName.set(normName, s);
    }
  }
  
  let matches = [];
  
  for (const upcItem of availableUnknown) {
    const normName = normalize(upcItem.name_original);
    const supply = supplyByNormName.get(normName);
    
    if (supply) {
      matches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        brand: supply.brand || 'UNKNOWN',
        upc: upcItem.upc,
        upcName: upcItem.name_original,
        score: 1.0,
        matchType: 'unknown_brand_exact'
      });
      supplyByNormName.delete(normName);
    }
  }
  
  console.log(`\nDirect matches found: ${matches.length}`);
  
  if (matches.length > 0) {
    fs.writeFileSync('scripts/unknown_brand_matches.json', JSON.stringify(matches, null, 2));
    console.log('Saved to scripts/unknown_brand_matches.json');
    
    console.log('\nSamples:');
    matches.slice(0, 10).forEach((m, i) => {
      console.log(`${i+1}. ${m.brand}: ${m.supplyName}`);
      console.log(`   UPC: ${m.upc} | ${m.upcName}`);
    });
  }
  
  process.exit(0);
}

main().catch(console.error);
