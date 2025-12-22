import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

const BRAND_ABBREVS: Record<string, string> = {
  'zml': 'zoo med', 'zm': 'zoo med',
  'zil': 'zilla',
  'gal': 'galapagos',
  'flu': 'flukers', 'fluk': 'flukers',
  'exo': 'exo terra', 'ext': 'exo terra',
  'oxb': 'oxbow',
  'kay': 'kaytee',
  'hik': 'hikari',
  'tet': 'tetra',
  'aqu': 'aqueon',
  'api': 'api',
  'mar': 'marineland',
  'sec': 'seachem',
  'flu': 'fluval',
  'gre': 'greenies',
  'kon': 'kong',
  'nyl': 'nylabone',
  'ben': 'benebone',
  'cos': 'coastal',
  'lup': 'lupine',
  'sd': 'science diet',
  'rc': 'royal canin',
  'nb': 'natural balance',
  'bb': 'blue buffalo',
  'frm': 'fromm',
  'prm': 'primal',
  'vict': 'victor',
  'diam': 'diamond',
  'zig': 'zignature', 'zign': 'zignature',
  'cand': 'canidae',
  'nutr': 'nutrisource',
  'omeg': 'omega one',
  'oce': 'ocean nutrition',
  'van': 'van ness', 'vann': 'van ness',
  'pet': 'petmate',
  'mid': 'midwest',
  'ware': 'ware',
  'prev': 'prevue',
  'saf': 'safari',
  'furm': 'furminator',
  'trp': 'tropiclean', 'trop': 'tropiclean',
  'nat': 'naturvet',
  'skout': 'skouts honor',
  'zym': 'zymox',
  'four': 'four paws', 'fourp': 'four paws',
  'jw': 'jw pet',
  'ae': 'a&e',
  'bird': 'birdlife',
  'vita': 'vitakraft',
  'care': 'carefresh',
  'cas': 'cascade',
  'penn': 'penn plax',
  'aq': 'aquatop',
  'frit': 'fritz',
  'rep': 'reptile systems',
  'reps': 'reptile systems',
};

const WORD_ABBREVS: Record<string, string> = {
  'froz': 'frozen', 'fro': 'frozen', 'frz': 'frozen',
  'bedng': 'bedding', 'bedg': 'bedding',
  'ck': 'chicken', 'chk': 'chicken', 'chkn': 'chicken',
  'bf': 'beef',
  'lam': 'lamb', 'lmb': 'lamb',
  'slm': 'salmon', 'sal': 'salmon', 'salm': 'salmon',
  'trk': 'turkey', 'turk': 'turkey',
  'dck': 'duck',
  'veg': 'vegetable',
  'frt': 'fruit',
  'sm': 'small',
  'med': 'medium', 'md': 'medium',
  'lg': 'large', 'lrg': 'large',
  'xl': 'extra large', 'xlg': 'extra large',
  'oz': 'ounce',
  'lb': 'pound', 'lbs': 'pounds',
  'pk': 'pack',
  'ct': 'count',
  'pc': 'piece',
  'fd': 'freeze dried',
  'gr': 'grain', 'grn': 'grain',
  'gf': 'grain free',
  'sens': 'sensitive', 'sensi': 'sensitive',
  'pup': 'puppy',
  'kit': 'kitten',
  'sr': 'senior',
  'adlt': 'adult',
  'col': 'collar', 'cllr': 'collar',
  'lsh': 'leash',
  'hrn': 'harness',
  'bwl': 'bowl',
  'fdr': 'feeder',
  'trt': 'treat', 'trts': 'treats',
  'dntl': 'dental',
  'orig': 'original',
  'prem': 'premium',
  'asst': 'assorted',
  'shri': 'shrimp', 'shrim': 'shrimp',
  'brin': 'brine',
  'cnut': 'coconut',
  'cich': 'cichlid',
  'pel': 'pellet', 'pell': 'pellets',
  'waf': 'wafer',
  'enhan': 'enhancing',
  'terrm': 'terrarium', 'terr': 'terrarium',
  'liner': 'liner',
  'bkgd': 'background',
  'cling': 'cling',
  'des': 'desert',
  'sil': 'screen',
  'bulb': 'bulb',
  'fixt': 'fixture', 'fix': 'fixture',
  'sup': 'super',
  'stw': 'stew',
  'pron': 'pronto',
  'jum': 'jumbo',
  'bld': 'blend',
  'coco': 'coconut',
  'clay': 'clay',
  'hydro': 'hydro',
  'ball': 'balls',
  'eco': 'eco',
  'earth': 'earth',
  'loos': 'loose',
  'qt': 'quart',
  'gal': 'gallon',
  'snak': 'snack',
  'pv': 'pure vita',
  'ind': 'indoor',
  'shred': 'shredded',
  'belly': 'belly',
  'shin': 'shiny',
  'coat': 'coat',
  'health': 'healthy',
  'bugu': 'bug bite',
  'bug': 'bug',
  'bite': 'bites',
  'algae': 'algae',
  'crisp': 'crisps',
  'color': 'color',
  'spirul': 'spirulina',
  'plank': 'plankton',
  'blood': 'blood',
  'worm': 'worm',
  'prazi': 'prazipro',
  'herbal': 'herbal',
  'betta': 'betta',
  'revive': 'revive',
  'rep': 'reptile',
  'sys': 'systems',
  'zone': 'zone',
  't5': 't5',
  'uv': 'uv', 'uvb': 'uvb',
  'durable': 'durable',
  'dish': 'dish',
  'water': 'water',
};

