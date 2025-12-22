import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

const masterUpcs: UpcEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
console.log(`Loaded ${masterUpcs.length} UPCs from master list`);

function normalize(text: string): string {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(text: string): string[] {
  const stop = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'to', 'of', 'is']);
  return normalize(text).split(/\s+/)
    .filter(w => w.length >= 2 && !stop.has(w));
}

function getWordSet(text: string): Set<string> {
  return new Set(getWords(text));
}

const upcIndex = new Map<string, UpcEntry[]>();
const exactIndex = new Map<string, UpcEntry>();

console.log('Building search indexes...');

for (const entry of masterUpcs) {
  const norm = normalize(entry.name);
  exactIndex.set(norm, entry);
  
  const words = getWords(entry.name);
  for (const word of words) {
    if (!upcIndex.has(word)) {
      upcIndex.set(word, []);
    }
    upcIndex.get(word)!.push(entry);
  }
}

console.log(`Indexes built: ${exactIndex.size} exact, ${upcIndex.size} words`);

function findMatch(productName: string): { upc: string; name: string; score: number } | null {
  const norm = normalize(productName);
  
  const exact = exactIndex.get(norm);
  if (exact) {
    return { upc: exact.upc, name: exact.name, score: 100 };
  }
  
  const prodWords = getWords(productName);
  if (prodWords.length === 0) return null;
  
  const candidates = new Map<string, { entry: UpcEntry; hits: number }>();
  
  for (const word of prodWords) {
    const matches = upcIndex.get(word) || [];
    for (const entry of matches) {
      const key = entry.upc;
      if (!candidates.has(key)) {
        candidates.set(key, { entry, hits: 0 });
      }
      candidates.get(key)!.hits++;
    }
  }
  
  let best: { upc: string; name: string; score: number } | null = null;
  
  for (const [upc, data] of candidates) {
    const upcWords = getWordSet(data.entry.name);
    const prodWordSet = new Set(prodWords);
    
    let matching = 0;
    for (const w of prodWordSet) {
      if (upcWords.has(w)) matching++;
    }
    
    const prodCov = matching / prodWordSet.size;
    const upcCov = matching / upcWords.size;
    
    let score = Math.min(prodCov, upcCov) * 100;
    
    if (prodCov >= 0.9 && upcCov >= 0.8) score += 5;
    if (matching >= 4 && prodCov >= 0.8) score += 5;
    
    score = Math.min(100, Math.round(score));
    
    if (score >= 90 && (!best || score > best.score)) {
      best = { upc, name: data.entry.name, score };
    }
  }
  
  return best;
}

async function main() {
  console.log('Loading products from database...');
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku
  }).from(supplies);
  
  console.log(`Loaded ${products.length} products`);
  
  const noSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Products without SKU: ${noSku.length}`);
  
  const matches: { id: number; name: string; upc: string; upcName: string; score: number }[] = [];
  const noMatch: { id: number; name: string }[] = [];
  
  let processed = 0;
  const start = Date.now();
  
  for (const product of noSku) {
    processed++;
    if (processed % 1000 === 0) {
      const elapsed = (Date.now() - start) / 1000;
      const rate = processed / elapsed;
      console.log(`Processed ${processed}/${noSku.length} (${rate.toFixed(0)}/sec)...`);
    }
    
    const match = findMatch(product.name);
    
    if (match) {
      matches.push({
        id: product.id,
        name: product.name,
        upc: match.upc,
        upcName: match.name,
        score: match.score
      });
    } else {
      noMatch.push({ id: product.id, name: product.name });
    }
  }
  
  const elapsed = (Date.now() - start) / 1000;
  console.log(`\nMatching completed in ${elapsed.toFixed(1)}s`);
  
  console.log('\n=== RESULTS ===');
  console.log(`Total products: ${noSku.length}`);
  console.log(`Matched (90%+): ${matches.length}`);
  console.log(`No match: ${noMatch.length}`);
  console.log(`Match rate: ${((matches.length / noSku.length) * 100).toFixed(1)}%`);
  
  console.log('\nSample matches:');
  for (const m of matches.slice(0, 15)) {
    console.log(`  [${m.score}%] "${m.name}" => "${m.upcName}"`);
  }
  
  console.log('\nApplying matches to database...');
  
  let applied = 0;
  for (const match of matches) {
    await db.update(supplies)
      .set({ sku: match.upc })
      .where(eq(supplies.id, match.id));
    applied++;
    
    if (applied % 500 === 0) {
      console.log(`Applied ${applied}/${matches.length}...`);
    }
  }
  
  console.log(`Applied ${applied} UPCs`);
  
  fs.writeFileSync('scripts/unmatched_90.json', JSON.stringify(noMatch, null, 2));
  console.log(`Saved ${noMatch.length} unmatched to scripts/unmatched_90.json`);
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\nFinal: ${withSku}/${final.length} products have UPCs (${((withSku / final.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
