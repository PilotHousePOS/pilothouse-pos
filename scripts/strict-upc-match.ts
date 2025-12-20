import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, isNull } from 'drizzle-orm';

const brandAbbreviations: Record<string, string[]> = {
  'science diet': ['sd', 'scidiet', 'sci diet', 'hill', 'hills'],
  'taste of the wild': ['tow', 'totw'],
  'blue buffalo': ['bb', 'bluebuff', 'blue buff'],
  'royal canin': ['rc', 'royalc', 'royal can', 'roycan'],
  'pro plan': ['pp', 'proplan', 'purina pro'],
  'nutrisource': ['ns', 'nutri source', 'nutri sour'],
  'natural balance': ['nb', 'natbal', 'nat bal'],
  'kong': ['kon', 'kng'],
  'nylabone': ['nyl', 'nyla'],
  'zilla': ['zil', 'zla'],
  'zoo med': ['zm', 'zml', 'zoomed', 'zmed'],
  'exo terra': ['et', 'exot', 'exoterra'],
  'fluker': ['fluk', 'flukers'],
  'greenies': ['gre', 'green'],
  'iams': ['iam'],
  'midwest': ['mw', 'midw'],
  'redbarn': ['rb', 'rbp', 'redb', 'red b'],
  'ethical': ['eth'],
  'kaytee': ['kay', 'kt', 'kayt'],
  'tetra': ['tet', 'tetr'],
  'hikari': ['hik', 'hikar'],
  'aqueon': ['aqe', 'aque'],
  'four paws': ['fou', 'fourp', '4paws'],
  'tropiclean': ['tro', 'tropi'],
  'vital essentials': ['ve', 'vitale'],
  'fromm': ['frm', 'frmm'],
  'orijen': ['orj', 'orij'],
  'acana': ['ac', 'acan'],
  'victor': ['vic', 'vict'],
  'coastal': ['cst', 'coast'],
  'lupine': ['lup'],
  'seachem': ['sli', 'seach'],
  'api': ['api'],
  'fluval': ['fluv'],
  'marineland': ['marine'],
  'omega one': ['omg', 'omega'],
  'oxbow': ['ox', 'oxb'],
  'diamond': ['diam', 'diamnd'],
  'wellness': ['well', 'wlns'],
  'purina': ['pur'],
  'merrick': ['mer', 'merr'],
  'canidae': ['can', 'cand'],
  'earthborn': ['earth', 'eb'],
  'nutro': ['nut', 'nutr'],
  'pedigree': ['ped', 'pedg'],
  'eukanuba': ['euk'],
  'natures recipe': ['nr', 'natr'],
  'rachael ray': ['rr', 'rach'],
  'friskies': ['fri', 'frisk'],
  'fancy feast': ['ff', 'fancy'],
  'meow mix': ['mm', 'meow'],
  'arm hammer': ['ah', 'arm'],
  'furminator': ['fur', 'furm'],
  'frontline': ['fl', 'front'],
  'advantage': ['adv', 'advant'],
  'seresto': ['ser', 'seres'],
  'benebone': ['bene', 'beneb'],
  'chuckit': ['chuck', 'chk'],
  'petmate': ['pm', 'petm'],
  'starmark': ['star', 'starm'],
  'jolly pets': ['jp', 'jolly'],
  'multipet': ['mp', 'multi'],
};

