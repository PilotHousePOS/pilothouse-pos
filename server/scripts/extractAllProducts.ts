// @ts-nocheck
import * as fs from 'fs';

// Brand code to full brand name - comprehensive list
const BRAND_CODES: Record<string, string> = {
  'API': 'API', 'AGA': 'Aqueon', 'AQE': 'Aqueon', 'AQA': 'Aqueon',
  'TET': 'Tetra', 'HIK': 'Hikari', 'FLU': 'Fluval', 'MAR': 'Marineland',
  'ZOO': 'Zoo Med', 'ZML': 'Zoo Med', 'EXO': 'Exo Terra', 'ZIL': 'Zilla',
  'FLK': 'Fluker', 'SEC': 'SeaChem', 'SLI': 'SeaChem', 'OMG': 'Omega One',
  'NLS': 'New Life Spectrum', 'CLI': 'Carib Sea', 'CBS': 'Carib Sea',
  'WWI': 'Worldwide', 'SIC': 'Sicce', 'ATP': 'Aquatop', 'WEC': 'Weco',
  'GBE': 'GloFish', 'KAY': 'Kaytee', 'OXB': 'Oxbow', 'ZUP': 'ZuPreem',
  'MFP': 'Marshall', 'LAF': 'Lafeber', 'AEC': 'AE Cage', 'VIT': 'Vitakraft',
  'SUN': 'Sunseed', 'INS': 'Arm & Hammer', 'CND': 'Arm & Hammer',
  'ARM': 'Arm & Hammer', 'GRE': 'Greenies', 'ELA': 'Elanco', 'FAR': 'Farnam',
  'INV': 'Vetoquinol', 'BDL': 'Bayer', 'GAR': 'NaturVet', 'DOS': 'Petmate',
  'FOU': 'Four Paws', 'SMO': 'Smokehouse', 'ETH': 'Ethical Pet',
  'LOV': 'Loving Pets', 'MAG': 'Mag-Float', 'KON': 'Kong', 'NYL': 'Nylabone',
  'JWP': 'JW Pet', 'PET': 'Petmate', 'BLU': 'Blue Buffalo', 'ROY': 'Royal Canin',
  'SCI': 'Science Diet', 'PRO': 'Pro Plan', 'PUR': 'Purina', 'PED': 'Pedigree',
  'IAM': 'Iams', 'NUT': 'Nutrisource', 'TAS': 'Taste of the Wild',
  'WEL': 'Wellness', 'FRO': 'Fromm', 'DIA': 'Diamond', 'VIC': 'Victor',
  'NUL': 'Nulo', 'MER': 'Merrick', 'CAN': 'Canidae', 'ORI': 'Orijen',
  'ACA': 'Acana', 'NAT': 'Natural Balance', 'EAR': 'Earthborn',
  'RAC': 'Rachael Ray', 'CES': 'Cesar', 'FAN': 'Fancy Feast', 'FRI': 'Friskies',
  'MEO': 'Meow Mix', 'TDY': 'Tidy Cats', 'PRE': 'Prevue', 'LIV': 'Living World',
  'TRO': 'Tropiclean', 'FCF': 'Cadet', 'IMS': 'IMS', 'LEN': 'Lennox',
  'MUL': 'Multipet', 'RBP': 'Redbarn', 'NZP': 'Natural Chemistry',
  'NOV': 'Novelty', 'PTS': 'Pet Supply', 'PP': 'Penn Plax', 'CST': 'Coastal',
  'BRK': 'Bark', 'SPC': 'Spot', 'SPT': 'Spot', 'HGN': 'Hagen',
  'AQM': 'Aquarium', 'FNT': 'Fontana', 'HSP': 'HS Aqua', 'SKY': 'Sky Pet',
  'ROC': 'Rolf C Hagen', 'TOP': 'Top Fin', 'MRC': 'Marineland',
  'GRR': 'Grrrr', 'BOS': 'Bos', 'PEN': 'Penn Plax', 'ZON': 'Zoner',
  'PEP': 'Pepper', 'ASP': 'Aspen', 'CAR': 'Carefresh', 'LIX': 'Lixit',
  'SUP': 'SuperPet', 'HAB': 'Habitrail', 'RAG': 'Ragno', 'BIO': 'Bio',
  'COA': 'Coastal', 'CSTL': 'Coastal', 'BEN': 'Benebone', 'BTE': 'Benebone',
  'BB': 'Blue Buffalo', 'MPF': 'Marshall', 'NBP': 'National Pet',
  'KMP': 'Komplex', 'PRML': 'Primal', 'MAM': 'Mammoth', 'KOM': 'Komodo',
  'SPF': 'Spectrastone', 'VAN': 'Van Ness', 'FAS': 'FastCat',
  'RAD': 'Ideal', 'WEC': 'Weco', 'IMS': 'IMS Trading', 'LEN': 'Lennox',
  'CPN': 'Coupon', 'VPN': 'Vendor', 'HIGG': 'Higgins', 'HLP': 'Help',
  'KONG': 'Kong', 'CAT': 'Cat', 'DOG': 'Dog', 'WP': 'Wild Pet',
  'ZST': 'ZooStar', 'ANM': 'Animal', 'PMP': 'Pump', 'LMP': 'Lamp',
  'SPL': 'Special', 'NTR': 'Nature', 'WLD': 'Wild', 'PRM': 'Premium',
  'BSC': 'Basic', 'DLX': 'Deluxe', 'PRF': 'Professional', 'CPF': 'Cascade',
  'CAS': 'Cascade', 'TRU': 'True', 'ZFC': 'ZooFari', 'PER': 'Perle',
  'ADV': 'Advantage', 'FRT': 'Frontline', 'SER': 'Seresto', 'NXG': 'NexGard',
  'SMP': 'Simple', 'CLN': 'Clean', 'FRS': 'Fresh', 'BRT': 'Bright',
  'GLD': 'Gold', 'SLV': 'Silver', 'PLT': 'Platinum', 'DLT': 'Delta',
  'ALF': 'Alfalfa', 'TMY': 'Timothy', 'HAY': 'Hay', 'PLN': 'Plain',
  'FLV': 'Flavor', 'ORG': 'Organic', 'ALL': 'All', 'ONE': 'One',
  'TWO': 'Two', 'BX': 'Box', 'BG': 'Bag', 'BTL': 'Bottle', 'JR': 'Jar'
};

