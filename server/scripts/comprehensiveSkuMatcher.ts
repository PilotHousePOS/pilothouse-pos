import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, and, isNull, or, sql, ilike } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

interface InventoryItem {
  upc: string;
  name: string;
  type: string;
  price: number | null;
}

interface ExtractedProduct {
  productNumber: string;
  upc: string;
  description: string;
  expandedDesc: string;
  brand: string;
}

// Normalize text for matching
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get tokens from text
function getTokens(text: string): string[] {
  return normalize(text).split(' ').filter(t => t.length > 1);
}

// Calculate similarity score between two strings
function calculateSimilarity(str1: string, str2: string): number {
  const tokens1 = getTokens(str1);
  const tokens2 = getTokens(str2);
  
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  
  let matches = 0;
  for (const token of set1) {
    if (set2.has(token)) matches++;
  }
  
  // Jaccard similarity
  const union = new Set([...tokens1, ...tokens2]).size;
  return (matches / union) * 100;
}

// Load inventory from Excel file
async function loadInventory(): Promise<InventoryItem[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const sheet = workbook.worksheets[0];
  const items: InventoryItem[] = [];
  
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const upc = String(row.getCell(2).value || '').trim();
    const name = String(row.getCell(3).value || '').trim();
    const type = String(row.getCell(4).value || '').trim();
    const price = row.getCell(5).value as number | null;
    
    if (upc && name && upc.length >= 8) {
      items.push({ upc, name, type, price });
    }
  }
  
  return items;
}

// Load Penn Plax products
function loadPennPlax(): InventoryItem[] {
  const content = fs.readFileSync('/tmp/penn_plax_products.txt', 'utf-8');
  const items: InventoryItem[] = [];
  
  for (const line of content.split('\n')) {
    const match = line.match(/^(.+?)\s*\|\|\|(\d{12,14})$/);
    if (match) {
      items.push({
        upc: match[2],
        name: match[1].trim(),
        type: 'Penn Plax',
        price: null
      });
    }
  }
  
  return items;
}

// Load Central Pet extracted products
function loadCentralPet(): ExtractedProduct[] {
  try {
    return JSON.parse(fs.readFileSync('/tmp/all_extracted_products.json', 'utf-8'));
  } catch {
    return [];
  }
}

