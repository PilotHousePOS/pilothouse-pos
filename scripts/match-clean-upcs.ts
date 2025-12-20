import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcRecord { upc: string; name: string; }

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getWords(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(w => w.length >= 2));
}

function matchScore(productName: string, upcName: string): number {
  const pWords = getWords(productName);
  const uWords = getWords(upcName);
  let matches = 0;
  for (const w of pWords) {
    if (uWords.has(w)) matches++;
  }
  const minSize = Math.min(pWords.size, uWords.size);
  return minSize > 0 ? matches / minSize : 0;
}

async function run() {
  const upcData: UpcRecord[] = JSON.parse(fs.readFileSync('clean_upcs.json', 'utf8'));
  console.log(`Loaded ${upcData.length} unique UPCs`);
  
  const products = await db.select().from(supplies).where(isNull(supplies.sku));
  console.log(`Products without SKU: ${products.length}`);
  
  // Build word index
  const wordToUpcs = new Map<string, UpcRecord[]>();
  for (const upc of upcData) {
    for (const w of getWords(upc.name)) {
      if (!wordToUpcs.has(w)) wordToUpcs.set(w, []);
      wordToUpcs.get(w)!.push(upc);
    }
  }
  
  const updates: { id: number; sku: string; score: number }[] = [];
  
  for (const product of products) {
    const pWords = getWords(product.name);
    const candidates = new Map<string, UpcRecord>();
    
    for (const w of pWords) {
      for (const upc of (wordToUpcs.get(w) || [])) {
        candidates.set(upc.upc, upc);
      }
    }
    
    let bestUpc: UpcRecord | null = null;
    let bestScore = 0;
    
    for (const upc of candidates.values()) {
      const score = matchScore(product.name, upc.name);
      if (score > bestScore) {
        bestScore = score;
        bestUpc = upc;
      }
    }
    
    // Higher threshold for better accuracy
    if (bestUpc && bestScore >= 0.5) {
      updates.push({ id: product.id, sku: bestUpc.upc, score: bestScore });
    }
  }
  
  console.log(`Found ${updates.length} matches with ≥50% similarity`);
  
  // Apply
  for (let i = 0; i < updates.length; i += 50) {
    await Promise.all(updates.slice(i, i + 50).map(u => 
      db.execute(sql`UPDATE supplies SET sku = ${u.sku} WHERE id = ${u.id}`)
    ));
    if ((i + 50) % 500 === 0) console.log(`Applied ${Math.min(i + 50, updates.length)}/${updates.length}`);
  }
  
  const all = await db.select().from(supplies);
  const withSku = all.filter(p => p.sku).length;
  console.log(`\nCoverage: ${withSku}/${all.length} = ${((withSku/all.length)*100).toFixed(1)}%`);
  
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
