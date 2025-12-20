import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull, eq, sql, isNotNull, inArray } from 'drizzle-orm';
import { expandAbbreviations } from './server/abbreviationExpansion';

// Brand alias map - maps invoice abbreviations to canonical brand names
const BRAND_ALIASES: Record<string, string> = {
  // Dog/Cat Food Brands
  'vict': 'victor', 'victor': 'victor',
  'tow': 'taste of the wild', 'toe': 'taste of the wild', 'taste': 'taste of the wild',
  'sd': 'science diet', 'science': 'science diet', 'hills': 'science diet',
  'nb': 'natural balance', 'natural balance': 'natural balance',
  'diam': 'diamond', 'diamond': 'diamond',
  'frm': 'fromm', 'fromm': 'fromm',
  'blue': 'blue buffalo', 'blue buffalo': 'blue buffalo', 'blue buf': 'blue buffalo',
  'nutri sou': 'nutrisource', 'nutrisource': 'nutrisource', 'nutri source': 'nutrisource',
  'merr': 'merrick', 'merrick': 'merrick',
  'well': 'wellness', 'wellness': 'wellness',
  'can': 'canidae', 'canidae': 'canidae',
  'acana': 'acana', 'acna': 'acana',
  'orijen': 'orijen', 'ori': 'orijen',
  'nutro': 'nutro',
  'iams': 'iams', 'iam': 'iams',
  'euk': 'eukanuba', 'eukanuba': 'eukanuba',
  'purina': 'purina', 'pro plan': 'pro plan',
  'royal canin': 'royal canin', 'roy': 'royal canin',
  'bil jac': 'bil jac', 'bil': 'bil jac',
  'nat v': 'naturvet', 'naturvet': 'naturvet', 'natv': 'naturvet',
  'grn': 'greenies', 'greenies': 'greenies',
  'nyl': 'nylabone', 'nylabone': 'nylabone',
  'kong': 'kong',
  'coastal': 'coastal', 'cst': 'coastal',
  'four paws': 'four paws', 'fou': 'four paws',
  'midwest': 'midwest', 'mw': 'midwest', 'mid west': 'midwest',
  'petmate': 'petmate', 'pet': 'petmate',
  
  // Aquatic Brands
  'hik': 'hikari', 'hikari': 'hikari',
  'tet': 'tetra', 'tetra': 'tetra',
  'aqe': 'aqueon', 'aqueon': 'aqueon',
  'api': 'api',
  'fluval': 'fluval', 'flu': 'fluval',
  'marineland': 'marineland', 'mar': 'marineland',
  'seachem': 'seachem', 'sea': 'seachem',
  'glofish': 'glofish', 'glo': 'glofish',
  
  // Reptile Brands
  'zoo med': 'zoo med', 'zoomed': 'zoo med', 'zoo': 'zoo med', 'zmd': 'zoo med',
  'zilla': 'zilla', 'zil': 'zilla',
  'exo terra': 'exo terra', 'exo': 'exo terra',
  'flukers': 'flukers', 'flk': 'flukers', "fluker's": 'flukers',
  
  // Bird Brands
  'kaytee': 'kaytee', 'kay': 'kaytee', 'kmp': 'kaytee',
  'zupreem': 'zupreem', 'zup': 'zupreem',
  'prevue': 'prevue', 'prv': 'prevue',
  
  // Small Animal Brands
  'oxbow': 'oxbow', 'oxb': 'oxbow',
  'ware': 'ware', 'war': 'ware',
  'kaycee': 'kaytee',
  'vitakraft': 'vitakraft', 'vit': 'vitakraft',
  
  // Treats/Chews
  'redbarn': 'redbarn', 'red': 'redbarn',
  'benebone': 'benebone', 'ben': 'benebone',
  'whimzees': 'whimzees', 'whim': 'whimzees',
  'zuke': 'zukes', "zuke's": 'zukes', 'zukes': 'zukes',
  
  // Other
  'jw pet': 'jw pet', 'jw': 'jw pet', 'jwp': 'jw pet',
  'catit': 'catit',
  'ethical': 'ethical', 'eth': 'ethical',
  'spot': 'spot', 'spt': 'spot',
  'mammoth': 'mammoth', 'mam': 'mammoth',
  'chuckit': 'chuckit', 'chk': 'chuckit',
  'fussie cat': 'fussie cat', 'fussie': 'fussie cat',
  'vital essentials': 'vital essentials', 'vit ess': 'vital essentials', 'vit essen': 'vital essentials',
  'polar': 'polar',
  'spree': 'spree',
};

