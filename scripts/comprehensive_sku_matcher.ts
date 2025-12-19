import * as fs from 'fs';
import * as path from 'path';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

interface Product {
  id: number;
  name: string;
  brand: string;
  category: string;
  sku: string | null;
}

const brandAbbrev: Record<string, string> = {
  'AQE': 'Aqueon', 'HIK': 'Hikari', 'TET': 'Tetra', 'API': 'API', 'SLI': 'Seachem',
  'WWI': 'World Wide', 'MAR': 'Marineland', 'PEN': 'Penn-Plax', 'FLV': 'Fluval',
  'ZML': 'Zoo Med', 'ZM': 'Zoo Med', 'ZIL': 'Zilla', 'FLU': 'Fluker', 'EXO': 'Exo Terra',
  'KOM': 'Komodo', 'GAL': 'Galapagos', 'NZP': 'Nature Zone',
  'BLU': 'Blue Buffalo', 'BLUE': 'Blue Buffalo', 'IAM': 'Iams', 'EUK': 'Eukanuba',
  'PUR': 'Purina', 'WEL': 'Wellness', 'NUT': 'Nutro', 'MER': 'Merrick',
  'ACN': 'Acana', 'ORI': 'Orijen', 'TAS': 'Taste of the Wild', 'FRM': 'Fromm',
  'CAN': 'Canidae', 'HIL': 'Hills', 'ROY': 'Royal Canin', 'PED': 'Pedigree',
  'CES': 'Cesar', 'BEN': 'Beneful', 'NBP': 'Natural Balance', 'VIC': 'Victor',
  'DIA': 'Diamond', 'SPM': 'Sportmix', 'NTS': 'Nutrisource',
  'KON': 'Kong', 'ETH': 'Ethical', 'SPT': 'Spot', 'MAM': 'Mammoth', 'NYL': 'Nylabone',
  'JWP': 'JW Pet', 'FOU': 'Four Paws', 'BRK': 'Barkworthies', 'GRE': 'Greenies',
  'MPF': 'Milk-Bone', 'DMF': 'Del Monte',
  'OXB': 'Oxbow', 'KAY': 'Kaytee', 'KT': 'Kaytee', 'ZUP': 'Zupreem',
  'KMP': 'Kaylor Made', 'SPF': 'Super Pet', 'HLP': 'Healthy Pet',
  'LMP': 'Living World', 'MSH': 'Marshall',
  'FMN': 'Furminator', 'BDE': 'Bioderm', 'TRO': 'TropiClean', 'ADM': 'Adams',
  'NVM': 'NaturVet', 'VET': 'Vet Solutions',
  'RBP': 'Redbarn', 'CAD': 'Cadet', 'SMB': 'SmartBones', 'WHM': 'Whimzees',
  'DEN': 'Dentley', 'BNB': 'Benebone', 'BAM': 'Bam-Bones'
};

const typeAbbrev: Record<string, string> = {
  'FD': 'Food', 'FOOD': 'Food', 'TRT': 'Treat', 'TOY': 'Toy',
  'SHMP': 'Shampoo', 'COND': 'Conditioner', 'CLNR': 'Cleaner',
  'FXTR': 'Fixture', 'BULB': 'Bulb', 'HOOD': 'Hood', 'TANK': 'Tank',
  'FLTR': 'Filter', 'PUMP': 'Pump', 'HTR': 'Heater', 'LITE': 'Light',
  'GRVL': 'Gravel', 'SBSTRT': 'Substrate', 'BEDNG': 'Bedding',
  'ORNMT': 'Ornament', 'PLNT': 'Plant', 'DECOR': 'Decor',
  'BOWL': 'Bowl', 'DISH': 'Dish', 'FDR': 'Feeder', 'WTR': 'Waterer',
  'CAGE': 'Cage', 'HBTRT': 'Habitat', 'DEN': 'Den', 'HUT': 'Hut',
  'CLLR': 'Collar', 'HRNS': 'Harness', 'LSH': 'Leash', 'BED': 'Bed',
  'RMDY': 'Remedy', 'SPLMT': 'Supplement', 'MED': 'Medicine',
  'DRY': 'Dry', 'WET': 'Wet', 'CAN': 'Canned', 'CCHLD': 'Cichlid',
  'BTTA': 'Betta', 'TRPCL': 'Tropical', 'GLDFSH': 'Goldfish',
  'ALGAE': 'Algae', 'PLECO': 'Pleco', 'KOI': 'Koi',
  'HRMT': 'Hermit', 'TRTL': 'Turtle', 'LZRD': 'Lizard', 'SNK': 'Snake',
  'BIRD': 'Bird', 'PRRT': 'Parrot', 'TIEL': 'Cockatiel', 'KEET': 'Parakeet',
  'HAMST': 'Hamster', 'GERB': 'Gerbil', 'RAT': 'Rat', 'GUIN': 'Guinea',
  'RABT': 'Rabbit', 'FERT': 'Ferret', 'CHINCH': 'Chinchilla',
  'CHK': 'Chicken', 'BF': 'Beef', 'LMB': 'Lamb', 'SLMN': 'Salmon',
  'TURK': 'Turkey', 'DCK': 'Duck', 'FSH': 'Fish', 'VNSN': 'Venison',
  'PB': 'Peanut Butter', 'BCN': 'Bacon', 'CHS': 'Cheese',
  'SM': 'Small', 'MD': 'Medium', 'LG': 'Large', 'XL': 'Extra Large',
  'XS': 'Extra Small', 'REG': 'Regular', 'GNT': 'Giant',
  'PUP': 'Puppy', 'ADL': 'Adult', 'SNR': 'Senior', 'KTN': 'Kitten',
  'BR': 'Breed', 'WT': 'Weight', 'MGMT': 'Management',
  'HLTH': 'Health', 'JNT': 'Joint', 'DGT': 'Digestive', 'SKN': 'Skin'
};

