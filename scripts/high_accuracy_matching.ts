import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, and, isNull, or, sql } from 'drizzle-orm';
import * as fs from 'fs';

// Comprehensive abbreviation expansion - research-based
const ABBREVIATIONS: Record<string, string[]> = {
  // Sizes
  'sm': ['small'], 'sml': ['small'], 'md': ['medium'], 'med': ['medium'],
  'lg': ['large'], 'lrg': ['large'], 'xl': ['extra large', 'xlarge'],
  'xxl': ['extra extra large'], 'xs': ['extra small'], 'xsm': ['extra small'],
  'mini': ['mini', 'miniature'], 'reg': ['regular'],
  
  // Weights/Measures
  'oz': ['ounce', 'ounces'], 'lb': ['pound', 'pounds'], 'lbs': ['pound', 'pounds'],
  'gal': ['gallon', 'gallons'], 'qt': ['quart'], 'pt': ['pint'],
  'ml': ['milliliter'], 'g': ['gram'], 'kg': ['kilogram'],
  'in': ['inch', 'inches'], 'ft': ['foot', 'feet'], 'mm': ['millimeter'],
  
  // Quantities
  'pk': ['pack'], 'ct': ['count'], 'pc': ['piece'], 'pcs': ['pieces'],
  '1pk': ['1 pack'], '2pk': ['2 pack'], '3pk': ['3 pack'], '4pk': ['4 pack'],
  '6pk': ['6 pack'], '12pk': ['12 pack'], '24pk': ['24 pack'],
  
  // Common words
  'w': ['with'], 'w/': ['with'], 'wo': ['without'], 'w/o': ['without'],
  'adj': ['adjustable'], 'auto': ['automatic'], 'asst': ['assorted'], 'assrt': ['assorted'],
  'rplc': ['replacement'], 'repl': ['replacement'],
  
  // Pet food
  'fd': ['food'], 'fod': ['food'], 'trt': ['treat', 'treats'], 'trts': ['treats'],
  'ckn': ['chicken'], 'chkn': ['chicken'], 'chk': ['chicken'],
  'bf': ['beef'], 'slmn': ['salmon'], 'salm': ['salmon'],
  'trky': ['turkey'], 'turk': ['turkey'], 'lmb': ['lamb'],
  'vnson': ['venison'], 'ven': ['venison'], 'dck': ['duck'],
  'fsh': ['fish'], 'whfsh': ['whitefish'], 'whtfsh': ['whitefish'],
  'pllts': ['pellets'], 'pllt': ['pellet', 'pellets'], 'flks': ['flakes'],
  'frz': ['freeze', 'frozen'], 'dryd': ['dried'], 'frzdryd': ['freeze dried'],
  
  // Aquarium - Aqueon specific
  'aqe': ['aqueon'], 'aq': ['aquarium'], 'aquar': ['aquarium'],
  'fltr': ['filter'], 'flt': ['filter'], 'crtrdg': ['cartridge'], 'crtdg': ['cartridge'],
  'htr': ['heater'], 'htrs': ['heaters'], 'thrmtr': ['thermometer'],
  'cchld': ['cichlid'], 'cich': ['cichlid'], 'btta': ['betta'],
  'gldfish': ['goldfish'], 'gldfsh': ['goldfish'], 'gld': ['gold', 'goldfish'],
  'trpcl': ['tropical'], 'trop': ['tropical'], 'marn': ['marine'],
  'sltw': ['saltwater'], 'frsw': ['freshwater'], 'fw': ['freshwater'], 'sw': ['saltwater'],
  'grvl': ['gravel'], 'sbstrt': ['substrate'], 'plnt': ['plant'], 'plnts': ['plants'],
  'dcor': ['decor'], 'ornmnt': ['ornament'], 'led': ['led'],
  'fxtr': ['fixture'], 'strplght': ['striplight'], 'strp': ['strip'],
  'clnr': ['cleaner'], 'vac': ['vacuum'], 'algae': ['algae'], 'scrbr': ['scrubber'],
  'pmp': ['pump'], 'airpmp': ['air pump'], 'vlv': ['valve'],
  'cond': ['conditioner'], 'strs': ['stress'], 'tst': ['test'],
  
  // API specific
  'ar': ['api'], 'wtr': ['water'],
  
  // Hikari specific
  'hik': ['hikari'],
  
  // Reptile
  'rptl': ['reptile'], 'rept': ['reptile'], 'exo': ['exo terra'],
  'terrm': ['terrarium'], 'terr': ['terrarium'], 'uvb': ['uvb'], 'uva': ['uva'],
  'bsking': ['basking'], 'bask': ['basking'], 'htpd': ['heat pad'],
  'bulb': ['bulb'], 'blb': ['bulb'], 'spt': ['spot'], 'nght': ['night'],
  'bx': ['box'], 'bkgd': ['background'],
  'splmt': ['supplement'], 'cal': ['calcium'], 'vit': ['vitamin'],
  'bedng': ['bedding'], 'subsrt': ['substrate'], 'moss': ['moss'],
  'cork': ['cork'], 'brk': ['bark'], 'coco': ['coconut'],
  'liner': ['liner'],
  
  // Zoo Med specific
  'zmd': ['zoo med'], 'habba': ['habba'], 'rpti': ['repti'],
  'daylght': ['daylight'], 'ngtlght': ['nightlight'],
  'creatrs': ['creatures'], 'creatr': ['creature'],
  'munchies': ['munchies'],
  
  // Zilla specific
  'zla': ['zilla'], 'mni': ['mini'],
  
  // Dog/Cat
  'dg': ['dog'], 'pup': ['puppy'], 'ktn': ['kitten'], 'kit': ['kitten'],
  'chw': ['chew'], 'chws': ['chews'], 'bne': ['bone'], 'bns': ['bones'],
  'lsh': ['leash'], 'cllr': ['collar'], 'hrns': ['harness'],
  'shmp': ['shampoo'], 'cndtnr': ['conditioner'],
  'bwl': ['bowl'], 'bwls': ['bowls'], 'fdr': ['feeder'],
  'toy': ['toy'], 'tys': ['toys'],
  'knnl': ['kennel'], 'crt': ['crate'],
  'brkwy': ['breakaway'], 'brkw': ['breakaway'],
  
  // Coastal specific
  'cstl': ['coastal'], 'lp': ['lil pals', "li'l pals"],
  'gpg': ['gingham'], 'plaid': ['plaid'],
  'safe': ['safe', 'safety'], 'gid': ['glow in dark', 'glow'],
  'bfly': ['butterfly'], 'gof': ['goldfish'],
  
  // Bird
  'brd': ['bird'], 'prrt': ['parrot'], 'prkt': ['parakeet'], 'keet': ['parakeet'],
  'fnch': ['finch'], 'cnry': ['canary'], 'ccktel': ['cockatiel'],
  'prch': ['perch'], 'swng': ['swing'], 'lddr': ['ladder'],
  'mrror': ['mirror'], 'bell': ['bell'],
  
  // Small animal
  'hmstr': ['hamster'], 'grbl': ['gerbil'], 'gnpg': ['guinea pig'], 'gp': ['guinea pig'],
  'gpig': ['guinea pig'], 'rbbt': ['rabbit'], 'rbt': ['rabbit'],
  'frrt': ['ferret'], 'hdghg': ['hedgehog'],
  'hay': ['hay'], 'tmthy': ['timothy'], 'alflf': ['alfalfa'],
  'orc': ['orchard'],
  
  // Kaytee specific
  'kay': ['kaytee'], 'crittertrail': ['crittertrail'],
  
  // Oxbow specific  
  'oxb': ['oxbow'], 'sim': ['simple'], 'rwds': ['rewards'],
  
  // Penn-Plax specific
  'cascade': ['cascade'], 'pennplax': ['penn plax', 'penn-plax'],
  'drytech': ['dry tech', 'drytech'],
  
  // Brands
  'flvl': ['fluval'], 'mrln': ['marineland'], 'sera': ['sera'],
  'nyla': ['nylabone'], 'kng': ['kong'],
  'scnc': ['science'], 'hil': ['hills', "hill's"],
  'purina': ['purina'], 'iams': ['iams'],
  'frm': ['fromm'], 'nutri': ['nutrisource', 'nutri'],
  'blu': ['blue', 'blue buffalo'],
  'redbarn': ['redbarn', 'red barn'],
  'prevue': ['prevue'],
};

