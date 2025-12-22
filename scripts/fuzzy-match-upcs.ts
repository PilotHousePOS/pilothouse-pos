import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, isNull, or } from 'drizzle-orm';
import * as fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

const masterUPCs: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
console.log(`Master UPCs: ${masterUPCs.length}`);

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[™®©'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function tokenSimilarity(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  
  let matchedTokens = 0;
  const used = new Set<number>();
  
  for (const t1 of tokens1) {
    let bestMatch = 0;
    let bestIdx = -1;
    for (let i = 0; i < tokens2.length; i++) {
      if (used.has(i)) continue;
      const sim = similarity(t1, tokens2[i]);
      if (sim > bestMatch) {
        bestMatch = sim;
        bestIdx = i;
      }
    }
    if (bestMatch >= 0.8 && bestIdx >= 0) {
      matchedTokens++;
      used.add(bestIdx);
    }
  }
  
  return matchedTokens / Math.max(tokens1.length, tokens2.length);
}

const brandAbbreviations: Record<string, string> = {
  'nw': 'northwest', 'nw naturals': 'northwest naturals',
  'pf': 'primal freeze dried', 'k9': 'k9 natural',
  'zm': 'zoo med', 'zm labs': 'zoo med labs',
  'exot': 'exo terra', 'fluk': 'flukers',
  'zil': 'zilla', 'tek': 'tetra',
  'hik': 'hikari', 'aq': 'aqueon',
  'mar': 'marineland', 'api': 'api',
  'fluv': 'fluval', 'sec': 'seachem',
  'glof': 'glofish', 'omeg': 'omega one',
  'oce': 'ocean nutrition', 'trop': 'tropical',
  'nat': 'natural', 'org': 'organic',
  'prem': 'premium', 'orig': 'original',
  'chk': 'chicken', 'bf': 'beef', 'slm': 'salmon',
  'trk': 'turkey', 'lmb': 'lamb', 'dck': 'duck',
  'veg': 'vegetable', 'frt': 'fruit',
  'sm': 'small', 'med': 'medium', 'lg': 'large', 'xl': 'extra large',
  'oz': 'ounce', 'lb': 'pound', 'lbs': 'pounds',
  'pk': 'pack', 'ct': 'count', 'pc': 'piece',
  'fd': 'freeze dried', 'frz': 'frozen',
  'grn': 'grain', 'gf': 'grain free',
  'rx': 'prescription', 'sens': 'sensitive',
  'jnt': 'joint', 'hip': 'hip', 'dnt': 'dental',
  'pup': 'puppy', 'kit': 'kitten', 'sr': 'senior',
  'adlt': 'adult', 'wgt': 'weight',
  'hrt': 'heart', 'skn': 'skin', 'ct': 'coat',
  'imm': 'immune', 'dgs': 'digestive',
  'col': 'collar', 'lsh': 'leash', 'hrn': 'harness',
  'crt': 'crate', 'knl': 'kennel', 'bd': 'bed',
  'bwl': 'bowl', 'fdr': 'feeder', 'wtr': 'waterer'
};

function expandAbbreviations(text: string): string {
  let expanded = text.toLowerCase();
  for (const [abbr, full] of Object.entries(brandAbbreviations)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  return expanded;
}

const upcIndex: { tokens: string[]; entry: UPCEntry; normalized: string }[] = [];
for (const entry of masterUPCs) {
  const expanded = expandAbbreviations(entry.name);
  const tokens = tokenize(expanded);
  const normalized = normalize(expanded);
  upcIndex.push({ tokens, entry, normalized });
}

async function main() {
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
    brand: supplies.brand
  }).from(supplies);
  
  console.log(`Total products: ${products.length}`);
  
  const noSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Without SKU: ${noSku.length}`);
  
  const matches: { id: number; dbName: string; upcName: string; upc: string; score: number }[] = [];
  const THRESHOLD = 0.85;
  
  console.log(`\nMatching with ${THRESHOLD * 100}% threshold...`);
  
  let processed = 0;
  for (const product of noSku) {
    const expandedName = expandAbbreviations(product.name);
    const productTokens = tokenize(expandedName);
    const productNorm = normalize(expandedName);
    
    let bestMatch: UPCEntry | null = null;
    let bestScore = 0;
    
    for (const { tokens, entry, normalized } of upcIndex) {
      const stringSim = similarity(productNorm, normalized);
      if (stringSim > bestScore) {
        bestScore = stringSim;
        bestMatch = entry;
      }
      
      const tokenSim = tokenSimilarity(productTokens, tokens);
      if (tokenSim > bestScore) {
        bestScore = tokenSim;
        bestMatch = entry;
      }
    }
    
    if (bestMatch && bestScore >= THRESHOLD) {
      matches.push({
        id: product.id,
        dbName: product.name,
        upcName: bestMatch.name,
        upc: bestMatch.upc,
        score: bestScore
      });
    }
    
    processed++;
    if (processed % 500 === 0) {
      console.log(`Processed ${processed}/${noSku.length} - Found ${matches.length} matches`);
    }
  }
  
  console.log(`\nTotal fuzzy matches: ${matches.length}`);
  
  matches.sort((a, b) => b.score - a.score);
  
  console.log('\nTop 20 matches:');
  for (const m of matches.slice(0, 20)) {
    console.log(`  [${(m.score * 100).toFixed(1)}%] "${m.dbName}" => "${m.upcName}" (${m.upc})`);
  }
  
  console.log('\nLast 20 matches (lowest scores):');
  for (const m of matches.slice(-20)) {
    console.log(`  [${(m.score * 100).toFixed(1)}%] "${m.dbName}" => "${m.upcName}" (${m.upc})`);
  }
  
  if (matches.length > 0) {
    console.log('\nApplying matches...');
    for (const m of matches) {
      await db.update(supplies)
        .set({ sku: m.upc })
        .where(eq(supplies.id, m.id));
    }
    console.log(`Applied ${matches.length} UPCs`);
  }
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\nFinal coverage: ${withSku}/${final.length} (${((withSku / final.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
