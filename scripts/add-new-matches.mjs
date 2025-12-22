import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq } from 'drizzle-orm';

// Abbreviation mappings
const abbreviations = {
  'oxb': 'oxbow', 'essntl': 'essential', 'tmthy': 'timothy', 'westrn': 'western',
  'adlt': 'adult', 'yng': 'young', 'rbbt': 'rabbit', 'gpig': 'guinea pig',
  'chinch': 'chinchilla', 'frrt': 'ferret', 'mse': 'mouse', 'orc': 'orchard',
  'grss': 'grass', 'trt': 'treat', 'bttl': 'bottle', 'lttr': 'litter',
  'bedng': 'bedding', 'cmft': 'comfort', 'wh': 'white', 'nat': 'natural',
  'smbn': 'smartbones', 'pmx': 'petmatrix', 'chkn': 'chicken', 'pb': 'peanut butter',
  'ben': 'benebone', 'chw': 'chew', 'wshbn': 'wishbone', 'bcn': 'bacon',
  'mple': 'maple', 'zgglr': 'zaggler', 'fshbn': 'fishbone', 'slmn': 'salmon',
  'gnt': 'giant', 'pup': 'puppy', 'sm': 'small', 'md': 'medium', 'lg': 'large',
  'twst': 'twist', 'twstz': 'twistz', 'stfd': 'stuffed', 'wrp': 'wrap',
};

function expandName(name) {
  let expanded = name;
  for (const [abbr, full] of Object.entries(abbreviations)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  return expanded;
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(name) {
  return normalize(name).split(' ').filter(t => t.length > 2);
}

async function main() {
  console.log('=== ADD NEW MATCHES FROM RESCAN ===\n');
  
  // Load invoice UPCs
  const invoiceData = JSON.parse(fs.readFileSync('scripts/all_invoice_upcs.json', 'utf-8'));
  
  // Get unmatched supplies
  const unmatched = await db.select()
    .from(supplies)
    .where(sql`${supplies.upc} IS NULL`);
  
  console.log(`Found ${unmatched.length} unmatched supplies`);
  console.log(`Have ${invoiceData.length} invoice UPCs to match against\n`);
  
  // Get already used UPCs
  const usedUpcResult = await db.execute(sql`
    SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL
  `);
  const usedUpcs = new Set(usedUpcResult.rows.map(r => r.upc));
  console.log(`${usedUpcs.size} UPCs already in use\n`);
  
  // Build invoice index
  const invoiceIndex = invoiceData
    .filter(i => !usedUpcs.has(i.upc))
    .map(i => ({
      ...i,
      expanded: expandName(i.name),
      tokens: tokenize(expandName(i.name))
    }));
  
  console.log(`${invoiceIndex.length} unused invoice UPCs available\n`);
  
  const newMatches = [];
  const matchedInvoices = new Set();
  
  for (const supply of unmatched) {
    const supplyExpanded = expandName(supply.name);
    const supplyTokens = tokenize(supplyExpanded);
    const supplyBrand = (supply.brand || '').toLowerCase().replace(/[^a-z]/g, '');
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const inv of invoiceIndex) {
      if (matchedInvoices.has(inv.upc)) continue;
      
      // Token matching
      const matchingTokens = supplyTokens.filter(t => 
        inv.tokens.includes(t) || inv.expanded.toLowerCase().includes(t)
      );
      const score = matchingTokens.length / Math.max(supplyTokens.length, 1);
      
      // Brand bonus
      let bonus = 0;
      if (supplyBrand && inv.brand === supplyBrand) bonus += 0.3;
      
      const totalScore = score + bonus;
      
      if (totalScore > bestScore && totalScore >= 0.5) {
        bestScore = totalScore;
        bestMatch = inv;
      }
    }
    
    if (bestMatch) {
      newMatches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        matchedName: bestMatch.expanded,
        upc: bestMatch.upc,
        score: bestScore
      });
      matchedInvoices.add(bestMatch.upc);
    }
  }
  
  console.log(`Found ${newMatches.length} NEW matches to add\n`);
  
  if (newMatches.length > 0) {
    console.log('Sample new matches:');
    newMatches.slice(0, 10).forEach(m => {
      console.log(`  ${m.supplyName} -> ${m.matchedName} (${(m.score*100).toFixed(0)}%)`);
    });
    
    // Apply new matches
    console.log('\nApplying new matches...');
    for (const m of newMatches) {
      await db.update(supplies)
        .set({ upc: m.upc })
        .where(eq(supplies.id, m.supplyId));
    }
    console.log(`Added ${newMatches.length} new UPCs`);
  }
  
  // Final stats
  const finalStats = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(upc) as with_upc FROM supplies
  `);
  const total = parseInt(finalStats.rows[0].total);
  const withUpc = parseInt(finalStats.rows[0].with_upc);
  
  console.log(`\n=== FINAL COVERAGE: ${withUpc}/${total} (${(withUpc/total*100).toFixed(1)}%) ===`);
  
  // Target brands
  const brandStats = await db.execute(sql`
    SELECT brand, COUNT(*) as total, COUNT(upc) as matched
    FROM supplies
    WHERE brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies')
    GROUP BY brand ORDER BY total DESC
  `);
  console.log('\n=== TARGET BRANDS ===');
  for (const row of brandStats.rows) {
    const pct = Math.round(parseInt(row.matched) / parseInt(row.total) * 100);
    console.log(`  ${row.brand}: ${row.matched}/${row.total} (${pct}%)`);
  }
  
  process.exit(0);
}

main().catch(console.error);
