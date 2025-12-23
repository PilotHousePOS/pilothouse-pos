import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq, isNull, and } from 'drizzle-orm';

const allUpcs = JSON.parse(fs.readFileSync('scripts/ALL_UPCS_EXPANDED.json', 'utf-8'));

// Get all brands with UPCs
const brandCounts = {};
allUpcs.forEach(u => {
  if (u.brand && u.brand !== 'UNKNOWN') {
    brandCounts[u.brand] = (brandCounts[u.brand] || 0) + 1;
  }
});

// Get top 30 brands
const topBrands = Object.entries(brandCounts)
  .sort((a,b) => b[1] - a[1])
  .slice(0, 30)
  .map(([brand]) => brand);

console.log('Checking', topBrands.length, 'brands for potential matches...\n');

// Get all used UPCs
const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
const usedUpcs = new Set(usedResult.rows.map(r => r.upc));

// Get unmatched counts by brand
const unmatchedResult = await db.execute(sql`
  SELECT brand, COUNT(*) as count 
  FROM supplies 
  WHERE upc IS NULL AND brand IS NOT NULL
  GROUP BY brand
`);
const unmatchedByBrand = {};
unmatchedResult.rows.forEach(r => {
  unmatchedByBrand[r.brand] = parseInt(r.count);
});

// Summary
console.log('Brand Summary:');
console.log('='.repeat(60));
for (const brand of topBrands) {
  const upcCount = brandCounts[brand];
  const availableCount = allUpcs.filter(u => u.brand === brand && !usedUpcs.has(u.upc)).length;
  const unmatched = unmatchedByBrand[brand] || 0;
  const potential = Math.min(availableCount, unmatched);
  if (potential > 0) {
    console.log(`${brand.padEnd(20)} UPCs: ${upcCount.toString().padStart(4)} | Available: ${availableCount.toString().padStart(4)} | Unmatched: ${unmatched.toString().padStart(4)} | Potential: ${potential}`);
  }
}

process.exit(0);
