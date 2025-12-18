import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, and, isNull, ilike, or, sql } from 'drizzle-orm';
import * as fs from 'fs';

// Comprehensive brand code mappings
const BRAND_CODES: Record<string, string> = {
  'API': 'API', 'AGA': 'Aqueon', 'AQE': 'Aqueon', 'AQA': 'Aqueon',
  'TET': 'Tetra', 'HIK': 'Hikari', 'FLU': 'Fluval', 'MAR': 'Marineland',
  'ZOO': 'Zoo Med', 'ZML': 'Zoo Med', 'EXO': 'Exo Terra', 'ZIL': 'Zilla',
  'FLK': 'Fluker', 'SEC': 'SeaChem', 'SLI': 'SeaChem', 'OMG': 'Omega One',
  'NLS': 'New Life Spectrum', 'CLI': 'Carib Sea', 'WWI': 'Worldwide',
  'SIC': 'Sicce', 'ATP': 'Aquatop', 'WEC': 'Weco', 'GBE': 'GloFish',
  'KAY': 'Kaytee', 'OXB': 'Oxbow', 'ZUP': 'ZuPreem', 'MFP': 'Marshall',
  'LAF': 'Lafeber', 'AEC': 'AE Cage', 'VIT': 'Vitakraft', 'SUN': 'Sunseed',
  'INS': 'Arm & Hammer', 'CND': 'Arm & Hammer', 'ARM': 'Arm & Hammer',
  'GRE': 'Greenies', 'ELA': 'Elanco', 'FAR': 'Farnam', 'INV': 'Vetoquinol',
  'BDL': 'Bayer', 'GAR': 'NaturVet', 'DOS': 'Petmate', 'FOU': 'Four Paws',
  'SMO': 'Smokehouse', 'ETH': 'Ethical Pet', 'LOV': 'Loving Pets',
  'MAG': 'Mag-Float', 'KON': 'Kong', 'NYL': 'Nylabone', 'JWP': 'JW Pet',
  'PET': 'Petmate', 'BLU': 'Blue Buffalo', 'ROY': 'Royal Canin',
  'SCI': 'Science Diet', 'PRO': 'Pro Plan', 'PUR': 'Purina',
  'PED': 'Pedigree', 'IAM': 'Iams', 'NUT': 'Nutrisource',
  'TAS': 'Taste of the Wild', 'WEL': 'Wellness', 'FRO': 'Fromm',
  'DIA': 'Diamond', 'VIC': 'Victor', 'NUL': 'Nulo', 'MER': 'Merrick',
  'CAN': 'Canidae', 'ORI': 'Orijen', 'ACA': 'Acana', 'NAT': 'Natural Balance',
  'EAR': 'Earthborn', 'RAC': 'Rachael Ray', 'CES': 'Cesar',
  'FAN': 'Fancy Feast', 'FRI': 'Friskies', 'MEO': 'Meow Mix',
  'TDY': 'Tidy Cats', 'PRE': 'Prevue', 'LIV': 'Living World',
  'TRO': 'Tropiclean', 'FCF': 'Cadet', 'IMS': 'IMS', 'LEN': 'Lennox',
  'MUL': 'Multipet', 'RBP': 'Redbarn', 'NZP': 'Natural Chemistry',
  'NOV': 'Novelty', 'PTS': 'Pet Supply', 'PP': 'Penn Plax',
  'CST': 'Coastal', 'BRK': 'Bark', 'SPC': 'Spot', 'SPT': 'Spot',
  'HGN': 'Hagen', 'AQM': 'Aquarium', 'FNT': 'Fontana', 'CBS': 'Carib Sea',
  'HSP': 'HS Aqua', 'SKY': 'Sky Pet', 'ROC': 'Rolf C Hagen'
};