// Lines that are NOT product descriptions (headers, addresses, etc.)
const SKIP_PATTERNS = [
  /^WEST\s/i, /^SHIP\s/i, /^BILL\s/i, /^LINE\s/i, /^PAGE\s/i,
  /^OUR\s/i, /^PO\s+BOX/i, /ANIMAL HOUSE/i, /CYPRESS ST/i,
  /CENTRAL PET/i, /DALLAS/i, /PHONE/i, /FAX/i, /INVOICE/i,
  /ORDER/i, /DATE/i, /REMIT/i, /PAYMENT/i, /TERMS/i, /COD/i,
  /REPRINT/i, /CONTINUED/i, /WRITTEN/i, /CUSTOMER/i, /EXTENDED/i,
  /NET\s*$/i, /WEB\s*$/i, /DESCRIPTION\s*$/i, /UPC\s*$/i
];

// Word abbreviation expansions
const WORD_EXPANSIONS: Record<string, string> = {
  'COND': 'conditioner', 'SPLMT': 'supplement', 'TRTMNT': 'treatment',
  'RMDY': 'remedy', 'MED': 'medication', 'FOOD': 'food', 'TRT': 'treat',
  'TOY': 'toy', 'ORNMT': 'ornament', 'DECOR': 'decoration',
  'SHMP': 'shampoo', 'DEOD': 'deodorizer', 'CLNR': 'cleaner', 'LTTR': 'litter',
  'WTR': 'water', 'TAP': 'tap', 'STRSS': 'stress', 'STRS': 'stress',
  'COAT': 'coat', 'AQUA': 'aquarium', 'ESNTL': 'essential',
  'ALGAE': 'algae', 'SCRPR': 'scraper', 'CRTRDG': 'cartridge',
  'FLTR': 'filter', 'PMP': 'pump', 'PWRHD': 'powerhead',
  'GRVL': 'gravel', 'VAC': 'vacuum', 'THRMTR': 'thermometer',
  'HYGRMTR': 'hygrometer', 'AQRM': 'aquarium', 'FSH': 'fish',
  'BETTA': 'betta', 'GLDFS': 'goldfish', 'CCHLD': 'cichlid',
  'TRPCL': 'tropical', 'GRNLS': 'granules', 'PLTS': 'pellets',
  'FLK': 'flakes', 'WFRS': 'wafers', 'SHRMP': 'shrimp',
  'BRNE': 'brine', 'FROZ': 'frozen', 'FD': 'freeze dried',
  'ICH': 'ich', 'CLR': 'clear', 'STRT': 'start',
  'AMMO': 'ammonia', 'SALT': 'salt', 'ROOT': 'root',
  'TABS': 'tablets', 'STRP': 'strips', 'TEST': 'test', 'KIT': 'kit',
  'MSTR': 'master', 'FW': 'freshwater', 'SW': 'saltwater', 'PH': 'ph',
  'NITRT': 'nitrate', 'CRBN': 'carbon', 'ACTIVTD': 'activated',
  'SPONGE': 'sponge', 'RPTL': 'reptile', 'TERRM': 'terrarium',
  'BEDNG': 'bedding', 'CRSTD': 'crested', 'GECKO': 'gecko',
  'DRGN': 'dragon', 'BRD': 'bearded', 'WTRMLN': 'watermelon',
  'UVB': 'uvb', 'HOOD': 'hood', 'CALCI': 'calcium', 'CAL': 'calcium',
  'CT': 'cat', 'K9': 'dog', 'DOG': 'dog', 'PUP': 'puppy',
  'PRRT': 'parrot', 'TIEL': 'cockatiel', 'GPIG': 'guinea pig',
  'RBBT': 'rabbit', 'HAM': 'hamster', 'SA': 'small animal',
  'HRBL': 'herbal', 'HRTS': 'hearts', 'VEG': 'vegetable',
  'BAN': 'banana', 'STRWBRRY': 'strawberry', 'GMA': 'grandma',
  'SM': 'small', 'MD': 'medium', 'LG': 'large', 'XL': 'extra large',
  'MINI': 'mini', 'JMB': 'jumbo', 'ASST': 'assorted',
  'BK': 'black', 'BL': 'blue', 'CL': 'clear', 'WT': 'white',
  'GRN': 'green', 'RD': 'red', 'PNK': 'pink', 'SIL': 'silicone',
  'SPRY': 'spray', 'LTX': 'latex', 'AN': 'animal',
  'MNSTRS': 'monsters', 'SQKR': 'squeaker', 'NAT': 'natural',
  'SOOTHING': 'soothing', 'BRY': 'berry', 'BREEZE': 'breeze',
  'WTRLSS': 'waterless', 'DEEP': 'deep', 'CLN': 'clean',
  'HI': 'high', 'SLMN': 'salmon', 'BF': 'beef', 'CHKN': 'chicken',
  'SWPOT': 'sweet potato', 'HCKRY': 'hickory', 'CHS': 'cheese',
  'PILLP': 'pill pocket', 'DNTL': 'dental', 'ORIG': 'original',
  'RWHD': 'rawhide', 'RTRVR': 'retriever', 'BULLY': 'bully',
  'STC': 'stick', 'SLICES': 'slices', 'VAN': 'vanilla',
  'MITE': 'mite', 'TRPL': 'triple', 'ACTN': 'action',
  'ANTIMIC': 'antimicrobial', 'EYE': 'eye', 'GEL': 'gel',
  'EAR': 'ear', 'WASH': 'wash', 'DROPS': 'drops',
  'MELATONIN': 'melatonin', 'QUIET': 'quiet', 'MOMENT': 'moment',
  'PWD': 'powder', 'SFT': 'soft', 'ADVNTG': 'advantage',
  'ADVNTX': 'advantix', 'FUR': 'fur', 'MICE': 'mice',
  'HIDE': 'hide', 'ROLL': 'roll', 'TWST': 'twist',
  'ALOE': 'aloe', 'COCONUT': 'coconut', 'HOME': 'home',
  'CRICKET': 'cricket', 'QUENCHER': 'quencher',
  'REPTO': 'reptile', 'MUNCHIE': 'munchie', 'KIDNEY': 'kidney',
  'CERAMIC': 'ceramic', 'SHED': 'shed', 'EASE': 'ease',
  'CREATURE': 'creature', 'JELLY': 'jelly', 'CUP': 'cup',
  'BANQUET': 'banquet', 'BEETLES': 'beetles', 'REPTI': 'reptile',
  'ECO': 'eco', 'EARTH': 'earth', 'BTTL': 'bottle',
  'DRIPLESS': 'dripless', 'VITADROP': 'vitadrop', 'WET': 'wet',
  'TAIL': 'tail', 'WHEEL': 'wheel', 'MOUSE': 'mouse',
  'PATCH': 'patch', 'CLEARWATER': 'clearwater', 'SKUNK': 'skunk',
  'ODOR': 'odor', 'CLBRTN': 'celebration', 'CUPCAKE': 'cupcake',
  'SMAKER': 'treat', 'SND': 'sand', 'MARN': 'marine',
  'REEF': 'reef', 'WH': 'white', 'BACTO': 'bacterial',
  'SURGE': 'surge', 'FOAM': 'foam', 'INTRNL': 'internal',
  'UV': 'uv', 'MFLOW': 'maxflow', 'LAGOON': 'lagoon',
  'POLISH': 'polish', 'MAGNUM': 'magnum', 'MAXI': 'maxi',
  'JET': 'jet', 'PRIME': 'prime', 'FLOURISH': 'flourish',
  'STRESSGUARD': 'stressguard', 'POLYGUARD': 'polyguard',
  'TETRAMIN': 'tetramin', 'TETRACCHLD': 'tetra cichlid',
  'TETRAFIN': 'tetrafin', 'TETRA': 'tetra', 'REPTOMIN': 'reptomin',
  'PRO': 'pro', 'CRISPS': 'crisps', 'PLUS': 'plus',
  'ANTIMIC': 'antimicrobial', 'TUNDRA': 'tundra',
  'ALFALFA': 'alfalfa', 'HAY': 'hay', 'GRMT': 'gourmet',
  'GRNL': 'granules', 'SHRT': 'short', 'VIBRANCE': 'vibrance',
  'NTH': 'nothing', 'SLMN': 'salmon', 'NORD': 'nordic',
  'SGL': 'single', 'DBL': 'double', 'BOWL': 'bowl',
  'DISH': 'dish', 'FEEDER': 'feeder', 'FDR': 'feeder',
  'HTR': 'heater', 'LGT': 'light', 'BULB': 'bulb',
  'LAMP': 'lamp', 'FIXTURE': 'fixture', 'BALLAST': 'ballast',
  'CANOPY': 'canopy', 'STAND': 'stand', 'TANK': 'tank',
  'KIT': 'kit', 'SET': 'set', 'COMBO': 'combo',
  'STARTER': 'starter', 'COMPLETE': 'complete', 'DELUXE': 'deluxe',
  'PREMIUM': 'premium', 'BASIC': 'basic', 'MINI': 'mini',
  'NANO': 'nano', 'XS': 'extra small', 'XSML': 'extra small',
  'XXL': 'extra extra large', 'XXLG': 'extra extra large',
  'GLD': 'gold', 'GLDFSH': 'goldfish', 'KOI': 'koi',
  'BTRFLY': 'butterfly', 'SNAIL': 'snail', 'HERMIT': 'hermit',
  'CRAB': 'crab', 'FROG': 'frog', 'TURTLE': 'turtle',
  'TORTOISE': 'tortoise', 'SNAKE': 'snake', 'LIZARD': 'lizard',
  'IGUANA': 'iguana', 'CHAMELEON': 'chameleon', 'BALL': 'ball',
  'PYTHON': 'python', 'BOA': 'boa', 'CORN': 'corn',
  'KING': 'king', 'MILK': 'milk', 'RAT': 'rat',
  'MOUSE': 'mouse', 'HAMSTER': 'hamster', 'GERBIL': 'gerbil',
  'GUINEA': 'guinea', 'PIG': 'pig', 'RABBIT': 'rabbit',
  'FERRET': 'ferret', 'CHINCHILLA': 'chinchilla', 'HEDGEHOG': 'hedgehog',
  'BIRD': 'bird', 'PARROT': 'parrot', 'PARAKEET': 'parakeet',
  'BUDGIE': 'budgie', 'COCKATIEL': 'cockatiel', 'FINCH': 'finch',
  'CANARY': 'canary', 'LOVEBIRD': 'lovebird', 'CONURE': 'conure',
  'MACAW': 'macaw', 'COCKATOO': 'cockatoo', 'AFRICAN': 'african',
  'GREY': 'grey', 'GRAY': 'gray', 'AMAZON': 'amazon',
  'ECLECTUS': 'eclectus', 'QUAKER': 'quaker', 'SENEGAL': 'senegal',
  'CAIQUE': 'caique', 'PIONUS': 'pionus', 'RINGNECK': 'ringneck',
  'DUBIA': 'dubia', 'ROACH': 'roach', 'WORM': 'worm',
  'MEALWORM': 'mealworm', 'SUPERWORM': 'superworm', 'WAX': 'wax',
  'HORNWORM': 'hornworm', 'BUTTERWORM': 'butterworm',
  'PHOENIX': 'phoenix', 'SILKWORM': 'silkworm', 'BLOODWORM': 'bloodworm',
  'TUBIFEX': 'tubifex', 'DAPHNIA': 'daphnia', 'ROTIFER': 'rotifer',
  'ARTEMIA': 'artemia', 'COPEPOD': 'copepod', 'SPIRULINA': 'spirulina'
};

