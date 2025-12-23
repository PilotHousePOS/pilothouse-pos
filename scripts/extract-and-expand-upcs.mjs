import fs from 'fs';
import path from 'path';

// ===== COMPREHENSIVE ABBREVIATION EXPANSION =====
// This grows as we find new patterns

const ABBREVIATIONS = {
  // BRAND PREFIXES
  'aqe': 'aqueon', 'aqa': 'aqueon',
  'kon': 'kong', 'kng': 'kong',
  'aec': 'ae cage', 'a&e': 'ae cage',
  'zmd': 'zoo med', 'zm': 'zoo med', 'zoomed': 'zoo med',
  'exo': 'exo terra', 'exoterra': 'exo terra',
  'zil': 'zilla',
  'kay': 'kaytee',
  'cst': 'coastal', 'coa': 'coastal',
  'ppx': 'penn plax', 'pennplax': 'penn plax',
  'flk': 'flukers', 'flkr': 'flukers',
  'hkr': 'hikari',
  'tet': 'tetra',
  'mar': 'marineland',
  'flv': 'fluval',
  'scm': 'seachem',
  'nyl': 'nylabone',
  'oxb': 'oxbow',
  'ben': 'benebone',
  'smb': 'smartbones', 'smbn': 'smartbones',
  'bwi': 'barkworthies',
  'llp': 'lil pals', 'lilpals': 'lil pals',
  'spt': 'spot',
  'tit': 'titan',
  'prv': 'prevue', 'ph': 'prevue hendrix',
  'jwp': 'jw pet', 'jw': 'jw pet',
  'saf': 'safari',
  'trc': 'tropiclean',
  'frp': 'four paws', 'fourpaws': 'four paws',
  'nvt': 'naturvet',
  'brd': 'birdlife',
  'kmd': 'komodo',
  'vtk': 'vitakraft',
  'mrp': 'multipet',
  'tuf': 'tuffy',
  'pge': 'pangea',
  'sd': 'science diet', 'hsd': 'science diet',
  'bb': 'blue buffalo',
  'rc': 'royal canin',
  'nut': 'nutrisource',
  'prm': 'proplan', 'pp': 'proplan',
  'frm': 'fromm',
  'dia': 'diamond',
  'nulo': 'nulo',
  'aca': 'acana',
  'ori': 'orijen',
  'wlns': 'wellness',
  'nat': 'natural balance', 'nb': 'natural balance',
  'euk': 'eukanuba',
  'iam': 'iams',
  'prna': 'purina',
  'pds': 'pedigree',
  'csr': 'cesar',
  
  // PRODUCT TYPES
  'fd': 'food', 'fod': 'food', 'fds': 'foods',
  'trt': 'treat', 'trts': 'treats',
  'chw': 'chew', 'chws': 'chews', 'chwr': 'chewer',
  'cllr': 'collar', 'clr': 'collar',
  'lsh': 'leash', 'ldp': 'leash', 'ld': 'lead',
  'hrns': 'harness', 'harn': 'harness', 'hrn': 'harness',
  'bwl': 'bowl', 'bwls': 'bowls',
  'dsh': 'dish', 'dshs': 'dishes',
  'fdr': 'feeder', 'fdrs': 'feeders',
  'wtr': 'water', 'wtrer': 'waterer',
  'tys': 'toys', 'ty': 'toy',
  'bal': 'ball', 'bll': 'ball',
  'crt': 'crate', 'crts': 'crates',
  'tnk': 'tank', 'tnks': 'tanks',
  'aqua': 'aquarium',
  'fltr': 'filter', 'fltrs': 'filters',
  'crtrdg': 'cartridge', 'crtrd': 'cartridge',
  'pmp': 'pump', 'pmps': 'pumps',
  'htr': 'heater', 'htrs': 'heaters',
  'lght': 'light', 'lmp': 'lamp',
  'blb': 'bulb', 'blbs': 'bulbs',
  'fxtr': 'fixture',
  'dcr': 'decor', 'ornmt': 'ornament',
  'plnt': 'plant', 'plnts': 'plants',
  'grvl': 'gravel',
  'sbstrt': 'substrate',
  'bdng': 'bedding', 'bddng': 'bedding',
  'shmp': 'shampoo', 'shmpoo': 'shampoo',
  'cond': 'conditioner',
  'spry': 'spray',
  'brsh': 'brush', 'brshs': 'brushes',
  'cmb': 'comb',
  'clpr': 'clipper', 'clprs': 'clippers',
  'grmg': 'grooming', 'grm': 'grooming',
  'splmt': 'supplement', 'suplmt': 'supplement',
  'vit': 'vitamin', 'vits': 'vitamins',
  'crnr': 'corner',
  'wtrfl': 'waterfall',
  'brch': 'branch',
  'mstr': 'mister',
  'fnrm': 'faunarium',
  'slk': 'silk',
  'jngl': 'jungle',
  'rck': 'rock',
  'glw': 'glow',
  'crckt': 'cricket',
  'pn': 'pen',
  'strtr': 'starter',
  'whl': 'wheel',
  'spnnr': 'spinner',
  'mllt': 'millet',
  'gtwy': 'getaway',
  'clnr': 'cleaner', 'clnrs': 'cleaners',
  'vac': 'vacuum',
  'scrpr': 'scraper',
  'hngd': 'hinged',
  'stnd': 'stand',
  'pwr': 'power',
  'dntl': 'dental',
  'stc': 'stick', 'stck': 'stick',
  'comft': 'comfort', 'cmft': 'comfort',
  'asst': 'assorted',
  'dspnsr': 'dispenser',
  'wrpz': 'wraps',
  'pllt': 'pellet', 'pllts': 'pellets',
  'flk': 'flake', 'flks': 'flakes',
  'wfr': 'wafer',
  'tmthy': 'timothy',
  'hrbl': 'herbal',
  'scratcher': 'scratcher', 'scrtr': 'scratcher',
  'ftch': 'fetch',
  'ftball': 'football',
  'bne': 'bone', 'bns': 'bones',
  'ctnp': 'catnip',
  
  // SIZES
  'sm': 'small', 'sml': 'small',
  'md': 'medium', 'med': 'medium',
  'lg': 'large', 'lrg': 'large', 'lge': 'large',
  'xlg': 'xlarge', 'xlrg': 'xlarge', 'xl': 'xlarge',
  'xsm': 'xsmall', 'xs': 'xsmall',
  'xxl': 'xxlarge',
  'xxs': 'xxsmall',
  'mn': 'mini',
  'jmb': 'jumbo',
  'gnt': 'giant',
  'reg': 'regular',
  
  // COLORS
  'blk': 'black', 'bk': 'black',
  'blu': 'blue', 'bl': 'blue',
  'wht': 'white', 'wh': 'white',
  'rd': 'red',
  'grn': 'green', 'gn': 'green',
  'ylw': 'yellow', 'yw': 'yellow',
  'org': 'orange', 'or': 'orange',
  'pnk': 'pink', 'pk': 'pink',
  'prp': 'purple', 'pr': 'purple',
  'gry': 'gray', 'gy': 'gray',
  'brn': 'brown', 'br': 'brown',
  'tn': 'tan',
  'slvr': 'silver', 'slv': 'silver',
  'gld': 'gold',
  
  // ANIMALS & BREEDS
  'dg': 'dog', 'dgs': 'dogs',
  'ct': 'cat', 'cts': 'cats',
  'pup': 'puppy', 'ppy': 'puppy',
  'ktn': 'kitten', 'kit': 'kitten',
  'fsh': 'fish',
  'rptl': 'reptile', 'rpt': 'reptile',
  'rbbt': 'rabbit', 'rbt': 'rabbit',
  'gpig': 'guineapig', 'gp': 'guineapig',
  'hstr': 'hamster', 'ham': 'hamster',
  'frrt': 'ferret', 'frt': 'ferret',
  'trtl': 'turtle', 'ttl': 'turtle',
  'lzrd': 'lizard', 'lz': 'lizard',
  'snk': 'snake', 'sk': 'snake',
  'gck': 'gecko',
  'leo': 'leopard',
  'brd': 'bird', 'brds': 'birds',
  'tiel': 'cockatiel',
  'keet': 'parakeet',
  'cchld': 'cichlid',
  
  // FOOD SPECIFIC
  'ck': 'chicken', 'chkn': 'chicken',
  'bf': 'beef',
  'lam': 'lamb', 'lmb': 'lamb',
  'slmn': 'salmon', 'sal': 'salmon',
  'trky': 'turkey', 'trk': 'turkey',
  'fsh': 'fish',
  'whtfsh': 'whitefish', 'wf': 'whitefish',
  'vnson': 'venison', 'vn': 'venison',
  'dck': 'duck', 'dk': 'duck',
  'pork': 'pork', 'prk': 'pork',
  'veg': 'vegetable', 'vegs': 'vegetables',
  'frt': 'fruit', 'frts': 'fruits',
  'ban': 'banana',
  'strw': 'strawberry',
  'rc': 'rice',
  'oat': 'oatmeal',
  'swpt': 'sweet potato',
  'pmpk': 'pumpkin',
  'spnch': 'spinach',
  'crrt': 'carrot',
  
  // MEASUREMENTS & COUNTS
  'pk': 'pack',
  'ct': 'count',
  'pc': 'piece', 'pcs': 'pieces',
  '1pk': '1 pack', '2pk': '2 pack', '3pk': '3 pack', '4pk': '4 pack', '5pk': '5 pack', '10pk': '10 pack',
  '1ct': '1 count', '2ct': '2 count', '4ct': '4 count', '6ct': '6 count',
  'oz': 'ounce', 'ozs': 'ounces',
  'lb': 'pound', 'lbs': 'pounds', '#': 'pound',
  'gal': 'gallon', 'gals': 'gallons',
  'qt': 'quart',
  'gph': 'gallons per hour',
  
  // PRODUCT ATTRIBUTES
  'orig': 'original',
  'ntrl': 'natural',
  'prm': 'premium',
  'dlx': 'deluxe',
  'uvb': 'uvb', 'uva': 'uva',
  'cmbo': 'combo',
  'halo': 'halogen',
  'trm': 'terrarium',
  'pldrm': 'paludarium',
  'adj': 'adjustable',
  'rtrct': 'retractable', 'retr': 'retractable',
  'nyl': 'nylon',
  'lthr': 'leather',
  'rfl': 'reflective', 'rflct': 'reflective',
  'glo': 'glow',
  'lght': 'light',
  'sens': 'sensitive',
  'wght': 'weight',
  'mgmt': 'management',
  'frml': 'formula',
  'hlthy': 'healthy',
  'adlt': 'adult',
  'snr': 'senior',
  'jnr': 'junior',
  
  // Aquarium/Reptile specific
  'air': 'air',
  'bbblwnd': 'bubble wand', 'bbl': 'bubble',
  'flx': 'flex',
  'mag': 'magnetic', 'mgnt': 'magnet',
  'algae': 'algae', 'alg': 'algae',
  'pro': 'pro',
  'shrt': 'short',
  'tnk': 'tank',
  'bow': 'bow',
  'stnd': 'stand',
  'foam': 'foam',
  'pad': 'pad', 'pds': 'pads',
  'carb': 'carbon', 'crbn': 'carbon',
  'amm': 'ammonia',
  'repl': 'replace', 'rplc': 'replacement',
  'q-flow': 'quietflow', 'qflow': 'quietflow',
  'st': 'starter',
  'bds': 'beads',
  'bomb': 'bomb',
  'changer': 'changer', 'chngr': 'changer',
  
  // W/ and other connectors
  'w/': 'with', 'w': 'with',
  '&': 'and',
  'n': 'and',
};