// Comprehensive word abbreviation expansions
const WORD_EXPANSIONS: Record<string, string[]> = {
  // Product types
  'COND': ['conditioner', 'conditioning'], 'SPLMT': ['supplement'],
  'TRTMNT': ['treatment'], 'RMDY': ['remedy'], 'MED': ['medication', 'medicine'],
  'FOOD': ['food'], 'TRT': ['treat', 'treats'], 'TOY': ['toy', 'toys'],
  'ORNMT': ['ornament'], 'DECOR': ['decoration', 'decor'],
  'SHMP': ['shampoo'], 'DEOD': ['deodorant', 'deodorizer'],
  'CLNR': ['cleaner', 'clean'], 'LTTR': ['litter'],
  
  // Aquarium words
  'WTR': ['water'], 'TAP': ['tap'], 'STRSS': ['stress'], 'STRS': ['stress'],
  'COAT': ['coat'], 'AQUA': ['aqua', 'aquarium'], 'ESNTL': ['essential'],
  'ALGAE': ['algae'], 'SCRPR': ['scraper'], 'CRTRDG': ['cartridge'],
  'FLTR': ['filter'], 'PMP': ['pump'], 'PWRHD': ['powerhead'],
  'GRVL': ['gravel'], 'VAC': ['vac', 'vacuum'], 'THRMTR': ['thermometer'],
  'HYGRMTR': ['hygrometer'], 'AQRM': ['aquarium'], 'FSH': ['fish'],
  'BETTA': ['betta'], 'GLDFS': ['goldfish'], 'CCHLD': ['cichlid'],
  'TRPCL': ['tropical'], 'GRNLS': ['granules'], 'PLTS': ['pellets'],
  'FLK': ['flakes'], 'WFRS': ['wafers'], 'SHRMP': ['shrimp'],
  'BRNE': ['brine'], 'FROZ': ['frozen', 'freeze dried'], 'FD': ['freeze dried'],
  'ICH': ['ich', 'ick'], 'CLR': ['clear'], 'STRT': ['start'],
  'AMMO': ['ammonia'], 'SALT': ['salt'], 'ROOT': ['root'],
  'TABS': ['tabs', 'tablets'], 'STRP': ['strip', 'strips'],
  'TEST': ['test'], 'KIT': ['kit'], 'MSTR': ['master'],
  'FW': ['freshwater'], 'SW': ['saltwater'], 'PH': ['ph'],
  'NITRT': ['nitrate', 'nitrite'], 'CRBN': ['carbon'],
  'ACTIVTD': ['activated'], 'SPONGE': ['sponge'],
  
  // Reptile words
  'RPTL': ['reptile', 'reptiles'], 'TERRM': ['terrarium'],
  'BEDNG': ['bedding'], 'CRSTD': ['crested'], 'GECKO': ['gecko'],
  'DRGN': ['dragon'], 'BRD': ['bearded'], 'WTRMLN': ['watermelon'],
  'UVB': ['uvb'], 'HOOD': ['hood'], 'CALCI': ['calcium'], 'CAL': ['calcium'],
  
  // Pet words
  'CT': ['cat'], 'K9': ['canine', 'dog'], 'DOG': ['dog'],
  'PUP': ['puppy'], 'PRRT': ['parrot'], 'TIEL': ['cockatiel'],
  'GPIG': ['guinea pig'], 'RBBT': ['rabbit'], 'HAM': ['hamster'],
  'SA': ['small animal'], 'HRBL': ['herbal'], 'HRTS': ['hearts'],
  'VEG': ['vegetable', 'veggie'], 'BAN': ['banana'],
  'STRWBRRY': ['strawberry'], 'GMA': ['grandma'],
  
  // Sizes
  'SM': ['small'], 'MD': ['medium'], 'LG': ['large'], 'XL': ['extra large'],
  'MINI': ['mini'], 'JMB': ['jumbo'],
  
  // Misc
  'ASST': ['assorted'], 'BK': ['black'], 'BL': ['blue'], 'CL': ['clear'],
  'WT': ['white'], 'GRN': ['green'], 'RD': ['red'], 'PNK': ['pink'],
  'SIL': ['silicone', 'silver'], 'SPRY': ['spray'],
  'LTX': ['latex'], 'AN': ['animal'], 'MNSTRS': ['monsters'],
  'SQKR': ['squeaker'], 'NAT': ['natural'], 'SOOTHING': ['soothing'],
  'BRY': ['berry'], 'BREEZE': ['breeze'], 'WTRLSS': ['waterless'],
  'DEEP': ['deep'], 'CLN': ['clean'], 'HI': ['high'], 'SLMN': ['salmon'],
  'BF': ['beef'], 'CHKN': ['chicken'], 'SWPOT': ['sweet potato'],
  'HCKRY': ['hickory'], 'CHS': ['cheese'], 'PILLP': ['pill pocket'],
  'DNTL': ['dental'], 'ORIG': ['original'], 'RWHD': ['rawhide'],
  'RTRVR': ['retriever'], 'BULLY': ['bully'], 'STC': ['stick'],
  'SLICES': ['slices'], 'VAN': ['vanilla'],
  'MITE': ['mite'], 'TRPL': ['triple'], 'ACTN': ['action'],
  'ANTIMIC': ['antimicrobial'], 'EYE': ['eye'], 'GEL': ['gel'],
  'EAR': ['ear'], 'WASH': ['wash'], 'DROPS': ['drops'],
  'MELATONIN': ['melatonin'], 'QUIET': ['quiet'], 'MOMENT': ['moment'],
  'PWD': ['powder'], 'SFT': ['soft'], 'ADVNTG': ['advantage'],
  'ADVNTX': ['advantix'], 'FUR': ['fur'], 'MICE': ['mice'],
  'HIDE': ['hide'], 'ROLL': ['roll'], 'TWST': ['twist'],
  'ALOE': ['aloe'], 'COCONUT': ['coconut'], 'HOME': ['home'],
  'CRICKET': ['cricket'], 'QUENCHER': ['quencher'],
  'REPTO': ['repto', 'reptile'], 'MUNCHIE': ['munchie'],
  'KIDNEY': ['kidney'], 'CERAMIC': ['ceramic'], 'SHED': ['shed'],
  'EASE': ['ease'], 'CREATURE': ['creature'], 'JELLY': ['jelly'],
  'CUP': ['cup'], 'BANQUET': ['banquet'], 'BEETLES': ['beetles'],
  'REPTI': ['repti', 'reptile'], 'ECO': ['eco'], 'EARTH': ['earth'],
  'BTTL': ['bottle'], 'DRIPLESS': ['dripless'], 'VITADROP': ['vitadrop'],
  'WET': ['wet'], 'TAIL': ['tail'], 'WHEEL': ['wheel'],
  'MOUSE': ['mouse'], 'PATCH': ['patch'], 'CLEARWATER': ['clearwater'],
  'SKUNK': ['skunk'], 'ODOR': ['odor'], 'CLBRTN': ['celebration'],
  'CUPCAKE': ['cupcake'], 'SMAKER': ['salt maker', 'treat']
};

