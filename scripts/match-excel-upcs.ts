import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcRecord { upc: string; name: string; }

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(s: string): string[] {
  return normalize(s).split(' ').filter(w => w.length >= 2);
}

// Calculate Jaccard similarity
function similarity(a: string, b: string): number {
  const aWords = new Set(getWords(a));
  const bWords = new Set(getWords(b));
  
  if (aWords.size === 0 || bWords.size === 0) return 0;
  
  let intersection = 0;
  for (const w of aWords) {
    if (bWords.has(w)) intersection++;
  }
  
  const union = new Set([...aWords, ...bWords]).size;
  return intersection / union;
}

// Check if names share a brand at the start
function sharesBrand(a: string, b: string): boolean {
  const aFirst = getWords(a)[0];
  const bFirst = getWords(b)[0];
  return aFirst && bFirst && aFirst === bFirst;
}

async function run() {
  const upcData: UpcRecord[] = JSON.parse(fs.readFileSync('combined_upcs.json', 'utf8'));
  console.log(`Loaded ${upcData.length} UPCs from Excel`);
  
  // Deduplicate - keep first occurrence
  const upcMap = new Map<string, UpcRecord>();
  for (const u of upcData) {
    if (!upcMap.has(u.upc)) {
      upcMap.set(u.upc, u);
    }
  }
  const uniqueUpcs = [...upcMap.values()];
  console.log(`Unique UPCs: ${uniqueUpcs.length}`);
  
  const products = await db.select().from(supplies);
  console.log(`Total products: ${products.length}`);
  
  // Build word index for fast lookup
  const wordIndex = new Map<string, UpcRecord[]>();
  for (const upc of uniqueUpcs) {
    for (const word of getWords(upc.name)) {
      if (!wordIndex.has(word)) wordIndex.set(word, []);
      wordIndex.get(word)!.push(upc);
    }
  }
  
  const matches: { id: number; sku: string; pName: string; uName: string; sim: number }[] = [];
  
  for (const product of products) {
    const pWords = getWords(product.name);
    
    // Collect candidates that share words
    const candidateScores = new Map<string, { upc: UpcRecord; score: number }>();
    
    for (const word of pWords) {
      const candidates = wordIndex.get(word) || [];
      for (const upc of candidates) {
        if (!candidateScores.has(upc.upc)) {
          const sim = similarity(product.name, upc.name);
          const bonus = sharesBrand(product.name, upc.name) ? 0.1 : 0;
          candidateScores.set(upc.upc, { upc, score: sim + bonus });
        }
      }
    }
    
    // Find best match
    let best: { upc: UpcRecord; score: number } | null = null;
    for (const entry of candidateScores.values()) {
      if (!best || entry.score > best.score) {
        best = entry;
      }
    }
    
    // Threshold: 50% similarity for match
    if (best && best.score >= 0.50) {
      matches.push({
        id: product.id,
        sku: best.upc.upc,
        pName: product.name,
        uName: best.upc.name,
        sim: best.score
      });
    }
  }
  
  console.log(`\nFound ${matches.length} matches (≥40% similarity)`);
  
  // Apply in batches
  for (let i = 0; i < matches.length; i += 50) {
    const batch = matches.slice(i, i + 50);
    await Promise.all(batch.map(m => 
      db.execute(sql`UPDATE supplies SET sku = ${m.sku} WHERE id = ${m.id}`)
    ));
    if ((i + 50) % 500 === 0) {
      console.log(`Applied ${Math.min(i + 50, matches.length)}/${matches.length}`);
    }
  }
  
  // Final stats
  const final = await db.select().from(supplies);
  const withSku = final.filter(p => p.sku).length;
  console.log(`\n=== FINAL RESULTS ===`);
  console.log(`Coverage: ${withSku}/${final.length} = ${((withSku/final.length)*100).toFixed(1)}%`);
  
  // Sample high-confidence matches
  console.log(`\n=== SAMPLE HIGH CONFIDENCE MATCHES (>70%) ===`);
  const highConf = matches.filter(m => m.sim >= 0.70).slice(0, 15);
  for (const m of highConf) {
    console.log(`✓ ${m.pName}`);
    console.log(`  → ${m.uName} (${(m.sim * 100).toFixed(0)}%)`);
  }
  
  // Sample borderline matches
  console.log(`\n=== SAMPLE BORDERLINE MATCHES (40-50%) ===`);
  const borderline = matches.filter(m => m.sim >= 0.40 && m.sim < 0.50).slice(0, 15);
  for (const m of borderline) {
    console.log(`? ${m.pName}`);
    console.log(`  → ${m.uName} (${(m.sim * 100).toFixed(0)}%)`);
  }
  
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