const wordAbbreviations: Record<string, string[]> = {
  'small': ['sm', 'sml'],
  'medium': ['md', 'med'],
  'large': ['lg', 'lrg'],
  'extra large': ['xl', 'xlg', 'xlrg', 'x large'],
  'breed': ['br', 'brd'],
  'chicken': ['ck', 'chk', 'chkn', 'chic', 'chick'],
  'lamb': ['lam', 'lmb'],
  'beef': ['bf', 'bef'],
  'salmon': ['sal', 'slm', 'slmn', 'salm'],
  'turkey': ['trk', 'turk', 'turky'],
  'duck': ['dk', 'dck'],
  'fish': ['fsh'],
  'whitefish': ['wh fish', 'whfish', 'whtfsh'],
  'puppy': ['pup', 'ppy'],
  'kitten': ['kit', 'ktn', 'kttn'],
  'senior': ['sen', 'snr'],
  'adult': ['adt', 'adlt'],
  'weight': ['wt', 'wght'],
  'light': ['lt', 'lite'],
  'healthy': ['hlthy', 'heal'],
  'food': ['fd'],
  'treat': ['trt', 'trts'],
  'treats': ['trts'],
  'collar': ['col', 'cllr', 'collr'],
  'leash': ['lsh'],
  'harness': ['har', 'hrns'],
  'bowl': ['bwl'],
  'bed': ['bd'],
  'toy': ['ty'],
  'pound': ['lb', 'lbs'],
  'ounce': ['oz'],
  'gallon': ['gal'],
  'quart': ['qt'],
  'grain free': ['gr fr', 'grfr', 'grf'],
  'original': ['orig'],
  'maintenance': ['mainten', 'maint'],
  'premium': ['prem'],
  'skin': ['skn'],
  'yorkshire': ['york', 'yorkie'],
  'chihuahua': ['chih', 'chihu'],
  'shih tzu': ['shih', 'shihtzu'],
  'pomeranian': ['pom', 'pomer'],
  'dachshund': ['dach', 'dachs'],
  'bulldog': ['bull', 'bdog'],
  'labrador': ['lab'],
  'german shepherd': ['germ shep', 'gsd'],
  'golden retriever': ['gold ret', 'golden'],
  'apple': ['apl'],
  'peanut butter': ['pb', 'pnut but', 'peanut'],
  'sweet potato': ['sw pot', 'swpot', 'swpotato'],
  'venison': ['ven', 'vens'],
  'bison': ['bis', 'bisn'],
  'rabbit': ['rab', 'rbt'],
  'blue': ['blu'],
  'black': ['blk'],
  'white': ['wh', 'wht'],
  'green': ['grn'],
  'red': ['rd'],
  'pink': ['pnk'],
  'purple': ['pur', 'prpl'],
  'orange': ['org', 'orng'],
  'sky': ['sky'],
  'region': ['reg'],
};