async function runMatcher() {
  console.log('=== Comprehensive SKU Matcher ===\n');
  
  // Load all data sources
  console.log('Loading data sources...');
  const inventory = await loadInventory();
  console.log(`  Inventory Excel: ${inventory.length} items with UPCs`);
  
  const pennPlax = loadPennPlax();
  console.log(`  Penn Plax: ${pennPlax.length} items`);
  
  const centralPet = loadCentralPet();
  console.log(`  Central Pet: ${centralPet.length} items`);
  
  // Build UPC lookup
  const upcLookup = new Map<string, { name: string; source: string }>();
  
  for (const item of inventory) {
    upcLookup.set(item.upc, { name: item.name, source: 'Inventory' });
  }
  
  for (const item of pennPlax) {
    if (!upcLookup.has(item.upc)) {
      upcLookup.set(item.upc, { name: item.name, source: 'Penn Plax' });
    }
  }
  
  for (const item of centralPet) {
    if (!upcLookup.has(item.upc)) {
      upcLookup.set(item.upc, { name: item.expandedDesc || item.description, source: 'Central Pet' });
    }
  }
  
  console.log(`\nCombined UPC database: ${upcLookup.size} unique UPCs\n`);
  
  // Build name->UPC index from all sources
  const nameIndex = new Map<string, string>();
  for (const [upc, info] of upcLookup) {
    const normalized = normalize(info.name);
    if (!nameIndex.has(normalized)) {
      nameIndex.set(normalized, upc);
    }
  }
  
  // Token index for fuzzy matching
  const tokenIndex = new Map<string, Array<{ upc: string; name: string }>>();
  for (const [upc, info] of upcLookup) {
    const tokens = getTokens(info.name);
    for (const token of tokens) {
      if (token.length > 2) {
        if (!tokenIndex.has(token)) {
          tokenIndex.set(token, []);
        }
        tokenIndex.get(token)!.push({ upc, name: info.name });
      }
    }
  }
  
  console.log(`Token index: ${tokenIndex.size} tokens\n`);
  
  // Get supplies without SKU
  const unmatchedSupplies = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`${unmatchedSupplies.length} supplies need SKU matching\n`);
  
  let exactMatches = 0;
  let fuzzyMatches = 0;
  let usedUpcs = new Set<string>();
  
  const matchLog: string[] = [];
  const nearMatches: string[] = [];
  
  // Phase 1: Exact name matches
  console.log('Phase 1: Exact name matching...');
  for (const supply of unmatchedSupplies) {
    const normalized = normalize(supply.name);
    const upc = nameIndex.get(normalized);
    
    if (upc && !usedUpcs.has(upc)) {
      await db.update(supplies)
        .set({ sku: upc })
        .where(eq(supplies.id, supply.id));
      
      usedUpcs.add(upc);
      exactMatches++;
      matchLog.push(`[EXACT] "${supply.name}" -> ${upc}`);
    }
  }
  console.log(`  Found ${exactMatches} exact matches\n`);
  
  // Phase 2: High-confidence fuzzy matching
  console.log('Phase 2: Fuzzy matching...');
  const stillUnmatched = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  for (let i = 0; i < stillUnmatched.length; i++) {
    const supply = stillUnmatched[i];
    const supplyTokens = getTokens(supply.name);
    
    // Find candidates with shared tokens
    const candidateScores = new Map<string, number>();
    
    for (const token of supplyTokens) {
      const candidates = tokenIndex.get(token) || [];
      for (const cand of candidates) {
        if (!usedUpcs.has(cand.upc)) {
          const score = (candidateScores.get(cand.upc) || 0) + 1;
          candidateScores.set(cand.upc, score);
        }
      }
    }
    
    // Find best match
    let bestUpc = '';
    let bestScore = 0;
    let bestName = '';
    
    for (const [upc, tokenHits] of candidateScores) {
      if (tokenHits >= 2) {
        const info = upcLookup.get(upc)!;
        const similarity = calculateSimilarity(supply.name, info.name);
        
        // Boost for matching size patterns
        const supplySize = supply.name.match(/(\d+(?:\.\d+)?)\s*(oz|lb|g|ml|ct|pk|in|ft|gal)/i);
        const candSize = info.name.match(/(\d+(?:\.\d+)?)\s*(oz|lb|g|ml|ct|pk|in|ft|gal)/i);
        
        let finalScore = similarity;
        if (supplySize && candSize) {
          if (supplySize[2].toLowerCase() === candSize[2].toLowerCase()) {
            const sizeDiff = Math.abs(parseFloat(supplySize[1]) - parseFloat(candSize[1]));
            if (sizeDiff < 0.5) {
              finalScore += 15;
            } else if (sizeDiff < 2) {
              finalScore += 5;
            }
          }
        }
        
        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestUpc = upc;
          bestName = info.name;
        }
      }
    }
    
    // Lower threshold but with additional validation
    if (bestScore >= 40) {
      // Additional validation: key word must match
      const supplyLower = supply.name.toLowerCase();
      const bestLower = bestName.toLowerCase();
      
      // Check for key product identifiers
      const keyMatches = 
        (supplyLower.includes('barrel') && bestLower.includes('barrel')) ||
        (supplyLower.includes('castle') && bestLower.includes('castle')) ||
        (supplyLower.includes('bridge') && bestLower.includes('bridge')) ||
        (supplyLower.includes('driftwood') && bestLower.includes('driftwood')) ||
        (supplyLower.includes('crystal') && bestLower.includes('crystal')) ||
        (supplyLower.includes('thermometer') && bestLower.includes('thermometer')) ||
        (supplyLower.includes('igloo') && bestLower.includes('igloo')) ||
        (supplyLower.includes('hideout') && bestLower.includes('hideout')) ||
        (supplyLower.includes('filter') && bestLower.includes('filter')) ||
        (supplyLower.includes('collagen') && bestLower.includes('collagen')) ||
        (supplyLower.includes('bully') && bestLower.includes('bully')) ||
        (supplyLower.includes('shampoo') && bestLower.includes('shampoo')) ||
        (supplyLower.includes('treat') && bestLower.includes('treat')) ||
        (supplyLower.includes('food') && bestLower.includes('food')) ||
        (supplyLower.includes('toy') && bestLower.includes('toy')) ||
        (supplyLower.includes('cave') && bestLower.includes('cave')) ||
        (supplyLower.includes('plant') && bestLower.includes('plant')) ||
        (supplyLower.includes('vine') && bestLower.includes('vine')) ||
        (supplyLower.includes('general cure') && bestLower.includes('general cure')) ||
        bestScore >= 50; // Allow high scores without key match
      
      if (keyMatches) {
        await db.update(supplies)
          .set({ sku: bestUpc })
          .where(eq(supplies.id, supply.id));
        
        usedUpcs.add(bestUpc);
        fuzzyMatches++;
        matchLog.push(`[FUZZY ${bestScore.toFixed(1)}] "${supply.name}" -> "${bestName}" (${bestUpc})`);
      } else {
        nearMatches.push(`[${bestScore.toFixed(1)}] "${supply.name}" ~ "${bestName}" (${bestUpc})`);
      }
    } else if (bestScore >= 30) {
      nearMatches.push(`[${bestScore.toFixed(1)}] "${supply.name}" ~ "${bestName}" (${bestUpc})`);
    }
    
    if ((i + 1) % 500 === 0) {
      console.log(`  Processed ${i + 1}/${stillUnmatched.length}`);
    }
  }
  
  console.log(`  Found ${fuzzyMatches} fuzzy matches\n`);
  
  // Save logs
  fs.writeFileSync('/tmp/comprehensive_match_log.txt', matchLog.join('\n'));
  fs.writeFileSync('/tmp/comprehensive_near_matches.txt', nearMatches.join('\n'));
  
  // Final counts
  const finalWithSku = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const finalTotal = await db.select({ count: sql<number>`count(*)` })
    .from(supplies);
  
  const withSkuCount = Number(finalWithSku[0].count);
  const totalCount = Number(finalTotal[0].count);
  const coverage = ((withSkuCount / totalCount) * 100).toFixed(1);
  
  console.log('=== RESULTS ===');
  console.log(`Exact matches: ${exactMatches}`);
  console.log(`Fuzzy matches: ${fuzzyMatches}`);
  console.log(`Total new matches: ${exactMatches + fuzzyMatches}`);
  console.log(`Near-matches for review: ${nearMatches.length}`);
  console.log(`\nFinal SKU coverage: ${withSkuCount}/${totalCount} (${coverage}%)`);
}

runMatcher().catch(console.error);