// Size pattern normalizations
const SIZE_PATTERNS: Record<string, string[]> = {
  'OZ': ['oz', 'ounce', 'ounces'],
  'LB': ['lb', 'lbs', 'pound', 'pounds'],
  'GM': ['gm', 'g', 'gram', 'grams'],
  'ML': ['ml', 'milliliter'],
  'CT': ['ct', 'count', 'pk', 'pack'],
  'PK': ['pk', 'pack', 'count'],
  'IN': ['in', 'inch', '"'],
  'FT': ['ft', 'feet', "'"]
};

interface InvoiceProduct {
  productNumber: string;
  upc: string;
  description: string;
  expandedDescription: string;
  brand: string;
}

// Extract UPC patterns - 12-13 digits
function isValidUPC(str: string): boolean {
  return /^[0-9]{12,14}$/.test(str.trim());
}

// Parse Central Pet format invoices
function parseCentralPetInvoices(text: string): InvoiceProduct[] {
  const products: InvoiceProduct[] = [];
  const lines = text.split('\n');
  
  // Pattern for product descriptions like "API COND WTR TAP 4OZ"
  const descPattern = /^([A-Z]{2,4})\s+([A-Z][A-Z0-9\/\s\.\-]+(?:[0-9]+(?:OZ|LB|GM|ML|CT|PK|IN|FT|GAL))?)\s*$/;
  
  // Extract products with product numbers and find corresponding UPCs
  let currentProducts: {number: string; desc: string}[] = [];
  let currentUPCs: string[] = [];
  let inProductSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Check if this is a UPC
    if (isValidUPC(line)) {
      currentUPCs.push(line);
      continue;
    }
    
    // Check for product number format like "85036020"
    if (/^[0-9]{8}$/.test(line)) {
      inProductSection = true;
      continue;
    }
    
    // Check for product description
    const descMatch = line.match(descPattern);
    if (descMatch) {
      const brandCode = descMatch[1];
      const restOfDesc = descMatch[2];
      
      if (BRAND_CODES[brandCode]) {
        currentProducts.push({
          number: '',
          desc: line
        });
      }
    }
  }
  
  // Now scan more carefully for product-UPC associations
  // Look for lines that have format: description followed by UPC nearby
  const productDescPattern = /^([A-Z]{2,4})\s+([A-Z][A-Z0-9\/\s\.\-\']+)$/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(productDescPattern);
    
    if (match) {
      const brandCode = match[1];
      if (BRAND_CODES[brandCode]) {
        // Look for UPC within next 10 lines
        for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (isValidUPC(nextLine)) {
            const fullDesc = line;
            const expanded = expandDescription(fullDesc);
            products.push({
              productNumber: '',
              upc: nextLine,
              description: fullDesc,
              expandedDescription: expanded,
              brand: BRAND_CODES[brandCode]
            });
            break;
          }
        }
      }
    }
  }
  
  return products;
}

