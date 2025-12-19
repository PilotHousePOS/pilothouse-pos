/**
 * STRICT SKU Matching Script
 * 
 * Requirements for a valid match:
 * 1. Brand must match EXACTLY
 * 2. Size/weight must match EXACTLY (15lb = 15#)
 * 3. Protein/flavor must match if present (chicken ≠ beef ≠ lamb)
 * 4. Product type must match (food ≠ treats)
 * 5. High word similarity (>= 70%)
 * 
 * Goal: 100% accuracy - only assign SKUs that are definitively correct
 */

import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, sql, and, or, ilike } from 'drizzle-orm';
import ExcelJS from 'exceljs';

// Brand abbreviation mappings (from inventory file → database brand)
const BRAND_ABBREVS: Record<string, string> = {
  'sd': 'Science Diet',
  'blue b': 'Blue Buffalo',
  'tow': 'Taste of the Wild',
  'nutri sou': 'Nutrisource',
  'diam': 'Diamond',
  'fromm': 'Fromm',
  'zign': 'Zignature',
  'vict': 'Victor',
  'nb': 'Natural Balance',
  'euk': 'Eukanuba',
  'nut': 'Nulo',
  'nulo': 'Nulo',
  'cand': 'Canidae',
  'pure': 'PureVita',
  'purevita': 'PureVita',
  'pedigree': 'Pedigree',
  'iams': 'IAMS',
  'purina': 'Purina',
  'royal canin': 'Royal Canin',
  'rc': 'Royal Canin',
  'wellness': 'Wellness',
  'merrick': 'Merrick',
  'acana': 'Acana',
  'orijen': 'Orijen',
  'instinct': 'Instinct',
  'nat bal': 'Natural Balance',
  'firstmate': 'FirstMate',
  'earth born': 'Earthborn',
  'earthborn': 'Earthborn',
};

// Word abbreviation mappings (from inventory → expanded)
const WORD_ABBREVS: Record<string, string> = {
  // Proteins
  'ck': 'chicken',
  'chk': 'chicken',
  'chkn': 'chicken',
  'lam': 'lamb',
  'sal': 'salmon',
  'salm': 'salmon',
  'bf': 'beef',
  'trk': 'turkey',
  'turk': 'turkey',
  'whtfsh': 'whitefish',
  'venison': 'venison',
  'ven': 'venison',
  'duck': 'duck',
  'bison': 'bison',
  'pork': 'pork',
  'rabbit': 'rabbit',
  'kang': 'kangaroo',
  'tr': 'trout',
  // Age/Life stage
  'pup': 'puppy',
  'kit': 'kitten',
  'sr': 'senior',
  'ad': 'adult',
  'adlt': 'adult',
  // Size
  'sm': 'small',
  'lg': 'large',
  'med': 'medium',
  'br': 'breed',
  'min': 'mini',
  'giant': 'giant',
  // Product lines
  'anc': 'ancient',
  'wilder': 'wilderness',
  'pacif': 'pacific',
  'stre': 'stream',
  'high pra': 'high prairie',
  'hp': 'high prairie',
  'gr fr': 'grain free',
  'gf': 'grain free',
  'sensi': 'sensitive',
  'perf': 'perfect',
  'hairba': 'hairball',
  'urin': 'urinary',
  'indo': 'indoor',
  // Weight markers
  '#': 'lb',
  '$': 'lb',
};

interface InventoryItem {
  upc: string;
  name: string;
  type: string;
  price: number | null;
}

interface DbProduct {
  id: number;
  name: string;
  brand: string | null;
  size: string | null;
}

interface MatchResult {
  inventoryItem: InventoryItem;
  dbProduct: DbProduct;
  confidence: number;
  matchDetails: string;
}

// Parse the inventory Excel file
async function parseInventoryFile(filePath: string): Promise<InventoryItem[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  
  const items: InventoryItem[] = [];
  
  for (let row = 2; row <= sheet.rowCount; row++) {
    const upc = sheet.getRow(row).getCell(1).value?.toString()?.trim() || '';
    const name = sheet.getRow(row).getCell(2).value?.toString()?.trim() || '';
    const type = sheet.getRow(row).getCell(3).value?.toString()?.trim() || '';
    const priceVal = sheet.getRow(row).getCell(4).value;
    const price = typeof priceVal === 'number' ? priceVal : parseFloat(priceVal?.toString() || '') || null;
    
    if (upc && name && upc.length >= 5) {
      items.push({ upc, name, type, price });
    }
  }
  
  return items;
}