// Size units normalization
const SIZE_UNITS: Record<string, string> = {
  'OZ': 'oz', 'LB': 'lb', 'LBS': 'lb', 'GM': 'g', 'G': 'g',
  'ML': 'ml', 'L': 'l', 'GAL': 'gal', 'CT': 'ct', 'PK': 'pk',
  'IN': 'in', 'FT': 'ft', '"': 'in', "'": 'ft'
};

interface ExtractedProduct {
  productNumber: string;
  upc: string;
  description: string;
  expandedDesc: string;
  brand: string;
}

function expandDescription(desc: string): string {
  let expanded = desc;
  
  // Get brand from first word
  const words = desc.split(/\s+/);
  if (words.length > 0 && BRAND_CODES[words[0]]) {
    expanded = BRAND_CODES[words[0]] + ' ' + words.slice(1).join(' ');
  }
  
  // Expand abbreviations
  for (const [abbr, full] of Object.entries(WORD_EXPANSIONS)) {
    const pattern = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(pattern, full);
  }
  
  // Normalize sizes
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*(OZ|LB|LBS|GM|G|ML|L|GAL|CT|PK|IN|FT)/gi, 
    (_, num, unit) => `${num} ${SIZE_UNITS[unit.toUpperCase()] || unit.toLowerCase()}`);
  
  return expanded.toLowerCase();
}

