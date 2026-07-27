// @ts-nocheck
import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, and, isNull, ilike, or, sql } from 'drizzle-orm';
import * as fs from 'fs';

// Brand code to full brand name
const BRAND_CODES: Record<string, string> = {
  'API': 'API', 'AGA': 'Aqueon', 'AQE': 'Aqueon', 'AQA': 'Aqueon',
  'TET': 'Tetra', 'HIK': 'Hikari', 'FLU': 'Fluval', 'MAR': 'Marineland',
  'ZOO': 'Zoo Med', 'ZML': 'Zoo Med', 'EXO': 'Exo Terra', 'ZIL': 'Zilla',
  'FLK': 'Fluker', 'SEC': 'SeaChem', 'SLI': 'SeaChem', 'OMG': 'Omega One',
  'NLS': 'New Life Spectrum', 'CLI': 'Carib Sea', 'WWI': 'Worldwide',
  'SIC': 'Sicce', 'ATP': 'Aquatop', 'WEC': 'Weco', 'GBE': 'GloFish',
  'KAY': 'Kaytee', 'OXB': 'Oxbow', 'ZUP': 'ZuPreem', 'MFP': 'Marshall',
  'LAF': 'Lafeber', 'AEC': 'AE Cage', 'VIT': 'Vitakraft', 'SUN': 'Sunseed',
  'INS': 'Arm & Hammer', 'CND': 'Arm & Hammer', 'GRE': 'Greenies',
  'ELA': 'Elanco', 'FAR': 'Farnam', 'INV': 'Vetoquinol', 'BDL': 'Bayer',
  'GAR': 'NaturVet', 'DOS': 'Petmate', 'FOU': 'Four Paws', 'SMO': 'Smokehouse',
  'ETH': 'Ethical Pet', 'LOV': 'Loving Pets', 'MAG': 'Mag-Float',
  'KON': 'Kong', 'NYL': 'Nylabone', 'JWP': 'JW Pet', 'PET': 'Petmate',
  'BLU': 'Blue Buffalo', 'ROY': 'Royal Canin', 'SCI': 'Science Diet',
  'PRO': 'Pro Plan', 'PUR': 'Purina', 'PED': 'Pedigree', 'IAM': 'Iams',
  'NUT': 'Nutrisource', 'TAS': 'Taste of the Wild', 'WEL': 'Wellness',
  'FRO': 'Fromm', 'DIA': 'Diamond', 'VIC': 'Victor', 'NUL': 'Nulo',
  'MER': 'Merrick', 'CAN': 'Canidae', 'ORI': 'Orijen', 'ACA': 'Acana',
  'NAT': 'Natural Balance', 'EAR': 'Earthborn', 'RAC': 'Rachael Ray',
  'CES': 'Cesar', 'FAN': 'Fancy Feast', 'FRI': 'Friskies', 'MEO': 'Meow Mix',
  'TDY': 'Tidy Cats', 'ARM': 'Arm & Hammer', 'PRE': 'Prevue', 'LIV': 'Living World',
};

