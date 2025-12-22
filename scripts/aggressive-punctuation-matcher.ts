import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import * as fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

// Load UPCs
const maybeUpcs: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));

// Aggressively normalize text - remove ALL punctuation and extra spaces
function aggressiveNormalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // Replace all non-alphanumeric with space
    .replace(/\s+/g, ' ')          // Collapse multiple spaces
    .trim();
}

// Create a key that's just sorted alphanumeric tokens
function createMatchKey(text: string): string {
  const normalized = aggressiveNormalize(text);
  const tokens = normalized.split(' ').filter(t => t.length > 0);
  // Sort and join for order-independent matching
  return tokens.sort().join('|');
}

async function main() {
  console.log('=== AGGRESSIVE PUNCTUATION MATCHER ===\n');
  
  // Get all products without UPC
  const missingProducts = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`Products missing UPC: ${missingProducts.length}`);
  console.log(`UPC source entries: ${maybeUpcs.length}`);
  
  // Build match key to UPC map
  const keyToUPC = new Map<string, { upc: string; name: string }>();
  for (const entry of maybeUpcs) {
    const key = createMatchKey(entry.name);
    if (!keyToUPC.has(key)) {
      keyToUPC.set(key, { upc: entry.upc, name: entry.name });
    }
  }
  
  console.log(`Unique match keys: ${keyToUPC.size}\n`);
  
  let matched = 0;
  const matches: string[] = [];
  
  for (const product of missingProducts) {
    const productKey = createMatchKey(product.name);
    const upcEntry = keyToUPC.get(productKey);
    
    if (upcEntry) {
      matches.push(`MATCH: "${product.name}" -> "${upcEntry.name}" = ${upcEntry.upc}`);
      
      await db.update(supplies)
        .set({ sku: upcEntry.upc })
        .where(eq(supplies.id, product.id));
      
      matched++;
    }
  }
  
  console.log(`=== RESULTS ===`);
  console.log(`Matched: ${matched}`);
  
  // Show matches
  if (matches.length > 0) {
    console.log('\nMatches found:');
    matches.forEach(m => console.log(m));
  }
  
  // Check final coverage
  const result = await db.execute(sql`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc
    FROM supplies
  `);
  const row = result.rows[0] as { total: string; with_upc: string };
  console.log(`\nFinal coverage: ${row.with_upc}/${row.total} (${(100 * parseInt(row.with_upc) / parseInt(row.total)).toFixed(1)}%)`);
  
  process.exit(0);
}

main().catch(console.error);
