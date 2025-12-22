import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { eq, sql } from "drizzle-orm";
import { expandAbbreviations } from "../server/abbreviationExpansion";
import * as fs from "fs";

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/\bmarineland\b/gi, 'marina')  // Normalize brand: Marineland → Marina
    .replace(/(\d+)#/g, '$1lb')         // Convert weight symbol: "3.5#" -> "3.5lb"
    .replace(/#(\d+)/g, '$1lb')         // Handle "#5" -> "5lb"
    .replace(/(\d+)\s*lbs?\b/gi, '$1lb') // Normalize "13 lb" or "13lbs" to "13lb"
    .replace(/(\d+)\s*oz\b/gi, '$1oz')   // Normalize "8 oz" to "8oz"
    .replace(/([a-z])(\d)/gi, '$1 $2')  // Split letters from digits: "Black14" -> "Black 14"
    .replace(/(\d)([a-z])/gi, '$1 $2')  // Split digits from letters: "14inch" -> "14 inch"
    .replace(/['']s\b/g, 's')           // Handle possessives: "Elsey's" -> "Elseys"
    .replace(/['']/g, '')               // Remove remaining apostrophes: "n't" -> "nt"
    .replace(/\./g, '')                 // Remove periods: "Dr." -> "Dr"
    .replace(/&/g, ' and ')             // Normalize ampersand
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pre-expand common brand abbreviations BEFORE main expansion
function preExpandBrands(text: string): string {
  const brandExpansions: [RegExp, string][] = [
    [/\bsd\b/gi, 'Science Diet'],
    [/\bbb\b/gi, 'Blue Buffalo'],
    [/\bpp\b/gi, 'Pro Plan'],
    [/\bnb\b/gi, 'Natural Balance'],
    [/\bns\b/gi, 'Nutrisource'],
    [/\brc\b/gi, 'Royal Canin'],
    [/\btow\b/gi, 'Taste of the Wild'],
    [/\btotw\b/gi, 'Taste of the Wild'],
    [/\bzm\b/gi, 'Zoo Med'],
    [/\brbp\b/gi, 'Redbarn'],
    [/\bkt\b/gi, 'Kaytee'],
    [/\bkay\b/gi, 'Kaytee'],
    [/\bhik\b/gi, 'Hikari'],
    [/\btet\b/gi, 'Tetra'],
    [/\bcoa\b/gi, 'Coastal'],
    [/\bcp\b/gi, 'Coastal'],
    [/\bap\b/gi, 'API'],
    [/\bph\b/gi, 'Penn Plax'],
    [/\beth\b/gi, 'Ethical Pet'],
    [/\bkng\b/gi, 'Kong'],
    [/\bnyl\b/gi, 'Nylabone'],
    [/\bgrn\b/gi, 'Greenies'],
    [/\bflv\b/gi, 'Fluval'],
    [/\baq\b/gi, 'Aqueon'],
    [/\bmar\b/gi, 'Marineland'],
    [/\bvict\b/gi, 'Victor'],
    [/\bdiam\b/gi, 'Diamond'],
    [/\beuk\b/gi, 'Eukanuba'],
    [/\bfrm\b/gi, 'Fromm'],
    [/\bzig\b/gi, 'Zignature'],
    [/\bnutri\s?sou?\b/gi, 'Nutrisource'],
  ];
  
  let result = text;
  for (const [pattern, replacement] of brandExpansions) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(t => t.length > 1);
}

function jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  let intersection = 0;
  for (const t of set1) if (set2.has(t)) intersection++;
  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function extractBrand(name: string): string {
  const brandPatterns = [
    { pattern: /^(science\s?diet|sd)\b/i, brand: 'sciencediet' },
    { pattern: /^(blue\s?buffalo|bb|blue)\b/i, brand: 'bluebuffalo' },
    { pattern: /^(pro\s?plan|pp|purina)\b/i, brand: 'proplan' },
    { pattern: /^(natural\s?balance|nb)\b/i, brand: 'naturalbalance' },
    { pattern: /^(taste\s?of\s?the\s?wild|totw|tow)\b/i, brand: 'tasteofthewild' },
    { pattern: /^(nutri\s?source|ns)\b/i, brand: 'nutrisource' },
    { pattern: /^(royal\s?canin|rc)\b/i, brand: 'royalcanin' },
    { pattern: /^(zoo\s?med|zm)\b/i, brand: 'zoomed' },
    { pattern: /^(exo\s?terra)\b/i, brand: 'exoterra' },
    { pattern: /^(zilla)\b/i, brand: 'zilla' },
    { pattern: /^(fluker)/i, brand: 'fluker' },
    { pattern: /^(kaytee)\b/i, brand: 'kaytee' },
    { pattern: /^(fromm)\b/i, brand: 'fromm' },
    { pattern: /^(coastal|coa|cp)\b/i, brand: 'coastal' },
    { pattern: /^(kong)\b/i, brand: 'kong' },
    { pattern: /^(greenies)/i, brand: 'greenies' },
    { pattern: /^(benebone)/i, brand: 'benebone' },
    { pattern: /^(oxbow)/i, brand: 'oxbow' },
    { pattern: /^(tetra|tet)\b/i, brand: 'tetra' },
    { pattern: /^(fluval)\b/i, brand: 'fluval' },
    { pattern: /^(hikari|hik)\b/i, brand: 'hikari' },
    { pattern: /^(marineland|marina)\b/i, brand: 'marina' },
    { pattern: /^(aqueon)/i, brand: 'aqueon' },
    { pattern: /^(api|ap)\b/i, brand: 'api' },
    { pattern: /^(penn[\s-]?plax|ph)\b/i, brand: 'pennplax' },
    { pattern: /^(eukanuba)\b/i, brand: 'eukanuba' },
    { pattern: /^(adams)\b/i, brand: 'adams' },
    { pattern: /^(tropiclean)/i, brand: 'tropiclean' },
    { pattern: /^(dogswell)/i, brand: 'dogswell' },
    { pattern: /^(jw\s?pet|jw)\b/i, brand: 'jwpet' },
    { pattern: /^(victor)\b/i, brand: 'victor' },
    { pattern: /^(diamond)\b/i, brand: 'diamond' },
    { pattern: /^(canidae)\b/i, brand: 'canidae' },
    { pattern: /^(merrick)/i, brand: 'merrick' },
    { pattern: /^(wellness)/i, brand: 'wellness' },
    { pattern: /^(orijen)/i, brand: 'orijen' },
    { pattern: /^(acana)/i, brand: 'acana' },
    { pattern: /^(natures\s?variety|nv)\b/i, brand: 'naturesvariety' },
    { pattern: /^(instinct)/i, brand: 'instinct' },
    { pattern: /^(hills)\b/i, brand: 'hills' },
    { pattern: /^(redbarn|rbp)\b/i, brand: 'redbarn' },
    { pattern: /^(spot|eth)\b/i, brand: 'spot' },
    { pattern: /^(smartbones?)/i, brand: 'smartbones' },
    { pattern: /^(barkworthies)/i, brand: 'barkworthies' },
    { pattern: /^(vitakraft)/i, brand: 'vitakraft' },
    { pattern: /^(nylabone|nyl)\b/i, brand: 'nylabone' },
    { pattern: /^(hartz)\b/i, brand: 'hartz' },
    { pattern: /^(nutro)\b/i, brand: 'nutro' },
  ];
  
  for (const { pattern, brand } of brandPatterns) {
    if (pattern.test(name)) return brand;
  }
  return '';
}

async function main() {
  console.log("=== EXPAND ABBREVIATIONS AND MATCH UPCs ===\n");
  
  // Load confirmed matches first (so we don't start over)
  console.log("0. Loading confirmed matches...");
  let confirmedMatches: Map<number, string> = new Map();
  const confirmedFile = 'scripts/confirmed_upc_matches.json';
  if (fs.existsSync(confirmedFile)) {
    const confirmed = JSON.parse(fs.readFileSync(confirmedFile, 'utf-8'));
    for (const m of confirmed.matches) {
      confirmedMatches.set(m.supplyId, m.upc);
    }
    console.log(`   Loaded ${confirmedMatches.size} confirmed matches\n`);
  } else {
    console.log("   No confirmed matches file found, starting fresh\n");
  }
  
  // Load master UPC index (enriched index has data quality issues)
  console.log("1. Loading master UPC index...");
  const masterDataRaw = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));
  // Support both array format and object with entries property
  const masterEntries = Array.isArray(masterDataRaw) ? masterDataRaw : (masterDataRaw.entries || []);
  console.log(`   Loaded ${masterEntries.length} entries\n`);
  
  // Expand all catalog names using the abbreviation system
  console.log("2. Expanding abbreviations in catalog names...");
  type IndexEntry = {
    upc: string;
    originalName: string;
    expandedName: string;
    tokens: string[];
    brand: string;
    upcBrand: string; // Brand inferred from UPC prefix
    isCoastal: boolean;
  };
  
  // UPC prefix to brand mapping - helps match when invoice names don't include brand
  const upcPrefixBrands: Record<string, string> = {
    // Pet food brands
    '052742': 'sciencediet',   // Hill's Science Diet
    '073893': 'nutrisource',   // NutriSource
    '840243': 'bluebuffalo',   // Blue Buffalo
    '023100': 'royalcanin',    // Royal Canin
    '038100': 'proplan',       // Purina Pro Plan
    '723633': 'tasteofthewild', // Taste of the Wild
    '072705': 'fromm',         // Fromm
    '769949': 'victor',        // Victor
    '074198': 'diamond',       // Diamond
    '884308': 'canidae',       // Canidae
    '022808': 'merrick',       // Merrick
    '076344': 'wellness',      // Wellness
    '064992': 'orijen',        // Orijen
    '082413': 'nutro',         // Nutro
    '079105': 'primal',        // Primal
    '859610': 'zignature',     // Zignature
    
    // RedBarn - CRITICAL: uses multiple prefixes!
    '758541': 'redbarn',       // RedBarn (dry food)
    '785184': 'redbarn',       // RedBarn (dry food alt)
    '515450': 'redbarn',       // RedBarn (treats - bully slices)
    
    // Aquatics/Reptile brands
    '030172': 'pennplax',
    '097612': 'zoomed',
    '015561': 'fluval',        // Also Marina/Hagen
    '046798': 'tetra',
    '042055': 'hikari',
    '077234': 'api',
    '317163': 'api',           // API alternate
    '015905': 'marineland',
    '090653': 'exoterra',
    '017800': 'zilla',
    '096316': 'zilla',         // Zilla alternate
    '048081': 'pennplax',      // Penn-Plax alternate (PH prefix)
    
    // Small animal / Treats brands
    '071859': 'kaytee',
    '884244': 'vitakraft',     // Vitakraft
    '086783': 'oxbow',         // Oxbow (for those in master)
    
    // Accessories/Toys brands
    '076484': 'coastal',
    '052742': 'coastal',       // Coastal alternate (COA)
    '045663': 'fourpaws',
    '071860': 'arknaturals',
    '030027': 'acme',
    '018065': 'tropiclean',
    '013227': 'kong',
    '035585': 'kong',          // Kong primary
    '018214': 'nylabone',      // Nylabone
    '871864': 'nylabone',      // Nylabone alternate
    '642863': 'greenies',      // Greenies
    '875854': 'benebone',      // Benebone
    
    // Dog treats - priority
    '895777': 'smokehouse',    // Smokehouse
    '073101': 'fieldcrestfarms', // Fieldcrest Farms
    '084279': 'nutrisource',   // NutriSource treats
    '810028': 'smartbones',    // SmartBones
  };
  
  const index: IndexEntry[] = [];
  let expanded = 0;
  
  for (const entry of masterEntries) {
    const originalName = entry.name;
    // Use pre-expanded name from master if available
    let expandedName = entry.expandedName || originalName;
    
    // Pre-expand brand abbreviations FIRST (sd → Science Diet, rbp → Redbarn, etc.)
    const brandExpanded = preExpandBrands(expandedName);
    // Pre-process Coastal color codes followed by dimensions (e.g., "AWN06'" -> "AWN 06'")
    const preSplit = brandExpanded
      .replace(/\b(AWN|LWO|NPK|HNT|PUR|BLK|GRY|PNK|RED|GRN|BLU|ORG|YLW|TAN|BRN|WHT|SLV|GLD)(\d)/gi, '$1 $2');
    expandedName = expandAbbreviations(preSplit);
    
    if (expandedName !== originalName) expanded++;
    
    // Get brand from UPC prefix
    const upcPrefix = entry.upc.slice(0, 6);
    const upcBrand = upcPrefixBrands[upcPrefix] || '';
    
    index.push({
      upc: entry.upc,
      originalName,
      expandedName,
      tokens: tokenize(expandedName),
      brand: extractBrand(expandedName) || upcBrand, // Use UPC brand if name doesn't have it
      upcBrand,
      isCoastal: entry.isCoastal || originalName.toLowerCase().includes('coastal')
    });
  }
  
  console.log(`   Expanded ${expanded} names\n`);
  
  // Show sample expansions
  console.log("   Sample expansions:");
  const sampleExpansions = index.filter(e => e.originalName !== e.expandedName).slice(0, 10);
  sampleExpansions.forEach(e => {
    console.log(`     "${e.originalName}" -> "${e.expandedName}"`);
  });
  
  // Get all supplies
  console.log("\n3. Fetching supplies...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies);
  console.log(`   Found ${allSupplies.length} supplies\n`);
  
  // Match with expanded names
  console.log("4. Matching with expanded names...");
  const matches: Array<{
    id: number;
    upc: string;
    supplyName: string;
    catalogOriginal: string;
    catalogExpanded: string;
    similarity: number;
    method: string;
  }> = [];
  const usedUpcs = new Set<string>();
  
  // Build exact match index for fast lookups
  const exactMatchIndex = new Map<string, IndexEntry>();
  for (const entry of index) {
    const normalizedName = normalize(entry.expandedName);
    if (!exactMatchIndex.has(normalizedName)) {
      exactMatchIndex.set(normalizedName, entry);
    }
  }
  console.log(`   Built exact match index with ${exactMatchIndex.size} entries`);
  
  let exactMatches = 0;
  let fuzzyMatches = 0;
  
  for (const supply of allSupplies) {
    // CRITICAL: Pre-expand brand abbreviations THEN expand other abbreviations
    const brandExpanded = preExpandBrands(supply.name);
    const expandedSupplyName = expandAbbreviations(brandExpanded);
    const normalizedSupplyName = normalize(expandedSupplyName);
    const supplyTokens = tokenize(expandedSupplyName);
    if (supplyTokens.length < 2) continue;
    
    // Get brand from name extraction OR from supply.brand field
    const supplyBrand = extractBrand(expandedSupplyName) || (supply.brand || '').toLowerCase().replace(/[^a-z]/g, '');
    
    let bestMatch: { 
      upc: string; 
      originalName: string; 
      expandedName: string; 
      similarity: number; 
      method: string 
    } | null = null;
    
    // FAST PATH: Check exact match first
    const exactEntry = exactMatchIndex.get(normalizedSupplyName);
    if (exactEntry && (!usedUpcs.has(exactEntry.upc) || exactEntry.isCoastal)) {
      bestMatch = {
        upc: exactEntry.upc,
        originalName: exactEntry.originalName,
        expandedName: exactEntry.expandedName,
        similarity: 1.0,
        method: 'exact'
      };
      exactMatches++;
    }
    
    // SMART MATCHING: Combine ALL methods with weighted scoring
    if (!bestMatch) {
      let candidates: Array<{
        entry: IndexEntry;
        score: number;
        method: string;
        details: string;
      }> = [];
      
      // OPTIMIZATION: Filter candidates by brand first, then fallback to all
      let candidateEntries = supplyBrand 
        ? index.filter(e => e.brand === supplyBrand || e.upcBrand === supplyBrand)
        : [];
      
      // If no brand-filtered candidates or too few, use all
      if (candidateEntries.length < 5) {
        candidateEntries = index;
      }
      
      for (const entry of candidateEntries) {
        if (usedUpcs.has(entry.upc) && !entry.isCoastal) continue;
        
        const entryNorm = normalize(entry.expandedName);
        const supplySet = new Set(supplyTokens);
        const entrySet = new Set(entry.tokens);
        
        // Calculate all matching factors
        const jaccard = jaccardSimilarity(supplyTokens, entry.tokens);
        const matchingTokens = entry.tokens.filter(t => supplySet.has(t));
        const significantMatching = matchingTokens.filter(t => t.length > 2);
        const reverseMatching = supplyTokens.filter(t => entrySet.has(t));
        
        // Containment ratios (bidirectional)
        const masterContainment = matchingTokens.length / Math.max(entry.tokens.length, 1);
        const supplyContainment = reverseMatching.length / Math.max(supplyTokens.length, 1);
        
        // Brand match check
        const brandMatch = supplyBrand && (entry.upcBrand === supplyBrand || entry.brand === supplyBrand);
        
        // Weight/size match check
        const weightPattern = /(\d+(?:\.\d+)?)(lb|oz|kg|g|qt|gal)/i;
        const supplyWeight = normalizedSupplyName.match(weightPattern);
        const entryWeight = entryNorm.match(weightPattern);
        const weightMatch = supplyWeight && entryWeight && 
          supplyWeight[1] === entryWeight[1] && supplyWeight[2].toLowerCase() === entryWeight[2].toLowerCase();
        
        // Product type keywords
        const productTypes = ['bully', 'stick', 'treat', 'chew', 'bone', 'food', 'dry', 'wet', 'can', 'kibble', 
          'slice', 'ring', 'braid', 'knuckle', 'jerky', 'rawhide', 'dental', 'puppy', 'adult', 'senior',
          'small', 'medium', 'large', 'giant', 'mini', 'toy', 'collar', 'leash', 'harness', 'bed',
          'filter', 'heater', 'light', 'lamp', 'bulb', 'substrate', 'bedding', 'hay', 'pellet'];
        const supplyProductTypes = supplyTokens.filter(t => productTypes.includes(t));
        const entryProductTypes = entry.tokens.filter(t => productTypes.includes(t));
        const productTypeMatch = supplyProductTypes.some(t => entryProductTypes.includes(t));
        
        // === COMBINED SCORING ===
        let score = 0;
        let method = '';
        let details = '';
        
        // Base score from Jaccard
        score += jaccard * 0.4;
        
        // Brand match bonus (+0.25)
        if (brandMatch) {
          score += 0.25;
          details += 'brand+';
        }
        
        // Weight match bonus (+0.15)
        if (weightMatch) {
          score += 0.15;
          details += 'weight+';
        }
        
        // Product type match bonus (+0.10)
        if (productTypeMatch) {
          score += 0.10;
          details += 'type+';
        }
        
        // Significant token bonus (scaled by count)
        if (significantMatching.length >= 2) {
          score += Math.min(significantMatching.length * 0.05, 0.20);
          details += `${significantMatching.length}tok+`;
        }
        
        // High containment bonus
        if (masterContainment >= 0.8 || supplyContainment >= 0.8) {
          score += 0.10;
          details += 'contain+';
        }
        
        // Determine method based on primary factor
        if (jaccard >= 0.90) method = 'exact_fuzzy';
        else if (brandMatch && weightMatch) method = 'brand_weight';
        else if (brandMatch && significantMatching.length >= 3) method = 'brand_tokens';
        else if (brandMatch) method = 'brand_match';
        else if (weightMatch && significantMatching.length >= 2) method = 'weight_tokens';
        else if (jaccard >= 0.70) method = 'high_jaccard';
        else if (masterContainment >= 0.80) method = 'containment';
        else method = 'combined';
        
        // Threshold: require minimum score of 0.55 to be considered
        // With brand match, lower to 0.45
        const threshold = brandMatch ? 0.45 : 0.55;
        
        if (score >= threshold) {
          candidates.push({ entry, score, method, details });
        }
      }
      
      // Sort by score and pick the best
      candidates.sort((a, b) => b.score - a.score);
      
      if (candidates.length > 0) {
        const best = candidates[0];
        bestMatch = {
          upc: best.entry.upc,
          originalName: best.entry.originalName,
          expandedName: best.entry.expandedName,
          similarity: best.score,
          method: best.method
        };
        fuzzyMatches++;
      }
    }
    
    if (bestMatch) {
      matches.push({
        id: supply.id,
        upc: bestMatch.upc,
        supplyName: supply.name,
        catalogOriginal: bestMatch.originalName,
        catalogExpanded: bestMatch.expandedName,
        similarity: bestMatch.similarity,
        method: bestMatch.method
      });
      usedUpcs.add(bestMatch.upc);
    }
  }
  
  console.log(`\n   Found ${matches.length} matches`);
  console.log(`   Exact matches: ${exactMatches}`);
  console.log(`   Fuzzy matches: ${fuzzyMatches}`);
  
  // Stats by method
  const byMethod: Record<string, number> = {};
  matches.forEach(m => byMethod[m.method] = (byMethod[m.method] || 0) + 1);
  console.log("\n   By method:");
  Object.entries(byMethod).forEach(([k, v]) => console.log(`     ${k}: ${v}`));
  
  // Save matches to file - database apply done separately
  console.log("\n5. Saving matches...");
  
  // Merge confirmed + new matches
  const allMatchMap = new Map<number, string>();
  for (const [id, upc] of confirmedMatches) {
    allMatchMap.set(id, upc);
  }
  for (const m of matches) {
    allMatchMap.set(m.id, m.upc);
  }
  
  console.log(`   Total unique matches: ${allMatchMap.size}`);
  
  // Save to confirmed file
  const allEntries = Array.from(allMatchMap.entries());
  const savedMatches = allEntries.map(([id, upc]) => ({ supplyId: id, upc }));
  fs.writeFileSync(confirmedFile, JSON.stringify({ matches: savedMatches }, null, 2));
  console.log(`   Saved ${savedMatches.length} matches to confirmed file`);
  
  // Generate SQL file for bulk apply
  const values = allEntries.map(([id, upc]) => `(${id},'${upc.replace(/'/g, "''")}')`).join(',');
  const sqlScript = `UPDATE supplies SET upc = NULL;\nUPDATE supplies SET upc = v.upc FROM (VALUES ${values}) AS v(id, upc) WHERE supplies.id = v.id;`;
  fs.writeFileSync('/tmp/apply_upcs.sql', sqlScript);
  console.log(`   Generated SQL script at /tmp/apply_upcs.sql`);
  console.log(`   Run: psql $DATABASE_URL -f /tmp/apply_upcs.sql`);
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Total supplies: ${allSupplies.length}`);
  console.log(`Total matches: ${allMatchMap.size}`);
  console.log(`Coverage: ${((allMatchMap.size / allSupplies.length) * 100).toFixed(1)}%`);
  
  // Save report
  fs.writeFileSync('scripts/expanded_match_report.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    indexEntries: index.length,
    expandedNames: expanded,
    totalSupplies: allSupplies.length,
    matchedSupplies: allMatchMap.size,
    coverage: ((allMatchMap.size / allSupplies.length) * 100).toFixed(1) + '%',
    byMethod,
    sampleMatches: matches.slice(0, 30).map(m => ({
      supply: m.supplyName,
      catalogOriginal: m.catalogOriginal,
      catalogExpanded: m.catalogExpanded,
      similarity: (m.similarity * 100).toFixed(0) + '%',
      method: m.method
    }))
  }, null, 2));
  
  console.log("\nDone!");
  process.exit(0);
}

main().catch(console.error);
