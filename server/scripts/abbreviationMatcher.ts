import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, isNull, or, sql } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

// Inventory abbreviation expansions (from user's screenshot)
const ABBR_MAP: Record<string, string> = {
  // Brands
  'sd': 'science diet',
  'royal can': 'royal canin',
  'rc': 'royal canin',
  'bb': 'blue buffalo',
  'blue': 'blue buffalo',
  'ns': 'nutrisource',
  'nutri sou': 'nutrisource',
  'pp': 'pro plan',
  'proplan': 'pro plan',
  'totw': 'taste of the wild',
  'tow': 'taste of the wild',
  'frm': 'fromm',
  'diam': 'diamond',
  'can': 'canidae',
  'euk': 'eukanuba',
  'iams': 'iams',
  'nulo': 'nulo',
  'orij': 'orijen',
  'acana': 'acana',
  'merr': 'merrick',
  'well': 'wellness',
  'nat bal': 'natural balance',
  'nb': 'natural balance',
  
  // Age/Life stages
  'pup': 'puppy',
  'puppy': 'puppy',
  'kit': 'kitten',
  'kitten': 'kitten',
  'ad': 'adult',
  'adult': 'adult',
  'sen': 'senior',
  'senior': 'senior',
  '7+': 'mature adult 7+',
  '11+': 'senior 11+',
  
  // Sizes
  'sm': 'small',
  'small': 'small',
  'med': 'medium',
  'md': 'medium',
  'lg': 'large',
  'large': 'large',
  'xlg': 'extra large',
  'giant': 'giant',
  'mini': 'mini',
  'toy': 'toy breed',
  
  // Breed types
  'br': 'breed',
  'breed': 'breed',
  
  // Proteins/Flavors
  'ck': 'chicken',
  'chk': 'chicken',
  'chicken': 'chicken',
  'lam': 'lamb',
  'lamb': 'lamb',
  'bf': 'beef',
  'beef': 'beef',
  'sal': 'salmon',
  'salmon': 'salmon',
  'tur': 'turkey',
  'turkey': 'turkey',
  'dk': 'duck',
  'duck': 'duck',
  'fish': 'fish',
  'whtfish': 'whitefish',
  'ven': 'venison',
  'venison': 'venison',
  
  // Product types
  'sensi': 'sensitive',
  'sensitive': 'sensitive',
  'sens': 'sensitive',
  'stom': 'stomach',
  'stomach': 'stomach',
  'skin': 'skin',
  'coat': 'coat',
  'perf': 'perfect',
  'perfect': 'perfect',
  'wt': 'weight',
  'weight': 'weight',
  'light': 'light',
  'lite': 'light',
  'indoor': 'indoor',
  'outdoor': 'outdoor',
  'hairball': 'hairball',
  'urinary': 'urinary',
  'digest': 'digestive',
  'oral': 'oral care',
  'dental': 'dental',
  'joint': 'joint',
  'mobility': 'mobility',
  
  // Grain
  'gr': 'grain',
  'grain': 'grain',
  'fr': 'free',
  'free': 'free',
  'gf': 'grain free',
  
  // Formulas
  'orig': 'original',
  'original': 'original',
  'classic': 'classic',
  'healthy': 'healthy',
  'hlthy': 'healthy',
  
  // Food types
  'dry': 'dry',
  'can': 'canned',
  'canned': 'canned',
  'wet': 'wet',
  'stew': 'stew',
  'pate': 'pate',
  
  // Rice types
  'rice': 'rice',
  'br rice': 'brown rice',
  
  // Other
  'sw pot': 'sweet potato',
  'oat': 'oatmeal',
};