// Log file for learning
const LOG_FILE = 'scripts/abbreviation_log.json';
let abbreviationLog = { found: {}, unknown: {}, patterns: [] };

function loadLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      abbreviationLog = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    }
  } catch (e) {}
}

function saveLog() {
  fs.writeFileSync(LOG_FILE, JSON.stringify(abbreviationLog, null, 2));
}

function logPattern(word, context) {
  if (word.length <= 5 && /^[a-z0-9]+$/i.test(word) && !ABBREVIATIONS[word.toLowerCase()]) {
    const key = word.toLowerCase();
    if (!abbreviationLog.unknown[key]) {
      abbreviationLog.unknown[key] = { count: 0, contexts: [] };
    }
    abbreviationLog.unknown[key].count++;
    if (abbreviationLog.unknown[key].contexts.length < 5) {
      abbreviationLog.unknown[key].contexts.push(context.substring(0, 100));
    }
  }
}

function expandAbbreviations(text) {
  let result = text.toLowerCase()
    // Normalize dimensions first
    .replace(/(\d+\.?\d*)\s*["'']/g, '$1inch ')
    .replace(/(\d+\.?\d*)\s*in\b/gi, '$1inch')
    .replace(/(\d+\.?\d*)\s*[']/g, '$1ft ')
    .replace(/(\d+\.?\d*)\s*ft\b/gi, '$1ft')
    .replace(/(\d+)\s*x\s*(\d+)/gi, '$1by$2')
    // Normalize punctuation
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/['']/g, '')
    .replace(/#/g, ' pound')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Track words for logging
  const words = result.split(/\s+/);
  words.forEach(w => logPattern(w, text));
  
  // Expand abbreviations (longest first)
  const sorted = Object.entries(ABBREVIATIONS).sort((a, b) => b[0].length - a[0].length);
  for (const [abbr, full] of sorted) {
    result = result.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  
  return result;
}

async function main() {
  loadLog();
  
  console.log('=== UPC EXTRACTION WITH ABBREVIATION EXPANSION ===\n');
  
  // 1. Load invoice UPCs
  console.log('Loading invoice UPCs...');
  let invoiceUpcs = [];
  if (fs.existsSync('invoice_extracted_upcs.json')) {
    invoiceUpcs = JSON.parse(fs.readFileSync('invoice_extracted_upcs.json', 'utf-8'));
    console.log(`  Found ${invoiceUpcs.length} invoice UPCs`);
  } else if (fs.existsSync('scripts/all_invoice_upcs.json')) {
    const data = JSON.parse(fs.readFileSync('scripts/all_invoice_upcs.json', 'utf-8'));
    invoiceUpcs = data.map(u => ({ ...u, source: 'invoice' }));
    console.log(`  Found ${invoiceUpcs.length} invoice UPCs`);
  }
  
  // 2. Load maybe inventory UPCs
  console.log('Loading maybe inventory UPCs...');
  let maybeUpcs = [];
  if (fs.existsSync('scripts/maybe_upcs_clean_3171.json')) {
    maybeUpcs = JSON.parse(fs.readFileSync('scripts/maybe_upcs_clean_3171.json', 'utf-8'));
    console.log(`  Found ${maybeUpcs.length} maybe UPCs`);
  } else if (fs.existsSync('maybe_upcs.json')) {
    maybeUpcs = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
    console.log(`  Found ${maybeUpcs.length} maybe UPCs`);
  }
  
  // 3. Load Google sheet UPCs
  console.log('Loading Google sheet UPCs...');
  let sheetUpcs = [];
  if (fs.existsSync('scripts/google_sheet_upcs.csv')) {
    const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
    const lines = csv.split('\n').slice(1); // skip header
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
    console.log(`  Found ${sheetUpcs.length} spreadsheet UPCs`);
  }
  
  // 4. Combine and deduplicate
  console.log('\nCombining and deduplicating...');
  const allUpcs = new Map();
  
  [...invoiceUpcs, ...maybeUpcs, ...sheetUpcs].forEach(u => {
    const key = u.upc;
    if (!allUpcs.has(key)) {
      allUpcs.set(key, {
        upc: u.upc,
        name_original: u.name,
        name_expanded: expandAbbreviations(u.name),
        source: u.source
      });
    }
  });
  
  console.log(`  Total unique UPCs: ${allUpcs.size}`);
  
  // 5. Extract brand from expanded name
  const result = Array.from(allUpcs.values()).map(u => {
    // Try to extract brand from first word
    const firstWord = u.name_expanded.split(' ')[0];
    let brand = 'UNKNOWN';
    
    // Check if first word is a known brand
    const brandPatterns = {
      'aqueon': 'Aqueon',
      'kong': 'Kong',
      'ae cage': 'A&E Cage',
      'zoo med': 'Zoo Med',
      'exo terra': 'Exo Terra',
      'zilla': 'Zilla',
      'kaytee': 'Kaytee',
      'coastal': 'Coastal',
      'penn plax': 'Penn-Plax',
      'flukers': "Fluker's",
      'hikari': 'Hikari',
      'tetra': 'Tetra',
      'marineland': 'Marineland',
      'fluval': 'Fluval',
      'seachem': 'SeaChem',
      'nylabone': 'Nylabone',
      'oxbow': 'Oxbow',
      'benebone': 'Benebone',
      'science diet': 'Science Diet',
      'blue buffalo': 'Blue Buffalo',
      'royal canin': 'Royal Canin',
      'natural balance': 'Natural Balance',
      'purina': 'Purina',
      'iams': 'Iams',
      'wellness': 'Wellness',
      'fromm': 'Fromm',
      'nutrisource': 'Nutrisource',
      'proplan': 'Pro Plan',
      'nulo': 'Nulo',
      'acana': 'Acana',
      'orijen': 'Orijen',
      'diamond': 'Diamond',
      'lil pals': "Li'l Pals",
      'spot': 'Spot',
      'titan': 'Titan',
      'prevue': 'Prevue',
      'jw pet': 'JW Pet',
      'safari': 'Safari',
      'tropiclean': 'TropiClean',
      'four paws': 'Four Paws',
      'naturvet': 'NaturVet',
      'birdlife': 'Birdlife',
      'komodo': 'Komodo',
      'vitakraft': 'Vitakraft',
      'multipet': 'Multipet',
      'tuffy': 'Tuffy',
      'pangea': 'Pangea',
      'smartbones': 'SmartBones',
      'barkworthies': 'Barkworthies',
    };
    
    for (const [pattern, brandName] of Object.entries(brandPatterns)) {
      if (u.name_expanded.startsWith(pattern)) {
        brand = brandName;
        break;
      }
    }
    
    return {
      upc: u.upc,
      name: u.name_original,
      name_expanded: u.name_expanded,
      brand,
      source: u.source
    };
  });
  
  // 6. Save expanded UPCs
  fs.writeFileSync('scripts/ALL_UPCS_EXPANDED.json', JSON.stringify(result, null, 2));
  console.log(`\nSaved ${result.length} UPCs to scripts/ALL_UPCS_EXPANDED.json`);
  
  // 7. Save log with unknown abbreviations
  saveLog();
  
  // 8. Show statistics
  console.log('\n=== STATISTICS ===');
  const bySource = {};
  const byBrand = {};
  result.forEach(u => {
    bySource[u.source] = (bySource[u.source] || 0) + 1;
    byBrand[u.brand] = (byBrand[u.brand] || 0) + 1;
  });
  
  console.log('\nBy source:');
  Object.entries(bySource).forEach(([s, c]) => console.log(`  ${s}: ${c}`));
  
  console.log('\nTop brands:');
  Object.entries(byBrand)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([b, c]) => console.log(`  ${b}: ${c}`));
  
  // 9. Show unknown abbreviations found
  console.log('\n=== UNKNOWN ABBREVIATIONS (potential mappings needed) ===');
  const unknowns = Object.entries(abbreviationLog.unknown)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 30);
  
  unknowns.forEach(([abbr, data]) => {
    console.log(`\n${abbr} (${data.count}x):`);
    data.contexts.slice(0, 2).forEach(ctx => console.log(`  - ${ctx}`));
  });
  
  console.log('\n=== EXAMPLES OF EXPANDED NAMES ===');
  result.slice(0, 20).forEach(u => {
    console.log(`Original: ${u.name}`);
    console.log(`Expanded: ${u.name_expanded}`);
    console.log(`Brand: ${u.brand}`);
    console.log('');
  });
}

main().catch(console.error);
// Additional brand prefixes discovered:
// HIK → Hikari
// ATP → Aquatop
// WWI → World Wide Imports (aquarium gravel brand)
// SLI → Seachem (Flourite is a Seachem substrate)
// KMP → Kaytee (bird food)
// ETH → Ethical Pet
// ZML → Zoo Med Labs
// FAS → Fashion Pet
// PTS → Petmate/Pets International
// MPF → Monster Pet Food
// IAM → Iams
