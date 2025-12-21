import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

async function main() {
  console.log('=== Clearing Weak Matches ===\n');
  
  const matches = JSON.parse(fs.readFileSync('.local/state/memory/brand_prefix_matches.json', 'utf-8'));
  
  const weakIds: number[] = [];
  const strongMatches: any[] = [];
  
  for (const m of matches) {
    const pWords = m.name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w: string) => w.length >= 4);
    const uWords = m.upcName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w: string) => w.length >= 4);
    
    // Count unique significant word matches
    const shared = pWords.filter((pw: string) => 
      uWords.some((uw: string) => pw === uw || (pw.length >= 5 && uw.length >= 5 && (pw.includes(uw) || uw.includes(pw))))
    );
    
    // Require at least 2 matching significant words or >60% score
    if (shared.length >= 2 || m.score >= 0.6) {
      strongMatches.push(m);
    } else {
      weakIds.push(m.id);
      console.log(`CLEAR: "${m.name}" ← "${m.upcName}"`);
    }
  }
  
  console.log(`\nWeak matches to clear: ${weakIds.length}`);
  console.log(`Strong matches to keep: ${strongMatches.length}`);
  
  // Clear weak matches
  for (const id of weakIds) {
    await db.update(supplies).set({ sku: null }).where(eq(supplies.id, id));
  }
  
  // Check new coverage
  const updated = await db.select({ 
    total: sql<number>`COUNT(*)`,
    withUpc: sql<number>`COUNT(CASE WHEN sku IS NOT NULL AND LENGTH(sku) >= 10 THEN 1 END)`
  }).from(supplies);
  
  const total = Number(updated[0].total);
  const withUpc = Number(updated[0].withUpc);
  console.log(`\nNew coverage: ${withUpc} / ${total} = ${(withUpc/total*100).toFixed(1)}%`);
  console.log(`Need ${Math.ceil(total * 0.80) - withUpc} more for 80%`);
}

main().catch(console.error);