// Weight/size patterns
const WEIGHT_PATTERNS = [
  { pattern: /#$/, replacement: 'lb' },  // 4.5# -> 4.5lb
  { pattern: /(\d+\.?\d*)#/, replacement: '$1lb' },
  { pattern: /(\d+\.?\d*)\s*oz/, replacement: '$1oz' },
  { pattern: /(\d+\.?\d*)\s*lb/, replacement: '$1lb' },
];

// Expand abbreviations in text
function expandAbbreviations(text: string): string {
  let result = text.toLowerCase().trim();
  
  // Replace # with lb
  result = result.replace(/#/g, 'lb');
  
  // Sort abbreviations by length (longest first) to avoid partial replacements
  const sortedAbbrs = Object.entries(ABBR_MAP).sort((a, b) => b[0].length - a[0].length);
  
  for (const [abbr, full] of sortedAbbrs) {
    // Word boundary replacement
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  
  return result.replace(/\s+/g, ' ').trim();
}

// Normalize for comparison
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[™®©\-'"]/g, '')
    .replace(/hill's/g, 'hills')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get match score between expanded texts
function matchScore(supply: string, inventory: string): number {
  const supExpanded = expandAbbreviations(supply);
  const invExpanded = expandAbbreviations(inventory);
  
  const supNorm = normalize(supExpanded);
  const invNorm = normalize(invExpanded);
  
  // Exact match after expansion
  if (supNorm === invNorm) return 100;
  
  // One contains the other
  if (supNorm.includes(invNorm) || invNorm.includes(supNorm)) return 90;
  
  // Token matching
  const supTokens = new Set(supNorm.split(' ').filter(t => t.length > 1));
  const invTokens = new Set(invNorm.split(' ').filter(t => t.length > 1));
  
  let matches = 0;
  for (const st of supTokens) {
    if (invTokens.has(st)) {
      matches++;
    }
  }
  
  // Calculate Jaccard-like similarity
  const union = new Set([...supTokens, ...invTokens]).size;
  const score = (matches / union) * 100;
  
  return score;
}

// Check if products are compatible (same brand, similar size)
function isCompatible(supply: string, inventory: string): boolean {
  const supLower = supply.toLowerCase();
  const invLower = inventory.toLowerCase();
  
  // Check brand match
  const brands = ['science diet', 'sd', 'royal canin', 'blue buffalo', 'fromm', 'pro plan', 'nutrisource'];
  let supBrand = '';
  let invBrand = '';
  
  for (const brand of brands) {
    if (supLower.includes(brand)) supBrand = brand;
    if (invLower.includes(brand)) invBrand = brand;
  }
  
  // Normalize sd to science diet
  if (supBrand === 'sd') supBrand = 'science diet';
  if (invBrand === 'sd') invBrand = 'science diet';
  
  if (supBrand && invBrand && supBrand !== invBrand) {
    return false; // Different brands
  }
  
  // Check size match (weight)
  const supWeight = supLower.match(/(\d+\.?\d*)\s*(lb|oz|#)/);
  const invWeight = invLower.match(/(\d+\.?\d*)\s*(lb|oz|#)/);
  
  if (supWeight && invWeight) {
    let supOz = parseFloat(supWeight[1]);
    let invOz = parseFloat(invWeight[1]);
    
    // Convert to oz for comparison
    if (supWeight[2] === 'lb' || supWeight[2] === '#') supOz *= 16;
    if (invWeight[2] === 'lb' || invWeight[2] === '#') invOz *= 16;
    
    // Allow 10% variance
    if (Math.abs(supOz - invOz) / Math.max(supOz, invOz) > 0.1) {
      return false; // Different sizes
    }
  }
  
  return true;
}

async function run() {
  console.log('=== Abbreviation-Aware SKU Matcher ===\n');
  
  // Load inventory from Excel
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const sheet = workbook.worksheets[0];
  
  const inventory: Array<{upc: string, name: string, expanded: string}> = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name && upc.length >= 10) {
      inventory.push({ 
        upc, 
        name, 
        expanded: expandAbbreviations(name)
      });
    }
  }
  
  console.log(`Loaded ${inventory.length} inventory items\n`);
  
  // Show some expansion examples
  console.log('=== Expansion Examples ===');
  const samples = inventory.filter(i => i.name.toLowerCase().startsWith('sd ')).slice(0, 5);
  for (const s of samples) {
    console.log(`"${s.name}" -> "${s.expanded}"`);
  }
  console.log();
  
  // Get unmatched supplies
  const unmatched = await db.select({ id: supplies.id, name: supplies.name })
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`Unmatched supplies: ${unmatched.length}\n`);
  
  // Get already-used UPCs
  const existing = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const usedUpcs = new Set(existing.map(s => s.sku!));
  
  // Build inventory index by expanded name prefix
  const prefixIndex = new Map<string, typeof inventory>();
  for (const item of inventory) {
    const prefix = item.expanded.substring(0, 8);
    if (!prefixIndex.has(prefix)) prefixIndex.set(prefix, []);
    prefixIndex.get(prefix)!.push(item);
  }
  
  let matchCount = 0;
  const matchLog: string[] = [];
  
  // Match supplies to inventory
  for (let i = 0; i < unmatched.length; i++) {
    const supply = unmatched[i];
    const supExpanded = expandAbbreviations(supply.name);
    const supPrefix = supExpanded.substring(0, 8);
    
    // Get candidate matches from prefix index
    const candidates = [
      ...(prefixIndex.get(supPrefix) || []),
    ];
    
    // For food products, also check similar prefixes
    if (supExpanded.startsWith('science diet')) {
      candidates.push(...(prefixIndex.get('science ') || []));
    }
    
    let bestMatch: {upc: string, name: string} | null = null;
    let bestScore = 0;
    
    for (const cand of candidates) {
      if (usedUpcs.has(cand.upc)) continue;
      if (!isCompatible(supply.name, cand.name)) continue;
      
      const score = matchScore(supply.name, cand.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cand;
      }
    }
    
    // If no match from prefix, do a broader search for high-value brands
    if (!bestMatch || bestScore < 70) {
      const supLower = supply.name.toLowerCase();
      
      // Check if it's a valuable brand to match
      const valuableBrands = ['science diet', 'fromm', 'blue buffalo', 'royal canin', 'pro plan', 'nutrisource'];
      const isValuable = valuableBrands.some(b => supLower.includes(b));
      
      if (isValuable) {
        for (const cand of inventory) {
          if (usedUpcs.has(cand.upc)) continue;
          if (!isCompatible(supply.name, cand.name)) continue;
          
          const score = matchScore(supply.name, cand.name);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = cand;
          }
        }
      }
    }
    
    // Apply match if confident
    if (bestMatch && bestScore >= 70) {
      await db.update(supplies)
        .set({ sku: bestMatch.upc })
        .where(eq(supplies.id, supply.id));
      
      usedUpcs.add(bestMatch.upc);
      matchCount++;
      matchLog.push(`[${bestScore.toFixed(0)}] "${supply.name}" -> "${bestMatch.name}" (${bestMatch.upc})`);
    }
    
    if ((i + 1) % 500 === 0) {
      console.log(`Processed ${i + 1}/${unmatched.length}, ${matchCount} new matches`);
    }
  }
  
  // Save match log
  fs.writeFileSync('/tmp/abbr_matches.txt', matchLog.join('\n'));
  
  // Final stats
  const final = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const total = 7603;
  const coverage = (Number(final[0].count) / total * 100).toFixed(1);
  
  console.log(`\n=== RESULTS ===`);
  console.log(`New matches this run: ${matchCount}`);
  console.log(`Total with SKU: ${final[0].count}/${total} (${coverage}%)`);
  console.log(`Match log saved to /tmp/abbr_matches.txt`);
}

run().catch(console.error);