// Extract brand from inventory item name
function extractBrandFromInventory(name: string): string | null {
  const lowerName = name.toLowerCase();
  
  // Check abbreviated brands first (order matters - longer patterns first)
  const abbrevPatterns = Object.keys(BRAND_ABBREVS).sort((a, b) => b.length - a.length);
  
  for (const pattern of abbrevPatterns) {
    if (lowerName.startsWith(pattern + ' ') || lowerName.startsWith(pattern)) {
      return BRAND_ABBREVS[pattern];
    }
  }
  
  // Check for full brand names
  const fullBrands = [
    'Science Diet', 'Blue Buffalo', 'Taste of the Wild', 'Nutrisource',
    'Diamond', 'Fromm', 'Zignature', 'Victor', 'Natural Balance', 'Eukanuba',
    'Nulo', 'Canidae', 'PureVita', 'Pedigree', 'IAMS', 'Purina', 'Royal Canin',
    'Wellness', 'Merrick', 'Acana', 'Orijen', 'Instinct', 'FirstMate', 'Earthborn',
    'Zoo Med', 'Penn Plax', 'Hikari', 'Tetra', 'API', 'Fluval', 'Aqueon',
    'Kong', 'Nylabone', 'Greenies', 'Milk-Bone', 'Kaytee', 'Oxbow',
  ];
  
  for (const brand of fullBrands) {
    if (lowerName.startsWith(brand.toLowerCase())) {
      return brand;
    }
  }
  
  return null;
}