// Invoice abbreviation expansions
const ABBREVS: Record<string, string> = {
  'froz': 'frozen', 'frzn': 'frozen', 'frz': 'frozen',
  'chkn': 'chicken', 'chk': 'chicken', 'ck': 'chicken',
  'lam': 'lamb', 'lmb': 'lamb',
  'bf': 'beef', 'bff': 'beef',
  'slmn': 'salmon', 'salm': 'salmon', 'slm': 'salmon', 'sal': 'salmon',
  'trky': 'turkey', 'trk': 'turkey',
  'vnson': 'venison', 'vnsn': 'venison',
  'brn': 'brown', 'br': 'brown',
  'wht': 'white', 'wh': 'white',
  'sw': 'sweet', 'swt': 'sweet',
  'pot': 'potato', 'potat': 'potato',
  'rc': 'rice', 'ric': 'rice',
  'grf': 'grain free', 'grfr': 'grain free',
  'sm': 'small', 'sml': 'small',
  'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large',
  'xl': 'extra large', 'xlg': 'extra large',
  'xs': 'extra small', 'xsm': 'extra small',
  'jmb': 'jumbo', 'jmbo': 'jumbo',
  'reg': 'regular',
  'sensi': 'sensitive', 'sens': 'sensitive',
  'nat': 'natural', 'natu': 'natural',
  'pup': 'puppy', 'pupy': 'puppy',
  'adlt': 'adult', 'adt': 'adult',
  'senr': 'senior', 'snr': 'senior',
  'hairba': 'hairball', 'hairbl': 'hairball',
  'wild': 'wilderness',
};

function expandText(text: string): string {
  let result = expandAbbreviations(text);
  for (const [abbr, full] of Object.entries(ABBREVS)) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  // Handle pound notation: 15# → 15lb
  result = result.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb');
  return result.toLowerCase();
}

// Extract brand from product name
function extractBrand(name: string): string | null {
  const lower = name.toLowerCase();
  
  // Check each brand pattern (longest first)
  const sortedBrands = Object.keys(BRAND_ALIASES).sort((a, b) => b.length - a.length);
  
  for (const pattern of sortedBrands) {
    if (lower.startsWith(pattern + ' ') || lower.includes(' ' + pattern + ' ') || lower === pattern) {
      return BRAND_ALIASES[pattern];
    }
    // Also check at start without space for abbreviated brands
    if (lower.startsWith(pattern)) {
      return BRAND_ALIASES[pattern];
    }
  }
  
  return null;
}

