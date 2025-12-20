import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';

async function main() {
  const matches = JSON.parse(fs.readFileSync('.local/state/memory/upc_matches_to_apply.json', 'utf-8'));
  console.log(`Applying ${matches.length} UPC matches...`);
  
  // Build a single SQL query with CASE statements
  const CHUNK_SIZE = 500;
  let applied = 0;
  
  for (let i = 0; i < matches.length; i += CHUNK_SIZE) {
    const chunk = matches.slice(i, i + CHUNK_SIZE);
    const ids = chunk.map((m: any) => m.productId);
    
    // Build CASE statement
    const caseWhen = chunk.map((m: any) => `WHEN id = ${m.productId} THEN '${m.upc}'`).join(' ');
    const query = `UPDATE supplies SET sku = CASE ${caseWhen} END WHERE id IN (${ids.join(',')})`;
    
    await db.execute(sql.raw(query));
    applied += chunk.length;
    console.log(`Applied ${applied}/${matches.length}...`);
  }
  
  // Verify
  const result = await db.execute(sql`SELECT COUNT(*) as total, COUNT(sku) as with_sku, COUNT(DISTINCT sku) as unique_skus FROM supplies`);
  console.log('Final results:', result.rows[0]);
  
  process.exit(0);
}

main().catch(console.error);