function normalize(text: string): string {
  return text.toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandAbbreviations(text: string): string {
  let expanded = text.toUpperCase();
  for (const [abbr, full] of Object.entries(brandAbbrev)) {
    expanded = expanded.replace(new RegExp('\\b' + abbr + '\\b', 'g'), full.toUpperCase());
  }
  for (const [abbr, full] of Object.entries(typeAbbrev)) {
    expanded = expanded.replace(new RegExp('\\b' + abbr + '\\b', 'g'), full.toUpperCase());
  }
  return expanded;
}

function extractTokens(text: string): Set<string> {
  return new Set(normalize(text).split(' ').filter(t => t.length > 1));
}

function similarity(invoiceName: string, dbName: string): number {
  const invExpanded = expandAbbreviations(invoiceName);
  const invTokens = extractTokens(invExpanded);
  const dbTokens = extractTokens(dbName);
  
  if (invTokens.size === 0 || dbTokens.size === 0) return 0;
  
  let matches = 0;
  for (const token of invTokens) {
    if (dbTokens.has(token)) {
      matches++;
    } else {
      for (const dbToken of dbTokens) {
        if (token.length >= 3 && dbToken.length >= 3) {
          if (token.includes(dbToken) || dbToken.includes(token)) {
            matches += 0.5;
            break;
          }
        }
      }
    }
  }
  
  const union = new Set([...invTokens, ...dbTokens]);
  return matches / union.size;
}

function parseInvoiceLine(line: string): { upc: string; name: string } | null {
  const match = line.match(/^\s*\d+\/\d*\s+(\d{5,})\s+(\d{10,14})\s+([A-Z0-9\-]*)\s+(.+)/);
  if (match) {
    return { upc: match[2], name: match[4].trim() };
  }
  return null;
}

async function main() {
  console.log('=== COMPREHENSIVE SKU MATCHER ===\n');
  
  const productsCSV = fs.readFileSync('.local/state/memory/all_products.csv', 'utf-8');
  const lines = productsCSV.split('\n').slice(1);
  const products: Product[] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^(\d+),"?([^"]*)"?,"?([^"]*)"?,"?([^"]*)"?,(.*)$/);
    if (match) {
      products.push({
        id: parseInt(match[1]),
        name: match[2],
        brand: match[3],
        category: match[4],
        sku: match[5] || null
      });
    }
  }
  
  const noSku = products.filter(p => !p.sku);
  console.log(`Total products: ${products.length}`);
  console.log(`Products without SKU: ${noSku.length}\n`);
  
  const upcDB = fs.readFileSync('.local/state/memory/comprehensive_upc_database.txt', 'utf-8');
  const upcEntries: UPCEntry[] = [];
  for (const line of upcDB.split('\n')) {
    const [upc, name, , source] = line.split('|');
    if (upc && name) {
      upcEntries.push({ upc, name, source });
    }
  }
  console.log(`UPC entries loaded: ${upcEntries.length}\n`);
  
  const matches: Array<{ productId: number; productName: string; upc: string; invoiceName: string; score: number }> = [];
  
  console.log('Matching products to UPCs...');
  for (const product of noSku) {
    let bestMatch: { upc: UPCEntry; score: number } | null = null;
    
    for (const upc of upcEntries) {
      const score = similarity(upc.name, product.name);
      if (score >= 0.9 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { upc, score };
      }
    }
    
    if (bestMatch) {
      matches.push({
        productId: product.id,
        productName: product.name,
        upc: bestMatch.upc.upc,
        invoiceName: bestMatch.upc.name,
        score: bestMatch.score
      });
    }
  }
  
  console.log(`\nMatches found (>=90%): ${matches.length}`);
  console.log(`Products still unmatched: ${noSku.length - matches.length}\n`);
  
  const matchOutput = matches.map(m => 
    `${m.productId}|${m.upc}|${m.productName}|${m.invoiceName}|${m.score.toFixed(3)}`
  ).join('\n');
  fs.writeFileSync('.local/state/memory/verified_matches_90pct.txt', matchOutput);
  
  console.log('Sample matches:');
  matches.slice(0, 30).forEach(m => 
    console.log(`  [${(m.score * 100).toFixed(0)}%] "${m.invoiceName.substring(0, 35)}" -> "${m.productName.substring(0, 35)}"`)
  );
  
  const sqlUpdates = matches.map(m => 
    `UPDATE supplies SET sku = '${m.upc}' WHERE id = ${m.productId};`
  ).join('\n');
  fs.writeFileSync('.local/state/memory/sku_updates.sql', sqlUpdates);
  console.log(`\nSQL updates saved to .local/state/memory/sku_updates.sql`);
}

main().catch(console.error);