function normalizeText(text: string): string {
  let t = text.toLowerCase();
  // Normalize weight units: "5lb", "5#", "5 lb" all become just "5"
  t = t.replace(/(\d+\.?\d*)\s*(?:lb|lbs|#|pound|pounds|oz|ounce|ounces)/gi, '$1');
  // Normalize common word endings
  t = t.replace(/regional/g, 'region');
  t = t.replace(/[^a-z0-9\s]/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function expandAbbreviations(text: string): string {
  let expanded = normalizeText(text);
  
  for (const [full, abbrevs] of Object.entries(brandAbbreviations)) {
    for (const abbr of abbrevs) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  
  for (const [full, abbrevs] of Object.entries(wordAbbreviations)) {
    for (const abbr of abbrevs) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  
  return expanded.replace(/\s+/g, ' ').trim();
}

function getWords(text: string): Set<string> {
  return new Set(normalizeText(text).split(' ').filter(w => w.length > 1));
}

function calculateMatchScore(sourceExpanded: string, dbExpanded: string): number {
  const sourceWords = getWords(sourceExpanded);
  const dbWords = getWords(dbExpanded);
  
  if (sourceWords.size === 0 || dbWords.size === 0) return 0;
  
  let matchCount = 0;
  for (const word of sourceWords) {
    if (dbWords.has(word)) matchCount++;
  }
  
  const precision = matchCount / sourceWords.size;
  const recall = matchCount / dbWords.size;
  
  if (precision + recall === 0) return 0;
  const f1 = 2 * (precision * recall) / (precision + recall);
  
  return f1;
}

interface UPCSource {
  upc: string;
  name: string;
  expandedName: string;
}

interface Product {
  id: number;
  name: string;
  expandedName: string;
}

async function main() {
  console.log('Loading source UPC data...');
  
  const sources: UPCSource[] = [];
  const seenUPCs = new Set<string>();
  
  // Load from complete UPC database (primary source)
  const completeDbFile = '.local/state/memory/complete_upc_database.json';
  if (fs.existsSync(completeDbFile)) {
    const data = JSON.parse(fs.readFileSync(completeDbFile, 'utf-8'));
    for (const entry of data) {
      const upc = entry.upc?.trim();
      const name = entry.name?.trim();
      if (upc && name && upc.length >= 10 && !seenUPCs.has(upc)) {
        seenUPCs.add(upc);
        sources.push({
          upc,
          name,
          expandedName: expandAbbreviations(name)
        });
      }
    }
    console.log(`Loaded ${sources.length} UPCs from complete database`);
  } else {
    // Fallback to individual files
    const googleSheet = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
    for (const line of googleSheet.split('\n').slice(1)) {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const upc = parts[0].trim();
        const name = parts[1].trim();
        if (upc && name && upc.length >= 10 && !seenUPCs.has(upc)) {
          seenUPCs.add(upc);
          sources.push({
            upc,
            name,
            expandedName: expandAbbreviations(name)
          });
        }
      }
    }
    console.log(`Loaded ${sources.length} UPCs from Google Sheet`);
    
    const invoiceFile = '.local/state/memory/all_invoice_upcs.txt';
    if (fs.existsSync(invoiceFile)) {
      const invoices = fs.readFileSync(invoiceFile, 'utf-8');
      for (const line of invoices.split('\n').slice(1)) {
        const parts = line.split('|');
        if (parts.length >= 3) {
          const upc = parts[0].trim();
          const name = parts[2].trim();
          if (upc && name && upc.length >= 10 && !seenUPCs.has(upc)) {
            seenUPCs.add(upc);
            sources.push({
              upc,
              name,
              expandedName: expandAbbreviations(name)
            });
          }
        }
      }
    }
  }
  console.log(`Total unique UPCs: ${sources.length}`);
  
  // Load database products
  console.log('Loading products from database...');
  const dbProducts = await db.select({ id: supplies.id, name: supplies.name }).from(supplies);
  
  const products: Product[] = dbProducts.map(p => ({
    id: p.id,
    name: p.name,
    expandedName: expandAbbreviations(p.name)
  }));
  console.log(`Loaded ${products.length} products`);
  
  // Calculate best match for each UPC
  console.log('Calculating matches...');
  
  interface Match {
    upc: string;
    sourceName: string;
    productId: number;
    productName: string;
    score: number;
  }
  
  const matches: Match[] = [];
  const usedProductIds = new Set<number>();
  const MIN_SCORE = 0.3; // Require at least 30% word overlap
  
  // Sort sources by name length (longer names = more specific = match first)
  sources.sort((a, b) => b.name.length - a.name.length);
  
  for (const source of sources) {
    let bestMatch: { productId: number; productName: string; score: number } | null = null;
    
    for (const product of products) {
      if (usedProductIds.has(product.id)) continue;
      
      const score = calculateMatchScore(source.expandedName, product.expandedName);
      
      if (score >= MIN_SCORE && (!bestMatch || score > bestMatch.score)) {
        bestMatch = {
          productId: product.id,
          productName: product.name,
          score
        };
      }
    }
    
    if (bestMatch) {
      matches.push({
        upc: source.upc,
        sourceName: source.name,
        productId: bestMatch.productId,
        productName: bestMatch.productName,
        score: bestMatch.score
      });
      usedProductIds.add(bestMatch.productId);
    }
  }
  
  console.log(`Found ${matches.length} matches`);
  
  // Apply matches to database in batches
  console.log('Applying matches to database...');
  let applied = 0;
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = matches.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(match => 
      db.update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.productId))
    ));
    applied += batch.length;
    
    if (applied % 500 === 0 || applied === matches.length) {
      console.log(`Applied ${applied}/${matches.length} matches...`);
    }
  }
  
  // Final stats
  const stats = await db.select({}).from(supplies);
  const withSku = stats.filter((s: any) => s.sku).length;
  const uniqueSkus = new Set(stats.filter((s: any) => s.sku).map((s: any) => s.sku)).size;
  
  console.log('\n=== FINAL RESULTS ===');
  console.log(`Total products: ${stats.length}`);
  console.log(`Products with SKU: ${withSku}`);
  console.log(`Unique SKUs: ${uniqueSkus}`);
  console.log(`Coverage: ${(withSku / stats.length * 100).toFixed(1)}%`);
  console.log(`Duplicates: ${withSku - uniqueSkus}`);
  
  // Show some example matches
  console.log('\n=== SAMPLE MATCHES ===');
  for (const match of matches.slice(0, 10)) {
    console.log(`${match.upc}: "${match.sourceName}" -> "${match.productName}" (${(match.score * 100).toFixed(0)}%)`);
  }
  
  process.exit(0);
}

main().catch(console.error);
