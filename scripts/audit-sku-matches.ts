import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { isNotNull } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcRecord { upc: string; name: string; }

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getWords(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(w => w.length >= 2));
}

function similarity(a: string, b: string): number {
  const aWords = getWords(a);
  const bWords = getWords(b);
  let matches = 0;
  for (const w of aWords) {
    if (bWords.has(w)) matches++;
  }
  const total = Math.max(aWords.size, bWords.size);
  return total > 0 ? matches / total : 0;
}

async function audit() {
  const upcData: UpcRecord[] = JSON.parse(fs.readFileSync('all_upcs.json', 'utf8'));
  const upcMap = new Map<string, string>();
  for (const u of upcData) {
    upcMap.set(u.upc, u.name);
  }
  
  const productsWithSku = await db.select().from(supplies).where(isNotNull(supplies.sku));
  console.log(`Auditing ${productsWithSku.length} products with SKUs...\n`);
  
  const mismatches: { product: string; sku: string; upcName: string; similarity: number }[] = [];
  const notInSource: { product: string; sku: string }[] = [];
  const goodMatches: { product: string; sku: string; upcName: string; similarity: number }[] = [];
  
  for (const p of productsWithSku) {
    const sku = p.sku!;
    const upcName = upcMap.get(sku);
    
    if (!upcName) {
      notInSource.push({ product: p.name, sku });
      continue;
    }
    
    const sim = similarity(p.name, upcName);
    
    if (sim < 0.3) {
      mismatches.push({ product: p.name, sku, upcName, similarity: sim });
    } else {
      goodMatches.push({ product: p.name, sku, upcName, similarity: sim });
    }
  }
  
  console.log('=== AUDIT RESULTS ===\n');
  console.log(`Total products with SKU: ${productsWithSku.length}`);
  console.log(`Good matches (≥30% similarity): ${goodMatches.length}`);
  console.log(`Potential mismatches (<30% similarity): ${mismatches.length}`);
  console.log(`SKUs not found in source data: ${notInSource.length}`);
  
  const accuracy = (goodMatches.length / (goodMatches.length + mismatches.length) * 100).toFixed(1);
  console.log(`\nMatch accuracy: ${accuracy}%`);
  
  if (mismatches.length > 0) {
    console.log('\n=== POTENTIAL MISMATCHES (showing first 30) ===');
    for (const m of mismatches.slice(0, 30)) {
      console.log(`\nProduct: ${m.product}`);
      console.log(`UPC Name: ${m.upcName}`);
      console.log(`SKU: ${m.sku} | Similarity: ${(m.similarity * 100).toFixed(0)}%`);
    }
  }
  
  if (notInSource.length > 0) {
    console.log('\n=== SKUs NOT IN SOURCE (showing first 20) ===');
    for (const n of notInSource.slice(0, 20)) {
      console.log(`Product: ${n.product} | SKU: ${n.sku}`);
    }
  }
  
  console.log('\n=== SAMPLE GOOD MATCHES (random 20) ===');
  const shuffled = goodMatches.sort(() => Math.random() - 0.5).slice(0, 20);
  for (const g of shuffled) {
    console.log(`\n✓ ${g.product}`);
    console.log(`  → ${g.upcName} (${(g.similarity * 100).toFixed(0)}%)`);
  }
  
  process.exit(0);
}

audit().catch(e => { console.error(e); process.exit(1); });