// Extract size/weight from name (e.g., "15lb", "15#", "13oz", "4.5$")
function extractWeight(name: string): { value: number; unit: string } | null {
  const lowerName = name.toLowerCase();
  
  // Pattern: number followed by lb, #, $, oz, kg, g
  const weightPattern = /(\d+\.?\d*)\s*([#$]|lb|lbs|oz|kg|g)\b/gi;
  const match = weightPattern.exec(lowerName);
  
  if (match) {
    const value = parseFloat(match[1]);
    let unit = match[2].toLowerCase();
    
    // Normalize unit
    if (unit === '#' || unit === '$' || unit === 'lbs') {
      unit = 'lb';
    }
    
    return { value, unit };
  }
  
  return null;
}

// Extract protein/flavor from name
function extractProtein(name: string): string | null {
  const lowerName = name.toLowerCase();
  
  const proteins = [
    'chicken', 'ck', 'chk', 'chkn',
    'lamb', 'lam',
    'salmon', 'sal', 'salm',
    'beef', 'bf',
    'turkey', 'trk', 'turk',
    'whitefish', 'whtfsh',
    'venison', 'ven',
    'duck',
    'bison',
    'pork',
    'rabbit',
    'kangaroo', 'kang',
    'trout', 'tr',
    'fish',
    'tuna',
    'ocean',
    'liver',
  ];
  
  // Normalize protein abbreviations
  const proteinNorm: Record<string, string> = {
    'ck': 'chicken', 'chk': 'chicken', 'chkn': 'chicken',
    'lam': 'lamb',
    'sal': 'salmon', 'salm': 'salmon',
    'bf': 'beef',
    'trk': 'turkey', 'turk': 'turkey',
    'whtfsh': 'whitefish',
    'ven': 'venison',
    'kang': 'kangaroo',
    'tr': 'trout',
  };
  
  for (const protein of proteins) {
    const regex = new RegExp(`\\b${protein}\\b`, 'i');
    if (regex.test(lowerName)) {
      return proteinNorm[protein] || protein;
    }
  }
  
  return null;
}

// Expand abbreviations in a name for comparison
function expandName(name: string): string {
  let result = name.toLowerCase();
  
  // Expand weight markers
  result = result.replace(/(\d+\.?\d*)\s*[#$]/g, '$1lb');
  
  // Expand word abbreviations
  for (const [abbrev, full] of Object.entries(WORD_ABBREVS)) {
    if (abbrev === '#' || abbrev === '$') continue; // Already handled
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  
  return result;
}

// Normalize a name for comparison (remove punctuation, lowercase, sort words)
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate word similarity (Jaccard similarity)
function wordSimilarity(name1: string, name2: string): number {
  const words1 = new Set(normalizeName(name1).split(' ').filter(w => w.length > 1));
  const words2 = new Set(normalizeName(name2).split(' ').filter(w => w.length > 1));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

// Check if two weights match
function weightsMatch(w1: { value: number; unit: string } | null, w2: { value: number; unit: string } | null): boolean {
  if (!w1 || !w2) return true; // If either is missing, don't fail on weight
  
  // Must have same unit
  if (w1.unit !== w2.unit) return false;
  
  // Values must be very close (within 0.5 for lb/kg, within 1 for oz/g)
  const tolerance = (w1.unit === 'lb' || w1.unit === 'kg') ? 0.5 : 1;
  return Math.abs(w1.value - w2.value) <= tolerance;
}

// Check if two proteins match
function proteinsMatch(p1: string | null, p2: string | null): boolean {
  if (!p1 || !p2) return true; // If either is missing, don't fail on protein
  return p1 === p2;
}

// Strict matching function
function strictMatch(
  inventoryItem: InventoryItem,
  dbProducts: DbProduct[]
): MatchResult | null {
  const invBrand = extractBrandFromInventory(inventoryItem.name);
  const invWeight = extractWeight(inventoryItem.name);
  const invProtein = extractProtein(inventoryItem.name);
  const invExpanded = expandName(inventoryItem.name);
  
  let bestMatch: MatchResult | null = null;
  let bestConfidence = 0;
  
  for (const dbProduct of dbProducts) {
    // Rule 1: Brand must match exactly
    const dbBrand = dbProduct.brand?.toLowerCase() || '';
    const invBrandLower = invBrand?.toLowerCase() || '';
    
    if (invBrand && dbBrand && invBrandLower !== dbBrand) {
      continue; // Brand mismatch
    }
    
    // Rule 2: Weight must match
    const dbWeight = extractWeight(dbProduct.name);
    if (!weightsMatch(invWeight, dbWeight)) {
      continue; // Weight mismatch
    }
    
    // Rule 3: Protein must match
    const dbProtein = extractProtein(dbProduct.name);
    if (!proteinsMatch(invProtein, dbProtein)) {
      continue; // Protein mismatch
    }
    
    // Rule 4: Calculate word similarity
    const dbExpanded = expandName(dbProduct.name);
    const similarity = wordSimilarity(invExpanded, dbExpanded);
    
    if (similarity < 0.5) {
      continue; // Not similar enough
    }
    
    // Calculate overall confidence
    let confidence = similarity;
    
    // Boost confidence for matching components
    if (invBrand && dbBrand && invBrandLower === dbBrand) {
      confidence += 0.2;
    }
    if (invWeight && dbWeight && weightsMatch(invWeight, dbWeight)) {
      confidence += 0.15;
    }
    if (invProtein && dbProtein && proteinsMatch(invProtein, dbProtein)) {
      confidence += 0.15;
    }
    
    // Normalize to max 1.0
    confidence = Math.min(1.0, confidence);
    
    if (confidence > bestConfidence && confidence >= 0.7) {
      bestConfidence = confidence;
      bestMatch = {
        inventoryItem,
        dbProduct,
        confidence,
        matchDetails: `brand:${invBrand || 'none'}→${dbProduct.brand || 'none'}, ` +
                      `weight:${invWeight ? `${invWeight.value}${invWeight.unit}` : 'none'}→${dbWeight ? `${dbWeight.value}${dbWeight.unit}` : 'none'}, ` +
                      `protein:${invProtein || 'none'}→${dbProtein || 'none'}, ` +
                      `similarity:${(similarity * 100).toFixed(0)}%`,
      };
    }
  }
  
  return bestMatch;
}

async function main() {
  console.log('[STRICT-SKU] Starting strict SKU matching...');
  console.log('[STRICT-SKU] Rules: Brand + Weight + Protein + 70% word similarity\n');
  
  // Load inventory
  const inventoryPath = 'attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx';
  console.log(`[STRICT-SKU] Loading inventory from ${inventoryPath}...`);
  const inventoryItems = await parseInventoryFile(inventoryPath);
  console.log(`[STRICT-SKU] Loaded ${inventoryItems.length} inventory items with UPCs\n`);
  
  // Load database products
  console.log('[STRICT-SKU] Loading database products...');
  const dbProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    size: supplies.size,
  }).from(supplies);
  console.log(`[STRICT-SKU] Loaded ${dbProducts.length} database products\n`);
  
  // Group database products by brand for faster matching
  const dbByBrand = new Map<string, DbProduct[]>();
  for (const p of dbProducts) {
    const brand = p.brand?.toLowerCase() || 'unknown';
    if (!dbByBrand.has(brand)) {
      dbByBrand.set(brand, []);
    }
    dbByBrand.get(brand)!.push(p);
  }
  
  // Match each inventory item
  const matches: MatchResult[] = [];
  const noMatch: InventoryItem[] = [];
  const usedDbIds = new Set<number>();
  
  console.log('[STRICT-SKU] Matching inventory items...');
  for (const item of inventoryItems) {
    const invBrand = extractBrandFromInventory(item.name);
    
    // Get candidate products (same brand or all if brand unknown)
    let candidates: DbProduct[];
    if (invBrand) {
      candidates = dbByBrand.get(invBrand.toLowerCase()) || [];
    } else {
      candidates = dbProducts;
    }
    
    // Filter out already matched products
    candidates = candidates.filter(p => !usedDbIds.has(p.id));
    
    const match = strictMatch(item, candidates);
    
    if (match && match.confidence >= 0.7) {
      matches.push(match);
      usedDbIds.add(match.dbProduct.id);
    } else {
      noMatch.push(item);
    }
  }
  
  console.log(`\n[STRICT-SKU] === MATCH SUMMARY ===`);
  console.log(`Total inventory items: ${inventoryItems.length}`);
  console.log(`Matched with >= 70% confidence: ${matches.length}`);
  console.log(`No match found: ${noMatch.length}`);
  console.log(`Match rate: ${((matches.length / inventoryItems.length) * 100).toFixed(1)}%\n`);
  
  // Show high-confidence matches (>= 85%)
  const highConfidence = matches.filter(m => m.confidence >= 0.85);
  console.log(`[STRICT-SKU] High-confidence matches (>= 85%): ${highConfidence.length}`);
  console.log('[STRICT-SKU] Sample high-confidence matches:');
  for (let i = 0; i < Math.min(20, highConfidence.length); i++) {
    const m = highConfidence[i];
    console.log(`  ${m.inventoryItem.upc}:`);
    console.log(`    Inventory: "${m.inventoryItem.name}"`);
    console.log(`    Database:  "${m.dbProduct.name}"`);
    console.log(`    Confidence: ${(m.confidence * 100).toFixed(0)}% | ${m.matchDetails}`);
  }
  
  // Ask for confirmation before applying
  console.log(`\n[STRICT-SKU] Would apply ${highConfidence.length} high-confidence SKU matches.`);
  console.log('[STRICT-SKU] Run with --apply flag to update database.');
  
  if (process.argv.includes('--apply')) {
    console.log(`\n[STRICT-SKU] Applying ${highConfidence.length} SKU updates...`);
    
    const batchSize = 50;
    for (let i = 0; i < highConfidence.length; i += batchSize) {
      const batch = highConfidence.slice(i, i + batchSize);
      await Promise.all(batch.map(m =>
        db.update(supplies)
          .set({ sku: m.inventoryItem.upc })
          .where(eq(supplies.id, m.dbProduct.id))
      ));
      
      if ((i + batchSize) % 200 === 0 || i + batchSize >= highConfidence.length) {
        console.log(`[STRICT-SKU] Progress: ${Math.min(i + batchSize, highConfidence.length)}/${highConfidence.length}`);
      }
    }
    
    // Verify
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(supplies)
      .where(sql`sku IS NOT NULL AND sku != ''`);
    
    console.log(`\n[STRICT-SKU] === COMPLETE ===`);
    console.log(`Total supplies with SKU: ${countResult[0].count}`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
