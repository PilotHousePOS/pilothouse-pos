import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface Match {
  upc: string;
  productId: number;
  productName: string;
  invoiceDesc: string;
  similarity: number;
}

async function main() {
  const matches: Match[] = JSON.parse(fs.readFileSync('/tmp/upc_matches.json', 'utf8'));
  
  // Only apply matches with >= 60% similarity (high confidence)
  const highConfidenceMatches = matches.filter(m => m.similarity >= 0.6);
  console.log(`Applying ${highConfidenceMatches.length} high-confidence matches (>= 60% similarity)`);
  
  let updated = 0;
  let errors = 0;
  
  for (const match of highConfidenceMatches) {
    try {
      // Check if product already has a SKU
      const [existing] = await db.select()
        .from(supplies)
        .where(eq(supplies.id, match.productId));
      
      if (existing && (!existing.sku || existing.sku === '')) {
        await db.update(supplies)
          .set({ sku: match.upc })
          .where(eq(supplies.id, match.productId));
        updated++;
        console.log(`Updated: ${match.productName} -> ${match.upc}`);
      }
    } catch (err) {
      console.error(`Error updating ${match.productId}: ${err}`);
      errors++;
    }
  }
  
  console.log(`\nUpdated: ${updated}`);
  console.log(`Errors: ${errors}`);
  
  // Get new coverage
  const [stats] = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_sku
    FROM supplies
  `);
  
  console.log(`\nNew coverage: ${stats.with_sku}/${stats.total} = ${((Number(stats.with_sku) / Number(stats.total)) * 100).toFixed(2)}%`);
  
  process.exit(0);
}

import { sql } from 'drizzle-orm';
main().catch(console.error);
