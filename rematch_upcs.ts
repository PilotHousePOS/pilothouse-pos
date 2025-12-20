import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNull, eq, sql, isNotNull } from 'drizzle-orm';
import { expandAbbreviations } from './server/abbreviationExpansion';

// Additional abbreviations found in InventoryMaybe that need expansion
const INVOICE_ABBREVIATIONS: Record<string, string> = {
  // Common food abbreviations
  'froz': 'frozen', 'frzn': 'frozen', 'frz': 'frozen',
  'chkn': 'chicken', 'chk': 'chicken', 'ck': 'chicken',
  'lam': 'lamb', 'lmb': 'lamb',
  'bf': 'beef', 'bff': 'beef',
  'slmn': 'salmon', 'salm': 'salmon', 'slm': 'salmon',
  'trky': 'turkey', 'trk': 'turkey',
  'vnson': 'venison', 'vnsn': 'venison',
  'pork': 'pork', 'prk': 'pork',
  'duck': 'duck', 'dk': 'duck',
  'whfish': 'whitefish', 'whtfsh': 'whitefish',
  'brn': 'brown', 'br': 'brown',
  'wht': 'white', 'wh': 'white',
  'blk': 'black', 'bk': 'black',
  'sw': 'sweet', 'swt': 'sweet',
  'pot': 'potato', 'potat': 'potato',
  'veg': 'vegetable', 'vegg': 'vegetable',
  'oat': 'oatmeal', 'otml': 'oatmeal',
  'rc': 'rice', 'ric': 'rice',
  'gf': 'grain free', 'grfr': 'grain free',
  
  // Size/weight abbreviations
  '5#': '5lb', '10#': '10lb', '15#': '15lb', '20#': '20lb', '25#': '25lb',
  '30#': '30lb', '35#': '35lb', '40#': '40lb', '50#': '50lb',
  '2.5#': '2.5lb', '4#': '4lb', '4.5#': '4.5lb', '6#': '6lb', '7#': '7lb',
  '8#': '8lb', '12#': '12lb', '13#': '13lb', '14#': '14lb', '16#': '16lb',
  '18#': '18lb', '22#': '22lb', '24#': '24lb', '26#': '26lb', '28#': '28lb',
  'oz': 'oz', 'lb': 'lb', 'lbs': 'lb', 'gal': 'gallon',
  'sm': 'small', 'md': 'medium', 'lg': 'large', 'xl': 'extra large',
  'xs': 'extra small', 'xxl': 'extra extra large',
  'reg': 'regular', 'jmbo': 'jumbo', 'jmb': 'jumbo', 'gnt': 'giant',
  'min': 'mini', 'tiny': 'tiny',
  
  // Brand abbreviations
  'vict': 'victor', 'tow': 'taste of the wild', 'toe': 'taste of the wild',
  'sd': 'science diet', 'nb': 'natural balance', 'diam': 'diamond',
  'hik': 'hikari', 'tet': 'tetra', 'aqe': 'aqueon', 'api': 'api',
  'zoo': 'zoo med', 'zmd': 'zoo med', 'zil': 'zilla', 'exo': 'exo terra',
  'flk': 'flukers', 'kay': 'kaytee', 'kmp': 'kaytee', 'oxb': 'oxbow',
  'kong': 'kong', 'eth': 'ethical', 'nyl': 'nylabone',
  'frm': 'fromm', 'grn': 'greenies', 'natv': 'naturvet',
  'can': 'canidae', 'acna': 'acana', 'ori': 'orijen',
  'merr': 'merrick', 'well': 'wellness', 'blue': 'blue buffalo',
  'nutro': 'nutro', 'iam': 'iams', 'euk': 'eukanuba',
  'hill': 'hills', 'purin': 'purina', 'roy': 'royal canin',
  
  // Product type abbreviations
  'fd': 'food', 'trt': 'treat', 'trts': 'treats',
  'chw': 'chew', 'chws': 'chews', 'bne': 'bone', 'bns': 'bones',
  'toy': 'toy', 'tys': 'toys', 'ball': 'ball', 'bls': 'balls',
  'bwl': 'bowl', 'bwls': 'bowls', 'dish': 'dish',
  'cllr': 'collar', 'lsh': 'leash', 'harn': 'harness',
  'bed': 'bed', 'bds': 'beds', 'mat': 'mat',
  'cage': 'cage', 'cgs': 'cages', 'tank': 'tank',
  'fltr': 'filter', 'fltrs': 'filters', 'pump': 'pump',
  'heat': 'heater', 'htrs': 'heaters', 'lite': 'light', 'lts': 'lights',
  'bulb': 'bulb', 'blbs': 'bulbs', 'lamp': 'lamp',
  'sbst': 'substrate', 'grvl': 'gravel', 'sand': 'sand',
  'plnt': 'plant', 'plnts': 'plants', 'deco': 'decoration',
  'ornm': 'ornament', 'orns': 'ornaments',
  'shmp': 'shampoo', 'cond': 'conditioner',
  'spry': 'spray', 'wipes': 'wipes', 'clnr': 'cleaner',
  
  // Aquatic abbreviations
  'cchld': 'cichlid', 'cchlid': 'cichlid',
  'pllt': 'pellet', 'pllts': 'pellets', 'pellat': 'pellet',
  'flake': 'flake', 'flk': 'flake', 'flks': 'flakes',
  'sink': 'sinking', 'snk': 'sinking', 'snkng': 'sinking',
  'float': 'floating', 'flt': 'floating',
  'gld': 'goldfish', 'gldfs': 'goldfish',
  'trpcl': 'tropical', 'trpc': 'tropical',
  'betta': 'betta', 'bta': 'betta',
  'koi': 'koi', 'pond': 'pond',
  'shrmp': 'shrimp', 'shri': 'shrimp', 'brine': 'brine',
  'bldwrm': 'bloodworm', 'bldwrms': 'bloodworms',
  'tbfx': 'tubifex', 'daphnia': 'daphnia',
  'algae': 'algae', 'alga': 'algae', 'wafer': 'wafer', 'wfr': 'wafer',
  'splmt': 'supplement', 'vitm': 'vitamin', 'mins': 'minerals',
  
  // Reptile abbreviations  
  'rept': 'reptile', 'rptl': 'reptile',
  'terr': 'terrarium', 'terra': 'terrarium',
  'bask': 'basking', 'bskg': 'basking',
  'uvb': 'uvb', 'uva': 'uva',
  'drgn': 'dragon', 'brdd': 'bearded',
  'trtl': 'turtle', 'tort': 'tortoise',
  'geck': 'gecko', 'leo': 'leopard',
  'snake': 'snake', 'snk': 'snake',
  'crick': 'cricket', 'crkt': 'cricket',
  'mealwrm': 'mealworm', 'mlwrm': 'mealworm',
  'dubia': 'dubia', 'roach': 'roach',
  
  // Bird abbreviations
  'bird': 'bird', 'brd': 'bird',
  'prrt': 'parrot', 'prots': 'parrot',
  'keet': 'parakeet', 'pkeet': 'parakeet',
  'cocka': 'cockatiel', 'tiel': 'cockatiel',
  'finch': 'finch', 'fnch': 'finch',
  'canry': 'canary', 'cnry': 'canary',
  'seed': 'seed', 'sd': 'seed', 'sds': 'seeds',
  'perch': 'perch', 'prch': 'perch',
  'swing': 'swing', 'swng': 'swing',
  'mirr': 'mirror', 'mir': 'mirror',
  'bell': 'bell', 'bll': 'bell',
  
  // Small animal abbreviations
  'rbbt': 'rabbit', 'bunny': 'bunny', 'bny': 'bunny',
  'gpig': 'guinea pig', 'gp': 'guinea pig',
  'hamst': 'hamster', 'hmstr': 'hamster',
  'gerb': 'gerbil', 'grbl': 'gerbil',
  'mouse': 'mouse', 'mice': 'mice',
  'rat': 'rat', 'rts': 'rats',
  'frrt': 'ferret', 'frt': 'ferret',
  'chinch': 'chinchilla', 'chin': 'chinchilla',
  'hedg': 'hedgehog', 'hdg': 'hedgehog',
  'hay': 'hay', 'timothy': 'timothy', 'tmthy': 'timothy',
  'alflfa': 'alfalfa', 'alf': 'alfalfa',
  'bedng': 'bedding', 'bdg': 'bedding',
  'shavng': 'shavings', 'shav': 'shavings',
  
  // Cat/Dog specific
  'cat': 'cat', 'ct': 'cat', 'cts': 'cats', 'feline': 'feline',
  'dog': 'dog', 'dg': 'dog', 'dgs': 'dogs', 'canine': 'canine',
  'kittn': 'kitten', 'kit': 'kitten', 'kttn': 'kitten',
  'pup': 'puppy', 'pupy': 'puppy', 'pp': 'puppy',
  'adlt': 'adult', 'adt': 'adult',
  'senr': 'senior', 'snr': 'senior',
  
  // Common words
  'nat': 'natural', 'natu': 'natural', 'natl': 'natural',
  'org': 'organic', 'orgc': 'organic',
  'prem': 'premium', 'prm': 'premium',
  'hlthy': 'healthy', 'hlth': 'health',
  'essnt': 'essential', 'essen': 'essentials',
  'orig': 'original', 'orgnl': 'original',
  'clss': 'classic', 'clsc': 'classic',
  'spec': 'special', 'spcl': 'special',
  'dly': 'daily', 'dail': 'daily',
  'flvr': 'flavor', 'flv': 'flavor', 'flvrd': 'flavored',
  'asst': 'assorted', 'asrtd': 'assorted',
  'pk': 'pack', 'pck': 'pack', 'ct': 'count',
  'dbl': 'double', 'dub': 'double',
  'sngl': 'single', 'sng': 'single',
  'mult': 'multi', 'mlt': 'multi',
  'refill': 'refill', 'rfl': 'refill',
  'replc': 'replacement', 'rplc': 'replacement',
};

