import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

async function main() {
  const matches: { upc: string; productId: number; score: number }[] = 
    JSON.parse(fs.readFileSync('.local/state/memory/upc_matches_to_apply.json', 'utf-8'));
  
  console.log(`Applying ${matches.length} UPC matches in batches of 50...`);
  
  const BATCH = 50;
  let applied = 0;
  let errors = 0;
  
  for (let i = 0; i < matches.length; i += BATCH) {
    const batch = matches.slice(i, i + BATCH);
    
    try {
      for (const m of batch) {
        await db.update(supplies)
          .set({ sku: m.upc })
          .where(eq(supplies.id, m.productId));
      }
      applied += batch.length;
      
      if ((i + BATCH) % 500 === 0 || i + BATCH >= matches.length) {
        console.log(`Progress: ${Math.min(i + BATCH, matches.length)}/${matches.length} applied`);
      }
    } catch (err: any) {
      errors++;
      console.error(`Batch ${i}-${i+BATCH} error:`, err.message);
    }
  }
  
  console.log(`\nDone! Applied: ${applied}, Errors: ${errors}`);
  
  const stats = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(sku) as with_sku, COUNT(DISTINCT sku) as unique_skus 
    FROM supplies
  `);
  console.log('Final stats:', stats.rows[0]);
}

main().catch(console.error);
