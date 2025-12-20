import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { isNull, sql, ilike, or, and } from 'drizzle-orm';
import * as fs from 'fs';

interface PennPlaxUPC {
  upc: string;
  productName: string;
}

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/™|®|©/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(text: string): string[] {
  const norm = normalize(text);
  return norm.split(' ').filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'size'].includes(w));
}

function extractSize(text: string): string | null {
  const patterns = [
    /(\d+\.?\d*)\s*(?:oz|ounce)/i,
    /(\d+\.?\d*)\s*(?:gal|gallon)/i,
    /(\d+\.?\d*)\s*(?:in|inch|")/i,
    /(\d+\.?\d*)\s*(?:watt|w)/i,
    /(\d+\.?\d*)\s*(?:gph)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].toLowerCase().replace(/\s+/g, '');
  }
  return null;
}

function matchScore(productName: string, invoiceName: string): number {
  const pWords = extractKeywords(productName);
  const iWords = extractKeywords(invoiceName);
  
  if (pWords.length === 0 || iWords.length === 0) return 0;
  
  let matches = 0;
  for (const pw of pWords) {
    for (const iw of iWords) {
      if (pw === iw || (pw.length > 4 && iw.length > 4 && (pw.includes(iw) || iw.includes(pw)))) {
        matches++;
        break;
      }
    }
  }
  
  const pSize = extractSize(productName);
  const iSize = extractSize(invoiceName);
  
  if (pSize && iSize) {
    if (pSize !== iSize) return 0;
    matches += 2;
  }
  
  return matches / Math.max(pWords.length, iWords.length);
}

async function main() {
  const pennPlaxUpcs: PennPlaxUPC[] = JSON.parse(fs.readFileSync('/tmp/pennplax_upcs.json', 'utf-8'));
  
  const upcs = pennPlaxUpcs.filter(u => u.productName.length > 5);
  console.log(`Loaded ${upcs.length} Penn-Plax UPCs`);

  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies).where(
    and(
      isNull(supplies.sku),
      or(
        ilike(supplies.brand, '%penn%plax%'),
        ilike(supplies.brand, '%cascade%'),
        ilike(supplies.brand, '%reptology%'),
        ilike(supplies.brand, '%birdlife%'),
        ilike(supplies.name, '%cascade%'),
        ilike(supplies.name, '%penn%plax%'),
        ilike(supplies.name, '%tide%treasure%'),
        ilike(supplies.name, '%aqua-plant%'),
        ilike(supplies.name, '%small world%'),
      )
    )
  );
  
  console.log(`Found ${products.length} potential Penn-Plax products without SKU`);

  const matches: { id: number; sku: string; score: number; pName: string; uName: string }[] = [];

  for (const product of products) {
    let best: typeof matches[0] | null = null;

    for (const upc of upcs) {
      const score = matchScore(product.name, upc.productName);
      if (score >= 0.5 && (!best || score > best.score)) {
        best = { id: product.id, sku: upc.upc, score, pName: product.name, uName: upc.productName };
      }
    }

    if (best) matches.push(best);
  }

  console.log(`\nMatches found: ${matches.length}`);
  
  matches.sort((a, b) => b.score - a.score);
  
  console.log('\nTop matches:');
  matches.slice(0, 20).forEach(m => {
    console.log(`  [${(m.score * 100).toFixed(0)}%] ${m.pName.substring(0, 50)}`);
    console.log(`       -> ${m.uName.substring(0, 60)}`);
  });

  const highConf = matches.filter(m => m.score >= 0.6);
  console.log(`\nHigh confidence (60%+): ${highConf.length}`);

  if (highConf.length > 0) {
    console.log('\nApplying matches...');
    for (const m of highConf) {
      await db.update(supplies).set({ sku: m.sku }).where(sql`id = ${m.id}`);
    }
    console.log(`Updated ${highConf.length} products`);
  }

  const count = await db.select({ c: sql<number>`count(*)` }).from(supplies).where(sql`sku IS NOT NULL`);
  console.log(`\nFinal coverage: ${count[0].c}/7225 = ${(count[0].c / 7225 * 100).toFixed(1)}%`);
}

main().catch(console.error);
