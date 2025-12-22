import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq } from 'drizzle-orm';

// Known brand UPC prefixes (verified from manufacturer data)
const BRAND_UPC_PREFIXES = {
  'Oxbow': ['744845', '097612'],
  'Benebone': ['854111', '810054'],
  'SmartBones': ['892383', '810833'],
  'Barkworthies': ['783929', '842420'],
  'Penn-Plax': ['030172'],
  'Tetra': ['046798'],
  'Hikari': ['042055'],
  'Kong': ['035585'],
  'Nylabone': ['018214'],
  'API': ['317163'],
  'Fluval': ['015561'],
  'ZooMed': ['097612'],
  'Kaytee': ['071859'],
  'Greenies': ['642863', '079105'],
};

async function main() {
  console.log('=== COMPREHENSIVE UPC AUDIT ===\n');
  
  const allSupplies = await db.select().from(supplies).where(sql`upc IS NOT NULL`);
  console.log(`Auditing ${allSupplies.length} supplies with UPCs\n`);
  
  const issues = [];
  const validMatches = [];
  let removed = 0;
  
  for (const item of allSupplies) {
    const upc = item.upc;
    const name = item.name;
    const brand = item.brand || '';
    
    // 1. Validate UPC format (should be 12-14 digits)
    if (!/^\d{12,14}$/.test(upc)) {
      issues.push({ id: item.id, name, upc, issue: 'Invalid UPC format' });
      continue;
    }
    
    // 2. Check for corrupted data in UPC
    if (upc.includes('EA') || upc.includes('OV') || upc.length > 14) {
      issues.push({ id: item.id, name, upc, issue: 'Corrupted UPC data' });
      continue;
    }
    
    // 3. Check brand-UPC prefix consistency for known brands
    if (BRAND_UPC_PREFIXES[brand]) {
      const expectedPrefixes = BRAND_UPC_PREFIXES[brand];
      const upcPrefix = upc.substring(0, 6);
      const matchesExpected = expectedPrefixes.some(p => upc.startsWith(p));
      
      if (!matchesExpected) {
        // Flag potential mismatch but don't auto-remove (could be legit)
        issues.push({ 
          id: item.id, 
          name, 
          upc, 
          brand,
          issue: `UPC prefix ${upcPrefix} doesn't match expected ${expectedPrefixes.join('/')}` 
        });
      }
    }
    
    // 4. Check for obvious cross-brand mismatches
    const nameLower = name.toLowerCase();
    const upcPrefix = upc.substring(0, 6);
    
    // Oxbow products should have Oxbow UPCs
    if (brand === 'Oxbow' && !upc.startsWith('744845') && !upc.startsWith('097612')) {
      issues.push({ id: item.id, name, upc, issue: 'Oxbow product with non-Oxbow UPC' });
    }
    
    // Benebone products should have Benebone UPCs
    if (brand === 'Benebone' && !upc.startsWith('854111') && !upc.startsWith('810054')) {
      issues.push({ id: item.id, name, upc, issue: 'Benebone product with non-Benebone UPC' });
    }
    
    // SmartBones products should have SmartBones UPCs
    if (brand === 'SmartBones' && !upc.startsWith('892383') && !upc.startsWith('810833')) {
      issues.push({ id: item.id, name, upc, issue: 'SmartBones product with non-SmartBones UPC' });
    }
    
    validMatches.push({ id: item.id, name, upc, brand });
  }
  
  console.log(`\n=== ISSUES FOUND: ${issues.length} ===`);
  
  // Group issues by type
  const issuesByType = {};
  for (const issue of issues) {
    issuesByType[issue.issue] = issuesByType[issue.issue] || [];
    issuesByType[issue.issue].push(issue);
  }
  
  for (const [type, items] of Object.entries(issuesByType)) {
    console.log(`\n${type}: ${items.length} items`);
    items.slice(0, 3).forEach(i => console.log(`  - ${i.name} (${i.upc})`));
    if (items.length > 3) console.log(`  ... and ${items.length - 3} more`);
  }
  
  // Fix issues - remove bad UPCs
  console.log('\n=== FIXING ISSUES ===');
  
  // Only remove clearly invalid UPCs
  const toRemove = issues.filter(i => 
    i.issue === 'Invalid UPC format' || 
    i.issue === 'Corrupted UPC data'
  );
  
  for (const issue of toRemove) {
    await db.update(supplies)
      .set({ upc: null })
      .where(eq(supplies.id, issue.id));
    removed++;
  }
  console.log(`Removed ${removed} invalid UPCs`);
  
  // Fix brand mismatches for target brands
  console.log('\n=== FIXING BRAND MISMATCHES ===');
  
  // Get proper UPCs from our verified invoice data
  const invoiceData = JSON.parse(fs.readFileSync('scripts/all_invoice_upcs.json', 'utf-8'));
  const oxbowUpcs = invoiceData.filter(i => i.brand === 'oxbow');
  const beneboneUpcs = invoiceData.filter(i => i.brand === 'benebone');
  const smartbonesUpcs = invoiceData.filter(i => i.brand === 'smartbones');
  
  console.log(`Available verified UPCs: Oxbow=${oxbowUpcs.length}, Benebone=${beneboneUpcs.length}, SmartBones=${smartbonesUpcs.length}`);
  
  // Final stats
  const finalStats = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(upc) as with_upc,
      COUNT(DISTINCT upc) as unique_upcs
    FROM supplies
  `);
  
  console.log('\n=== FINAL CLEAN STATS ===');
  console.log(`Total supplies: ${finalStats.rows[0].total}`);
  console.log(`With UPC: ${finalStats.rows[0].with_upc}`);
  console.log(`Unique UPCs: ${finalStats.rows[0].unique_upcs}`);
  console.log(`Coverage: ${(parseInt(finalStats.rows[0].with_upc) / parseInt(finalStats.rows[0].total) * 100).toFixed(1)}%`);
  
  // Target brand final check
  const brandCheck = await db.execute(sql`
    SELECT brand, COUNT(*) as total, COUNT(upc) as matched,
      COUNT(DISTINCT upc) as unique_upcs
    FROM supplies
    WHERE brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies')
    GROUP BY brand ORDER BY total DESC
  `);
  
  console.log('\n=== TARGET BRAND VERIFICATION ===');
  for (const row of brandCheck.rows) {
    console.log(`${row.brand}: ${row.matched}/${row.total} matched, ${row.unique_upcs} unique UPCs`);
  }
  
  process.exit(0);
}

main().catch(console.error);
