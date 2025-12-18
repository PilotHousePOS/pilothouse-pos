import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, and, isNull, ilike, or, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface PennPlaxProduct {
  name: string;
  sku: string;
}

interface MatchResult {
  supplyId: number;
  supplyName: string;
  invoiceName: string;
  sku: string;
  confidence: number;
  matchType: 'manual' | 'auto';
}

const manualPatterns: Array<{
  supplyPattern: RegExp;
  skuMap: Record<string, string>;
}> = [
  {
    supplyPattern: /quick net (\d+) in/i,
    skuMap: {
      '2': '030172230028',
      '3': '030172230035',
      '4': '030172230042',
      '5': '030172230059',
      '6': '030172230066',
      '8': '030172230080',
      '10': '030172230103',
    }
  },
  {
    supplyPattern: /quick net 5l in/i,
    skuMap: {
      'default': '030172230509',
    }
  },
  {
    supplyPattern: /(\d+)w mini heater/i,
    skuMap: {
      '10': '030172094835',
      '25': '030172094842',
    }
  },
  {
    supplyPattern: /(\d+)w heater/i,
    skuMap: {
      '100': '030172034695',
    }
  },
  {
    supplyPattern: /divider (\d+)-(\d+)/i,
    skuMap: {
      '10': '030172391019',
      '15': '030172391026',
      '20': '030172391033',
      '29': '030172391040',
    }
  },
  {
    supplyPattern: /gravel vac (\d+)/i,
    skuMap: {
      '10': '030172001390',
      '16': '030172001406',
      '24': '030172001413',
    }
  },
  {
    supplyPattern: /cascade (\d+) hang/i,
    skuMap: {
      '20': '030172070990',
      '80': '030172015526',
      '100': '030172070983',
      '150': '030172015533',
      '200': '030172015540',
      '300': '030172015557',
    }
  },
  {
    supplyPattern: /nano air pump/i,
    skuMap: {
      'default': '030172084256',
    }
  },
  {
    supplyPattern: /airtech 2k1/i,
    skuMap: {
      'default': '030172047220',
    }
  },
  {
    supplyPattern: /airtech 2k4/i,
    skuMap: {
      'default': '030172047237',
    }
  },
  {
    supplyPattern: /airpod.*2k4/i,
    skuMap: {
      'default': '030172047237',
    }
  },
  {
    supplyPattern: /reptology internal filter/i,
    skuMap: {
      'default': '030172060724',
    }
  },
];