function expandName(text: string): string {
  let expanded = text.toLowerCase().trim();
  
  const words = expanded.split(/[\s\-_]+/);
  if (words.length > 0) {
    const firstWord = words[0].replace(/[^a-z]/g, '');
    if (BRAND_ABBREVS[firstWord]) {
      words[0] = BRAND_ABBREVS[firstWord];
    }
  }
  
  const expandedWords = words.map(w => {
    const clean = w.replace(/[^a-z0-9]/g, '');
    return WORD_ABBREVS[clean] || w;
  });
  
  return expandedWords.join(' ')
    .replace(/[™®©'"#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): Set<string> {
  const expanded = expandName(text);
  const tokens = expanded
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
  return new Set(tokens);
}

function matchScore(dbTokens: Set<string>, srcTokens: Set<string>): number {
  if (dbTokens.size === 0 || srcTokens.size === 0) return 0;
  
  let matches = 0;
  for (const t of dbTokens) {
    if (srcTokens.has(t)) {
      matches++;
    } else {
      for (const s of srcTokens) {
        if ((t.length > 3 && s.includes(t)) || (s.length > 3 && t.includes(s))) {
          matches += 0.5;
          break;
        }
      }
    }
  }
  
  return matches / Math.max(dbTokens.size, srcTokens.size);
}

async function main() {
  console.log('=== RESETTING ALL SKUs ===');
  await db.update(supplies).set({ sku: null });
  
  const allMaybe: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
  const goodMaybe = allMaybe.slice(0, 3171);
  
  const master: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
  const googleSheet = master.filter(e => e.source === 'google_sheet');
  const pdfInvoices = master.filter(e => e.source.includes('.txt'));
  
  console.log(`Good Maybe: ${goodMaybe.length}`);
  console.log(`Google Sheet: ${googleSheet.length}`);
  console.log(`PDF Invoices: ${pdfInvoices.length}`);
  
  const allSources = [...goodMaybe, ...googleSheet, ...pdfInvoices];
  console.log(`Total source entries: ${allSources.length}`);
  
  const sourceIndex: { tokens: Set<string>; entry: UPCEntry }[] = [];
  for (const entry of allSources) {
    sourceIndex.push({
      tokens: tokenize(entry.name),
      entry
    });
  }
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name
  }).from(supplies);
  
  console.log(`\nTotal products: ${products.length}`);
  
  let matched = 0;
  const THRESHOLD = 0.55;
  
  for (const product of products) {
    const productTokens = tokenize(product.name);
    if (productTokens.size < 2) continue;
    
    let bestMatch: UPCEntry | null = null;
    let bestScore = 0;
    
    for (const { tokens, entry } of sourceIndex) {
      const score = matchScore(productTokens, tokens);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }
    
    if (bestMatch && bestScore >= THRESHOLD) {
      await db.update(supplies)
        .set({ sku: bestMatch.upc })
        .where(eq(supplies.id, product.id));
      matched++;
      
      if (matched <= 30 || matched % 500 === 0) {
        console.log(`[${(bestScore * 100).toFixed(0)}%] "${product.name}" => "${bestMatch.name}"`);
      }
    }
  }
  
  console.log(`\nTotal matched: ${matched}`);
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\n=== FINAL: ${withSku}/${final.length} (${((withSku / final.length) * 100).toFixed(1)}%) ===`);
}

main().catch(console.error);