// Parse Penn-Plax format
function parsePennPlaxInvoices(text: string): InvoiceProduct[] {
  const products: InvoiceProduct[] = [];
  
  // Penn-Plax format: SKU | Description | UPC
  const pattern = /([A-Z0-9\-]+)\s+(.+?)\s+(\d{12,14})/g;
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    const [, sku, desc, upc] = match;
    products.push({
      productNumber: sku,
      upc: upc,
      description: desc.trim(),
      expandedDescription: desc.trim().toLowerCase(),
      brand: ''
    });
  }
  
  return products;
}

// Expand abbreviated description to full words
function expandDescription(abbrevDesc: string): string {
  let expanded = abbrevDesc.toLowerCase();
  
  // Expand brand code first
  const words = abbrevDesc.split(/\s+/);
  if (words.length > 0 && BRAND_CODES[words[0]]) {
    const brand = BRAND_CODES[words[0]].toLowerCase();
    expanded = brand + ' ' + words.slice(1).join(' ').toLowerCase();
  }
  
  // Expand word abbreviations
  for (const [abbrev, expansions] of Object.entries(WORD_EXPANSIONS)) {
    const pattern = new RegExp(`\\b${abbrev}\\b`, 'gi');
    if (pattern.test(expanded)) {
      expanded = expanded.replace(pattern, expansions[0]);
    }
  }
  
  // Handle size patterns
  for (const [sizeAbbr, expansions] of Object.entries(SIZE_PATTERNS)) {
    // Match sizes like "4OZ", "16OZ", "8.8OZ"
    const pattern = new RegExp(`([0-9.]+)${sizeAbbr}\\b`, 'gi');
    expanded = expanded.replace(pattern, `$1 ${expansions[0]}`);
  }
  
  return expanded.trim();
}

