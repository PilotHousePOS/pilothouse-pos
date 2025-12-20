import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, sql, isNull, or, ilike } from 'drizzle-orm';
import * as fs from 'fs';

// Extended UPC prefix to brand mapping (6-digit prefixes)
const UPC_BRAND_MAP: Record<string, string[]> = {
  '015905': ['Aqueon'],
  '317163': ['API', 'Api'],
  '042055': ['Hikari'],
  '046798': ['Tetra', 'GloFish'],
  '071859': ['Kaytee'],
  '035585': ['Kong', 'KONG'],
  '096316': ['Zilla'],
  '097612': ['Zoo Med'],
  '091197': ["Fluker's", 'Flukers'],
  '784369': ['Komodo'],
  '000116': ['Seachem'],
  '018214': ['Nylabone'],
  '077234': ['Ethical', 'Spot'],
  '642863': ['Greenies'],
  '762177': ['ZuPreem'],
  '618940': ['JW Pet'],
  '720101': ['Kaytee', 'Kalmbach'],
  '015561': ['Fluval'],
  '045663': ['Four Paws'],
  '034846': ['Milpet', 'Milpet Foods'],
  '746772': ['Mammoth'],
  '019014': ['Iams'],
  '645095': ['TropiClean'],
  '723633': ['Natural Balance'],
  '811794': ['Furminator', 'FURminator'],
  '029904': ['WorldWide Imports'],
  '070271': ['Penn-Plax'],
  '030172': ['Penn-Plax'],
  '759834': ['Galápagos', 'Galapagos'],
  '783178': ['NaturVet'],
  '073091': ['Spotbrights', 'Aspen Pet'],
  '049695': ['Midwest', 'MidWest'],
  '885249': ['Oxbow'],
  '013096': ['Midwest'],
  '073725': ['Prevue'],
};

