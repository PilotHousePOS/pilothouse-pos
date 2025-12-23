import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql } from 'drizzle-orm';

async function main() {
  // Load clean maybe inventory (3150 unique UPCs)
  const maybeData = JSON.parse(fs.readFileSync('scripts/maybe_upcs_clean_3171.json', 'utf-8'));
  console.log('Maybe inventory: ' + maybeData.length + ' unique UPCs');
  
  // Load invoice data
  const invoiceData = JSON.parse(fs.readFileSync('scripts/all_invoice_upcs.json', 'utf-8'));
  console.log('Invoice data: ' + invoiceData.length + ' UPCs');
  
  // Combine into master list (prefer maybe names - cleaner)
  const masterUpcs = new Map();
  
  // Add maybe data first (cleaner names)
  for (const item of maybeData) {
    masterUpcs.set(item.upc, { upc: item.upc, name: item.name, source: 'maybe' });
  }
  
  // Add invoice data (only if not already present)
  for (const item of invoiceData) {
    if (!masterUpcs.has(item.upc)) {
      masterUpcs.set(item.upc, { upc: item.upc, name: item.name, source: 'invoice' });
    }
  }
  
  console.log('Combined unique UPCs: ' + masterUpcs.size);
  
  // Get currently used UPCs
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  console.log('Already matched UPCs: ' + usedUpcs.size);
  
  // Available UPCs (not yet used)
  const available = [];
  for (const [upc, data] of masterUpcs) {
    if (!usedUpcs.has(upc)) {
      available.push(data);
    }
  }
  console.log('Available to match: ' + available.length);
  
  // Analyze available by brand pattern
  console.log('\n=== AVAILABLE UPCs BY BRAND PATTERN ===');
  const brandPatterns = {};
  for (const item of available) {
    const firstWord = item.name.split(' ')[0].toUpperCase();
    brandPatterns[firstWord] = brandPatterns[firstWord] || [];
    brandPatterns[firstWord].push(item);
  }
  
  Object.entries(brandPatterns)
    .sort((a,b) => b[1].length - a[1].length)
    .slice(0, 25)
    .forEach(([brand, items]) => {
      console.log(`${brand}: ${items.length} available`);
      console.log(`  Ex: ${items[0].upc} | ${items[0].name}`);
    });
  
  // Save combined master list
  fs.writeFileSync('scripts/master_upcs.json', JSON.stringify(Array.from(masterUpcs.values()), null, 2));
  console.log('\nSaved master_upcs.json with ' + masterUpcs.size + ' entries');
  
  // Get unmatched supplies by brand
  console.log('\n=== UNMATCHED SUPPLIES BY BRAND ===');
  const unmatchedBrands = await db.execute(sql`
    SELECT brand, COUNT(*) as cnt 
    FROM supplies 
    WHERE upc IS NULL AND brand IS NOT NULL AND brand != ''
    GROUP BY brand 
    HAVING COUNT(*) > 20
    ORDER BY cnt DESC 
    LIMIT 20
  `);
  
  for (const row of unmatchedBrands.rows) {
    console.log(`${row.brand}: ${row.cnt} unmatched`);
  }
  
  process.exit(0);
}

main().catch(console.error);
