import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';

interface UpcCatalogEntry {
  upc: string;
  names: string[];
  primaryName: string;
}

interface UpcCatalog {
  entries: UpcCatalogEntry[];
}

interface Match {
  supplyId: number;
  supplyName: string;
  supplyBrand: string | null;
  upc: string;
  catalogName: string;
  score: number;
  method: string;
}

const BRAND_ABBREVIATIONS: Record<string, string> = {
  'sd ': 'science diet',
  'sd$': 'science diet',
  'blue b ': 'blue buffalo',
  'bluebuff': 'blue buffalo',
  'bb ': 'blue buffalo',
  'ns ': 'nutrisource',
  'totw': 'taste of the wild',
  'pp ': 'penn plax',
  'penn-plax': 'penn plax',
  'pennplax': 'penn plax',
  'rc ': 'royal canin',
  'zm ': 'zoo med',
  'et ': 'exo terra',
  'ff ': 'fromm',
  'frm ': 'fromm',
};

function extractBrand(name: string): string {
  const brands = [
    'zoomed', 'zoo med', 'api', 'tetra', 'hikari', 'fluval', 'aqueon', 'marineland',
    'exo terra', 'exoterra', 'zilla', 'repti', 'flukers', 'komodo', 'kaytee', 
    'oxbow', 'mazuri', 'zupreem', 'higgins', 'tropican', 'lafeber',
    'blue buffalo', 'wellness', 'orijen', 'acana', 'taste of the wild', 'merrick',
    'canidae', 'fromm', 'nutrisource', 'diamond', 'victor', 'purina', 'iams',
    'science diet', 'royal canin', 'hill', 'eukanuba', 'nutro',
    'coastal', 'kong', 'nylabone', 'chuckit', 'outward hound', 'mammoth',
    'jw', 'starmark', 'busy buddy', 'west paw', 'ruffwear',
    'furminator', 'andis', 'wahl', 'oster', 'conair', 'safari', 'millers forge',
    'earthbath', 'tropiclean', 'natures miracle', 'simple solution',
    'aquatop', 'penn plax', 'penn-plax', 'marina', 'seachem', 'fritz', 'brightwell',
    'caribsea', 'fluval', 'eheim', 'hydor', 'aquaclear', 'cascade',
    'prevue', 'vision', 'ware', 'kaytee', 'super pet', 'habitrail',
    'marshall', 'ferplast', 'living world', 'oxbow', 'vitakraft',
    'inaba', 'tiki cat', 'weruva', 'fussie cat', 'nulo', 'instinct',
    'stella', 'primal', 'answers', 'smallbatch', 'vital essentials'
  ];
  const lower = name.toLowerCase();
  
  for (const [abbrev, fullBrand] of Object.entries(BRAND_ABBREVIATIONS)) {
    if (abbrev.endsWith('$')) {
      const pattern = abbrev.slice(0, -1);
      if (lower.endsWith(pattern) || lower.includes(pattern + ' ')) return fullBrand;
    } else if (lower.includes(abbrev) || lower.startsWith(abbrev.trim())) {
      return fullBrand;
    }
  }
  
  for (const brand of brands) {
    if (lower.includes(brand)) return brand;
  }
  return '';
}

const TOKEN_EXPANSIONS: Record<string, string> = {
  'perf': 'perfect',
  'sensi': 'sensitive',
  'sens': 'sensitive',
  'sm': 'small',
  'lg': 'large',
  'med': 'medium',
  'br': 'breed',
  'ck': 'chicken',
  'sal': 'salmon',
  'salm': 'salmon',
  'bf': 'beef',
  'lam': 'lamb',
  'turk': 'turkey',
  'wt': 'weight',
  'dig': 'digest',
  'digest': 'digestion',
  'min': 'mini',
  'pup': 'puppy',
  'kit': 'kitten',
  'adlt': 'adult',
  'wild': 'wilderness',
  'wilder': 'wilderness',
  'grav': 'gravy',
  'stw': 'stew',
  'frz': 'frozen',
  'frzn': 'frozen',
  'grn': 'grain',
  'hlth': 'health',
  'hrbl': 'hairball',
  'trky': 'turkey',
  'bflo': 'buffalo',
  'buf': 'buffalo',
};

function expandTokens(tokens: string[]): string[] {
  const expanded: string[] = [];
  for (const t of tokens) {
    expanded.push(t);
    if (TOKEN_EXPANSIONS[t]) {
      expanded.push(TOKEN_EXPANSIONS[t]);
    }
    for (const [abbrev, full] of Object.entries(TOKEN_EXPANSIONS)) {
      if (full === t && !expanded.includes(abbrev)) {
        expanded.push(abbrev);
      }
    }
  }
  return [...new Set(expanded)];
}

function extractTokens(str: string): string[] {
  const tokens = str.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
  return expandTokens(tokens);
}