function normalizeText(text: string): string {
  return text
    .replace(/[™®©]/g, '')
    .replace(/[''"]/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function extractNumbers(text: string): string[] {
  const matches = text.match(/\d+(\.\d+)?/g) || [];
  return matches;
}

function getProductType(name: string): string | null {
  const lower = name.toLowerCase();
  const types = [
    'heater', 'filter', 'net', 'pump', 'tank', 'divider', 'thermometer', 
    'decoration', 'ornament', 'plant', 'gravel', 'tubing', 'feeder',
    'cuttlebone', 'perch', 'toy', 'cave', 'bridge', 'castle', 'skull',
    'driftwood', 'rock', 'crystal', 'lounger', 'pier', 'vine'
  ];
  for (const type of types) {
    if (lower.includes(type)) return type;
  }
  return null;
}

function getSize(name: string): string | null {
  const lower = name.toLowerCase();
  if (/\b(extra large|x.?large|xl)\b/i.test(lower)) return 'xlarge';
  if (/\b(mini)\b/i.test(lower)) return 'mini';
  if (/\b(small|sm)\b/i.test(lower)) return 'small';
  if (/\b(medium|med|md)\b/i.test(lower)) return 'medium';
  if (/\b(large|lg)\b/i.test(lower)) return 'large';
  return null;
}

function getProductLine(name: string): string | null {
  const lower = name.toLowerCase();
  const lines: [string, RegExp][] = [
    ['action air', /\b(action.?air|act.?air)\b/],
    ['tide treasure', /\b(tide.?(and|&)?.?treasure)\b/],
    ['cascade', /\bcascade\b/],
    ['reptology', /\breptology\b/],
    ['bird life', /\bbird.?life\b/],
    ['cat life', /\bcat.?life\b/],
    ['dog life', /\bdog.?s?.?life\b/],
    ['shorefins', /\bshorefins\b/],
    ['spongebob', /\b(spongebob|sponge.?bob)\b/],
    ['disney', /\b(disney|finding.?(dory|nemo)|pixar)\b/],
    ['paw patrol', /\bpaw.?patrol\b/],
    ['minions', /\bminions\b/],
    ['hot wheels', /\bhot.?wheels?\b/],
    ['barbie', /\bbarbie\b/],
    ['star wars', /\bstar.?wars\b/],
    ['small world', /\b(small.?world|habitat)\b/],
    ['betta world', /\bbetta.?world\b/],
    ['aqua plant', /\b(aqua.?p(la)?nt|sinker)\b/],
  ];
  
  for (const [lineName, pattern] of lines) {
    if (pattern.test(lower)) return lineName;
  }
  return null;
}

function extractKeyTerms(name: string): Set<string> {
  const normalized = normalizeText(name);
  const stopWords = new Set(['the', 'and', 'for', 'with', 'size', 'color', 'pack', 'piece', 'kit', 'set', 'penn', 'plax', 'style']);
  
  const terms = new Set<string>();
  const words = normalized.split(/\s+/);
  
  for (const word of words) {
    if (word.length >= 3 && !stopWords.has(word)) {
      terms.add(word);
    }
  }
  
  return terms;
}

function calculateSimilarity(invoiceName: string, supplyName: string): number {
  const invNorm = normalizeText(invoiceName);
  const supNorm = normalizeText(supplyName);
  
  if (invNorm === supNorm) return 100;
  
  let score = 0;
  let penalties = 0;
  
  const invLine = getProductLine(invoiceName);
  const supLine = getProductLine(supplyName);
  
  if (invLine && supLine) {
    if (invLine === supLine) {
      score += 30;
    } else {
      return 0;
    }
  } else if (invLine || supLine) {
    penalties += 10;
  }
  
  const invSize = getSize(invoiceName);
  const supSize = getSize(supplyName);
  
  if (invSize && supSize) {
    if (invSize === supSize) {
      score += 20;
    } else {
      return 0;
    }
  }
  
  const invType = getProductType(invoiceName);
  const supType = getProductType(supplyName);
  
  if (invType && supType) {
    if (invType === supType) {
      score += 15;
    } else {
      return 0;
    }
  }
  
  const invNums = extractNumbers(invoiceName);
  const supNums = extractNumbers(supplyName);
  
  if (invNums.length > 0 && supNums.length > 0) {
    const commonNums = invNums.filter(n => supNums.includes(n));
    if (commonNums.length > 0) {
      score += 15;
    } else {
      penalties += 10;
    }
  }
  
  const invTerms = extractKeyTerms(invoiceName);
  const supTerms = extractKeyTerms(supplyName);
  
  let matchCount = 0;
  for (const term of invTerms) {
    if (supTerms.has(term)) {
      matchCount++;
    } else {
      for (const supTerm of supTerms) {
        if (term.length >= 4 && supTerm.length >= 4) {
          if (term.includes(supTerm) || supTerm.includes(term)) {
            matchCount += 0.7;
            break;
          }
        }
      }
    }
  }
  
  const totalTerms = Math.max(invTerms.size, supTerms.size);
  if (totalTerms > 0) {
    const termScore = (matchCount / totalTerms) * 35;
    score += termScore;
  }
  
  score -= penalties;
  
  return Math.max(0, Math.min(score, 100));
}

function tryManualMatch(supplyName: string): { sku: string; confidence: number } | null {
  const normalized = supplyName.toLowerCase();
  
  for (const pattern of manualPatterns) {
    const match = normalized.match(pattern.supplyPattern);
    if (match) {
      if (pattern.skuMap['default']) {
        return { sku: pattern.skuMap['default'], confidence: 95 };
      }
      const key = match[1];
      if (key && pattern.skuMap[key]) {
        return { sku: pattern.skuMap[key], confidence: 95 };
      }
    }
  }
  
  return null;
}

function parsePennPlaxData(textFile: string): PennPlaxProduct[] {
  const products: PennPlaxProduct[] = [];
  const skuMap = new Map<string, string>();
  
  const content = fs.readFileSync(textFile, 'utf8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    const match = line.match(/(.+?)\s*(030172\d{6})/);
    if (match) {
      const name = match[1].trim();
      const sku = match[2];
      
      if (name && !skuMap.has(sku)) {
        skuMap.set(sku, name);
      }
    }
  }
  
  for (const [sku, name] of skuMap) {
    products.push({ name, sku });
  }
  
  return products;
}

async function main() {
  console.log('=== Penn-Plax SKU Matching Script ===\n');
  
  const textFile = '/tmp/penn_plax_combined.txt';
  
  if (!fs.existsSync(textFile)) {
    console.error('Error: Penn-Plax text file not found. Run pdftotext extraction first.');
    process.exit(1);
  }
  
  const allProducts = parsePennPlaxData(textFile);
  console.log(`Extracted ${allProducts.length} unique products with SKUs\n`);
  
  const skuToProduct = new Map<string, string>();
  for (const p of allProducts) {
    skuToProduct.set(p.sku, p.name);
  }
  
  const pennPlaxSupplies = await db.select()
    .from(supplies)
    .where(and(
      ilike(supplies.brand, '%penn%plax%'),
      or(isNull(supplies.sku), eq(supplies.sku, ''))
    ));
  
  console.log(`Found ${pennPlaxSupplies.length} Penn-Plax supplies missing SKUs\n`);
  
  const matches: MatchResult[] = [];
  const usedSkus = new Set<string>();
  const matchedSupplyIds = new Set<number>();
  
  for (const supply of pennPlaxSupplies) {
    const manualMatch = tryManualMatch(supply.name);
    if (manualMatch && !usedSkus.has(manualMatch.sku)) {
      const invoiceName = skuToProduct.get(manualMatch.sku) || `SKU: ${manualMatch.sku}`;
      matches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        invoiceName,
        sku: manualMatch.sku,
        confidence: manualMatch.confidence,
        matchType: 'manual'
      });
      usedSkus.add(manualMatch.sku);
      matchedSupplyIds.add(supply.id);
      continue;
    }
    
    let bestMatch: { product: PennPlaxProduct; score: number } | null = null;
    
    for (const product of allProducts) {
      if (usedSkus.has(product.sku)) continue;
      
      const score = calculateSimilarity(product.name, supply.name);
      
      if (score >= 45 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { product, score };
      }
    }
    
    if (bestMatch && bestMatch.score >= 50) {
      matches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        invoiceName: bestMatch.product.name,
        sku: bestMatch.product.sku,
        confidence: bestMatch.score,
        matchType: 'auto'
      });
      usedSkus.add(bestMatch.product.sku);
      matchedSupplyIds.add(supply.id);
    }
  }
  
  matches.sort((a, b) => b.confidence - a.confidence);
  
  console.log(`\n=== Manual Matches (Pattern-Based) ===\n`);
  const manualMatches = matches.filter(m => m.matchType === 'manual');
  for (const match of manualMatches) {
    console.log(`[${match.confidence.toFixed(0)}%] DB: "${match.supplyName}"`);
    console.log(`       Invoice: "${match.invoiceName}"`);
    console.log(`       SKU: ${match.sku}\n`);
  }
  
  console.log(`\n=== Auto Matches (>= 50% confidence) ===\n`);
  const autoMatches = matches.filter(m => m.matchType === 'auto');
  for (const match of autoMatches) {
    console.log(`[${match.confidence.toFixed(0)}%] DB: "${match.supplyName}"`);
    console.log(`       Invoice: "${match.invoiceName}"`);
    console.log(`       SKU: ${match.sku}\n`);
  }
  
  console.log(`\nTotal matches: ${matches.length} (Manual: ${manualMatches.length}, Auto: ${autoMatches.length})`);
  console.log(`Supplies still unmatched: ${pennPlaxSupplies.length - matches.length}`);
  
  console.log('\n=== Sample Unmatched Supplies ===\n');
  const unmatched = pennPlaxSupplies.filter(s => !matchedSupplyIds.has(s.id)).slice(0, 40);
  for (const s of unmatched) {
    console.log(`- "${s.name}"`);
  }
  
  console.log('\n=== Sample Unused Invoice Products ===\n');
  const unusedProducts = allProducts.filter(p => !usedSkus.has(p.sku)).slice(0, 40);
  for (const p of unusedProducts) {
    console.log(`- "${p.name}" (${p.sku})`);
  }
  
  const confirmUpdate = process.argv.includes('--update');
  
  if (confirmUpdate && matches.length > 0) {
    console.log('\n=== Updating Database ===\n');
    
    for (const match of matches) {
      await db.update(supplies)
        .set({ sku: match.sku })
        .where(eq(supplies.id, match.supplyId));
      console.log(`Updated: ${match.supplyName} -> ${match.sku}`);
    }
    
    console.log(`\nUpdated ${matches.length} supplies with SKUs`);
  } else if (matches.length > 0) {
    console.log('\nRun with --update flag to apply changes to database');
  }
}

main().catch(console.error);
