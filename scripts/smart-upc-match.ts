import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { eq, sql } from "drizzle-orm";
import * as fs from "fs";

// Comprehensive abbreviation mappings for BOTH directions
const EXPAND_MAP: Record<string, string[]> = {
  // Brands
  'sd': ['science diet', 'sciencediet'],
  'nb': ['natural balance', 'naturalbalance'],
  'bb': ['blue buffalo', 'bluebuffalo', 'blue'],
  'pp': ['pro plan', 'proplan'],
  'totw': ['taste of the wild', 'tasteofthewild'],
  'tow': ['taste of the wild', 'tasteofthewild'],
  'ns': ['nutrisource', 'nutri source'],
  'rc': ['royal canin', 'royalcanin'],
  'euk': ['eukanuba'],
  'frm': ['fromm'],
  'zm': ['zoo med', 'zoomed'],
  
  // Size/Weight
  '#': ['lb', 'lbs', 'pound', 'pounds'],
  'oz': ['ounce', 'ounces'],
  'floz': ['fl oz', 'fluid ounce'],
  'lg': ['large'],
  'lrg': ['large'],
  'med': ['medium'],
  'sm': ['small'],
  'mini': ['mini', 'min'],
  'xl': ['extra large', 'xlarge'],
  'xs': ['extra small', 'xsmall'],
  
  // Products
  'ck': ['chicken', 'chk', 'chkn'],
  'chk': ['chicken', 'ck', 'chkn'],
  'chkn': ['chicken', 'ck', 'chk'],
  'sal': ['salmon', 'salm'],
  'salm': ['salmon', 'sal'],
  'lam': ['lamb'],
  'bef': ['beef'],
  'trky': ['turkey', 'turk'],
  'turk': ['turkey', 'trky'],
  
  // Age
  'pup': ['puppy'],
  'kit': ['kitten'],
  'adt': ['adult'],
  'adlt': ['adult'],
  'sr': ['senior'],
  'jr': ['junior'],
  
  // Descriptors
  'sensi': ['sensitive'],
  'perf': ['perfect'],
  'sens': ['sensitive'],
  'gf': ['grain free', 'grainfree'],
  'wt': ['weight'],
  'hlth': ['health', 'healthy'],
  'nat': ['natural'],
  'org': ['organic'],
  
  // Products
  'fd': ['food'],
  'trt': ['treat', 'treats'],
  'trts': ['treats', 'treat'],
  'sham': ['shampoo'],
  'cond': ['conditioner'],
  'coll': ['collar'],
  'lsh': ['leash'],
  'hrns': ['harness']
};

