import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq } from 'drizzle-orm';

// Abbreviation expansions
const abbrevs = {
  'oxb': 'oxbow', 'essntl': 'essential', 'tmthy': 'timothy', 'westrn': 'western',
  'adlt': 'adult', 'yng': 'young', 'rbbt': 'rabbit', 'gpig': 'guinea pig',
  'chinch': 'chinchilla', 'frrt': 'ferret', 'mse': 'mouse', 'orc': 'orchard',
  'grss': 'grass', 'trt': 'treat', 'bttl': 'bottle', 'lttr': 'litter',
  'bedng': 'bedding', 'cmft': 'comfort', 'wh': 'white', 'nat': 'natural',
  'smbn': 'smartbones', 'pmx': 'petmatrix', 'chkn': 'chicken', 'pb': 'peanut butter',
  'ben': 'benebone', 'chw': 'chew', 'wshbn': 'wishbone', 'bcn': 'bacon',
  'mple': 'maple', 'zgglr': 'zaggler', 'fshbn': 'fishbone', 'slmn': 'salmon',
  'gnt': 'giant', 'pup': 'puppy', 'sm': 'small', 'md': 'medium', 'lg': 'large',
  'twst': 'twist', 'stfd': 'stuffed', 'wrp': 'wrap', 'stc': 'stick',
  'bll': 'ball', 'clbrtn': 'celebration', 'wll': 'willow', 'ply': 'play',
  'cb': 'cube', 'appl': 'apple', 'h/s': 'hide seek', 'twsts': 'twists',
};

function expand(name) {
  let result = name;
  for (const [abbr, full] of Object.entries(abbrevs)) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  return result;
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(s) {
  return normalize(s).split(' ').filter(t => t.length > 2);
}

function matchScore(supply, invoice) {
  const supplyExpanded = expand(supply.name);
  const invoiceExpanded = expand(invoice.name);
  
  const supplyTokens = tokenize(supplyExpanded);
  const invoiceTokens = tokenize(invoiceExpanded);
  
  const matching = supplyTokens.filter(t => 
    invoiceTokens.includes(t) || invoiceExpanded.toLowerCase().includes(t)
  );
  
  return matching.length / Math.max(supplyTokens.length, 1);
}

async function main() {
  console.log('=== REMATCH TARGET BRANDS WITH VERIFIED UPCs ===\n');
  
  // Load verified invoice data
  const invoiceData = JSON.parse(fs.readFileSync('scripts/all_invoice_upcs.json', 'utf-8'));
  
  const oxbowUpcs = invoiceData.filter(i => i.brand === 'oxbow');
  const beneboneUpcs = invoiceData.filter(i => i.brand === 'benebone');
  const smartbonesUpcs = invoiceData.filter(i => i.brand === 'smartbones');
  
  console.log(`Verified UPCs: Oxbow=${oxbowUpcs.length}, Benebone=${beneboneUpcs.length}, SmartBones=${smartbonesUpcs.length}\n`);
  
  // Get unmatched supplies for each brand
  const unmatchedOxbow = await db.select().from(supplies)
    .where(sql`brand = 'Oxbow' AND upc IS NULL`);
  const unmatchedBenebone = await db.select().from(supplies)
    .where(sql`brand = 'Benebone' AND upc IS NULL`);
  const unmatchedSmartbones = await db.select().from(supplies)
    .where(sql`brand = 'SmartBones' AND upc IS NULL`);
  
  console.log(`Unmatched: Oxbow=${unmatchedOxbow.length}, Benebone=${unmatchedBenebone.length}, SmartBones=${unmatchedSmartbones.length}\n`);
  
  // Match Oxbow
  console.log('=== MATCHING OXBOW ===');
  let oxbowMatched = 0;
  const usedOxbow = new Set();
  
  for (const supply of unmatchedOxbow) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const inv of oxbowUpcs) {
      if (usedOxbow.has(inv.upc)) continue;
      const score = matchScore(supply, inv);
      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestMatch = inv;
      }
    }
    
    if (bestMatch) {
      await db.update(supplies).set({ upc: bestMatch.upc }).where(eq(supplies.id, supply.id));
      usedOxbow.add(bestMatch.upc);
      oxbowMatched++;
      console.log(`  ${supply.name} -> ${bestMatch.name} (${(bestScore*100).toFixed(0)}%)`);
    }
  }
  console.log(`  Matched ${oxbowMatched} Oxbow items\n`);
  
  // Match Benebone
  console.log('=== MATCHING BENEBONE ===');
  let beneboneMatched = 0;
  const usedBenebone = new Set();
  
  for (const supply of unmatchedBenebone) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const inv of beneboneUpcs) {
      if (usedBenebone.has(inv.upc)) continue;
      const score = matchScore(supply, inv);
      if (score > bestScore && score >= 0.3) {
        bestScore = score;
        bestMatch = inv;
      }
    }
    
    if (bestMatch) {
      await db.update(supplies).set({ upc: bestMatch.upc }).where(eq(supplies.id, supply.id));
      usedBenebone.add(bestMatch.upc);
      beneboneMatched++;
      console.log(`  ${supply.name} -> ${bestMatch.name} (${(bestScore*100).toFixed(0)}%)`);
    }
  }
  console.log(`  Matched ${beneboneMatched} Benebone items\n`);
  
  // Match SmartBones
  console.log('=== MATCHING SMARTBONES ===');
  let smartbonesMatched = 0;
  const usedSmartbones = new Set();
  
  for (const supply of unmatchedSmartbones) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const inv of smartbonesUpcs) {
      if (usedSmartbones.has(inv.upc)) continue;
      const score = matchScore(supply, inv);
      if (score > bestScore && score >= 0.3) {
        bestScore = score;
        bestMatch = inv;
      }
    }
    
    if (bestMatch) {
      await db.update(supplies).set({ upc: bestMatch.upc }).where(eq(supplies.id, supply.id));
      usedSmartbones.add(bestMatch.upc);
      smartbonesMatched++;
      console.log(`  ${supply.name} -> ${bestMatch.name} (${(bestScore*100).toFixed(0)}%)`);
    }
  }
  console.log(`  Matched ${smartbonesMatched} SmartBones items\n`);
  
  // Final stats
  const finalStats = await db.execute(sql`
    SELECT brand, COUNT(*) as total, COUNT(upc) as matched
    FROM supplies
    WHERE brand IN ('Oxbow', 'Benebone', 'SmartBones', 'Barkworthies')
    GROUP BY brand ORDER BY total DESC
  `);
  
  console.log('=== FINAL TARGET BRAND STATS ===');
  for (const row of finalStats.rows) {
    const pct = Math.round(parseInt(row.matched) / parseInt(row.total) * 100);
    console.log(`  ${row.brand}: ${row.matched}/${row.total} (${pct}%)`);
  }
  
  const overallStats = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(upc) as matched FROM supplies
  `);
  console.log(`\nOverall: ${overallStats.rows[0].matched}/${overallStats.rows[0].total} (${(parseInt(overallStats.rows[0].matched) / parseInt(overallStats.rows[0].total) * 100).toFixed(1)}%)`);
  
  process.exit(0);
}

main().catch(console.error);
