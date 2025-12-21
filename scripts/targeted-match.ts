import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq, and, isNull, or, lt } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

// Extract key product identifiers (model numbers, unique product names)
function extractProductKey(name: string): string[] {
  const keys: string[] = [];
  const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Extract model numbers (alphanumeric sequences)
  const models = normalized.match(/\b([a-z]+\d+|\d+[a-z]+)\b/g);
  if (models) keys.push(...models);
  
  // Extract significant words (5+ chars, not common)
  const ignore = new Set(['small', 'medium', 'large', 'extra', 'gallon', 'ounce', 'pound', 'count', 'piece', 'natural', 'premium']);
  const words = normalized.split(' ').filter(w => w.length >= 5 && !ignore.has(w));
  keys.push(...words);
  
  return [...new Set(keys)];
}

// Find exact key matches
function findExactKeyMatch(productKeys: string[], upcKeys: string[]): string[] {
  return productKeys.filter(pk => upcKeys.includes(pk));
}

async function main() {
  console.log('=== Targeted Key-Based UPC Matching ===\n');
  
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  console.log(`Loaded ${upcData.length} UPCs`);
  
  // Pre-index UPCs by keys
  const upcIndex = new Map<string, UpcEntry[]>();
  for (const entry of upcData) {
    const keys = extractProductKey(entry.name);
    for (const key of keys) {
      if (!upcIndex.has(key)) upcIndex.set(key, []);
      upcIndex.get(key)!.push(entry);
    }
  }
  console.log(`Indexed ${upcIndex.size} unique product keys`);
  
  // Get all products
  const allProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  // Track used UPCs
  const usedUpcs = new Set(allProducts.filter(p => p.sku && p.sku.length >= 10).map(p => p.sku!));
  console.log(`Already assigned: ${usedUpcs.size}`);
  
  // Get products without UPCs
  const needsUpc = allProducts.filter(p => !p.sku || p.sku.length < 10);
  console.log(`Products needing UPCs: ${needsUpc.length}\n`);
  
  const matches: { id: number; name: string; upc: string; upcName: string; matchedKeys: string[] }[] = [];
  const assigned = new Set<string>();
  
  for (const product of needsUpc) {
    const productKeys = extractProductKey(product.name);
    if (productKeys.length === 0) continue;
    
    // Find candidates that share at least one key
    const candidates = new Map<string, { entry: UpcEntry; matchedKeys: string[] }>();
    
    for (const key of productKeys) {
      const entries = upcIndex.get(key) || [];
      for (const entry of entries) {
        if (usedUpcs.has(entry.upc) || assigned.has(entry.upc)) continue;
        
        if (!candidates.has(entry.upc)) {
          candidates.set(entry.upc, { entry, matchedKeys: [] });
        }
        candidates.get(entry.upc)!.matchedKeys.push(key);
      }
    }
    
    // Find best match (most keys matched, at least 2)
    let best: { entry: UpcEntry; matchedKeys: string[] } | null = null;
    
    for (const [upc, data] of candidates) {
      if (data.matchedKeys.length >= 2) {
        if (!best || data.matchedKeys.length > best.matchedKeys.length) {
          best = data;
        }
      }
    }
    
    if (best) {
      matches.push({
        id: product.id,
        name: product.name,
        upc: best.entry.upc,
        upcName: best.entry.name,
        matchedKeys: [...new Set(best.matchedKeys)]
      });
      assigned.add(best.entry.upc);
    }
  }
  
  console.log(`=== Total matches: ${matches.length} ===\n`);
  
  // Show sample matches
  console.log('Sample matches:');
  matches.slice(0, 15).forEach(m => {
    console.log(`  "${m.name}" → "${m.upcName}" [${m.matchedKeys.join(', ')}]`);
  });
  
  // Save for review
  fs.writeFileSync('.local/state/memory/targeted_matches.json', JSON.stringify(matches, null, 2));
  
  // Apply
  if (matches.length > 0) {
    console.log('\nApplying to database...');
    for (const match of matches) {
      await db.update(supplies).set({ sku: match.upc }).where(eq(supplies.id, match.id));
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
}

main().catch(console.error);