// Expand a name using invoice abbreviations
function expandInvoiceName(name: string): string {
  let result = name;
  
  // First use the main abbreviation expansion
  result = expandAbbreviations(result);
  
  // Then apply invoice-specific abbreviations
  for (const [abbrev, full] of Object.entries(INVOICE_ABBREVIATIONS)) {
    // Word boundary matching (case-insensitive)
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  
  // Handle pound sign weight notation: 5# → 5lb
  result = result.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb');
  
  return result;
}

// Normalize and tokenize for comparison
function tokenize(text: string): Set<string> {
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const tokens = new Set<string>();
  for (const word of normalized.split(' ')) {
    if (word.length >= 2) {
      tokens.add(word);
    }
  }
  return tokens;
}

// Calculate Jaccard similarity between two token sets
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// Check if two product names are a match
function isMatch(dbName: string, invoiceName: string): { match: boolean; score: number; reason: string } {
  // Expand both names
  const dbExpanded = expandInvoiceName(dbName);
  const invoiceExpanded = expandInvoiceName(invoiceName);
  
  // Tokenize
  const dbTokens = tokenize(dbExpanded);
  const invoiceTokens = tokenize(invoiceExpanded);
  
  // Calculate similarity
  const similarity = jaccardSimilarity(dbTokens, invoiceTokens);
  
  // Also check substring containment (for abbreviated names)
  const dbNorm = dbExpanded.toLowerCase().replace(/[^a-z0-9]/g, '');
  const invNorm = invoiceExpanded.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const containsMatch = dbNorm.includes(invNorm) || invNorm.includes(dbNorm);
  const containRatio = Math.min(dbNorm.length, invNorm.length) / Math.max(dbNorm.length, invNorm.length);
  
  // Decision logic
  if (similarity >= 0.6) {
    return { match: true, score: similarity, reason: `Jaccard similarity ${(similarity * 100).toFixed(0)}%` };
  }
  
  if (containsMatch && containRatio >= 0.5) {
    return { match: true, score: containRatio, reason: `Substring match ${(containRatio * 100).toFixed(0)}%` };
  }
  
  // Check if critical tokens match (brand + key product words)
  const criticalDbTokens = [...dbTokens].slice(0, 4);
  const criticalMatches = criticalDbTokens.filter(t => invoiceTokens.has(t)).length;
  if (criticalMatches >= 3) {
    return { match: true, score: criticalMatches / criticalDbTokens.length, reason: `${criticalMatches} critical tokens match` };
  }
  
  return { match: false, score: similarity, reason: `Low similarity ${(similarity * 100).toFixed(0)}%` };
}

async function main() {
  console.log('=== UPC REMATCH SCRIPT ===\n');
  
  // Load InventoryMaybe
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = workbook.getWorksheet('Sheet1');
  
  // Build UPC -> Name map from InventoryMaybe
  const maybeMap = new Map<string, string>();
  ws?.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name) maybeMap.set(upc, name);
  });
  
  console.log(`InventoryMaybe: ${maybeMap.size} UPCs loaded\n`);
  
  // Get products WITHOUT SKUs
  const productsWithoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Products without SKU: ${productsWithoutSku.length}\n`);
  
  // Build inverted index: expanded name tokens -> [UPC, original name]
  const tokenIndex = new Map<string, Array<{upc: string, name: string}>>();
  
  for (const [upc, name] of maybeMap) {
    const expanded = expandInvoiceName(name);
    const tokens = tokenize(expanded);
    for (const token of tokens) {
      if (!tokenIndex.has(token)) {
        tokenIndex.set(token, []);
      }
      tokenIndex.get(token)!.push({ upc, name });
    }
  }
  
  console.log(`Token index built with ${tokenIndex.size} unique tokens\n`);
  
  // Match products to UPCs
  let matched = 0;
  let unmatched = 0;
  const updates: Array<{id: number, sku: string, dbName: string, maybeName: string, score: number}> = [];
  
  for (const prod of productsWithoutSku) {
    const prodExpanded = expandInvoiceName(prod.name);
    const prodTokens = tokenize(prodExpanded);
    
    // Find candidate UPCs using token overlap
    const candidateScores = new Map<string, number>();
    for (const token of prodTokens) {
      const matches = tokenIndex.get(token) || [];
      for (const { upc } of matches) {
        candidateScores.set(upc, (candidateScores.get(upc) || 0) + 1);
      }
    }
    
    // Sort candidates by token overlap
    const sortedCandidates = [...candidateScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Top 10 candidates
    
    // Find best match
    let bestMatch: {upc: string, name: string, score: number, reason: string} | null = null;
    
    for (const [upc, tokenOverlap] of sortedCandidates) {
      const maybeName = maybeMap.get(upc)!;
      const result = isMatch(prod.name, maybeName);
      
      if (result.match && (!bestMatch || result.score > bestMatch.score)) {
        bestMatch = { upc, name: maybeName, score: result.score, reason: result.reason };
      }
    }
    
    if (bestMatch) {
      matched++;
      updates.push({
        id: prod.id,
        sku: bestMatch.upc,
        dbName: prod.name,
        maybeName: bestMatch.name,
        score: bestMatch.score
      });
    } else {
      unmatched++;
    }
  }
  
  console.log(`=== MATCHING RESULTS ===`);
  console.log(`Matched: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  
  // Show sample matches
  console.log(`\n=== SAMPLE MATCHES (verify quality) ===`);
  const sampleMatches = updates.slice(0, 15);
  for (const m of sampleMatches) {
    console.log(`ID ${m.id}: "${m.dbName}"`);
    console.log(`  -> UPC ${m.sku} = "${m.maybeName}" (score: ${(m.score * 100).toFixed(0)}%)`);
  }
  
  // Apply updates
  if (updates.length > 0) {
    console.log(`\n=== APPLYING ${updates.length} UPC UPDATES ===`);
    
    for (let i = 0; i < updates.length; i++) {
      const u = updates[i];
      await db.update(supplies)
        .set({ sku: u.sku })
        .where(eq(supplies.id, u.id));
      
      if ((i + 1) % 500 === 0) {
        console.log(`Updated ${i + 1}/${updates.length}...`);
      }
    }
    
    console.log(`Applied ${updates.length} UPC updates.`);
  }
  
  // Final stats
  const totalCount = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  const withSkuCount = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(isNotNull(supplies.sku));
  
  console.log(`\n=== FINAL STATUS ===`);
  console.log(`Products with SKU: ${withSkuCount[0].count}`);
  console.log(`Total products: ${totalCount[0].count}`);
  console.log(`Coverage: ${((Number(withSkuCount[0].count) / Number(totalCount[0].count)) * 100).toFixed(1)}%`);
}

main().catch(console.error);
