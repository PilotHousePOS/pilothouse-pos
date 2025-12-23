#!/usr/bin/env node
/**
 * Audit UPC Brand Prefix Validation
 * 
 * This script identifies UPCs that are assigned to products from the wrong brand
 * based on known GS1/UPC prefix mappings.
 * 
 * Known brand prefixes:
 * - Zoo Med: 097612
 * - Kaytee: 071859
 * - Orijen: 064992
 * - Hill's Science Diet: 052742
 * - Blue Buffalo: 859610
 * - Fromm: 072705
 * - Royal Canin: 030111
 * - Tetra: 046798
 * - Aqueon: 015905
 * - Fluker's: 091197
 * - Exo Terra: 015561
 * - Hikari: 042055
 * - API: 317163
 * - Marineland: 047431
 * - Penn-Plax: 030172
 */

import pg from 'pg';
const { Pool } = pg;

// Comprehensive brand-to-UPC prefix mapping
const BRAND_UPC_PREFIXES = {
  // Reptile brands
  '097612': ['zoo med', 'zoomed'],
  '015561': ['exo terra', 'exoterra', 'hagen'],
  '091197': ["fluker's", 'flukers', 'fluker'],
  '096316': ['zilla'],
  
  // Aquatic brands
  '046798': ['tetra'],
  '015905': ['aqueon'],
  '042055': ['hikari'],
  '317163': ['api'],
  '047431': ['marineland'],
  '030172': ['penn-plax', 'pennplax', 'penn plax'],
  '015561': ['fluval', 'marina', 'hagen'],
  
  // Small animal/bird brands
  '071859': ['kaytee'],
  '034846': ['oxbow'],
  '071354': ['vitakraft'],
  
  // Pet food brands
  '064992': ['orijen', 'acana', 'champion petfoods'],
  '052742': ["hill's", 'hills', 'science diet', 'healthy advantage'],
  '859610': ['blue buffalo', 'blue'],
  '072705': ['fromm'],
  '030111': ['royal canin', 'royalcanin'],
  '019014': ['nutro'],
  '769949': ['taste of the wild', 'diamond'],
  '840243': ['instinct', "nature's variety"],
  '038100': ['purina', 'pro plan', 'beneful', 'friskies'],
  '023100': ['pedigree', 'iams', 'eukanuba'],
  
  // Dog/cat accessory brands
  '076484': ['kong'],
  '018214': ['coastal', "li'l pals", 'lil pals'],
  '018065': ['nylabone'],
  '810833': ['benebone'],
  '810039': ['smartbones'],
  '785184': ['redbarn'],
  '642863': ['greenies'],
  '8710231': ['whimzees'],
  '660048': ['chuckit'],
  '077234': ['ethical pet', 'spot'],
  '618940': ['jw pet'],
  '045663': ['safari', 'four paws'],
  '645095': ['tropiclean'],
};

// Reverse mapping: prefix -> brand names array
const PREFIX_TO_BRANDS = BRAND_UPC_PREFIXES;

// Build brand name -> prefix map for quick lookup
const BRAND_TO_PREFIX = {};
for (const [prefix, brands] of Object.entries(BRAND_UPC_PREFIXES)) {
  for (const brand of brands) {
    BRAND_TO_PREFIX[brand.toLowerCase()] = prefix;
  }
}

function getUpcBrand(upc) {
  if (!upc) return null;
  const cleanUpc = upc.replace(/[^0-9]/g, '');
  
  for (const [prefix, brandNames] of Object.entries(PREFIX_TO_BRANDS)) {
    if (cleanUpc.startsWith(prefix)) {
      return { prefix, brandNames };
    }
  }
  return null;
}

function normalizeSupplyBrand(brand) {
  if (!brand) return null;
  return brand.toLowerCase().trim();
}

