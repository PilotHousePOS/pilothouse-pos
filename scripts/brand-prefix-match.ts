import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

// Brand configs with UPC prefixes
const brandConfigs = [
  { brand: 'Coastal', upcPrefixes: ['076484'], sqlPattern: 'coastal' },
  { brand: 'Penn-Plax', upcPrefixes: ['076484', '030172', '618940', '097612'], sqlPattern: 'penn' },
  { brand: 'Exo Terra', upcPrefixes: ['015561'], sqlPattern: 'exo' },
  { brand: 'Fluval', upcPrefixes: ['015561'], sqlPattern: 'fluval' },
  { brand: "Li'l Pals", upcPrefixes: ['076484'], sqlPattern: 'lil' },
  { brand: 'Marineland', upcPrefixes: ['046798', '047431'], sqlPattern: 'marineland' },
  { brand: 'Tetra', upcPrefixes: ['046798', '751370'], sqlPattern: 'tetra' },
  { brand: 'Kaytee', upcPrefixes: ['071859', '045125'], sqlPattern: 'kaytee' },
  { brand: 'Zilla', upcPrefixes: ['096316'], sqlPattern: 'zilla' },
];

// Normalize text for matching
function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get words for matching (filter short words)
function getWords(text: string): string[] {
  return normalize(text).split(' ').filter(w => w.length >= 3);
}

// Calculate word overlap score
function matchScore(product: string, upc: string): { score: number; matched: number } {
  const pWords = getWords(product);
  const uWords = getWords(upc);
  
  if (pWords.length === 0) return { score: 0, matched: 0 };
  
  let matched = 0;
  for (const pw of pWords) {
    for (const uw of uWords) {
      if (pw === uw) { matched++; break; }
      if (pw.length >= 4 && uw.length >= 4 && (pw.includes(uw) || uw.includes(pw))) { matched++; break; }
    }
  }
  
  return { score: matched / pWords.length, matched };
}

async function main() {
  console.log('=== Brand Prefix UPC Matching ===\n');
  
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  console.log(`Loaded ${upcData.length} UPCs`);
  
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
  
  const matches: { id: number; name: string; brand: string | null; upc: string; upcName: string; score: number }[] = [];
  const assigned = new Set<string>();
  
  for (const config of brandConfigs) {
    // Get products for this brand
    const brandProducts = needsUpc.filter(p => 
      p.brand?.toLowerCase().includes(config.sqlPattern)
    );
    
    if (brandProducts.length === 0) continue;
    
    // Get available UPCs for this brand's prefixes
    const brandUpcs = upcData.filter(e => 
      config.upcPrefixes.some(prefix => e.upc.startsWith(prefix)) &&
      !usedUpcs.has(e.upc) &&
      !assigned.has(e.upc)
    );
    
    console.log(`${config.brand}: ${brandProducts.length} products, ${brandUpcs.length} available UPCs`);
    
    let matchCount = 0;
    
    for (const p of brandProducts) {
      let best: { upc: string; name: string; score: number; matched: number } | null = null;
      
      for (const entry of brandUpcs) {
        if (assigned.has(entry.upc)) continue;
        
        const { score, matched } = matchScore(p.name, entry.name);
        
        // Lower threshold: 1+ matched words OR 40% score
        if (matched >= 1 && score >= 0.4) {
          if (!best || score > best.score) {
            best = { upc: entry.upc, name: entry.name, score, matched };
          }
        }
      }
      
      if (best) {
        matches.push({ 
          id: p.id, 
          name: p.name, 
          brand: p.brand, 
          upc: best.upc, 
          upcName: best.name,
          score: best.score
        });
        assigned.add(best.upc);
        matchCount++;
        
        if (matchCount <= 3) {
          console.log(`  ✓ "${p.name}" → ${best.upc}`);
        }
      }
    }
    
    console.log(`  Matched: ${matchCount}\n`);
  }
  
  console.log(`=== Total matches: ${matches.length} ===`);
  
  // Save to file for review
  fs.writeFileSync('.local/state/memory/brand_prefix_matches.json', JSON.stringify(matches, null, 2));
  
  // Show sample matches
  console.log('\nSample matches:');
  matches.slice(0, 10).forEach(m => {
    console.log(`  ${m.name} → ${m.upcName} (${(m.score*100).toFixed(0)}%)`);
  });
  
  // Apply if we have matches
  if (matches.length > 0) {
    console.log('\nApplying to database...');
    for (const match of matches) {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.id));
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
