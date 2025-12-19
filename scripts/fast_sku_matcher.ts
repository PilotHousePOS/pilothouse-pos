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
  'KMP': 'KAYLOR', 'NBP': 'NATURAL BALANCE', 'ROY': 'ROYAL CANIN', 'HIL': 'HILLS',
  'SPM': 'SPORTMIX', 'DIA': 'DIAMOND', 'PED': 'PEDIGREE', 'BEN': 'BENEFUL',
  'GAL': 'GALAPAGOS', 'KOM': 'KOMODO', 'NZP': 'NATURE ZONE', 'HLP': 'HEALTHY PET'
};

function normalize(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
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
  console.log('=== FAST SKU MATCHER ===\n');
  
  const productsCSV = fs.readFileSync('.local/state/memory/all_products.csv', 'utf-8');
  const products: Array<{id: number; name: string; sku: string | null; tokens: string[]}> = [];
  
  for (const line of productsCSV.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    const id = parseInt(parts[0]);
    const name = parts.slice(1, -3).join(',').replace(/^"|"$/g, '');
    const sku = parts[parts.length - 1] || null;
    if (id && name) {
      products.push({ id, name, sku, tokens: tokenize(name) });
    }
  }
  
  const noSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Products without SKU: ${noSku.length}`);
  
  const upcDB = fs.readFileSync('.local/state/memory/comprehensive_upc_database.txt', 'utf-8');
  const upcEntries: Array<{upc: string; name: string; tokens: string[]}> = [];
  
  for (const line of upcDB.split('\n')) {
    const [upc, name] = line.split('|');
    if (upc && name) {
      const expanded = expand(name);
      upcEntries.push({ upc, name, tokens: tokenize(expanded) });
    }
  }
  console.log(`UPC entries: ${upcEntries.length}\n`);
  
  const matches: Array<{productId: number; productName: string; upc: string; upcName: string; score: number}> = [];
  let processed = 0;
  
  for (const product of noSku) {
    let best: {upc: typeof upcEntries[0]; score: number} | null = null;
    
    for (const upc of upcEntries) {
      const score = jaccard(product.tokens, upc.tokens);
      if (score >= 0.5 && (!best || score > best.score)) {
        best = { upc, score };
      }
    }
    
    if (best && best.score >= 0.5) {
      matches.push({
        productId: product.id,
        productName: product.name,
        upc: best.upc.upc,
        upcName: best.upc.name,
        score: best.score
      });
    }
    
    processed++;
    if (processed % 500 === 0) {
      console.log(`Processed ${processed}/${noSku.length}...`);
    }
  }
  
  const high = matches.filter(m => m.score >= 0.9);
  const medium = matches.filter(m => m.score >= 0.7 && m.score < 0.9);
  const low = matches.filter(m => m.score >= 0.5 && m.score < 0.7);
  
  console.log(`\nResults:`);
  console.log(`  90%+ matches: ${high.length}`);
  console.log(`  70-89% matches: ${medium.length}`);
  console.log(`  50-69% matches: ${low.length}`);
  console.log(`  Unmatched: ${noSku.length - matches.length}`);
  
  const output = matches.sort((a, b) => b.score - a.score).map(m => 
    `${m.productId}|${m.upc}|${m.score.toFixed(3)}|${m.productName}|${m.upcName}`
  ).join('\n');
  fs.writeFileSync('.local/state/memory/all_matches.txt', output);
  
  const sql90 = high.map(m => `UPDATE supplies SET sku = '${m.upc}' WHERE id = ${m.productId};`).join('\n');
  fs.writeFileSync('.local/state/memory/sku_updates_90pct.sql', sql90);
  
  console.log(`\nFiles saved:`);
  console.log(`  all_matches.txt - all matches with scores`);
  console.log(`  sku_updates_90pct.sql - SQL for 90%+ matches (${high.length} updates)`);
  
  console.log(`\nSample 90%+ matches:`);
  high.slice(0, 20).forEach(m => console.log(`  [${(m.score*100).toFixed(0)}%] "${m.upcName.substring(0,40)}" -> "${m.productName.substring(0,40)}"`));
}

main().catch(console.error);