function brandsMatch(supplyBrand, upcBrandNames) {
  if (!supplyBrand || !upcBrandNames) return true; // Can't validate without brand info
  
  const normalizedSupply = normalizeSupplyBrand(supplyBrand);
  
  // Check if supply brand matches any of the UPC brand names
  for (const upcBrand of upcBrandNames) {
    if (normalizedSupply.includes(upcBrand) || upcBrand.includes(normalizedSupply)) {
      return true;
    }
  }
  
  // Check brand aliases
  const brandAliases = {
    'hills': ["hill's", 'science diet', 'healthy advantage'],
    "hill's": ['hills', 'science diet', 'healthy advantage'],
    'science diet': ['hills', "hill's", 'healthy advantage'],
    'zoo med': ['zoomed'],
    'zoomed': ['zoo med'],
    'exo terra': ['exoterra', 'hagen'],
    'exoterra': ['exo terra', 'hagen'],
    'penn-plax': ['pennplax', 'penn plax'],
    "fluker's": ['flukers'],
    'flukers': ["fluker's"],
    'blue buffalo': ['blue'],
    'blue': ['blue buffalo'],
    'royal canin': ['royalcanin'],
    "li'l pals": ['lil pals', 'coastal'],
    'lil pals': ["li'l pals", 'coastal'],
  };
  
  const aliases = brandAliases[normalizedSupply] || [];
  for (const alias of aliases) {
    for (const upcBrand of upcBrandNames) {
      if (alias.includes(upcBrand) || upcBrand.includes(alias)) {
        return true;
      }
    }
  }
  
  return false;
}

async function auditUpcBrandPrefixes() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('=== UPC Brand Prefix Audit ===\n');
    
    // Get all supplies with UPCs
    const result = await pool.query(`
      SELECT id, name, brand, upc 
      FROM supplies 
      WHERE upc IS NOT NULL AND upc != ''
      ORDER BY brand, name
    `);
    
    console.log(`Total supplies with UPCs: ${result.rows.length}\n`);
    
    const mismatches = [];
    const validated = [];
    const unknownPrefix = [];
    
    for (const row of result.rows) {
      const upcBrand = getUpcBrand(row.upc);
      
      if (!upcBrand) {
        unknownPrefix.push(row);
        continue;
      }
      
      const supplyBrand = row.brand || '';
      const matches = brandsMatch(supplyBrand, upcBrand.brandNames);
      
      if (!matches) {
        mismatches.push({
          id: row.id,
          name: row.name,
          supplyBrand: row.brand,
          upc: row.upc,
          upcPrefix: upcBrand.prefix,
          expectedBrands: upcBrand.brandNames,
        });
      } else {
        validated.push(row);
      }
    }
    
    console.log(`\n=== RESULTS ===`);
    console.log(`Validated (brand matches UPC prefix): ${validated.length}`);
    console.log(`Unknown UPC prefix (can't validate): ${unknownPrefix.length}`);
    console.log(`MISMATCHES FOUND: ${mismatches.length}\n`);
    
    if (mismatches.length > 0) {
      console.log(`\n=== BRAND-UPC MISMATCHES (ERRORS) ===\n`);
      
      // Group by UPC prefix for easier review
      const byPrefix = {};
      for (const m of mismatches) {
        if (!byPrefix[m.upcPrefix]) byPrefix[m.upcPrefix] = [];
        byPrefix[m.upcPrefix].push(m);
      }
      
      for (const [prefix, items] of Object.entries(byPrefix)) {
        const expectedBrand = items[0].expectedBrands.join('/');
        console.log(`\n--- UPC Prefix ${prefix} (belongs to: ${expectedBrand}) ---`);
        for (const item of items) {
          console.log(`  ID ${item.id}: "${item.name}"`);
          console.log(`    Supply brand: "${item.supplyBrand || '(none)'}"`);
          console.log(`    UPC: ${item.upc}`);
          console.log(`    Expected brand: ${item.expectedBrands.join('/')}`);
          console.log('');
        }
      }
      
      // Save mismatches to file for rollback
      const fs = await import('fs');
      const outputPath = 'scripts/upc_brand_mismatches.json';
      fs.writeFileSync(outputPath, JSON.stringify({
        auditDate: new Date().toISOString(),
        totalMismatches: mismatches.length,
        mismatches: mismatches,
      }, null, 2));
      console.log(`\nMismatches saved to: ${outputPath}`);
      
      // Generate rollback SQL
      const rollbackSql = mismatches.map(m => 
        `UPDATE supplies SET upc = NULL WHERE id = ${m.id}; -- ${m.name.substring(0, 50)}`
      ).join('\n');
      
      const sqlPath = 'scripts/rollback_mismatched_upcs.sql';
      fs.writeFileSync(sqlPath, `-- Rollback mismatched UPCs\n-- Generated: ${new Date().toISOString()}\n\n${rollbackSql}\n`);
      console.log(`Rollback SQL saved to: ${sqlPath}`);
    }
    
    return mismatches;
    
  } finally {
    await pool.end();
  }
}

auditUpcBrandPrefixes().catch(console.error);
