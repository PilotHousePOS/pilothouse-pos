import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';
import * as fs from 'fs';

interface Match {
  productId: number;
  productName: string;
  upc: string;
  upcName: string;
  score: number;
}

async function main() {
  const matches: Match[] = JSON.parse(fs.readFileSync('scripts/upc_matches.json', 'utf8'));
  
  // Only apply matches with >= 75% similarity (high confidence)
  const highConfidenceMatches = matches.filter(m => m.score >= 0.75);
  console.log(`Applying ${highConfidenceMatches.length} high-confidence matches (>= 75% similarity)`);
  
  let updated = 0;
  let errors = 0;
  
  for (const match of highConfidenceMatches) {
    try {
      const [existing] = await db.select()
        .from(supplies)
        .where(eq(supplies.id, match.productId));
      
      if (existing && (!existing.sku || existing.sku === '')) {
        await db.update(supplies)
          .set({ sku: match.upc })
          .where(eq(supplies.id, match.productId));
        updated++;
        if (updated <= 20) {
          console.log(`Updated: ${match.productName} -> ${match.upc}`);
        }
      }
    } catch (err) {
      console.error(`Error updating ${match.productId}: ${err}`);
      errors++;
    }
  }
  
  console.log(`\nUpdated: ${updated}`);
  console.log(`Errors: ${errors}`);
  
  const allProducts = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withSku = allProducts.filter(p => p.sku && p.sku.length >= 10);
  console.log(`\nNew coverage: ${withSku.length}/${allProducts.length} = ${((withSku.length / allProducts.length) * 100).toFixed(2)}%`);
  
  process.exit(0);
}

main().catch(console.error);
