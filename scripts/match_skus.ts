import * as fs from 'fs';

const brandAbbrev: Record<string, string> = {
  'AQE': 'AQUEON', 'HIK': 'HIKARI', 'TET': 'TETRA', 'API': 'API', 'SLI': 'SEACHEM',
  'ZML': 'ZOO MED', 'ZM': 'ZOO MED', 'ZIL': 'ZILLA', 'FLU': 'FLUKER', 'EXO': 'EXO TERRA',
  'BLU': 'BLUE BUFFALO', 'BLUE': 'BLUE BUFFALO', 'IAM': 'IAMS', 'EUK': 'EUKANUBA',
  'FRM': 'FROMM', 'MER': 'MERRICK', 'ACN': 'ACANA', 'ORI': 'ORIJEN', 'VIC': 'VICTOR',
  'KON': 'KONG', 'ETH': 'ETHICAL', 'SPT': 'SPOT', 'MAM': 'MAMMOTH', 'NYL': 'NYLABONE',
  'JWP': 'JW PET', 'OXB': 'OXBOW', 'KAY': 'KAYTEE', 'KT': 'KAYTEE', 'ZUP': 'ZUPREEM',
  'RBP': 'REDBARN', 'CAD': 'CADET', 'SMB': 'SMARTBONES', 'GRE': 'GREENIES',
  'FOU': 'FOUR PAWS', 'FMN': 'FURMINATOR', 'TRO': 'TROPICLEAN', 'WWI': 'WORLD WIDE',
  'NBP': 'NATURAL BALANCE', 'ROY': 'ROYAL CANIN', 'HIL': 'HILLS',
  'SPM': 'SPORTMIX', 'DIA': 'DIAMOND', 'PED': 'PEDIGREE', 'BEN': 'BENEFUL',
  'GAL': 'GALAPAGOS', 'KOM': 'KOMODO', 'NZP': 'NATURE ZONE', 'HLP': 'HEALTHY PET',
  'MAR': 'MARINELAND', 'PBR': 'PENN PLAX', 'FLV': 'FLUVAL', 'GLO': 'GLOFISH'
};

function normalize(text: string): string {
  return text.toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expand(text: string): string {
  let result = text.toUpperCase();
  for (const [abbr, full] of Object.entries(brandAbbrev)) {
    result = result.replace(new RegExp(`^${abbr}\\b`, 'g'), full);
    result = result.replace(new RegExp(`\\s${abbr}\\b`, 'g'), ' ' + full);
  }
  return result;
}

function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(t => t.length > 1);
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

async function main() {
  console.log('=== SKU MATCHER ===\n');
  
  const productsCSV = fs.readFileSync('.local/state/memory/products_without_sku.csv', 'utf-8');
  const products: Array<{id: number; name: string; brand: string; tokens: string[]}> = [];
  
  for (const line of productsCSV.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split('|');
    const id = parseInt(parts[0]);
    const name = parts[1] || '';
    const brand = parts[2] || '';
    if (id && name) {
      const fullName = brand ? `${brand} ${name}` : name;
      products.push({ id, name, brand, tokens: tokenize(fullName) });
    }
  }
  console.log(`Products without SKU: ${products.length}`);
  
  const upcDB = fs.readFileSync('.local/state/memory/inventory_maybe_upcs.txt', 'utf-8');
  const upcEntries: Array<{upc: string; rawName: string; tokens: string[]}> = [];
  
  for (const line of upcDB.split('\n')) {
    const parts = line.split('|');
    if (parts.length >= 2) {
      const upc = parts[0].trim();
      const name = parts[1].trim();
      if (upc && name && upc.match(/^\d{8,14}$/)) {
        const expanded = expand(name);
        upcEntries.push({ upc, rawName: name, tokens: tokenize(expanded) });
      }
    }
  }
  console.log(`UPC entries: ${upcEntries.length}\n`);
  
  const matches: Array<{id: number; upc: string; score: number; prodName: string; upcName: string}> = [];
  const threshold = 0.5;
  
  for (const prod of products) {
    let bestScore = 0;
    let bestUPC: typeof upcEntries[0] | null = null;
    
    for (const upc of upcEntries) {
      const score = jaccard(prod.tokens, upc.tokens);
      if (score > bestScore) {
        bestScore = score;
        bestUPC = upc;
      }
    }
    
    if (bestUPC && bestScore >= threshold) {
      matches.push({
        id: prod.id,
        upc: bestUPC.upc,
        score: bestScore,
        prodName: prod.name,
        upcName: bestUPC.rawName
      });
    }
  }
  
  console.log(`Total matches found: ${matches.length}`);
  
  const high = matches.filter(m => m.score >= 0.9);
  const medium = matches.filter(m => m.score >= 0.7 && m.score < 0.9);
  const low = matches.filter(m => m.score >= 0.5 && m.score < 0.7);
  
  console.log(`High confidence (90%+): ${high.length}`);
  console.log(`Medium confidence (70-89%): ${medium.length}`);
  console.log(`Low confidence (50-69%): ${low.length}\n`);
  
  fs.writeFileSync('.local/state/memory/new_matches_90.txt', 
    high.map(m => `${m.id}|${m.upc}|${m.score.toFixed(3)}|${m.prodName}|${m.upcName}`).join('\n'));
  fs.writeFileSync('.local/state/memory/new_matches_70.txt',
    medium.map(m => `${m.id}|${m.upc}|${m.score.toFixed(3)}|${m.prodName}|${m.upcName}`).join('\n'));
  fs.writeFileSync('.local/state/memory/new_matches_50.txt',
    low.map(m => `${m.id}|${m.upc}|${m.score.toFixed(3)}|${m.prodName}|${m.upcName}`).join('\n'));
  
  console.log('Files written:');
  console.log('  .local/state/memory/new_matches_90.txt');
  console.log('  .local/state/memory/new_matches_70.txt');
  console.log('  .local/state/memory/new_matches_50.txt');
}

main().catch(console.error);