// Invoice abbreviation to full word mapping
const ABBREV_MAP: Record<string, string[]> = {
  'AQE': ['Aqueon'],
  'API': ['API'],
  'HIK': ['Hikari'],
  'TET': ['Tetra'],
  'KAY': ['Kaytee'],
  'KON': ['Kong'],
  'ZIL': ['Zilla'],
  'ZML': ['Zoo Med', 'ZooMed'],
  'FLU': ["Fluker's", 'Flukers'],
  'KOM': ['Komodo'],
  'SLI': ['Seachem'],
  'NYL': ['Nylabone'],
  'ETH': ['Ethical'],
  'GRE': ['Greenies'],
  'ZUP': ['ZuPreem'],
  'JWP': ['JW Pet'],
  'FLV': ['Fluval'],
  'FOU': ['Four Paws'],
  'MAM': ['Mammoth'],
  'IAM': ['Iams'],
  'TRO': ['TropiClean'],
  'NBP': ['Natural Balance'],
  'FMN': ['Furminator'],
  'GAL': ['Galapagos'],
  'NZP': ['NaturVet'],
  'MWP': ['Midwest'],
  'OXB': ['Oxbow'],
  'PRV': ['Prevue'],
  'CCHLD': ['Cichlid'],
  'PLLT': ['Pellet'],
  'CLNR': ['Cleaner', 'Vacuum'],
  'GRVL': ['Gravel'],
  'FXTR': ['Fixture', 'Light'],
  'COND': ['Conditioner', 'Water Conditioner'],
  'ESNTL': ['Essential'],
  'FLK': ['Flake', 'Flakes'],
  'GLOFSH': ['GloFish', 'Glofish'],
  'ORNMT': ['Ornament', 'Decoration'],
  'SBSTRT': ['Substrate'],
  'TRT': ['Treat', 'Treats'],
  'SPLMT': ['Supplement', 'Vitamin'],
  'RMDY': ['Remedy', 'Medicine', 'Treatment'],
  'BEDNG': ['Bedding', 'Substrate'],
  'REFL': ['Reflector', 'Dome'],
  'CERM': ['Ceramic'],
  'TRPCL': ['Tropical'],
  'WDLAND': ['Woodland'],
  'RAINFORST': ['Rainforest'],
  'SHMP': ['Shampoo'],
  'DNTL': ['Dental'],
  'BSCT': ['Biscuit'],
  'DSPNSR': ['Dispenser'],
  'VENISN': ['Venison'],
  'SWPOT': ['Sweet Potato'],
  'SLMN': ['Salmon'],
  'HRMT': ['Hermit', 'Hermit Crab'],
  'WTR': ['Water'],
  'THERM': ['Thermometer', 'Temperature'],
  'HUMDTY': ['Humidity', 'Hygrometer'],
  'PRRT': ['Parrot'],
  'TIEL': ['Cockatiel'],
  'KEET': ['Parakeet'],
  'HNY': ['Honey'],
  'FDPH': ['Forti-Diet', 'Forti Diet'],
  'SPRFD': ['Superfood'],
  'BK': ['Black'],
  'WH': ['White'],
  'MD': ['Medium'],
  'SM': ['Small'],
  'LG': ['Large'],
  'XL': ['Extra Large'],
  'REG': ['Regular'],
  'XTRM': ['Extreme'],
  'DRY': ['Dry Food', 'Kibble'],
  'WET': ['Wet Food', 'Canned'],
  'HLTHY': ['Healthy'],
  'EDBL': ['Edible'],
  'BF': ['Beef'],
  'CHK': ['Chicken'],
  'LVBR': ['Lovebird'],
  'SAF': ['Safflower'],
  'LAMP': ['Lamp', 'Light'],
  'BULB': ['Bulb', 'Light Bulb'],
  'HOOD': ['Hood', 'Canopy'],
  'LED': ['LED'],
  'DOME': ['Dome'],
  'CLAMP': ['Clamp'],
  'BOWL': ['Bowl', 'Dish'],
  'DEN': ['Den', 'Hide', 'Cave'],
  'PLNT': ['Plant', 'Decoration'],
  'SAND': ['Sand', 'Substrate'],
  'MED': ['Medicine', 'Medication', 'Treatment'],
  'FOOD': ['Food'],
  'TOY': ['Toy'],
  'CLLR': ['Collar'],
  'LESH': ['Leash'],
  'HRNSS': ['Harness'],
  'SWTR': ['Sweater'],
  'CAGE': ['Cage'],
  'LTTR': ['Litter'],
  'PERCH': ['Perch'],
  'GLD': ['Gold'],
  'MINI': ['Mini'],
  'VAC': ['Vacuum', 'Vac'],
  'COMBO': ['Combo', 'Combination'],
  'SPRY': ['Spray'],
  'FRT': ['Fruit'],
  'BLND': ['Blend'],
  'ORIG': ['Original'],
  'GRMT': ['Gourmet'],
  'SMKY': ['Smoky'],
  'CHKN': ['Chicken'],
  'JRKY': ['Jerky'],
  'PB': ['Peanut Butter'],
  'CAPSL': ['Capsule', 'Pill'],
  'CHS': ['Cheese'],
  'PUP': ['Puppy', 'Pup'],
  'MIG': ['Mignonette'],
  'BCN': ['Bacon'],
  'STCK': ['Stick'],
  'ROPE': ['Rope'],
  'TUG': ['Tug'],
  'KNOT': ['Knot'],
  'BALL': ['Ball'],
  'DUCK': ['Duck'],
  'BNE': ['Bone'],
  'OCTPS': ['Octopus'],
  'SHARK': ['Shark'],
  'ELPHNT': ['Elephant'],
  'ALIGTR': ['Alligator'],
  'BNNIES': ['Bunnies'],
  'NWSPPR': ['Newspaper'],
  'CHW': ['Chew'],
  'FLEXI': ['Flexi', 'Flexible'],
  'VARPK': ['Variety Pack'],
  'INC': ['Incandescent'],
  'DAY': ['Day', 'Daylight'],
  'NGHT': ['Night'],
  'NIGHT': ['Night'],
  'SPOT': ['Spot', 'Spotlight'],
  'RD': ['Red'],
  'MIX': ['Mix'],
  'JNGL': ['Jungle'],
  'DSRT': ['Desert'],
  'ASPEN': ['Aspen'],
  'SNAKE': ['Snake'],
  'TORTOISE': ['Tortoise'],
  'HAY': ['Hay'],
  'CRICKET': ['Cricket'],
  'INSCT': ['Insect'],
  'CRAB': ['Crab'],
  'TURTLE': ['Turtle'],
  'REPTI': ['Reptile', 'Repti'],
  'RAMP': ['Ramp'],
  'CRNR': ['Corner'],
  'ROCK': ['Rock'],
  'CORK': ['Cork'],
  'ROUND': ['Round'],
  'BRK': ['Bark'],
  'DIGITAL': ['Digital'],
  'GAUGE': ['Gauge'],
  'SUNR': ['Sunrise'],
  'NANO': ['Nano'],
  'BASKING': ['Basking'],
  'SHEDDING': ['Shedding', 'Shed'],
  'AID': ['Aid'],
  'CLGN': ['Collagen'],
  'FNC': ['Fence', 'Fancy'],
  'LATEX': ['Latex'],
  'VINYL': ['Vinyl'],
  'RUBBER': ['Rubber'],
  'PLUSH': ['Plush'],
  'SQUEAKY': ['Squeaky', 'Squeaker'],
  'CUDDLE': ['Cuddle'],
  'COZIE': ['Cozie', 'Cozy'],
  'WILD': ['Wild'],
  'SHIELD': ['Shield'],
  'CRUNCHAIR': ['Crunch Air', 'Air'],
  'MARATHON': ['Marathon'],
  'DUMBBELL': ['Dumbbell'],
  'BAMBOO': ['Bamboo'],
};