// Extract size/weight
function extractSize(name: string): { value: number; unit: string } | null {
  const lower = name.toLowerCase();
  
  // Weight: 15lb, 15#, 3.5oz, 12.2oz
  const weightMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:#|lb|lbs)/);
  if (weightMatch) {
    return { value: parseFloat(weightMatch[1]), unit: 'lb' };
  }
  
  const ozMatch = lower.match(/(\d+(?:\.\d+)?)\s*oz/);
  if (ozMatch) {
    return { value: parseFloat(ozMatch[1]), unit: 'oz' };
  }
  
  // Dimensions: 24", 19"
  const dimMatch = lower.match(/(\d+)"/);
  if (dimMatch) {
    return { value: parseInt(dimMatch[1]), unit: 'in' };
  }
  
  return null;
}

// Extract size category (small, medium, large, etc.)
function extractSizeCategory(name: string): string | null {
  const expanded = expandText(name);
  
  const patterns: [RegExp, string][] = [
    [/\bextra\s*small\b/i, 'xs'],
    [/\bsmall\b/i, 'small'],
    [/\bmedium\b/i, 'medium'],
    [/\blarge\b/i, 'large'],
    [/\bextra\s*large\b/i, 'xl'],
    [/\bjumbo\b/i, 'jumbo'],
    [/\bgiant\b/i, 'giant'],
    [/\bmini\b/i, 'mini'],
  ];
  
  for (const [pattern, value] of patterns) {
    if (pattern.test(expanded)) {
      return value;
    }
  }
  
  return null;
}

// Extract protein for food products
function extractProtein(name: string): string | null {
  const expanded = expandText(name);
  
  const proteins = [
    'chicken', 'beef', 'lamb', 'salmon', 'turkey', 'duck', 'venison',
    'pork', 'fish', 'whitefish', 'tuna', 'rabbit', 'bison', 'boar'
  ];
  
  for (const protein of proteins) {
    if (expanded.includes(protein)) {
      return protein;
    }
  }
  return null;
}

// Tokenize for comparison (excluding brand and size)
function tokenize(text: string): Set<string> {
  const expanded = expandText(text);
  const tokens = new Set<string>();
  
  const words = expanded.replace(/[^a-z0-9.]/g, ' ').split(/\s+/);
  for (const word of words) {
    if (word.length >= 3) {
      tokens.add(word);
    }
  }
  
  return tokens;
}

// Calculate token overlap score
function tokenOverlap(set1: Set<string>, set2: Set<string>): number {
  const intersection = [...set1].filter(t => set2.has(t)).length;
  const union = new Set([...set1, ...set2]).size;
  return union > 0 ? intersection / union : 0;
}

// Match products with brand and size gates
function matchProduct(
  dbName: string, 
  candidates: Array<{ upc: string; name: string; brand: string | null; size: { value: number; unit: string } | null; sizeCategory: string | null; protein: string | null; tokens: Set<string> }>
): { upc: string; name: string; confidence: number } | null {
  const dbBrand = extractBrand(dbName);
  const dbSize = extractSize(dbName);
  const dbSizeCategory = extractSizeCategory(dbName);
  const dbProtein = extractProtein(dbName);
  const dbTokens = tokenize(dbName);
  
  let bestMatch: { upc: string; name: string; confidence: number } | null = null;
  
  for (const cand of candidates) {
    // Gate 1: Brand must match (if both have brands)
    if (dbBrand && cand.brand && dbBrand !== cand.brand) {
      continue;
    }
    
    // Gate 2: Size must match (if both have numeric sizes)
    if (dbSize && cand.size) {
      if (dbSize.unit !== cand.size.unit || Math.abs(dbSize.value - cand.size.value) > 0.5) {
        continue;
      }
    }
    
    // Gate 3: Size category must match (if both have size categories)
    if (dbSizeCategory && cand.sizeCategory && dbSizeCategory !== cand.sizeCategory) {
      continue;
    }
    
    // Gate 4: Protein must match for food products (if both have proteins)
    if (dbProtein && cand.protein && dbProtein !== cand.protein) {
      continue;
    }
    
    // Calculate token overlap
    const overlap = tokenOverlap(dbTokens, cand.tokens);
    
    // Calculate confidence based on what matched
    let confidence = overlap;
    if (dbBrand && cand.brand && dbBrand === cand.brand) {
      confidence += 0.2; // Brand match bonus
    }
    if (dbSize && cand.size && dbSize.unit === cand.size.unit && Math.abs(dbSize.value - cand.size.value) < 0.1) {
      confidence += 0.15; // Exact size match bonus
    }
    if (dbProtein && cand.protein && dbProtein === cand.protein) {
      confidence += 0.1; // Protein match bonus
    }
    
    // Require minimum confidence
    if (confidence >= 0.5 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = { upc: cand.upc, name: cand.name, confidence };
    }
  }
  
  return bestMatch;
}

async function main() {
  console.log('=== IMPROVED UPC MATCHER ===\n');
  
  // Step 1: Clear all existing SKUs and start fresh
  console.log('Step 1: Clearing all SKUs for fresh start...');
  await db.update(supplies).set({ sku: null });
  console.log('Cleared all SKUs.\n');
  
  // Step 2: Load all sources
  console.log('Step 2: Loading source data...');
  
  const sources: Array<{ upc: string; name: string; brand: string | null; size: { value: number; unit: string } | null; sizeCategory: string | null; protein: string | null; tokens: Set<string> }> = [];
  
  // Load InventoryMaybe
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws1 = wb1.getWorksheet('Sheet1');
  
  ws1?.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name) {
      sources.push({
        upc,
        name,
        brand: extractBrand(name),
        size: extractSize(name),
        sizeCategory: extractSizeCategory(name),
        protein: extractProtein(name),
        tokens: tokenize(name),
      });
    }
  });
  console.log(`InventoryMaybe: ${sources.length} UPCs`);
  
  // Load Final Inventory
  const existingUpcs = new Set(sources.map(s => s.upc));
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile('attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx');
  const ws2 = wb2.worksheets[0];
  
  let finalCount = 0;
  for (let i = 3; i <= ws2.rowCount; i++) {
    const row = ws2.getRow(i);
    const desc = String(row.getCell(2).value || '').trim();
    const sku = String(row.getCell(24).value || '').trim();
    if (desc && sku && sku !== 'null' && sku.length > 5 && !existingUpcs.has(sku)) {
      sources.push({
        upc: sku,
        name: desc,
        brand: extractBrand(desc),
        size: extractSize(desc),
        sizeCategory: extractSizeCategory(desc),
        protein: extractProtein(desc),
        tokens: tokenize(desc),
      });
      existingUpcs.add(sku);
      finalCount++;
    }
  }
  console.log(`Final Inventory (new): ${finalCount} UPCs`);
  console.log(`Total sources: ${sources.length} UPCs\n`);
  
  // Build brand-indexed candidates for faster lookup
  const brandIndex = new Map<string, typeof sources>();
  const noBrandCandidates: typeof sources = [];
  
  for (const source of sources) {
    if (source.brand) {
      if (!brandIndex.has(source.brand)) {
        brandIndex.set(source.brand, []);
      }
      brandIndex.get(source.brand)!.push(source);
    } else {
      noBrandCandidates.push(source);
    }
  }
  console.log(`Brand index built: ${brandIndex.size} brands\n`);
  
  // Step 3: Get all products
  console.log('Step 3: Loading database products...');
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
  }).from(supplies);
  console.log(`Total products: ${products.length}\n`);
  
  // Step 4: Match products
  console.log('Step 4: Matching products...');
  
  let highConfidence = 0; // >= 0.85
  let mediumConfidence = 0; // 0.7 - 0.85
  let lowConfidence = 0; // 0.5 - 0.7
  let noMatch = 0;
  
  const updates: Array<{ id: number; sku: string; confidence: number }> = [];
  const sampleMatches: Array<{ dbName: string; invName: string; confidence: number }> = [];
  
  for (const prod of products) {
    const prodBrand = extractBrand(prod.name);
    
    // Get candidates: same brand + no-brand candidates
    let candidates = prodBrand ? (brandIndex.get(prodBrand) || []) : [];
    candidates = [...candidates, ...noBrandCandidates];
    
    // If no brand match, also check all sources (slower but more complete)
    if (candidates.length < 50 && prodBrand) {
      candidates = [...sources];
    }
    
    const match = matchProduct(prod.name, candidates);
    
    if (match) {
      updates.push({ id: prod.id, sku: match.upc, confidence: match.confidence });
      
      if (match.confidence >= 0.85) {
        highConfidence++;
      } else if (match.confidence >= 0.7) {
        mediumConfidence++;
        if (sampleMatches.length < 10) {
          sampleMatches.push({ dbName: prod.name, invName: match.name, confidence: match.confidence });
        }
      } else {
        lowConfidence++;
      }
    } else {
      noMatch++;
    }
  }
  
  console.log(`\n=== MATCHING RESULTS ===`);
  console.log(`High confidence (>=85%): ${highConfidence}`);
  console.log(`Medium confidence (70-85%): ${mediumConfidence}`);
  console.log(`Low confidence (50-70%): ${lowConfidence}`);
  console.log(`No match: ${noMatch}`);
  console.log(`Total matched: ${updates.length}`);
  
  if (sampleMatches.length > 0) {
    console.log(`\n=== SAMPLE MEDIUM CONFIDENCE MATCHES (verify) ===`);
    for (const m of sampleMatches) {
      console.log(`"${m.dbName}" -> "${m.invName}" (${(m.confidence * 100).toFixed(0)}%)`);
    }
  }
  
  // Step 5: Apply high and medium confidence matches only
  const highMedUpdates = updates.filter(u => u.confidence >= 0.7);
  console.log(`\n=== APPLYING ${highMedUpdates.length} UPDATES (>=70% confidence) ===`);
  
  for (let i = 0; i < highMedUpdates.length; i++) {
    const u = highMedUpdates[i];
    await db.update(supplies).set({ sku: u.sku }).where(eq(supplies.id, u.id));
    if ((i + 1) % 500 === 0) {
      console.log(`Updated ${i + 1}/${highMedUpdates.length}...`);
    }
  }
  console.log(`Applied ${highMedUpdates.length} updates.`);
  
  // Final stats
  const totalCount = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  const withSkuCount = await db.select({ count: sql<number>`count(*)` })
    .from(supplies).where(isNotNull(supplies.sku));
  
  console.log(`\n=== FINAL STATUS ===`);
  console.log(`Products with SKU: ${withSkuCount[0].count}`);
  console.log(`Total products: ${totalCount[0].count}`);
  console.log(`Coverage: ${((Number(withSkuCount[0].count) / Number(totalCount[0].count)) * 100).toFixed(1)}%`);
}

main().catch(console.error);