function expandText(text: string): string {
  let result = text.toLowerCase();
  
  // Expand abbreviations
  for (const [abbr, expansions] of Object.entries(ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    if (regex.test(result)) {
      result = result.replace(regex, expansions[0]);
    }
  }
  
  return result
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(str: string): string[] {
  return expandText(str).split(' ').filter(w => w.length > 1);
}

function calculateScore(invoiceName: string, dbName: string, brand?: string): number {
  const invoiceWords = getWords(invoiceName);
  const dbWords = getWords(dbName);
  
  if (invoiceWords.length === 0 || dbWords.length === 0) return 0;
  
  // Check for garbage invoice names (extraction errors)
  const garbagePatterns = ['est ship', 'item number', 'date number', 'qty ba or', 'type qty'];
  const invLower = invoiceName.toLowerCase();
  for (const pattern of garbagePatterns) {
    if (invLower.includes(pattern)) return 0;
  }
  
  let exactMatches = 0;
  let partialMatches = 0;
  const matchedDbWords = new Set<number>();
  
  for (const invWord of invoiceWords) {
    // Skip very short words
    if (invWord.length < 2) continue;
    
    for (let i = 0; i < dbWords.length; i++) {
      if (matchedDbWords.has(i)) continue;
      const dbWord = dbWords[i];
      
      // Exact match
      if (invWord === dbWord) {
        exactMatches++;
        matchedDbWords.add(i);
        break;
      }
      // Substring match (min 4 chars)
      else if (invWord.length >= 4 && dbWord.length >= 4) {
        if (invWord.includes(dbWord) || dbWord.includes(invWord)) {
          partialMatches += 0.8;
          matchedDbWords.add(i);
          break;
        }
      }
    }
  }
  
  // Brand match bonus
  let brandBonus = 0;
  if (brand) {
    const brandLower = brand.toLowerCase();
    const invLower = invoiceName.toLowerCase();
    if (invLower.includes(brandLower) || 
        (ABBREVIATIONS[brandLower] && ABBREVIATIONS[brandLower].some(exp => invLower.includes(exp)))) {
      brandBonus = 0.1;
    }
  }
  
  const score = (exactMatches + partialMatches) / Math.max(invoiceWords.length, dbWords.length);
  return Math.min(score + brandBonus, 1.0);
}

async function main() {
  console.log('=== HIGH ACCURACY MATCHING (80%+ only) ===\n');
  
  // Load all UPC sources
  const allUpcs = new Map<string, string>();
  
  const sources = [
    { file: '/tmp/clean_upcs.json', type: 'object' },
    { file: '/tmp/phillips_upcs_v3.json', type: 'array' },
    { file: '/tmp/pennplax_upcs.json', type: 'array' },
    { file: '/tmp/upc_mapping.json', type: 'object' },
  ];
  
  for (const source of sources) {
    try {
      const data = JSON.parse(fs.readFileSync(source.file, 'utf-8'));
      if (source.type === 'object') {
        for (const [upc, name] of Object.entries(data)) {
          if (!allUpcs.has(upc) && typeof name === 'string' && name.length > 3) {
            allUpcs.set(upc, name);
          }
        }
      } else {
        const arr = Array.isArray(data) ? data : Object.entries(data).map(([upc, name]) => ({ upc, productName: name }));
        for (const item of arr) {
          if (!allUpcs.has(item.upc) && item.productName && item.productName.length > 3) {
            allUpcs.set(item.upc, item.productName);
          }
        }
      }
    } catch (e) {}
  }
  
  console.log(`Loaded ${allUpcs.size} valid UPCs\n`);
  
  // Get products without SKU
  const products = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`Products without SKU: ${products.length}`);
  
  // Get already used SKUs
  const existing = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(and(sql`sku IS NOT NULL`, sql`sku != ''`));
  
  const usedSkus = new Set(existing.map(s => s.sku).filter(Boolean));
  console.log(`Already assigned SKUs: ${usedSkus.size}`);
  
  // Available UPCs
  const available = Array.from(allUpcs.entries()).filter(([upc]) => !usedSkus.has(upc));
  console.log(`Available for matching: ${available.length}\n`);
  
  // Match with 80%+ threshold
  const matches: Array<{id: number; name: string; brand: string; upc: string; invoiceName: string; score: number}> = [];
  const matchedUpcs = new Set<string>();
  
  for (const product of products) {
    let best: {upc: string; name: string; score: number} | null = null;
    
    for (const [upc, invoiceName] of available) {
      if (matchedUpcs.has(upc)) continue;
      
      const score = calculateScore(invoiceName, product.name, product.brand || '');
      
      if (score >= 0.80 && (!best || score > best.score)) {
        best = { upc, name: invoiceName, score };
      }
    }
    
    if (best) {
      matches.push({
        id: product.id,
        name: product.name,
        brand: product.brand || '',
        upc: best.upc,
        invoiceName: best.name,
        score: best.score
      });
      matchedUpcs.add(best.upc);
    }
  }
  
  console.log(`Found ${matches.length} matches at 80%+ confidence\n`);
  
  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score);
    
    console.log('Sample matches:');
    for (const m of matches.slice(0, 20)) {
      console.log(`  [${(m.score * 100).toFixed(0)}%] "${m.name}" -> "${m.invoiceName}"`);
    }
    
    console.log(`\nApplying ${matches.length} high-accuracy matches...`);
    
    for (const match of matches) {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.id));
    }
    
    console.log('Done!');
  }
  
  // Final stats
  const stats = await db.select({
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(case when sku is not null and sku != '' then 1 end)`
  }).from(supplies);
  
  const coverage = (stats[0].withSku / stats[0].total * 100).toFixed(2);
  console.log(`\n=== COVERAGE: ${stats[0].withSku}/${stats[0].total} (${coverage}%) ===`);
}

main().catch(console.error);