function extractKeywords(text: string): string[] {
  const normalized = text.toUpperCase();
  const keywords: string[] = [];
  
  // Find abbreviations and expand them
  for (const [abbr, expansions] of Object.entries(ABBREV_MAP)) {
    if (normalized.includes(abbr)) {
      keywords.push(...expansions.map(e => e.toLowerCase()));
    }
  }
  
  // Also add raw words
  const words = normalized.split(/[\s\/\-\.\(\)]+/).filter(w => w.length > 2);
  for (const word of words) {
    keywords.push(word.toLowerCase());
  }
  
  // Extract numbers (sizes like 4oz, 8qt, 10in)
  const sizeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(OZ|QT|IN|LB|#|W|PK|CT)/g);
  if (sizeMatch) {
    keywords.push(...sizeMatch.map(s => s.toLowerCase().replace(/\s/g, '')));
  }
  
  return [...new Set(keywords)];
}

function matchScore(invoiceKeywords: string[], productName: string, productDesc: string): number {
  const productText = `${productName} ${productDesc || ''}`.toLowerCase();
  let matches = 0;
  let total = invoiceKeywords.length;
  
  for (const kw of invoiceKeywords) {
    if (productText.includes(kw)) {
      matches++;
    }
  }
  
  // Bonus for exact size matches
  const sizePattern = /\d+(?:\.\d+)?\s*(oz|qt|in|lb|w)/gi;
  const invoiceSizes = invoiceKeywords.filter(k => sizePattern.test(k));
  for (const size of invoiceSizes) {
    if (productText.includes(size)) {
      matches += 0.5; // Extra weight for size matches
    }
  }
  
  return total > 0 ? matches / total : 0;
}

async function main() {
  // Load extracted UPCs
  const upcsData = JSON.parse(fs.readFileSync('/tmp/clean_upcs.json', 'utf8'));
  const upcs = Object.entries(upcsData) as [string, string][];
  
  console.log(`Loaded ${upcs.length} UPCs from invoices`);
  
  // Get all products without SKU
  const productsNoSku = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`Found ${productsNoSku.length} products without SKU`);
  
  // Track matches
  const matches: Array<{upc: string, productId: number, productName: string, invoiceDesc: string, score: number}> = [];
  const unmatchedUpcs: Array<{upc: string, desc: string, prefix: string, brands: string[] | null}> = [];
  
  for (const [upc, rawDesc] of upcs) {
    const prefix = upc.substring(0, 6);
    const brands = UPC_BRAND_MAP[prefix];
    
    if (!brands) {
      unmatchedUpcs.push({ upc, desc: rawDesc, prefix, brands: null });
      continue;
    }
    
    // Filter products by brand (case-insensitive)
    const brandProducts = productsNoSku.filter(p => 
      p.brand && brands.some(b => 
        p.brand!.toLowerCase() === b.toLowerCase() ||
        p.brand!.toLowerCase().includes(b.toLowerCase()) ||
        b.toLowerCase().includes(p.brand!.toLowerCase())
      )
    );
    
    if (brandProducts.length === 0) {
      unmatchedUpcs.push({ upc, desc: rawDesc, prefix, brands });
      continue;
    }
    
    // Extract keywords from invoice description
    const invoiceKeywords = extractKeywords(rawDesc);
    
    // Find best match
    let bestMatch = null;
    let bestScore = 0;
    
    for (const product of brandProducts) {
      const score = matchScore(invoiceKeywords, product.name, product.description || '');
      
      if (score > bestScore && score >= 0.35) {
        bestScore = score;
        bestMatch = product;
      }
    }
    
    if (bestMatch) {
      matches.push({
        upc,
        productId: bestMatch.id,
        productName: bestMatch.name,
        invoiceDesc: rawDesc,
        score: bestScore
      });
    } else {
      unmatchedUpcs.push({ upc, desc: rawDesc, prefix, brands });
    }
  }
  
  // Deduplicate matches (same product might match multiple UPCs - keep highest score)
  const productToMatch = new Map<number, typeof matches[0]>();
  for (const match of matches) {
    const existing = productToMatch.get(match.productId);
    if (!existing || match.score > existing.score) {
      productToMatch.set(match.productId, match);
    }
  }
  const dedupedMatches = Array.from(productToMatch.values());
  
  console.log(`\nTotal matches: ${matches.length}`);
  console.log(`Unique product matches: ${dedupedMatches.length}`);
  console.log(`Unmatched UPCs: ${unmatchedUpcs.length}`);
  
  // Sort by score
  dedupedMatches.sort((a, b) => b.score - a.score);
  
  // Save for review
  fs.writeFileSync('/tmp/upc_matches_v2.json', JSON.stringify(dedupedMatches, null, 2));
  fs.writeFileSync('/tmp/unmatched_upcs_v2.json', JSON.stringify(unmatchedUpcs, null, 2));
  
  // Show distribution
  const scoreRanges = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.35];
  console.log('\n=== Match Distribution ===');
  for (const threshold of scoreRanges) {
    const count = dedupedMatches.filter(m => m.score >= threshold).length;
    console.log(`>= ${(threshold * 100).toFixed(0)}%: ${count} matches`);
  }
  
  // Show top matches
  console.log('\n=== Top 15 Matches ===');
  for (const match of dedupedMatches.slice(0, 15)) {
    console.log(`Score: ${(match.score * 100).toFixed(0)}% | UPC: ${match.upc}`);
    console.log(`  Invoice: ${match.invoiceDesc}`);
    console.log(`  Product: ${match.productName}`);
  }
  
  // Show unknown prefixes
  const unknownPrefixes = new Map<string, number>();
  for (const item of unmatchedUpcs.filter(u => !u.brands)) {
    unknownPrefixes.set(item.prefix, (unknownPrefixes.get(item.prefix) || 0) + 1);
  }
  
  console.log('\n=== Unknown UPC Prefixes (top 20) ===');
  [...unknownPrefixes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([prefix, count]) => console.log(`  ${prefix}: ${count} items`));
  
  process.exit(0);
}

main().catch(console.error);