// Word abbreviation expansions
const WORD_EXPANSIONS: Record<string, string[]> = {
  'COND': ['conditioner', 'conditioning'],
  'WTR': ['water'],
  'TAP': ['tap'],
  'STRSS': ['stress'],
  'STRS': ['stress'],
  'COAT': ['coat'],
  'AQUA': ['aqua', 'aquarium'],
  'ESNTL': ['essential'],
  'ALGAE': ['algae'],
  'SCRPR': ['scraper'],
  'CLNR': ['cleaner'],
  'CRTRDG': ['cartridge'],
  'FLTR': ['filter'],
  'PMP': ['pump'],
  'PWRHD': ['powerhead'],
  'GRVL': ['gravel'],
  'VAC': ['vac', 'vacuum'],
  'THRMTR': ['thermometer'],
  'HYGRMTR': ['hygrometer'],
  'SPLMT': ['supplement'],
  'TRTMNT': ['treatment'],
  'RMDY': ['remedy'],
  'MED': ['medication', 'medicine', 'medicated'],
  'FOOD': ['food'],
  'TRT': ['treat', 'treats'],
  'TOY': ['toy'],
  'ORNMT': ['ornament'],
  'DECOR': ['decoration', 'decor'],
  'AQRM': ['aquarium'],
  'FSH': ['fish'],
  'BETTA': ['betta'],
  'GLDFS': ['goldfish'],
  'CCHLD': ['cichlid'],
  'TRPCL': ['tropical'],
  'GRNLS': ['granules'],
  'PLTS': ['pellets'],
  'FLK': ['flakes'],
  'WFRS': ['wafers'],
  'SHRMP': ['shrimp'],
  'BRNE': ['brine'],
  'FROZ': ['frozen', 'freeze dried'],
  'FD': ['freeze dried'],
  'ICH': ['ich', 'ick'],
  'MELAFIX': ['melafix'],
  'PIMAFIX': ['pimafix'],
  'BETTAFIX': ['bettafix'],
  'ALGAEFIX': ['algaefix'],
  'ACCU': ['accu', 'accurate'],
  'CLR': ['clear'],
  'AQCLR': ['aqua clear'],
  'STRT': ['start'],
  'QUICK': ['quick'],
  'AMMO': ['ammonia', 'ammo'],
  'SALT': ['salt'],
  'ROOT': ['root'],
  'TABS': ['tabs', 'tablets'],
  'STRP': ['strip', 'strips'],
  'TEST': ['test'],
  'KIT': ['kit'],
  'MSTR': ['master'],
  'MINI': ['mini'],
  'FW': ['freshwater'],
  'SW': ['saltwater'],
  'PH': ['ph'],
  'NITRT': ['nitrate', 'nitrite'],
  'COPPER': ['copper'],
  'CALC': ['calcium'],
  'PHOSP': ['phosphate'],
  'GEN': ['general'],
  'CURE': ['cure'],
  'SUPR': ['super'],
  'POND': ['pond'],
  'MICR': ['microbial', 'micro'],
  'ALG': ['algae'],
  'SMPL': ['simply'],
  'ERY': ['erythromycin'],
  'ZYME': ['zyme', 'enzyme'],
  'LCK': ['lock'],
  'GUAR': ['guard'],
  'STRSSGRD': ['stressguard'],
  'FLOURSH': ['flourish'],
  'PRIME': ['prime'],
  'INTRNL': ['internal'],
  'HANG': ['hang', 'hanging'],
  'CRNR': ['corner'],
  'RPLCMNT': ['replacement'],
  'SPONGE': ['sponge'],
  'BIOSPONGE': ['biosponge'],
  'CRBN': ['carbon'],
  'ZEOLIT': ['zeolite'],
  'ACTIVTD': ['activated'],
  'POLYFBR': ['polyfiber'],
  'NITRA': ['nitrate'],
  'AMMON': ['ammonia'],
  'PAD': ['pad'],
  'SND': ['sand'],
  'MARN': ['marine'],
  'REEF': ['reef'],
  'BK': ['black'],
  'WH': ['white'],
  'BL': ['blue'],
  'GRN': ['green'],
  'RD': ['red'],
  'LAGOON': ['lagoon'],
  'SHRT': ['short'],
  'MED': ['medium', 'med'],
  'MD': ['medium'],
  'LG': ['large'],
  'SM': ['small'],
  'XL': ['extra large', 'xl'],
  'XS': ['extra small', 'xs'],
  'PRO': ['pro', 'professional'],
  'MFLOW': ['mflow', 'multi-flow'],
  'GPH': ['gph'],
  'GAL': ['gallon'],
  'OZ': ['oz', 'ounce'],
  'GM': ['gram', 'g'],
  'LB': ['lb', 'pound'],
  'CT': ['count', 'ct'],
  'PK': ['pack', 'pk'],
  'PCK': ['pack'],
  '2PK': ['2 pack', '2pk'],
  '3PK': ['3 pack', '3pk'],
  '4PK': ['4 pack', '4pk'],
  '6PK': ['6 pack', '6pk'],
  'LTTR': ['litter'],
  'ODRLCK': ['odorlock'],
  'BRZE': ['breeze'],
  'DEOD': ['deodorizer'],
  'HRBL': ['hairball'],
  'CHKN': ['chicken'],
  'BF': ['beef'],
  'TUNA': ['tuna'],
  'SLMN': ['salmon'],
  'TRKY': ['turkey'],
  'LAMB': ['lamb'],
  'SWPOT': ['sweet potato'],
  'VEG': ['vegetable'],
  'GRAIN': ['grain'],
  'GRFR': ['grain free'],
  'WLD': ['wild'],
  'NTRL': ['natural'],
  'SELCT': ['select'],
  'PRMO': ['premium'],
  'HLTHY': ['healthy'],
  'INDOOR': ['indoor'],
  'OUTDR': ['outdoor'],
  'ACTV': ['active'],
  'SNSR': ['senior'],
  'ADLT': ['adult'],
  'KTTN': ['kitten'],
  'PPPY': ['puppy'],
  'DG': ['dog'],
  'CT': ['cat'],
  'BRD': ['bird'],
  'PRRT': ['parrot'],
  'TIEL': ['cockatiel'],
  'FNCH': ['finch'],
  'CNR': ['canary'],
  'LVBR': ['lovebird'],
  'CGE': ['cage'],
  'PRCH': ['perch'],
  'SWING': ['swing'],
  'LDDR': ['ladder'],
  'MRRR': ['mirror'],
  'BELL': ['bell'],
  'MILLET': ['millet'],
  'SPRY': ['spray'],
  'FORTI': ['fortified'],
  'NUTRI': ['nutrition', 'nutritious'],
  'NAT': ['natural'],
  'FRRT': ['ferret'],
  'REPT': ['reptile'],
  'TRTL': ['turtle'],
  'LZRD': ['lizard'],
  'SNK': ['snake'],
  'GECK': ['gecko'],
  'BRDD': ['bearded dragon'],
  'SUBST': ['substrate'],
  'BSKG': ['basking'],
  'HEAT': ['heat', 'heater'],
  'LAMP': ['lamp'],
  'BULB': ['bulb'],
  'UVB': ['uvb'],
  'DAYLT': ['daylight'],
  'NIGHT': ['night'],
  'INFRARD': ['infrared'],
  'CERAM': ['ceramic'],
  'EMTTR': ['emitter'],
  'THMST': ['thermostat'],
  'HUMID': ['humidity', 'humidifier'],
  'FOGGER': ['fogger'],
  'DRIPR': ['dripper'],
  'HIDWY': ['hideaway', 'hide'],
  'CAVE': ['cave'],
  'LOG': ['log'],
  'VINES': ['vines'],
  'PLANTS': ['plants'],
  'BCKGRND': ['background'],
  'TERRRM': ['terrarium'],
  'MESH': ['mesh'],
  'SCRN': ['screen'],
  'TOP': ['top'],
  'LID': ['lid'],
  'STAND': ['stand'],
  'RACK': ['rack'],
  'SHELTR': ['shelter'],
  'BEDNG': ['bedding'],
  'SHVNG': ['shavings'],
  'HAY': ['hay'],
  'ALFAFA': ['alfalfa'],
  'TIMOTHY': ['timothy'],
  'ORCHARD': ['orchard'],
  'GRASS': ['grass'],
  'HAMSTR': ['hamster'],
  'GERBIL': ['gerbil'],
  'GUIN': ['guinea pig'],
  'RABBIT': ['rabbit'],
  'CHINCH': ['chinchilla'],
  'HEDGE': ['hedgehog'],
  'RAT': ['rat'],
  'MOUSE': ['mouse'],
  'MICE': ['mice'],
  'WHEEL': ['wheel'],
  'BALL': ['ball'],
  'TUBE': ['tube'],
  'TUNNL': ['tunnel'],
  'HOUSE': ['house'],
  'COTTAGE': ['cottage'],
  'DOME': ['dome'],
  'IGLLOO': ['igloo'],
  'HUTCH': ['hutch'],
  'BOTTL': ['bottle'],
  'BOWL': ['bowl'],
  'DISH': ['dish'],
  'FEDR': ['feeder'],
  'DISPNSR': ['dispenser'],
  'CLIPON': ['clip on'],
  'HANGNG': ['hanging'],
  'WALL': ['wall'],
  'MOUNT': ['mount'],
  'STANDUP': ['stand up'],
  'AUTMTC': ['automatic'],
  'GRAVITY': ['gravity'],
  'FOUNTM': ['fountain'],
  'CLLR': ['collar'],
  'HARNS': ['harness'],
  'LEASH': ['leash'],
  'LEAD': ['lead'],
  'TIE': ['tie out'],
  'STAKE': ['stake'],
  'CHAIN': ['chain'],
  'CABLE': ['cable'],
  'RETRACT': ['retractable'],
  'NYLON': ['nylon'],
  'LTHR': ['leather'],
  'ROPE': ['rope'],
  'CHOKE': ['choke'],
  'PRONG': ['prong'],
  'SPIKE': ['spike'],
  'MARTINGALE': ['martingale'],
  'HEADCLLR': ['head collar'],
  'GENTLLEADR': ['gentle leader'],
  'MUZZLE': ['muzzle'],
  'BASKET': ['basket'],
  'VEST': ['vest'],
  'COAT': ['coat'],
  'SWEATER': ['sweater'],
  'JACKET': ['jacket'],
  'BOOTIE': ['bootie', 'boots'],
  'SOCK': ['sock', 'socks'],
  'DIAPER': ['diaper'],
  'WRAP': ['wrap'],
  'BAND': ['band', 'belly band'],
  'BED': ['bed'],
  'MAT': ['mat'],
  'CRATE': ['crate'],
  'KENNEL': ['kennel'],
  'CARRIER': ['carrier'],
  'GATE': ['gate'],
  'XPEN': ['exercise pen', 'x-pen'],
  'PEN': ['pen'],
  'PLAYYARD': ['playyard'],
  'DOOR': ['door'],
  'FLAP': ['flap'],
  'RAMP': ['ramp'],
  'STEP': ['step', 'steps'],
  'STAIRS': ['stairs'],
  'BRUSH': ['brush'],
  'COMB': ['comb'],
  'RAKE': ['rake'],
  'DESHED': ['deshedding', 'deshed'],
  'SLCKR': ['slicker'],
  'BRISTLE': ['bristle'],
  'PIN': ['pin'],
  'GROOM': ['grooming', 'groom'],
  'TRIM': ['trim', 'trimmer'],
  'CLIPPR': ['clipper', 'clippers'],
  'BLADE': ['blade'],
  'SCISSOR': ['scissors'],
  'SHEAR': ['shears'],
  'FILE': ['file'],
  'GRINDR': ['grinder'],
  'NAIL': ['nail'],
  'STYPTIC': ['styptic'],
  'PWDR': ['powder'],
  'SHMPOO': ['shampoo'],
  'CNDTNR': ['conditioner'],
  'SPRAY': ['spray'],
  'FOAM': ['foam'],
  'WIPE': ['wipe', 'wipes'],
  'DEODRZR': ['deodorizer'],
  'PERFUME': ['perfume'],
  'COLOGNE': ['cologne'],
  'DENTAL': ['dental'],
  'TOOTH': ['tooth'],
  'TTHBRSH': ['toothbrush'],
  'TTHPST': ['toothpaste'],
  'MOUTHWSH': ['mouthwash'],
  'ADDTV': ['additive'],
  'CHEW': ['chew'],
  'BONE': ['bone'],
  'NYLABONE': ['nylabone'],
  'ANTLER': ['antler'],
  'HORN': ['horn'],
  'HOOF': ['hoof'],
  'BULLY': ['bully stick'],
  'HIDE': ['hide', 'rawhide'],
  'BEEF': ['beef'],
  'PORK': ['pork'],
  'CHICKEN': ['chicken'],
  'DUCK': ['duck'],
  'VENISON': ['venison'],
  'BACON': ['bacon'],
  'JERKY': ['jerky'],
  'STRIP': ['strip', 'strips'],
  'STICK': ['stick', 'sticks'],
  'TWIST': ['twist', 'twists'],
  'ROLL': ['roll', 'rolls'],
  'RING': ['ring'],
  'KNOT': ['knot', 'knotted'],
  'BRAID': ['braid', 'braided'],
  'WRAPPED': ['wrapped'],
  'FILLED': ['filled'],
  'STUFFED': ['stuffed'],
  'FLVR': ['flavor', 'flavored'],
  'ASST': ['assorted'],
  'VARIETY': ['variety'],
  'SMAKER': ['seed maker', 'stick'],
  'FRT': ['fruit'],
  'VEG': ['vegetable'],
  'HONEY': ['honey'],
  'YOGURT': ['yogurt'],
  'PNUT': ['peanut'],
  'BTTR': ['butter'],
};

