import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, sql, isNull, or } from 'drizzle-orm';
import * as fs from 'fs';

// Extended UPC prefix to brand mapping
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
  // New mappings from research
  '076484': ['Coastal', 'Coastal Pet'],
  '744845': ['Coastal', "Li'l Pals", 'Lil Pals'],
  '045125': ['OurPets', 'Cosmic Cat'],
  '785184': ['RedBarn', 'Redbarn'],
  '660204': ['Fromm'],
  '029695': ['Spot', 'Ethical'],
  '797801': ['Science Diet', 'Hills'],
  '644472': ['Chicken Soup'],
  '180181': ['Coastal'],
  '066380': ['Nutrisource', 'NutriSource'],
  '842982': ['Blue Buffalo'],
  '879213': ['Catit'],
  '724089': ['Wellness'],
  '039079': ['Central'],
  '729849': ['Nutrisource', 'NutriSource'],
  '079441': ['Arm & Hammer'],
  '730582': ['Nutrisource', 'NutriSource'],
  '768303': ['Nutrisource', 'NutriSource'],
  '033200': ['Arm & Hammer'],
  '854111': ['Catit'],
  '073893': ['Petmate'],
  '041693': ['Flexi'],
  '030521': ['Petmate'],
};

// Abbreviation expansions
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
  'CST': ['Coastal'],
  'RBP': ['RedBarn'],
  'FRM': ['Fromm'],
  'NTS': ['Nutrisource'],
  'BBF': ['Blue Buffalo'],
  'CTT': ['Catit'],
  'WLL': ['Wellness'],
  'SCD': ['Science Diet'],
  'CCHLD': ['Cichlid'],
  'PLLT': ['Pellet'],
  'CLNR': ['Cleaner', 'Vacuum'],
  'GRVL': ['Gravel'],
  'FXTR': ['Fixture', 'Light'],
  'COND': ['Conditioner', 'Water Conditioner'],
  'FLK': ['Flake', 'Flakes'],
  'GLOFSH': ['GloFish', 'Glofish'],
  'ORNMT': ['Ornament', 'Decoration'],
  'SBSTRT': ['Substrate'],
  'TRT': ['Treat', 'Treats'],
  'SPLMT': ['Supplement', 'Vitamin'],
  'RMDY': ['Remedy', 'Medicine', 'Treatment'],
  'BEDNG': ['Bedding', 'Substrate'],
  'CERM': ['Ceramic'],
  'TRPCL': ['Tropical'],
  'SHMP': ['Shampoo'],
  'DNTL': ['Dental'],
  'VENISN': ['Venison'],
  'SLMN': ['Salmon'],
  'HRMT': ['Hermit', 'Hermit Crab'],
  'BK': ['Black'],
  'WH': ['White'],
  'MD': ['Medium'],
  'SM': ['Small'],
  'LG': ['Large'],
  'XL': ['Extra Large'],
  'DRY': ['Dry Food', 'Kibble'],
  'CHK': ['Chicken'],
  'BF': ['Beef'],
  'LAMP': ['Lamp', 'Light'],
  'BULB': ['Bulb', 'Light Bulb'],
  'LED': ['LED'],
  'DOME': ['Dome'],
  'BOWL': ['Bowl', 'Dish'],
  'DEN': ['Den', 'Hide', 'Cave'],
  'PLNT': ['Plant', 'Decoration'],
  'SAND': ['Sand', 'Substrate'],
  'FOOD': ['Food'],
  'TOY': ['Toy'],
  'CLLR': ['Collar'],
  'LESH': ['Leash'],
  'HRNSS': ['Harness'],
  'SWTR': ['Sweater'],
  'CAGE': ['Cage'],
  'LTTR': ['Litter'],
  'PERCH': ['Perch'],
  'TURTLE': ['Turtle'],
  'REPTILE': ['Reptile'],
  'SNAKE': ['Snake'],
  'TORTOISE': ['Tortoise'],
  'CRICKET': ['Cricket'],
  'INSCT': ['Insect'],
  'FROG': ['Frog'],
  'TADPOLE': ['Tadpole'],
};

function extractKeywords(text: string): string[] {
  const normalized = text.toUpperCase();
  const keywords: string[] = [];
  
  for (const [abbr, expansions] of Object.entries(ABBREV_MAP)) {
    if (normalized.includes(abbr)) {
      keywords.push(...expansions.map(e => e.toLowerCase()));
    }
  }
  
  const words = normalized.split(/[\s\/\-\.\(\)]+/).filter(w => w.length > 2);
  for (const word of words) {
    keywords.push(word.toLowerCase());
  }
  
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
  
  for (const [upc, rawDesc] of upcs) {
    const prefix = upc.substring(0, 6);
    const brands = UPC_BRAND_MAP[prefix];
    
    if (!brands) continue;
    
    const brandProducts = productsNoSku.filter(p => 
      p.brand && brands.some(b => 
        p.brand!.toLowerCase() === b.toLowerCase() ||
        p.brand!.toLowerCase().includes(b.toLowerCase()) ||
        b.toLowerCase().includes(p.brand!.toLowerCase())
      )
    );
    
    if (brandProducts.length === 0) continue;
    
    const invoiceKeywords = extractKeywords(rawDesc);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const product of brandProducts) {
      const score = matchScore(invoiceKeywords, product.name, product.description || '');
      
      if (score > bestScore && score >= 0.4) {
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
    }
  }
  
  // Deduplicate - keep highest score per product
  const productToMatch = new Map<number, typeof matches[0]>();
  for (const match of matches) {
    const existing = productToMatch.get(match.productId);
    if (!existing || match.score > existing.score) {
      productToMatch.set(match.productId, match);
    }
  }
  
  // Also keep highest score per UPC
  const upcToMatch = new Map<string, typeof matches[0]>();
  for (const [productId, match] of productToMatch) {
    const existing = upcToMatch.get(match.upc);
    if (!existing || match.score > existing.score) {
      upcToMatch.set(match.upc, match);
    }
  }
  
  const finalMatches = Array.from(upcToMatch.values()).filter(m => m.score >= 0.5);
  finalMatches.sort((a, b) => b.score - a.score);
  
  console.log(`\nApplying ${finalMatches.length} matches with >= 50% confidence`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const match of finalMatches) {
    try {
      const [existing] = await db.select()
        .from(supplies)
        .where(eq(supplies.id, match.productId));
      
      if (existing && (!existing.sku || existing.sku === '')) {
        await db.update(supplies)
          .set({ sku: match.upc })
          .where(eq(supplies.id, match.productId));
        updated++;
        if (updated <= 30) {
          console.log(`Updated: ${match.productName} -> ${match.upc} (${(match.score * 100).toFixed(0)}%)`);
        }
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`Error: ${err}`);
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  
  // Get new coverage
  const result = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_sku
    FROM supplies
  `);
  
  const stats = result.rows[0] as any;
  console.log(`\nNew coverage: ${stats.with_sku}/${stats.total} = ${((Number(stats.with_sku) / Number(stats.total)) * 100).toFixed(2)}%`);
  
  process.exit(0);
}

main().catch(console.error);
