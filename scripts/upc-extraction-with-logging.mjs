import fs from 'fs';

// ===== LOGGING SYSTEM =====
const LOG_FILE = 'scripts/upc_extraction_log.json';
const ABBREV_LOG_FILE = 'scripts/abbreviation_learning_log.json';

let log = {
  timestamp: new Date().toISOString(),
  steps: [],
  stats: {},
  unknownAbbreviations: {},
  brandPrefixesFound: {},
  errors: []
};

function logStep(step, details) {
  const entry = { step, details, time: new Date().toISOString() };
  log.steps.push(entry);
  console.log(`\n[STEP] ${step}`);
  if (typeof details === 'object') {
    Object.entries(details).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  } else {
    console.log(`  ${details}`);
  }
}

function logError(error, context) {
  log.errors.push({ error: error.message || error, context, time: new Date().toISOString() });
  console.error(`[ERROR] ${context}: ${error}`);
}

function saveLog() {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
  console.log(`\n[LOG SAVED] ${LOG_FILE}`);
}

// ===== COMPREHENSIVE ABBREVIATION MAPPING =====
// This is our learning dictionary - grows as we discover patterns

const BRAND_PREFIXES = {
  // Aquarium brands
  'aqe': 'Aqueon', 'aqa': 'Aqueon',
  'tet': 'Tetra',
  'mar': 'Marineland',
  'flv': 'Fluval',
  'scm': 'SeaChem', 'sli': 'SeaChem',
  'hik': 'Hikari', 'hkr': 'Hikari',
  'atp': 'Aquatop',
  'wwi': 'World Wide Imports',
  'api': 'API',
  'glf': 'GloFish',
  'penn': 'Penn-Plax',
  
  // Reptile brands
  'zmd': 'Zoo Med', 'zm': 'Zoo Med', 'zml': 'Zoo Med', 'zoomed': 'Zoo Med',
  'exo': 'Exo Terra',
  'zil': 'Zilla', 'zilla': 'Zilla',
  'flk': 'Flukers', 'fsk': 'Flukers', 'flu': 'Flukers', 'flukers': 'Flukers',
  'kmd': 'Komodo', 'kom': 'Komodo', 'komodo': 'Komodo',
  'pge': 'Pangea',
  
  // Dog/Cat brands
  'kon': 'Kong', 'kng': 'Kong', 'kong': 'Kong',
  'cst': 'Coastal', 'coa': 'Coastal',
  'nyl': 'Nylabone', 'nylabone': 'Nylabone',
  'ben': 'Benebone', 'benebone': 'Benebone',
  'smb': 'SmartBones', 'smbn': 'SmartBones',
  'bwi': 'Barkworthies',
  'rdb': 'RedBarn', 'redbarn': 'RedBarn',
  'grn': 'Greenies', 'greenies': 'Greenies',
  'whi': 'Whimzees', 'whimzees': 'Whimzees',
  'cht': 'Chuckit', 'chuckit': 'Chuckit',
  'eth': 'Ethical Pet',
  'spt': 'Spot', 'spot': 'Spot',
  'jwp': 'JW Pet', 'jw': 'JW Pet',
  'saf': 'Safari', 'safari': 'Safari',
  'trc': 'TropiClean', 'trp': 'TropiClean', 'tro': 'TropiClean', 'tropiclean': 'TropiClean',
  'frp': 'Four Paws', 'fourpaws': 'Four Paws',
  'nvt': 'NaturVet', 'naturvet': 'NaturVet',
  // NOTE: 'gar' is Garmon Corp (distributor), NOT a brand - use context detection instead
  'fas': 'Fashion Pet',
  'pts': 'Petmate', 'petmate': 'Petmate',
  'mps': 'Multipet', 'mrp': 'Multipet', 'mul': 'Multipet', 'multipet': 'Multipet',
  'mam': 'Mammoth', 'mammoth': 'Mammoth',
  'tit': 'Titan',
  'prv': 'Prevue', 'prevue': 'Prevue',
  'llp': "Li'l Pals",
  'tuf': 'Tuffy', 'tuffy': 'Tuffy',
  'catit': 'Catit',
  
  // Small animal/bird brands
  'kay': 'Kaytee', 'kmp': 'Kaytee', 'kaytee': 'Kaytee',
  'oxb': 'Oxbow', 'oxbow': 'Oxbow',
  'vtk': 'Vitakraft', 'vitakraft': 'Vitakraft',
  'laf': 'Lafebers', 'lafebers': 'Lafebers',
  'aec': 'A&E Cage', 'a&e': 'A&E Cage',
  'brd': 'Birdlife',
  'ppx': 'Penn-Plax',
  'marshall': 'Marshall',
  
  // Food brands
  'sd': 'Science Diet', 'hsd': 'Science Diet',
  'bb': 'Blue Buffalo', 'blu': 'Blue Buffalo', 'blue': 'Blue Buffalo',
  'rc': 'Royal Canin', 'royal': 'Royal Canin',
  'nut': 'Nutrisource', 'nbs': 'Nutrisource', 'sou': 'Nutrisource', 'nutri': 'Nutrisource',
  'frm': 'Fromm', 'fromm': 'Fromm',
  'dia': 'Diamond', 'diam': 'Diamond', 'diamond': 'Diamond',
  'wlns': 'Wellness', 'wellness': 'Wellness',
  'nat': 'Natural Balance', 'nb': 'Natural Balance',
  'iam': 'Iams', 'iams': 'Iams',
  'prna': 'Purina', 'purina': 'Purina',
  'pp': 'Pro Plan', 'pro': 'Pro Plan',
  'nulo': 'Nulo',
  'aca': 'Acana', 'acana': 'Acana',
  'ori': 'Orijen', 'orijen': 'Orijen',
  'mer': 'Merrick', 'merrick': 'Merrick',
  'can': 'Canidae', 'canidae': 'Canidae',
  'tas': 'Taste of the Wild', 'tow': 'Taste of the Wild',
  'ins': 'Instinct', 'instinct': 'Instinct',
  'euk': 'Eukanuba', 'eukanuba': 'Eukanuba',
  'pds': 'Pedigree', 'pedigree': 'Pedigree',
  'csr': 'Cesar', 'cesar': 'Cesar',
  'mpf': 'Monster Pet Food',
  'vit': 'Vital Essentials', 'vital': 'Vital Essentials',
  'adams': 'Adams',
  'advantage': 'Advantage',
  'tomlyn': 'Tomlyn',
  'zymox': 'Zymox',
  'furminator': 'Furminator',
  'earthbath': 'Earthbath',
};