interface Product {
  abbreviated: string;
  brand: string;
  expanded: string;
  upc: string;
}

// Parse a single abbreviated product line
function parseAbbreviatedLine(line: string, upc: string): Product | null {
  const trimmed = line.trim();
  if (trimmed.length < 5) return null;
  
  // Extract brand code (first 2-4 uppercase letters)
  const brandMatch = trimmed.match(/^([A-Z]{2,4})\s+(.+)/);
  if (!brandMatch) return null;
  
  const brandCode = brandMatch[1];
  const description = brandMatch[2];
  
  const brand = BRAND_CODES[brandCode] || brandCode;
  
  // Expand abbreviations in description
  let expanded = description;
  for (const [abbr, expansions] of Object.entries(WORD_EXPANSIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    if (regex.test(expanded)) {
      expanded = expanded.replace(regex, expansions[0]);
    }
  }
  
  // Add brand name
  expanded = `${brand} ${expanded}`;
  
  return {
    abbreviated: trimmed,
    brand,
    expanded: expanded.toLowerCase(),
    upc
  };
}

// Extract products with UPCs from Central Pet format
function extractCentralPetProducts(text: string): Product[] {
  const products: Product[] = [];
  const lines = text.split('\n');
  
  // Find product description lines and associate with UPCs
  let currentProducts: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this is an abbreviated product line
    if (line.match(/^[A-Z]{2,4}\s+[A-Z]/)) {
      currentProducts.push(line);
    }
    
    // Check if this is a UPC line (12-13 digit number)
    const upcMatch = line.match(/^(\d{12,13})$/);
    if (upcMatch && currentProducts.length > 0) {
      // Associate this UPC with the most recent product
      const prod = currentProducts.pop();
      if (prod) {
        const parsed = parseAbbreviatedLine(prod, upcMatch[1]);
        if (parsed) {
          products.push(parsed);
        }
      }
    }
  }
  
  // Also look for inline UPC patterns (description followed by UPC on same line or nearby)
  const inlinePattern = /([A-Z]{2,4}\s+[A-Z][A-Z0-9\s\-#/.]+)\s+(\d{12,13})/g;
  let match;
  while ((match = inlinePattern.exec(text)) !== null) {
    const parsed = parseAbbreviatedLine(match[1], match[2]);
    if (parsed) {
      products.push(parsed);
    }
  }
  
  return products;
}

// Normalize text for matching
function normalize(text: string): string {
  return text
    .replace(/[™®©'"\-–—()]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

// Score match between supply name and expanded product
function scoreMatch(supplyName: string, product: Product): number {
  const normSupply = normalize(supplyName);
  const normExpanded = normalize(product.expanded);
  
  // Extract tokens
  const supplyTokens = normSupply.split(' ').filter(t => t.length > 1);
  const productTokens = normExpanded.split(' ').filter(t => t.length > 1);
  
  if (supplyTokens.length === 0 || productTokens.length === 0) return 0;
  
  // Count matching tokens
  let matches = 0;
  for (const st of supplyTokens) {
    for (const pt of productTokens) {
      if (st === pt) {
        matches++;
        break;
      } else if (st.length >= 4 && pt.includes(st)) {
        matches += 0.7;
        break;
      } else if (pt.length >= 4 && st.includes(pt)) {
        matches += 0.7;
        break;
      }
    }
  }
  
  // Extract and compare sizes
  const supplySize = normSupply.match(/(\d+(?:\.\d+)?)\s*(oz|lb|gal|ct|pk|gm|g)/);
  const productSize = normExpanded.match(/(\d+(?:\.\d+)?)\s*(oz|lb|gal|ct|pk|gm|g)/);
  
  let sizeBonus = 0;
  if (supplySize && productSize) {
    if (supplySize[0] === productSize[0]) {
      sizeBonus = 0.3; // Exact size match
    } else if (supplySize[1] === productSize[1]) {
      sizeBonus = -0.2; // Same unit but different size - penalty
    }
  }
  
  // Brand match bonus
  let brandBonus = 0;
  if (normSupply.includes(product.brand.toLowerCase())) {
    brandBonus = 0.2;
  }
  
  const baseScore = matches / Math.max(supplyTokens.length, productTokens.length);
  return Math.min(baseScore + sizeBonus + brandBonus, 1.0);
}

async function runCentralPetMatcher() {
  console.log('=== Central Pet Invoice Matcher ===\n');
  
  // Load invoice text
  const invoiceText = fs.readFileSync('/tmp/all_invoice_text.txt', 'utf-8');
  console.log(`Loaded ${invoiceText.length} characters of invoice text`);
  
  // Extract products
  const products = extractCentralPetProducts(invoiceText);
  console.log(`Extracted ${products.length} products from Central Pet format`);
  
  // Deduplicate by UPC
  const upcMap = new Map<string, Product>();
  for (const prod of products) {
    if (!upcMap.has(prod.upc) || prod.expanded.length > (upcMap.get(prod.upc)?.expanded.length || 0)) {
      upcMap.set(prod.upc, prod);
    }
  }
  const uniqueProducts = Array.from(upcMap.values());
  console.log(`Unique products: ${uniqueProducts.length}\n`);
  
  // Show sample expansions
  console.log('Sample expansions:');
  for (const prod of uniqueProducts.slice(0, 20)) {
    console.log(`  "${prod.abbreviated}" => "${prod.expanded}" (${prod.upc})`);
  }
  
  // Get supplies without SKU
  const suppliesWithoutSku = await db
    .select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`\nSupplies without SKU: ${suppliesWithoutSku.length}`);
  
  // Match supplies to products
  const matches: Array<{
    supplyId: number;
    supplyName: string;
    productAbbrev: string;
    productExpanded: string;
    upc: string;
    score: number;
  }> = [];
  
  for (const supply of suppliesWithoutSku) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const product of uniqueProducts) {
      const score = scoreMatch(supply.name, product);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = {
          supplyId: supply.id,
          supplyName: supply.name,
          productAbbrev: product.abbreviated,
          productExpanded: product.expanded,
          upc: product.upc,
          score
        };
      }
    }
    
    if (bestMatch) {
      matches.push(bestMatch);
    }
  }
  
  // Sort by score
  matches.sort((a, b) => b.score - a.score);
  
  console.log(`\nFound ${matches.length} potential matches`);
  
  // Show top matches
  console.log('\nTop matches:');
  for (const m of matches.slice(0, 50)) {
    console.log(`  [${m.score.toFixed(2)}] "${m.supplyName}" => "${m.productExpanded.substring(0, 50)}" (${m.upc})`);
  }
  
  // Apply matches with score >= 0.55
  const toApply = matches.filter(m => m.score >= 0.55);
  console.log(`\nApplying ${toApply.length} matches...`);
  
  let applied = 0;
  for (const match of toApply) {
    try {
      await db
        .update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.supplyId));
      applied++;
    } catch (err) {
      // Ignore
    }
  }
  
  console.log(`Applied ${applied} SKU updates`);
  
  // Final stats
  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  const withSku = await db
    .select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(and(sql`sku IS NOT NULL`, sql`sku != ''`));
  
  console.log(`\n=== Final Stats ===`);
  console.log(`Supplies with SKU: ${withSku[0].count}`);
  console.log(`Supplies without SKU: ${remaining[0].count}`);
  
  return { applied };
}

runCentralPetMatcher()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