function createTokenVariants(token: string): string[] {
  const variants = [token];
  const tokenLower = token.toLowerCase();
  
  // Add expansions
  if (EXPAND_MAP[tokenLower]) {
    variants.push(...EXPAND_MAP[tokenLower]);
  }
  
  // Check if token is an expansion
  for (const [abbr, expansions] of Object.entries(EXPAND_MAP)) {
    if (expansions.includes(tokenLower)) {
      variants.push(abbr);
      variants.push(...expansions.filter(e => e !== tokenLower));
    }
  }
  
  // Handle size with numbers (e.g., "16#" -> "16lb")
  const sizeMatch = token.match(/^(\d+(?:\.\d+)?)(#|lb|lbs|oz|kg)$/i);
  if (sizeMatch) {
    const num = sizeMatch[1];
    variants.push(`${num}lb`, `${num}lbs`, `${num}#`, `${num}oz`);
  }
  
  return [...new Set(variants)];
}

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(t => t.length > 0);
}

function flexibleMatch(supplyTokens: string[], catalogTokens: string[]): number {
  const supplyVariants = supplyTokens.flatMap(createTokenVariants);
  const catalogVariants = catalogTokens.flatMap(createTokenVariants);
  
  const supplySet = new Set(supplyVariants.map(t => t.toLowerCase()));
  const catalogSet = new Set(catalogVariants.map(t => t.toLowerCase()));
  
  // Count matches
  let matches = 0;
  for (const t of supplySet) {
    if (catalogSet.has(t)) matches++;
  }
  
  // Calculate overlap ratio based on original token count
  const minTokens = Math.min(supplyTokens.length, catalogTokens.length);
  return minTokens > 0 ? matches / (minTokens + 2) : 0;
}

function extractBrand(name: string): string {
  const brandPatterns = [
    { pattern: /^(science\s?diet|sd)\b/i, brand: 'sciencediet' },
    { pattern: /^(blue\s?buffalo|bb|blue)\b/i, brand: 'bluebuffalo' },
    { pattern: /^(pro\s?plan|pp|purina\s?pro)\b/i, brand: 'proplan' },
    { pattern: /^(natural\s?balance|nb)\b/i, brand: 'naturalbalance' },
    { pattern: /^(taste\s?of\s?the\s?wild|totw|tow)\b/i, brand: 'tasteofthewild' },
    { pattern: /^(nutri\s?source|ns)\b/i, brand: 'nutrisource' },
    { pattern: /^(royal\s?canin|rc)\b/i, brand: 'royalcanin' },
    { pattern: /^(zoo\s?med|zm)\b/i, brand: 'zoomed' },
    { pattern: /^(exo\s?terra)\b/i, brand: 'exoterra' },
    { pattern: /^(zilla)\b/i, brand: 'zilla' },
    { pattern: /^(fluker)/i, brand: 'fluker' },
    { pattern: /^(kaytee|kt)\b/i, brand: 'kaytee' },
    { pattern: /^(fromm|frm)\b/i, brand: 'fromm' },
    { pattern: /^(coastal)\b/i, brand: 'coastal' },
    { pattern: /^(kong)\b/i, brand: 'kong' },
    { pattern: /^(greenies)/i, brand: 'greenies' },
    { pattern: /^(benebone)/i, brand: 'benebone' },
    { pattern: /^(oxbow)/i, brand: 'oxbow' },
    { pattern: /^(tetra)\b/i, brand: 'tetra' },
    { pattern: /^(fluval)\b/i, brand: 'fluval' },
    { pattern: /^(hikari)/i, brand: 'hikari' },
    { pattern: /^(marineland)/i, brand: 'marineland' },
    { pattern: /^(aqueon)/i, brand: 'aqueon' },
    { pattern: /^(api)\b/i, brand: 'api' },
    { pattern: /^(penn[\s-]?plax)/i, brand: 'pennplax' },
    { pattern: /^(eukanuba|euk)\b/i, brand: 'eukanuba' },
    { pattern: /^(adams)\b/i, brand: 'adams' },
    { pattern: /^(tropiclean)/i, brand: 'tropiclean' },
    { pattern: /^(dogswell)/i, brand: 'dogswell' },
    { pattern: /^(weewee|wee[\s-]?wee)/i, brand: 'weewee' },
    { pattern: /^(jw\s?pet|jw)\b/i, brand: 'jwpet' },
  ];
  
  for (const { pattern, brand } of brandPatterns) {
    if (pattern.test(name)) return brand;
  }
  return '';
}

async function main() {
  console.log("=== SMART UPC MATCHING ===\n");
  
  // Load all UPC sources
  console.log("1. Loading UPC sources...");
  const masterData = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));
  console.log(`   Master index: ${masterData.entries.length} entries`);
  
  // Build index with flexible matching data
  type IndexEntry = {
    upc: string;
    name: string;
    tokens: string[];
    brand: string;
    isCoastal: boolean;
  };
  
  const index: IndexEntry[] = masterData.entries.map((e: any) => ({
    upc: e.upc,
    name: e.name,
    tokens: tokenize(e.name),
    brand: extractBrand(e.name),
    isCoastal: e.isCoastal || e.name.toLowerCase().includes('coastal')
  }));
  
  // Get supplies
  console.log("\n2. Fetching supplies...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies);
  console.log(`   Found ${allSupplies.length} supplies`);
  
  // Match
  console.log("\n3. Matching...");
  const matches: Array<{
    id: number;
    upc: string;
    supplyName: string;
    catalogName: string;
    score: number;
    method: string;
  }> = [];
  const usedUpcs = new Set<string>();
  
  for (const supply of allSupplies) {
    const supplyTokens = tokenize(supply.name);
    if (supplyTokens.length < 2) continue;
    
    const supplyBrand = extractBrand(supply.name) || (supply.brand || '').toLowerCase().replace(/[^a-z]/g, '');
    
    let bestMatch: { upc: string; name: string; score: number; method: string } | null = null;
    
    for (const entry of index) {
      if (usedUpcs.has(entry.upc) && !entry.isCoastal) continue;
      
      // Brand must match if both have brands
      if (supplyBrand && entry.brand && supplyBrand !== entry.brand) continue;
      
      const score = flexibleMatch(supplyTokens, entry.tokens);
      
      // High score match
      if (score >= 0.7) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { 
            upc: entry.upc, 
            name: entry.name, 
            score, 
            method: score >= 0.9 ? 'high_flex' : 'med_flex' 
          };
        }
      }
    }
    
    if (bestMatch) {
      matches.push({
        id: supply.id,
        upc: bestMatch.upc,
        supplyName: supply.name,
        catalogName: bestMatch.name,
        score: bestMatch.score,
        method: bestMatch.method
      });
      usedUpcs.add(bestMatch.upc);
    }
  }
  
  console.log(`\n   Found ${matches.length} matches`);
  
  // Apply
  console.log("\n4. Applying matches...");
  await db.update(supplies).set({ upc: null });
  
  for (const match of matches) {
    await db.update(supplies).set({ upc: match.upc }).where(eq(supplies.id, match.id));
  }
  
  const finalCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(supplies).where(sql`${supplies.upc} IS NOT NULL`);
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Total supplies: ${allSupplies.length}`);
  console.log(`Matched: ${finalCount[0].count}`);
  console.log(`Coverage: ${((finalCount[0].count / allSupplies.length) * 100).toFixed(1)}%`);
  
  // Save sample
  fs.writeFileSync('scripts/smart_match_report.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: allSupplies.length,
    matched: finalCount[0].count,
    coverage: ((finalCount[0].count / allSupplies.length) * 100).toFixed(1) + '%',
    samples: matches.slice(0, 30).map(m => ({
      supply: m.supplyName,
      catalog: m.catalogName,
      score: (m.score * 100).toFixed(0) + '%'
    }))
  }, null, 2));
  
  process.exit(0);
}

main().catch(console.error);