// Context-based brand detection using product keywords
// These are VERIFIED patterns - don't add guesses here!
const CONTEXT_BRAND_RULES = [
  // NaturVet products (distributed by Garmon Corp with GAR prefix)
  // GAR is Garmon Corp distributor code - verified 2024-12
  { keywords: ['gar rmdy', 'gar splmt'], brand: 'NaturVet', confidence: 'high' },
  { keywords: ['aller-911', 'aller 911'], brand: 'NaturVet', confidence: 'high' },
  { keywords: ['cranberry relief', 'crnbrry relief'], brand: 'NaturVet', confidence: 'high' },
  { keywords: ['quiet moment', 'grasssaver', 'coprophagia'], brand: 'NaturVet', confidence: 'high' },
  { keywords: ['bladder support', 'bladder-pcrn', 'probio/enz'], brand: 'NaturVet', confidence: 'high' },
  { keywords: ['all-in-one', 'hip joint', 'digestive enzymes'], brand: 'NaturVet', confidence: 'medium' },
  
  // Lafebers products
  { keywords: ['nutri berries', 'nutriberries', 'el paso'], brand: 'Lafebers', confidence: 'high' },
  
  // Blue Buffalo products
  { keywords: ['wilderness', 'life protection', 'blue basics'], brand: 'Blue Buffalo', confidence: 'high' },
  
  // Taste of the Wild products
  { keywords: ['ancient stream', 'ancient wetland', 'ancient prairie', 'ancient mountain'], brand: 'Taste of the Wild', confidence: 'high' },
  
  // Zoo Med products
  { keywords: ['creature soil', 'repti bark', 'eco earth', 'naturalistic'], brand: 'Zoo Med', confidence: 'high' },
  
  // Flukers products  
  { keywords: ['repta leash', 'cricket quencher', 'hermit crab'], brand: 'Flukers', confidence: 'high' },
];

