import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';
import * as fs from 'fs';

interface Issue {
  id: number;
  name: string;
  brand: string;
  sku: string;
  invoiceName: string;
  score: number;
}

async function main() {
  console.log('=== FIXING SKU ERRORS ===\n');
  
  // Load issues
  const issues: Issue[] = JSON.parse(fs.readFileSync('/tmp/sku_issues.json', 'utf-8'));
  console.log(`Loaded ${issues.length} issues to fix\n`);
  
  // Remove SKUs with less than 30% match (clearly wrong)
  const toRemove = issues.filter(i => i.score < 0.30);
  console.log(`Removing ${toRemove.length} clearly wrong SKUs (<30% match)...\n`);
  
  let removed = 0;
  for (const issue of toRemove) {
    await db.update(supplies)
      .set({ sku: null })
      .where(eq(supplies.id, issue.id));
    removed++;
    
    if (removed <= 20) {
      console.log(`Removed: "${issue.name}" had wrong SKU for "${issue.invoiceName}"`);
    }
  }
  
  if (removed > 20) {
    console.log(`... and ${removed - 20} more`);
  }
  
  console.log(`\nRemoved ${removed} incorrect SKUs`);
  
  // Get current stats
  const stats = await db.select({
    total: sql<number>`count(*)`,
    withSku: sql<number>`count(case when sku is not null and sku != '' then 1 end)`
  }).from(supplies);
  
  const coverage = (stats[0].withSku / stats[0].total * 100).toFixed(2);
  console.log(`\nCurrent coverage after cleanup: ${stats[0].withSku}/${stats[0].total} (${coverage}%)`);
}

main().catch(console.error);