function extractNumbers(str: string): string[] {
  const matches = str.match(/\d+(?:\.\d+)?(?:oz|lb|pk|ct|gal|qt|ml|l|in|ft|"|')?/gi) || [];
  return matches.map(m => m.toLowerCase());
}

function scoreMatch(supplyTokens: string[], catalogTokens: string[], supplyNums: string[], catalogNums: string[]): number {
  let score = 0;
  
  const commonTokens = supplyTokens.filter(t => catalogTokens.includes(t));
  const tokenScore = commonTokens.length / Math.max(supplyTokens.length, catalogTokens.length);
  score += tokenScore * 0.6;
  
  const commonNums = supplyNums.filter(n => catalogNums.some(cn => cn.includes(n) || n.includes(cn)));
  if (supplyNums.length > 0 && catalogNums.length > 0) {
    const numScore = commonNums.length / Math.max(supplyNums.length, catalogNums.length);
    score += numScore * 0.4;
  } else {
    score += tokenScore * 0.4;
  }
  
  return score;
}

async function smartMatch() {
  console.log('=== SMART UPC MATCHING ===\n');

  const catalog: UpcCatalog = JSON.parse(fs.readFileSync('scripts/upc_catalog.json', 'utf-8'));
  console.log(`Catalog: ${catalog.entries.length} UPCs with names`);

  const allSupplies = await db.select().from(supplies);
  const needsUpc = allSupplies.filter(s => !s.sku || s.sku.trim() === '');
  const hasUpc = allSupplies.filter(s => s.sku && s.sku.trim() !== '');
  console.log(`Supplies needing UPC: ${needsUpc.length}`);
  console.log(`Supplies with UPC: ${hasUpc.length}`);

  console.log('\nBuilding brand index...');
  const brandIndex = new Map<string, UpcCatalogEntry[]>();
  const allEntries: { entry: UpcCatalogEntry; tokens: string[]; nums: string[]; brand: string }[] = [];
  
  for (const entry of catalog.entries) {
    const allNames = entry.names.join(' ');
    const brand = extractBrand(allNames);
    const tokens = extractTokens(allNames);
    const nums = extractNumbers(allNames);
    
    allEntries.push({ entry, tokens, nums, brand });
    
    if (brand) {
      if (!brandIndex.has(brand)) brandIndex.set(brand, []);
      brandIndex.get(brand)!.push(entry);
    }
  }
  console.log(`Brands indexed: ${brandIndex.size}`);

  const matches: Match[] = [];
  let processed = 0;

  console.log('\nMatching...');
  
  for (const supply of needsUpc) {
    processed++;
    if (processed % 500 === 0) console.log(`  ${processed}/${needsUpc.length}`);

    let supplyBrand = extractBrand(supply.name);
    if (!supplyBrand && supply.brand) {
      supplyBrand = extractBrand(supply.brand);
      if (!supplyBrand) supplyBrand = supply.brand.toLowerCase().trim();
    }
    const supplyTokens = extractTokens(supply.name);
    const supplyNums = extractNumbers(supply.name);

    if (supplyTokens.length < 2) continue;

    let candidates = allEntries;
    if (supplyBrand && brandIndex.has(supplyBrand)) {
      const brandEntries = brandIndex.get(supplyBrand)!;
      candidates = allEntries.filter(e => brandEntries.includes(e.entry));
    }

    let bestMatch: { entry: UpcCatalogEntry; score: number; name: string } | null = null;

    for (const cand of candidates) {
      const score = scoreMatch(supplyTokens, cand.tokens, supplyNums, cand.nums);
      if (score > 0.5 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { entry: cand.entry, score, name: cand.entry.primaryName };
      }
    }

    if (bestMatch && bestMatch.score >= 0.55) {
      matches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        supplyBrand: supply.brand,
        upc: bestMatch.entry.upc,
        catalogName: bestMatch.name,
        score: bestMatch.score,
        method: supplyBrand ? 'brand+tokens' : 'tokens'
      });
    }
  }

  const highConf = matches.filter(m => m.score >= 0.75);
  const medConf = matches.filter(m => m.score >= 0.65 && m.score < 0.75);
  const lowConf = matches.filter(m => m.score >= 0.55 && m.score < 0.65);

  console.log('\n=== RESULTS ===');
  console.log(`High confidence (>=75%): ${highConf.length}`);
  console.log(`Medium confidence (65-75%): ${medConf.length}`);
  console.log(`Low confidence (55-65%): ${lowConf.length}`);
  console.log(`Total matches: ${matches.length}`);

  const projectedCoverage = hasUpc.length + matches.length;
  console.log(`\nProjected coverage: ${projectedCoverage}/${allSupplies.length} (${(projectedCoverage/allSupplies.length*100).toFixed(1)}%)`);

  fs.writeFileSync('scripts/smart_matches.json', JSON.stringify(matches, null, 2));

  console.log('\n=== SAMPLE HIGH CONFIDENCE ===');
  for (const m of highConf.slice(0, 15)) {
    console.log(`[${(m.score*100).toFixed(0)}%] "${m.supplyName}"`);
    console.log(`    -> "${m.catalogName}" | UPC: ${m.upc}`);
  }

  console.log('\n=== SAMPLE MEDIUM CONFIDENCE ===');
  for (const m of medConf.slice(0, 10)) {
    console.log(`[${(m.score*100).toFixed(0)}%] "${m.supplyName}"`);
    console.log(`    -> "${m.catalogName}" | UPC: ${m.upc}`);
  }
}

smartMatch().catch(console.error);
