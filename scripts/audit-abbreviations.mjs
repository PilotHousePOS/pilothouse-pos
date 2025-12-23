import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { eq, isNull, and, sql } from 'drizzle-orm';

// Analyze unmatched supplies vs available UPCs to find pattern differences
async function main() {
  const brand = process.argv[2] || 'Kaytee';
  
  const allUpcs = JSON.parse(fs.readFileSync('scripts/FLAGGED_ALL_UPCS.json', 'utf-8'));
  const brandUpcs = allUpcs.filter(u => u.brand === brand);
  
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  const availableUpcs = brandUpcs.filter(u => !usedUpcs.has(u.upc));
  
  const unmatched = await db.select().from(supplies)
    .where(and(eq(supplies.brand, brand), isNull(supplies.upc)));
  
  console.log(`=== ${brand} AUDIT ===`);
  console.log(`Unmatched supplies: ${unmatched.length}`);
  console.log(`Available UPCs: ${availableUpcs.length}`);
  console.log('');
  
  // Show samples side by side
  console.log('=== UNMATCHED SUPPLIES (first 15) ===');
  unmatched.slice(0, 15).forEach(s => console.log(s.name));
  
  console.log('');
  console.log('=== AVAILABLE UPCs (first 15) ===');
  availableUpcs.slice(0, 15).forEach(u => console.log(u.name));
  
  // Find common abbreviation patterns in UPC names
  console.log('');
  console.log('=== POTENTIAL ABBREVIATIONS IN UPCs ===');
  const abbrevPatterns = {};
  availableUpcs.forEach(u => {
    const words = u.name.split(/\s+/);
    words.forEach(w => {
      if (w.length <= 4 && /^[A-Z0-9]+$/i.test(w) && !/^\d+$/.test(w)) {
        abbrevPatterns[w.toLowerCase()] = (abbrevPatterns[w.toLowerCase()] || 0) + 1;
      }
    });
  });
  Object.entries(abbrevPatterns)
    .filter(([k, v]) => v >= 2)
    .sort((a, b) => b[1] - a[1])
    .forEach(([abbr, count]) => console.log(`${abbr}: ${count} occurrences`));
  
  process.exit(0);
}

main().catch(console.error);
