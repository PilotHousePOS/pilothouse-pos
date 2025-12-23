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
  
  // Reptile brands
  'zmd': 'Zoo Med', 'zm': 'Zoo Med', 'zml': 'Zoo Med',
  'exo': 'Exo Terra',
  'zil': 'Zilla',
  'flk': 'Flukers', 'fsk': 'Flukers',
  'kmd': 'Komodo',
  'pge': 'Pangea',
  
  // Dog/Cat brands
  'kon': 'Kong', 'kng': 'Kong',
  'cst': 'Coastal', 'coa': 'Coastal',
  'nyl': 'Nylabone',
  'ben': 'Benebone',
  'smb': 'SmartBones', 'smbn': 'SmartBones',
  'bwi': 'Barkworthies',
  'rdb': 'RedBarn',
  'grn': 'Greenies',
  'whi': 'Whimzees',
  'cht': 'Chuckit',
  'eth': 'Ethical Pet',
  'spt': 'Spot',
  'jwp': 'JW Pet', 'jw': 'JW Pet',
  'saf': 'Safari',
  'trc': 'TropiClean', 'trp': 'TropiClean',
  'frp': 'Four Paws',
  'nvt': 'NaturVet',
  'fas': 'Fashion Pet',
  'pts': 'Petmate',
  'mps': 'Multipet', 'mrp': 'Multipet',
  'tit': 'Titan',
  'prv': 'Prevue',
  'llp': "Li'l Pals",
  'tuf': 'Tuffy',
  
  // Small animal/bird brands
  'kay': 'Kaytee', 'kmp': 'Kaytee',
  'oxb': 'Oxbow',
  'vtk': 'Vitakraft',
  'laf': 'Lafebers',
  'aec': 'A&E Cage',
  'brd': 'Birdlife',
  'ppx': 'Penn-Plax',
  'mar': 'Marshall',
  
  // Food brands
  'sd': 'Science Diet', 'hsd': 'Science Diet',
  'bb': 'Blue Buffalo', 'blu': 'Blue Buffalo',
  'rc': 'Royal Canin',
  'nut': 'Nutrisource', 'nbs': 'Nutrisource',
  'frm': 'Fromm',
  'dia': 'Diamond',
  'wlns': 'Wellness',
  'nat': 'Natural Balance', 'nb': 'Natural Balance',
  'iam': 'Iams',
  'prna': 'Purina',
  'pp': 'Pro Plan',
  'nulo': 'Nulo',
  'aca': 'Acana',
  'ori': 'Orijen',
  'mer': 'Merrick',
  'can': 'Canidae',
  'tas': 'Taste of the Wild',
  'ins': 'Instinct',
  'euk': 'Eukanuba',
  'pds': 'Pedigree',
  'csr': 'Cesar',
  'mpf': 'Monster Pet Food',
};

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
  const firstWord = lower.split(/\s+/)[0];
  
  // Check brand prefixes
  if (BRAND_PREFIXES[firstWord]) {
    return BRAND_PREFIXES[firstWord];
  }
  
  // Check if brand name appears at start
  const brandPatterns = Object.values(BRAND_PREFIXES);
  for (const brand of brandPatterns) {
    if (lower.startsWith(brand.toLowerCase())) {
      return brand;
    }
  }
  
  // Track unknown first words as potential brand prefixes
  if (firstWord.length >= 2 && firstWord.length <= 4 && /^[a-z]+$/i.test(firstWord)) {
    if (!log.brandPrefixesFound[firstWord]) {
      log.brandPrefixesFound[firstWord] = { count: 0, examples: [] };
    }
    log.brandPrefixesFound[firstWord].count++;
    if (log.brandPrefixesFound[firstWord].examples.length < 3) {
      log.brandPrefixesFound[firstWord].examples.push(text.substring(0, 60));
    }
  }
  
  return 'UNKNOWN';
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
  
  for (const [upc, data] of allUpcs) {
    const expanded = expandText(data.name);
    const brand = detectBrand(data.name);
    
    result.push({
      upc,
      name_original: data.name,
      name_expanded: expanded,
      brand,
      source: data.source
    });
    
    brandCounts[brand] = (brandCounts[brand] || 0) + 1;
    sourceCounts[data.source] = (sourceCounts[data.source] || 0) + 1;
  }
  
  log.stats = {
    total_upcs: result.length,
    by_source: sourceCounts,
    by_brand: brandCounts,
    unknown_brand_count: brandCounts['UNKNOWN'] || 0
  };
  
  logStep('Processing complete', {
    total: result.length,
    known_brands: result.length - (brandCounts['UNKNOWN'] || 0),
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
    console.log(`Brand: ${u.brand} | Source: ${u.source}`);
  });
  
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
