import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

// Brand configs with UPC prefixes and name patterns
const brandConfigs: { brand: string; namePatterns: RegExp[]; upcPrefixes: string[]; sqlPattern: string }[] = [
  { 
    brand: 'Penn-Plax', 
    namePatterns: [/penn[- ]?plax/i, /pennplax/i],
    upcPrefixes: ['076484', '030172', '618940', '097612'],
    sqlPattern: '%penn%'
  },
  { 
    brand: "Li'l Pals", 
    namePatterns: [/li'?l\s*pals?/i, /lil\s*pals?/i, /lilpals/i, /coastal.*lil/i],
    upcPrefixes: ['076484'],
    sqlPattern: '%lil%pal%'
  },
  { 
    brand: 'Zoo Med', 
    namePatterns: [/zoo\s*med/i, /^zml\b/i, /zoomed/i],
    upcPrefixes: ['097612'],
    sqlPattern: '%zoo%med%'
  },
  { 
    brand: 'Fluval', 
    namePatterns: [/fluval/i],
    upcPrefixes: ['015561'],
    sqlPattern: '%fluval%'
  },
  { 
    brand: 'Exo Terra', 
    namePatterns: [/exo[- ]?terra/i, /exoterra/i],
    upcPrefixes: ['015561'],
    sqlPattern: '%exo%terra%'
  },
];

// Extract significant words from text
function getWords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .filter(w => !['the', 'and', 'for', 'with', 'small', 'medium', 'large', 'mini', 'pack'].includes(w));
}

// Calculate match score between product and UPC entry
function calculateMatchScore(productName: string, upcName: string): { score: number; matchedWords: string[] } {
  const productWords = getWords(productName);
  const upcWords = getWords(upcName);
  const matchedWords: string[] = [];
  
  for (const pw of productWords) {
    for (const uw of upcWords) {
      // Exact match
      if (pw === uw) {
        matchedWords.push(pw);
        break;
      }
      // Substring match for longer words
      if (pw.length >= 4 && uw.length >= 4) {
        if (pw.includes(uw) || uw.includes(pw)) {
          matchedWords.push(pw);
          break;
        }
      }
    }
  }
  
  const score = productWords.length > 0 ? matchedWords.length / productWords.length : 0;
  return { score, matchedWords };
}

// Get UPCs for a brand by prefix OR name pattern
function getBrandUpcs(upcData: UpcEntry[], config: typeof brandConfigs[0]): UpcEntry[] {
  return upcData.filter(e => 
    config.upcPrefixes.some(prefix => e.upc.startsWith(prefix)) ||
    config.namePatterns.some(pattern => pattern.test(e.name))
  );
}

async function main() {
  console.log('=== Enhanced Brand UPC Matching ===\n');
  
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  console.log(`Loaded ${upcData.length} UPCs\n`);
  
  // Show UPC counts per brand
  for (const config of brandConfigs) {
    const upcs = getBrandUpcs(upcData, config);
    console.log(`  ${config.brand}: ${upcs.length} potential UPCs`);
  }
  
  // Get all products
  const allProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  // Track used UPCs
  const usedUpcs = new Set(allProducts.filter(p => p.sku && p.sku.length >= 10).map(p => p.sku!));
  console.log(`\nAlready assigned UPCs: ${usedUpcs.size}`);
  
  const matches: { id: number; name: string; brand: string; upc: string; upcName: string; score: number; matched: string[] }[] = [];
  const assigned = new Set<string>();
  
  for (const config of brandConfigs) {
    // Get products needing UPCs for this brand
    const products = allProducts.filter(p => 
      (!p.sku || p.sku.length < 10) && 
      p.brand && p.brand.toLowerCase().includes(config.brand.split(' ')[0].toLowerCase().replace("'", ''))
    );
    
    console.log(`\n=== Processing ${config.brand}: ${products.length} products ===`);
    
    // Get available UPCs for this brand
    const brandUpcs = getBrandUpcs(upcData, config).filter(e => !usedUpcs.has(e.upc) && !assigned.has(e.upc));
    console.log(`  Available UPCs: ${brandUpcs.length}`);
    
    let matchCount = 0;
    
    for (const p of products) {
      const productWords = getWords(p.name);
      if (productWords.length < 1) continue;
      
      let best: { upc: string; name: string; score: number; matched: string[] } | null = null;
      
      for (const entry of brandUpcs) {
        if (assigned.has(entry.upc)) continue;
        
        const { score, matchedWords } = calculateMatchScore(p.name, entry.name);
        
        // Require at least 2 matching words OR 60% match
        if ((matchedWords.length >= 2 || score >= 0.6) && matchedWords.length >= 1) {
          if (!best || score > best.score || (score === best.score && matchedWords.length > best.matched.length)) {
            best = { upc: entry.upc, name: entry.name, score, matched: matchedWords };
          }
        }
      }
      
      if (best) {
        matches.push({ 
          id: p.id, 
          name: p.name, 
          brand: config.brand, 
          upc: best.upc, 
          upcName: best.name,
          score: best.score,
          matched: best.matched
        });
        assigned.add(best.upc);
        matchCount++;
        
        if (matchCount <= 5) {
          console.log(`  ✓ "${p.name}" → ${best.upc} (${best.matched.join(', ')})`);
        }
      }
    }
    
    console.log(`  Total matches for ${config.brand}: ${matchCount}`);
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total new matches: ${matches.length}`);
  
  // Save matches to file for review
  fs.writeFileSync('.local/state/memory/enhanced_matches.json', JSON.stringify(matches, null, 2));
  console.log('Matches saved to .local/state/memory/enhanced_matches.json');
  
  // Apply matches if any
  if (matches.length > 0) {
    console.log('\nApplying matches to database...');
    for (const match of matches) {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(sql`id = ${match.id}`);
    }
    console.log('Done!');
    
    // Check new coverage
    const updated = await db.select({ 
      total: sql<number>`COUNT(*)`,
      withUpc: sql<number>`COUNT(CASE WHEN sku IS NOT NULL AND LENGTH(sku) >= 10 THEN 1 END)`
    }).from(supplies);
    
    const total = Number(updated[0].total);
    const withUpc = Number(updated[0].withUpc);
    console.log(`\nNew coverage: ${withUpc} / ${total} = ${(withUpc/total*100).toFixed(1)}%`);
  }
}

main().catch(console.error);