// Normalize a product name for matching
function normalizeForMatching(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract key tokens from a product name
function extractTokens(name: string): Set<string> {
  const normalized = normalizeForMatching(name);
  const words = normalized.split(' ').filter(w => w.length > 1);
  return new Set(words);
}

// Calculate token similarity
function tokenSimilarity(tokens1: Set<string>, tokens2: Set<string>): number {
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  return intersection.size / union.size;
}

// Check if product name contains essential tokens
function containsEssentialTokens(dbName: string, invoiceTokens: Set<string>): boolean {
  const dbTokens = extractTokens(dbName);
  
  // Check if at least 60% of invoice tokens are in db name
  let matches = 0;
  for (const token of invoiceTokens) {
    if (dbTokens.has(token)) matches++;
  }
  
  return matches >= Math.max(2, invoiceTokens.size * 0.5);
}

// Extract size from product name
function extractSize(name: string): string | null {
  const sizePattern = /(\d+(?:\.\d+)?)\s*(oz|lb|ml|gm|g|ct|pk|in|ft|gal)/i;
  const match = name.match(sizePattern);
  return match ? `${match[1]}${match[2].toLowerCase()}` : null;
}

async function comprehensiveMatch() {
  console.log('=== Comprehensive Slow SKU Matcher ===');
  console.log('Reading invoice text...');
  
  const invoiceText = fs.readFileSync('/tmp/all_invoice_text.txt', 'utf-8');
  console.log(`Invoice text: ${invoiceText.length} characters`);
  
  // Parse all products from invoices
  console.log('\nParsing Central Pet format...');
  const centralProducts = parseCentralPetInvoices(invoiceText);
  console.log(`Found ${centralProducts.length} Central Pet products`);
  
  // Get all supplies without SKU
  console.log('\nFetching supplies without SKU...');
  const unmatched = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`${unmatched.length} supplies need SKU`);
  
  // Create lookup maps
  const upcToProduct = new Map<string, InvoiceProduct>();
  const expandedDescToProduct = new Map<string, InvoiceProduct>();
  
  for (const product of centralProducts) {
    if (product.upc) {
      upcToProduct.set(product.upc, product);
    }
    if (product.expandedDescription) {
      expandedDescToProduct.set(product.expandedDescription, product);
    }
  }
  
  console.log(`Unique UPCs: ${upcToProduct.size}`);
  console.log(`Unique descriptions: ${expandedDescToProduct.size}`);
  
  // Match supplies
  let matched = 0;
  const matchLog: string[] = [];
  
  for (const supply of unmatched) {
    const supplyName = supply.name.toLowerCase();
    const supplyBrand = (supply.brand || '').toLowerCase();
    const supplySize = extractSize(supply.name);
    const supplyTokens = extractTokens(supply.name);
    
    let bestMatch: InvoiceProduct | null = null;
    let bestScore = 0;
    
    // Try each invoice product
    for (const product of centralProducts) {
      if (!product.upc) continue;
      
      let score = 0;
      
      // Brand match
      if (supplyBrand && product.brand.toLowerCase().includes(supplyBrand)) {
        score += 30;
      }
      
      // Token similarity on expanded description
      const productTokens = extractTokens(product.expandedDescription);
      const similarity = tokenSimilarity(supplyTokens, productTokens);
      score += similarity * 50;
      
      // Size match
      const productSize = extractSize(product.description);
      if (supplySize && productSize && supplySize === productSize) {
        score += 20;
      }
      
      // Essential tokens check
      if (containsEssentialTokens(supply.name, productTokens)) {
        score += 10;
      }
      
      // Direct substring match in expanded
      if (product.expandedDescription.includes(supplyName.slice(0, 10)) ||
          supplyName.includes(product.expandedDescription.slice(0, 10))) {
        score += 15;
      }
      
      if (score > bestScore && score >= 50) {
        bestScore = score;
        bestMatch = product;
      }
    }
    
    if (bestMatch) {
      // Apply the match
      await db.update(supplies)
        .set({ sku: bestMatch.upc })
        .where(eq(supplies.id, supply.id));
      
      matched++;
      matchLog.push(`${supply.name} -> ${bestMatch.description} (${bestMatch.upc}) [score: ${bestScore}]`);
      
      if (matched % 50 === 0) {
        console.log(`Matched ${matched} so far...`);
      }
    }
  }
  
  console.log(`\n=== Results ===`);
  console.log(`Total matched: ${matched}`);
  
  // Write match log
  fs.writeFileSync('/tmp/match_log.txt', matchLog.join('\n'));
  console.log('Match log saved to /tmp/match_log.txt');
  
  // Check final counts
  const finalWithSku = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const finalWithoutSku = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`\nFinal counts:`);
  console.log(`With SKU: ${finalWithSku[0].count}`);
  console.log(`Without SKU: ${finalWithoutSku[0].count}`);
}

comprehensiveMatch().catch(console.error);