// Track unverified prefix patterns for manual review (don't auto-promote!)
let unverifiedPrefixes = {};

const ABBREVIATIONS = {
  // Product types
  'fd': 'food', 'fod': 'food', 'fds': 'foods',
  'trt': 'treat', 'trts': 'treats',
  'chw': 'chew', 'chws': 'chews',
  'cllr': 'collar', 'clr': 'collar',
  'lsh': 'leash', 'ld': 'lead',
  'hrns': 'harness', 'harn': 'harness',
  'bwl': 'bowl', 'dsh': 'dish',
  'fdr': 'feeder', 'wtr': 'water',
  'toy': 'toy', 'tys': 'toys',
  'bal': 'ball', 'bll': 'ball',
  'crt': 'crate', 'tnk': 'tank',
  'fltr': 'filter', 'crtrdg': 'cartridge',
  'pmp': 'pump', 'htr': 'heater',
  'lght': 'light', 'lmp': 'lamp', 'blb': 'bulb',
  'fxtr': 'fixture',
  'dcr': 'decor', 'ornmt': 'ornament',
  'plnt': 'plant', 'grvl': 'gravel',
  'sbstrt': 'substrate', 'bdng': 'bedding',
  'shmp': 'shampoo', 'cond': 'conditioner',
  'brsh': 'brush', 'cmb': 'comb',
  'clpr': 'clipper', 'grmg': 'grooming',
  'splmt': 'supplement', 'vit': 'vitamin',
  'clnr': 'cleaner', 'vac': 'vacuum',
  'scrpr': 'scraper', 'hngd': 'hinged',
  'stnd': 'stand', 'pwr': 'power',
  'stc': 'stick', 'stck': 'stick',
  'bne': 'bone', 'bns': 'bones',
  'teasr': 'teaser', 'scratcher': 'scratcher',
  'ctnp': 'catnip', 'ftch': 'fetch',
  'pllt': 'pellet', 'flk': 'flake',
  'wfr': 'wafer', 'crckt': 'cricket',
  'mstr': 'mister', 'brch': 'branch',
  'whl': 'wheel', 'mllt': 'millet',
  'perch': 'perch', 'cage': 'cage',
  'crock': 'crock', 'prancer': 'prancer',
  'xtrm': 'extreme', 'zen': 'zen',
  'crunchair': 'crunch air',
  
  // Sizes
  'sm': 'small', 'sml': 'small',
  'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large',
  'xlg': 'xlarge', 'xl': 'xlarge',
  'xsm': 'xsmall', 'xs': 'xsmall',
  'xxl': 'xxlarge', 'xxs': 'xxsmall',
  'mini': 'mini', 'mn': 'mini',
  'jmb': 'jumbo', 'gnt': 'giant',
  'reg': 'regular',
  
  // Colors
  'blk': 'black', 'bk': 'black',
  'blu': 'blue', 'bl': 'blue',
  'wht': 'white', 'wh': 'white',
  'rd': 'red', 'grn': 'green',
  'ylw': 'yellow', 'org': 'orange',
  'pnk': 'pink', 'pk': 'pink',
  'prp': 'purple', 'pr': 'purple',
  'gry': 'gray', 'brn': 'brown',
  'slvr': 'silver', 'gld': 'gold',
  'clr': 'clear', 'rnbw': 'rainbow',
  
  // Animals
  'dg': 'dog', 'ct': 'cat',
  'pup': 'puppy', 'ppy': 'puppy',
  'ktn': 'kitten', 'kit': 'kitten',
  'fsh': 'fish', 'brd': 'bird',
  'rptl': 'reptile', 'rpt': 'reptile',
  'rbbt': 'rabbit', 'gpig': 'guinea pig',
  'hstr': 'hamster', 'ham': 'hamster',
  'frrt': 'ferret', 'trtl': 'turtle',
  'lzrd': 'lizard', 'snk': 'snake',
  'gck': 'gecko', 'betta': 'betta',
  'cchld': 'cichlid', 'gldfish': 'goldfish',
  'tiel': 'cockatiel', 'keet': 'parakeet',
  'prrt': 'parrot', 'cnry': 'canary',
  
  // Food ingredients
  'ck': 'chicken', 'chkn': 'chicken',
  'bf': 'beef', 'lam': 'lamb',
  'slmn': 'salmon', 'sal': 'salmon',
  'trky': 'turkey', 'trk': 'turkey',
  'whtfsh': 'whitefish', 'wf': 'whitefish',
  'vnson': 'venison', 'dck': 'duck',
  'veg': 'vegetable', 'frt': 'fruit',
  'rc': 'rice', 'oat': 'oatmeal',
  'swpt': 'sweet potato', 'pmpk': 'pumpkin',
  'spnch': 'spinach', 'crrt': 'carrot',
  'ban': 'banana', 'strw': 'strawberry',
  'hrbl': 'herbal', 'tmthy': 'timothy',
  
  // Counts & measurements
  'pk': 'pack', 'ct': 'count',
  'pc': 'piece', 'pcs': 'pieces',
  '1pk': '1pack', '2pk': '2pack', '3pk': '3pack', '4pk': '4pack',
  '1ct': '1count', '2ct': '2count', '4ct': '4count',
  'oz': 'ounce', 'lb': 'pound',
  'gal': 'gallon', 'qt': 'quart',
  
  // Attributes
  'orig': 'original', 'ntrl': 'natural',
  'prm': 'premium', 'dlx': 'deluxe',
  'uvb': 'uvb', 'uva': 'uva',
  'cmbo': 'combo', 'adj': 'adjustable',
  'rtrct': 'retractable', 'rfl': 'reflective',
  'sens': 'sensitive', 'hlthy': 'healthy',
  'adlt': 'adult', 'snr': 'senior',
  'jnr': 'junior', 'frml': 'formula',
  'br': 'breed', 'nosf': 'no sunflower',
  'swthrvst': 'sweet harvest',
  'fdph': 'food dish',
  'rtl': 'retail', 'asst': 'assorted',
  'pro': 'pro', 'esntl': 'essential',
  'activ': 'active', 'bio': 'bio',
  'mag': 'magnetic', 'nano': 'nano',
  'skyaqua': 'sky aqua',
  'flourite': 'flourite',
  
  // Connectors
  'w/': 'with', 'w': 'with',
  'n': 'and', '&': 'and',
};

