import { db } from '../db';
import { supplies } from '../../shared/schema';
import { eq, ilike, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

// Parse the CSV file
const csvPath = path.join(process.cwd(), 'attached_assets', 'unmatched_invoice_items.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.split('\n').slice(1).filter(line => line.trim());

interface UnmatchedItem {
  upc: string;
  original: string;
  expanded: string;
}

const unmatchedItems: UnmatchedItem[] = lines.map(line => {
  const match = line.match(/^"?([^",]+)"?,\s*"([^"]+)",\s*"([^"]+)"$/);
  if (!match) {
    const parts = line.split(',');
    return { upc: parts[0], original: parts[1]?.replace(/"/g, '') || '', expanded: parts[2]?.replace(/"/g, '') || '' };
  }
  return { upc: match[1], original: match[2], expanded: match[3] };
});

console.log(`Loaded ${unmatchedItems.length} unmatched items`);

// Extract key matching components
function extractComponents(text: string): { brand: string | null, size: string | null, words: string[] } {
  const lower = text.toLowerCase();
  
  // Known brands
  const brands = ['hikari', 'seachem', 'zoo med', 'zoomed', 'tetra', 'api', 'oxbow', 'kaytee', 
    'greenies', 'nylabone', 'kong', 'carefresh', 'fluker', 'exo terra', 'exoterra', 'zilla',
    'aqueon', 'marineland', 'fluval', 'omega one', 'coastal', 'komodo', 'marshall'];
  
  let brand: string | null = null;
  for (const b of brands) {
    if (lower.includes(b)) {
      brand = b;
      break;
    }
  }
  
  // Extract size
  const sizeMatch = lower.match(/(\d+(?:\.\d+)?)\s*(oz|lb|#|qt|l|ml|gm|in|ct|pk)/i);
  const size = sizeMatch ? sizeMatch[0].replace(/\s+/g, '') : null;
  
  // Important words
  const stopWords = new Set(['the', 'and', 'for', 'with', 'food', 'treat', 'toy', 'small', 'medium', 'large', 'extra']);
  const words = lower.replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  
  return { brand, size, words };
}

async function main() {
  const allSupplies = await db.select().from(supplies);
  console.log(`Found ${allSupplies.length} supplies in database`);
  
  // Index supplies by components
  const supplyIndex = allSupplies.map(s => ({
    ...s,
    components: extractComponents(s.name)
  }));
  
  const matches: Array<{upc: string, supplyId: number, supplyName: string, invoiceDesc: string, score: number}> = [];
  const stillUnmatched: UnmatchedItem[] = [];
  
  for (const item of unmatchedItems) {
    const itemComp = extractComponents(item.expanded);
    
    let bestMatch: typeof allSupplies[0] | null = null;
    let bestScore = 0;
    
    for (const supply of supplyIndex) {
      let score = 0;
      
      // Brand match is essential
      if (itemComp.brand && supply.components.brand) {
        if (itemComp.brand === supply.components.brand) {
          score += 3; // Strong brand match
        } else {
          continue; // Skip if brands don't match
        }
      }
      
      // Size match
      if (itemComp.size && supply.components.size) {
        if (itemComp.size === supply.components.size) {
          score += 2;
        }
      }
      
      // Word overlap
      const commonWords = itemComp.words.filter(w => 
        supply.components.words.some(sw => sw.includes(w) || w.includes(sw))
      );
      score += commonWords.length * 0.5;
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = supply;
      }
    }
    
    if (bestMatch && bestScore >= 3.5) {
      matches.push({
        upc: item.upc,
        supplyId: bestMatch.id,
        supplyName: bestMatch.name,
        invoiceDesc: item.expanded,
        score: bestScore
      });
    } else {
      stillUnmatched.push(item);
    }
  }
  
  matches.sort((a, b) => b.score - a.score);
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Matched: ${matches.length}`);
  console.log(`Still unmatched: ${stillUnmatched.length}`);
  
  console.log(`\n=== ALL MATCHES ===`);
  for (const m of matches) {
    console.log(`[${m.score.toFixed(1)}] "${m.invoiceDesc}" => "${m.supplyName}"`);
  }
  
  // Update database
  console.log(`\n=== UPDATING DATABASE ===`);
  let updated = 0;
  for (const m of matches) {
    const supply = allSupplies.find(s => s.id === m.supplyId);
    if (supply && !supply.sku) {
      await db.update(supplies).set({ sku: m.upc }).where(eq(supplies.id, m.supplyId));
      updated++;
    }
  }
  console.log(`Updated ${updated} supplies with new SKUs`);
  
  // Update CSV
  const unmatchedCsv = 'UPC,Original Description,Expanded Description\n' + 
    stillUnmatched.map(item => `${item.upc},"${item.original}","${item.expanded}"`).join('\n');
  fs.writeFileSync(csvPath, unmatchedCsv);
  console.log(`\nUpdated unmatched CSV with ${stillUnmatched.length} remaining items`);
}

main().catch(console.error);