function extractProducts(): ExtractedProduct[] {
  console.log('Reading invoice text...');
  const text = fs.readFileSync('/tmp/all_invoice_text.txt', 'utf-8');
  
  // Extract all product numbers (8 digits)
  const productNumbers = [...new Set(text.match(/^[0-9]{8}$/gm) || [])];
  console.log(`Found ${productNumbers.length} unique product numbers`);
  
  // Extract all UPCs (12-14 digits)
  const upcs = [...new Set(text.match(/^[0-9]{12,14}$/gm) || [])];
  console.log(`Found ${upcs.length} unique UPCs`);
  
  // Extract all descriptions (brand code at start)
  const descPattern = /^([A-Z]{2,4})\s+([A-Z0-9\/\s\.\-\'\"\(\)]+)$/gm;
  const descriptions: {brand: string, desc: string}[] = [];
  let match;
  while ((match = descPattern.exec(text)) !== null) {
    if (BRAND_CODES[match[1]]) {
      descriptions.push({
        brand: match[1],
        desc: match[0].trim()
      });
    }
  }
  console.log(`Found ${descriptions.length} product descriptions`);
  
  // Create a map: for each page section, correlate product numbers, descriptions, UPCs
  // The invoice structure shows them in parallel columns within each page
  
  // Split by page markers or invoice headers
  const pages = text.split(/PAGE:|INVOICE NO:|CENTRAL PET DALLAS/);
  
  const products: ExtractedProduct[] = [];
  const seenUPCs = new Set<string>();
  
  for (const page of pages) {
    const lines = page.split('\n').map(l => l.trim()).filter(l => l);
    
    // Find product numbers, UPCs, and descriptions on this page
    const pageProductNums: string[] = [];
    const pageUPCs: string[] = [];
    const pageDescs: {brand: string, desc: string}[] = [];
    
    for (const line of lines) {
      if (/^[0-9]{8}$/.test(line)) {
        pageProductNums.push(line);
      } else if (/^[0-9]{12,14}$/.test(line)) {
        pageUPCs.push(line);
      } else {
        const descMatch = line.match(/^([A-Z]{2,4})\s+([A-Z0-9\/\s\.\-\'\"\(\)]+)$/);
        if (descMatch && BRAND_CODES[descMatch[1]]) {
          pageDescs.push({ brand: descMatch[1], desc: line });
        }
      }
    }
    
    // Match by position - product numbers and descriptions usually align
    // UPCs might be in different order but often correlate 1:1
    const minLen = Math.min(pageProductNums.length, pageDescs.length, pageUPCs.length);
    
    for (let i = 0; i < minLen; i++) {
      const upc = pageUPCs[i];
      if (seenUPCs.has(upc)) continue;
      
      const prod = {
        productNumber: pageProductNums[i],
        upc: upc,
        description: pageDescs[i].desc,
        expandedDesc: expandDescription(pageDescs[i].desc),
        brand: BRAND_CODES[pageDescs[i].brand]
      };
      
      products.push(prod);
      seenUPCs.add(upc);
    }
  }
  
  console.log(`Extracted ${products.length} products with UPCs`);
  return products;
}

// Run extraction
const products = extractProducts();

// Save to JSON for matching
fs.writeFileSync('/tmp/all_extracted_products.json', JSON.stringify(products, null, 2));
console.log('Saved to /tmp/all_extracted_products.json');

// Show sample
console.log('\nSample products:');
for (const p of products.slice(0, 20)) {
  console.log(`${p.upc}: ${p.description} -> ${p.expandedDesc}`);
}