function trackUnknownWord(word, context) {
  if (word.length >= 2 && word.length <= 6 && /^[a-z]+$/i.test(word)) {
    const lower = word.toLowerCase();
    if (!ABBREVIATIONS[lower] && !BRAND_PREFIXES[lower]) {
      if (!log.unknownAbbreviations[lower]) {
        log.unknownAbbreviations[lower] = { count: 0, contexts: [] };
      }
      log.unknownAbbreviations[lower].count++;
      if (log.unknownAbbreviations[lower].contexts.length < 3) {
        log.unknownAbbreviations[lower].contexts.push(context.substring(0, 80));
      }
    }
  }
}

function expandText(text) {
  let result = text.toLowerCase()
    .replace(/(\d+\.?\d*)\s*["'']/g, '$1inch ')
    .replace(/(\d+\.?\d*)\s*in\b/gi, '$1inch')
    .replace(/(\d+\.?\d*)\s*[']/g, '$1ft ')
    .replace(/(\d+\.?\d*)\s*ft\b/gi, '$1ft')
    .replace(/(\d+)\s*x\s*(\d+)/gi, '$1by$2')
    .replace(/#/g, ' pound ')
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/['']/g, '')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Track unknown words
  result.split(/\s+/).forEach(w => trackUnknownWord(w, text));
  
  // Expand abbreviations (longest first to avoid partial matches)
  const sorted = Object.entries(ABBREVIATIONS).sort((a, b) => b[0].length - a[0].length);
  for (const [abbr, full] of sorted) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  
  return result;
}

function detectBrand(text) {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const firstWord = words[0];
  
  // STEP 1: Check verified brand prefixes (highest priority)
  if (BRAND_PREFIXES[firstWord]) {
    return { brand: BRAND_PREFIXES[firstWord], method: 'prefix', confidence: 'verified' };
  }
  
  // STEP 2: Check if brand name appears at start
  const brandPatterns = [...new Set(Object.values(BRAND_PREFIXES))];
  for (const brand of brandPatterns) {
    if (lower.startsWith(brand.toLowerCase())) {
      return { brand, method: 'name_match', confidence: 'verified' };
    }
  }
  
  // STEP 3: Check context-based rules
  for (const rule of CONTEXT_BRAND_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return { brand: rule.brand, method: 'context', confidence: rule.confidence, keyword };
      }
    }
  }
  
  // STEP 4: Track unknown first words for MANUAL REVIEW (never auto-promote!)
  if (firstWord.length >= 2 && firstWord.length <= 5 && /^[a-z]+$/i.test(firstWord)) {
    if (!unverifiedPrefixes[firstWord]) {
      unverifiedPrefixes[firstWord] = { count: 0, examples: [], status: 'needs_review' };
    }
    unverifiedPrefixes[firstWord].count++;
    if (unverifiedPrefixes[firstWord].examples.length < 5) {
      unverifiedPrefixes[firstWord].examples.push(text.substring(0, 80));
    }
    
    // Also track in log for learning
    if (!log.brandPrefixesFound[firstWord]) {
      log.brandPrefixesFound[firstWord] = { count: 0, examples: [], status: 'NEEDS_VERIFICATION' };
    }
    log.brandPrefixesFound[firstWord].count++;
    if (log.brandPrefixesFound[firstWord].examples.length < 5) {
      log.brandPrefixesFound[firstWord].examples.push(text.substring(0, 80));
    }
  }
  
  return { brand: 'UNKNOWN', method: 'none', confidence: 'none' };
}

// ===== MAIN EXTRACTION =====

async function main() {
  console.log('========================================');
  console.log('UPC EXTRACTION WITH COMPREHENSIVE LOGGING');
  console.log('========================================');
  
  // STEP 1: Load invoice UPCs
  logStep('Loading invoice UPCs', 'Checking available files...');
  let invoiceUpcs = [];
  
  const invoiceFiles = [
    'invoice_extracted_upcs.json',
    'scripts/all_invoice_upcs.json',
    'all_invoice_upcs.json'
  ];
  
  for (const file of invoiceFiles) {
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        invoiceUpcs = Array.isArray(data) ? data : [];
        logStep('Invoice UPCs loaded', { file, count: invoiceUpcs.length });
        break;
      } catch (e) {
        logError(e, `Loading ${file}`);
      }
    }
  }
  
  // STEP 2: Load maybe inventory UPCs
  logStep('Loading maybe inventory UPCs', 'Checking available files...');
  let maybeUpcs = [];
  
  const maybeFiles = [
    'scripts/maybe_upcs_clean_3171.json',
    'maybe_upcs.json',
    'scripts/filtered_maybe_upcs.json'
  ];
  
  for (const file of maybeFiles) {
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        maybeUpcs = Array.isArray(data) ? data : [];
        logStep('Maybe UPCs loaded', { file, count: maybeUpcs.length });
        break;
      } catch (e) {
        logError(e, `Loading ${file}`);
      }
    }
  }
  
  // STEP 3: Load Google sheet UPCs
  logStep('Loading Google sheet UPCs', 'Checking available files...');
  let sheetUpcs = [];
  
  if (fs.existsSync('scripts/google_sheet_upcs.csv')) {
    try {
      const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
      const lines = csv.split('\n').slice(1);
      
      lines.forEach(line => {
        const parts = line.split(',');
        if (parts[0] && parts[1] && parts[0].match(/^\d{10,14}$/)) {
          sheetUpcs.push({
            upc: parts[0].trim(),
            name: parts[1].trim(),
            source: 'spreadsheet'
          });
        }
      });
      
      logStep('Sheet UPCs loaded', { file: 'scripts/google_sheet_upcs.csv', count: sheetUpcs.length });
    } catch (e) {
      logError(e, 'Loading Google sheet');
    }
  }
  
  // STEP 4: Combine and deduplicate
  logStep('Combining all sources', {
    invoice: invoiceUpcs.length,
    maybe: maybeUpcs.length,
    sheet: sheetUpcs.length,
    total_before_dedup: invoiceUpcs.length + maybeUpcs.length + sheetUpcs.length
  });
  
  const allUpcs = new Map();
  
  // Add invoice UPCs first (priority)
  invoiceUpcs.forEach(u => {
    if (u.upc && u.name) {
      allUpcs.set(u.upc, { ...u, source: u.source || 'invoice' });
    }
  });
  
  // Add maybe UPCs
  maybeUpcs.forEach(u => {
    if (u.upc && u.name && !allUpcs.has(u.upc)) {
      allUpcs.set(u.upc, { ...u, source: u.source || 'maybe' });
    }
  });
  
  // Add sheet UPCs
  sheetUpcs.forEach(u => {
    if (u.upc && u.name && !allUpcs.has(u.upc)) {
      allUpcs.set(u.upc, u);
    }
  });
  
  logStep('After deduplication', { unique_upcs: allUpcs.size });
  
  // STEP 5: Expand abbreviations and detect brands
  logStep('Expanding abbreviations and detecting brands', 'Processing all UPCs...');
  
  const result = [];
  let brandCounts = {};
  let sourceCounts = {};
  
  let methodCounts = { prefix: 0, name_match: 0, context: 0, none: 0 };
  let confidenceCounts = { verified: 0, high: 0, medium: 0, none: 0 };
  
  for (const [upc, data] of allUpcs) {
    const expanded = expandText(data.name);
    const brandResult = detectBrand(data.name);
    
    result.push({
      upc,
      name_original: data.name,
      name_expanded: expanded,
      brand: brandResult.brand,
      brand_method: brandResult.method,
      brand_confidence: brandResult.confidence,
      brand_keyword: brandResult.keyword || null,
      source: data.source
    });
    
    brandCounts[brandResult.brand] = (brandCounts[brandResult.brand] || 0) + 1;
    sourceCounts[data.source] = (sourceCounts[data.source] || 0) + 1;
    methodCounts[brandResult.method] = (methodCounts[brandResult.method] || 0) + 1;
    confidenceCounts[brandResult.confidence] = (confidenceCounts[brandResult.confidence] || 0) + 1;
  }
  
  log.stats = {
    total_upcs: result.length,
    by_source: sourceCounts,
    by_brand: brandCounts,
    by_detection_method: methodCounts,
    by_confidence: confidenceCounts,
    unknown_brand_count: brandCounts['UNKNOWN'] || 0
  };
  
  // Add unverified prefixes to log for review
  log.unverifiedPrefixes = unverifiedPrefixes;
  
  logStep('Processing complete', {
    total: result.length,
    verified_brands: confidenceCounts.verified || 0,
    context_detected: methodCounts.context || 0,
    unknown_brands: brandCounts['UNKNOWN'] || 0
  });
  
  // STEP 6: Save results
  logStep('Saving results', 'Writing to files...');
  
  fs.writeFileSync('scripts/ALL_UPCS_EXPANDED.json', JSON.stringify(result, null, 2));
  console.log(`  Saved ${result.length} UPCs to scripts/ALL_UPCS_EXPANDED.json`);
  
  // STEP 7: Show examples
  console.log('\n========== SAMPLE EXPANSIONS ==========');
  result.slice(0, 15).forEach(u => {
    console.log(`\nOriginal: ${u.name_original}`);
    console.log(`Expanded: ${u.name_expanded}`);
    console.log(`Brand: ${u.brand} (${u.brand_method}/${u.brand_confidence}) | Source: ${u.source}`);
    if (u.brand_keyword) console.log(`  Matched keyword: "${u.brand_keyword}"`);
  });
  
  // Show detection method breakdown
  console.log('\n========== DETECTION METHODS ==========');
  console.log(`Prefix match (verified): ${methodCounts.prefix}`);
  console.log(`Name match (verified): ${methodCounts.name_match}`);
  console.log(`Context rules: ${methodCounts.context}`);
  console.log(`Unknown (needs review): ${methodCounts.none}`);
  
  // STEP 8: Show unknown abbreviations for learning
  console.log('\n========== UNKNOWN ABBREVIATIONS (HELP NEEDED) ==========');
  const unknowns = Object.entries(log.unknownAbbreviations)
    .filter(([k, v]) => v.count >= 5)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 25);
  
  if (unknowns.length > 0) {
    console.log('\nThese appear frequently but are not in our dictionary:');
    unknowns.forEach(([abbr, data]) => {
      console.log(`\n  "${abbr}" (${data.count}x):`);
      data.contexts.forEach(ctx => console.log(`    - ${ctx}`));
    });
  }
  
  // STEP 9: Show potential brand prefixes
  console.log('\n========== POTENTIAL BRAND PREFIXES ==========');
  const potentialBrands = Object.entries(log.brandPrefixesFound)
    .filter(([k, v]) => v.count >= 10)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);
  
  if (potentialBrands.length > 0) {
    console.log('\nThese first words appear frequently (might be brand prefixes):');
    potentialBrands.forEach(([prefix, data]) => {
      console.log(`\n  "${prefix}" (${data.count}x):`);
      data.examples.forEach(ex => console.log(`    - ${ex}`));
    });
  }
  
  // STEP 10: Save learning log
  saveLog();
  
  // Also save abbreviation learning separately for easy reference
  const abbrevLearning = {
    unknown_abbreviations: Object.entries(log.unknownAbbreviations)
      .filter(([k, v]) => v.count >= 3)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([abbr, data]) => ({ abbr, count: data.count, examples: data.contexts })),
    potential_brand_prefixes: Object.entries(log.brandPrefixesFound)
      .filter(([k, v]) => v.count >= 5)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([prefix, data]) => ({ prefix, count: data.count, examples: data.examples }))
  };
  
  fs.writeFileSync(ABBREV_LOG_FILE, JSON.stringify(abbrevLearning, null, 2));
  console.log(`\n[LEARNING LOG SAVED] ${ABBREV_LOG_FILE}`);
  
  console.log('\n========== FINAL STATISTICS ==========');
  console.log(`Total UPCs: ${result.length}`);
  console.log('\nBy source:');
  Object.entries(sourceCounts).forEach(([s, c]) => console.log(`  ${s}: ${c}`));
  console.log('\nTop 15 brands:');
  Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([b, c]) => console.log(`  ${b}: ${c}`));
}

main().catch(e => {
  logError(e, 'Main execution');
  saveLog();
  process.exit(1);
});
