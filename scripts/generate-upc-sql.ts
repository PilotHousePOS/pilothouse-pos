import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';

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
  'grain free': ['gr fr', 'grfr', 'grf'],
  'original': ['orig'],
  'maintenance': ['mainten', 'maint'],
  'premium': ['prem'],
  'skin': ['skn'],
  'yorkshire': ['york', 'yorkie'],
  'chihuahua': ['chih', 'chihu'],
  'region': ['reg'],
};

function normalizeText(text: string): string {
  let t = text.toLowerCase();
  t = t.replace(/(\d+\.?\d*)\s*(?:lb|lbs|#|pound|pounds|oz|ounce|ounces)/gi, '$1');
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
  return 2 * (precision * recall) / (precision + recall);
}

async function main() {
  console.log('Loading source UPC data...');
  
  const sources: {upc: string, name: string, expandedName: string}[] = [];
  const seenUPCs = new Set<string>();
  
  const data = JSON.parse(fs.readFileSync('.local/state/memory/complete_upc_database.json', 'utf-8'));
  for (const entry of data) {
    const upc = entry.upc?.trim();
    const name = entry.name?.trim();
    if (upc && name && upc.length >= 10 && !seenUPCs.has(upc)) {
      seenUPCs.add(upc);
      sources.push({ upc, name, expandedName: expandAbbreviations(name) });
    }
  }
  console.log(`Loaded ${sources.length} UPCs`);
  
  console.log('Loading products from database...');
  const dbProducts = await db.select({ id: supplies.id, name: supplies.name }).from(supplies);
  const products = dbProducts.map(p => ({
    id: p.id,
    name: p.name,
    expandedName: expandAbbreviations(p.name)
  }));
  console.log(`Loaded ${products.length} products`);
  
  console.log('Calculating matches...');
  const matches: {upc: string, productId: number, score: number}[] = [];
  const usedProductIds = new Set<number>();
  const MIN_SCORE = 0.3;
  
  sources.sort((a, b) => b.name.length - a.name.length);
  
  for (const source of sources) {
    let bestMatch: {productId: number, score: number} | null = null;
    for (const product of products) {
      if (usedProductIds.has(product.id)) continue;
      const score = calculateMatchScore(source.expandedName, product.expandedName);
      if (score >= MIN_SCORE && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { productId: product.id, score };
      }
    }
    if (bestMatch) {
      matches.push({ upc: source.upc, productId: bestMatch.productId, score: bestMatch.score });
      usedProductIds.add(bestMatch.productId);
    }
  }
  
  console.log(`Found ${matches.length} matches`);
  
  // Save matches to JSON file
  fs.writeFileSync('.local/state/memory/upc_matches_to_apply.json', JSON.stringify(matches, null, 2));
  console.log('Saved matches to .local/state/memory/upc_matches_to_apply.json');
  
  // Generate SQL
  const sqlStatements = matches.map(m => 
    `UPDATE supplies SET sku = '${m.upc}' WHERE id = ${m.productId};`
  );
  fs.writeFileSync('.local/state/memory/apply_upcs.sql', sqlStatements.join('\n'));
  console.log(`Generated ${matches.length} SQL statements`);
  
  process.exit(0);
}

main().catch(console.error);
