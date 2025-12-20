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
  const total = Math.max(pWords.size, uWords.size);
  return total > 0 ? matches / total : 0;
}

async function run() {
  const upcData: UpcRecord[] = JSON.parse(fs.readFileSync('all_upcs.json', 'utf8'));
  console.log(`Loaded ${upcData.length} UPCs`);
  
  const products = await db.select().from(supplies).where(isNull(supplies.sku));
  console.log(`Products without SKU: ${products.length}`);
  
  // Build word index for UPCs
  const wordToUpcs = new Map<string, UpcRecord[]>();
  for (const upc of upcData) {
    const words = getWords(upc.name);
    for (const w of words) {
      if (!wordToUpcs.has(w)) wordToUpcs.set(w, []);
      wordToUpcs.get(w)!.push(upc);
    }
  }
  
  let matched = 0;
  const updates: { id: number; sku: string }[] = [];
  
  for (const product of products) {
    const pWords = getWords(product.name);
    
    // Collect candidate UPCs that share at least one word
    const candidates = new Map<string, UpcRecord>();
    for (const w of pWords) {
      const upcs = wordToUpcs.get(w) || [];
      for (const upc of upcs) {
        candidates.set(upc.upc, upc);
      }
    }
    
    // Find best match
    let bestUpc: UpcRecord | null = null;
    let bestScore = 0;
    for (const upc of candidates.values()) {
      const score = matchScore(product.name, upc.name);
      if (score > bestScore) {
        bestScore = score;
        bestUpc = upc;
      }
    }
    
    if (bestUpc && bestScore >= 0.4) {
      updates.push({ id: product.id, sku: bestUpc.upc });
      matched++;
    }
  }
  
  console.log(`Found ${matched} matches, applying...`);
  
  // Apply in batches
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    await Promise.all(batch.map(u => 
      db.execute(sql`UPDATE supplies SET sku = ${u.sku} WHERE id = ${u.id}`)
    ));
    if ((i + 50) % 500 === 0) console.log(`Applied ${Math.min(i + 50, updates.length)}/${updates.length}`);
  }
  
  const total = await db.select().from(supplies);
  const withSku = total.filter(p => p.sku).length;
  console.log(`\nFinal: ${withSku}/${total.length} = ${((withSku/total.length)*100).toFixed(1)}%`);
  
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
