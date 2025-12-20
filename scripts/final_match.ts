import { db } from './server/db';
import { supplies } from './shared/schema';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcRecord { upc: string; name: string; }

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getWords(s: string): string[] {
  return normalize(s).split(' ').filter(w => w.length >= 2);
}

function similarity(a: string, b: string): number {
  const aWords = new Set(getWords(a));
  const bWords = new Set(getWords(b));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let intersection = 0;
  for (const w of aWords) if (bWords.has(w)) intersection++;
  return intersection / new Set([...aWords, ...bWords]).size;
}

async function run() {
  const upcData: UpcRecord[] = JSON.parse(fs.readFileSync('combined_upcs.json', 'utf8'));
  const upcMap = new Map<string, UpcRecord>();
  for (const u of upcData) if (!upcMap.has(u.upc)) upcMap.set(u.upc, u);
  const uniqueUpcs = [...upcMap.values()];
  console.log('Unique UPCs:', uniqueUpcs.length);
  
  const products = await db.select().from(supplies);
  console.log('Products:', products.length);
  
  const wordIndex = new Map<string, UpcRecord[]>();
  for (const upc of uniqueUpcs) {
    for (const word of getWords(upc.name)) {
      if (!wordIndex.has(word)) wordIndex.set(word, []);
      wordIndex.get(word)!.push(upc);
    }
  }
  
  const matches: { id: number; sku: string; sim: number }[] = [];
  
  for (const product of products) {
    if (product.sku) continue; // Already has SKU
    
    const pWords = getWords(product.name);
    const candidates = new Map<string, { upc: UpcRecord; score: number }>();
    
    for (const word of pWords) {
      for (const upc of (wordIndex.get(word) || [])) {
        if (!candidates.has(upc.upc)) {
          candidates.set(upc.upc, { upc, score: similarity(product.name, upc.name) });
        }
      }
    }
    
    let best: { upc: UpcRecord; score: number } | null = null;
    for (const entry of candidates.values()) {
      if (!best || entry.score > best.score) best = entry;
    }
    
    if (best && best.score >= 0.50) {
      matches.push({ id: product.id, sku: best.upc.upc, sim: best.score });
    }
  }
  
  console.log('Matches (>=50%):', matches.length);
  
  for (let i = 0; i < matches.length; i += 50) {
    await Promise.all(matches.slice(i, i + 50).map(m => 
      db.execute(sql`UPDATE supplies SET sku = ${m.sku} WHERE id = ${m.id}`)
    ));
  }
  
  const all = await db.select().from(supplies);
  const withSku = all.filter(p => p.sku).length;
  console.log('Coverage:', withSku + '/' + all.length, '=', ((withSku/all.length)*100).toFixed(1) + '%');
  
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
