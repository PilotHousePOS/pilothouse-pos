import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNotNull, notInArray } from 'drizzle-orm';
import * as fs from 'fs';

async function main() {
  const permanentMatches = JSON.parse(
    fs.readFileSync('.local/state/memory/permanent_upc_matches.json', 'utf-8')
  );
  
  const goodProductIds = permanentMatches.map((m: any) => m.productId);
  console.log(`Good product IDs to keep: ${goodProductIds.length}`);
  
  const result = await db.execute(sql`
    UPDATE supplies 
    SET sku = NULL 
    WHERE sku IS NOT NULL 
    AND id NOT IN (${sql.join(goodProductIds.map((id: number) => sql`${id}`), sql`, `)})
  `);
  
  console.log('Reset bad SKUs');
  
  const withSku = await db.select().from(supplies).where(isNotNull(supplies.sku));
  console.log(`Products with SKU now: ${withSku.length}`);
}

main().catch(console.error);
