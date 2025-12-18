import { db } from '../db';
import { supplies } from '../../shared/schema';
import { isNull, or, eq, ilike } from 'drizzle-orm';
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
    return { upc: parts[0], original: parts[1] || '', expanded: parts[2] || '' };
  }
  return { upc: match[1], original: match[2], expanded: match[3] };
});

console.log(`Loaded ${unmatchedItems.length} unmatched items`);

// Fuzzy match function
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return (longer.length - costs[s2.length]) / longer.length;
}

// Normalize text for matching
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract key terms for matching
function extractKeyTerms(text: string): string[] {
  const normalized = normalize(text);
  const terms = normalized.split(' ').filter(t => t.length > 2);
  return terms;
}

async function main() {
  // Get all supplies
  const allSupplies = await db.select().from(supplies);
  console.log(`Found ${allSupplies.length} supplies in database`);
  
  // Create lookup maps
  const byUpc = new Map<string, typeof allSupplies[0]>();
  const byName = new Map<string, typeof allSupplies[0]>();
  
  for (const supply of allSupplies) {
    if (supply.sku) {
      byUpc.set(supply.sku, supply);
    }
    byName.set(normalize(supply.name), supply);
  }
  
  let matchedByUpc = 0;
  let matchedByFuzzy = 0;
  const stillUnmatched: UnmatchedItem[] = [];
  const matches: Array<{upc: string, supplyId: number, supplyName: string, invoiceDesc: string, method: string}> = [];
  
  for (const item of unmatchedItems) {
    // Try UPC match first
    if (byUpc.has(item.upc)) {
      const supply = byUpc.get(item.upc)!;
      matches.push({
        upc: item.upc,
        supplyId: supply.id,
        supplyName: supply.name,
        invoiceDesc: item.expanded,
        method: 'UPC'
      });
      matchedByUpc++;
      continue;
    }
    
    // Try fuzzy matching with lower threshold (0.55)
    const searchText = normalize(item.expanded);
    let bestMatch: typeof allSupplies[0] | null = null;
    let bestScore = 0;
    
    for (const supply of allSupplies) {
      const supplyText = normalize(supply.name);
      const score = similarity(searchText, supplyText);
      
      if (score > bestScore && score >= 0.55) {
        bestScore = score;
        bestMatch = supply;
      }
    }
    
    if (bestMatch) {
      matches.push({
        upc: item.upc,
        supplyId: bestMatch.id,
        supplyName: bestMatch.name,
        invoiceDesc: item.expanded,
        method: `Fuzzy (${(bestScore * 100).toFixed(0)}%)`
      });
      matchedByFuzzy++;
    } else {
      stillUnmatched.push(item);
    }
  }
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Matched by UPC: ${matchedByUpc}`);
  console.log(`Matched by Fuzzy: ${matchedByFuzzy}`);
  console.log(`Still unmatched: ${stillUnmatched.length}`);
  
  // Show sample matches for review
  console.log(`\n=== SAMPLE MATCHES (first 20) ===`);
  for (const m of matches.slice(0, 20)) {
    console.log(`[${m.method}] "${m.invoiceDesc}" => "${m.supplyName}"`);
  }
  
  // Update database with UPC matches
  console.log(`\n=== UPDATING DATABASE ===`);
  let updated = 0;
  for (const m of matches) {
    if (m.method === 'UPC') continue; // Already has SKU
    
    const supply = allSupplies.find(s => s.id === m.supplyId);
    if (supply && !supply.sku) {
      await db.update(supplies).set({ sku: m.upc }).where(eq(supplies.id, m.supplyId));
      updated++;
    }
  }
  console.log(`Updated ${updated} supplies with new SKUs`);
  
  // Write still unmatched to new CSV
  const unmatchedCsv = 'UPC,Original Description,Expanded Description\n' + 
    stillUnmatched.map(item => `${item.upc},"${item.original}","${item.expanded}"`).join('\n');
  fs.writeFileSync(csvPath, unmatchedCsv);
  console.log(`\nUpdated unmatched CSV with ${stillUnmatched.length} remaining items`);
}

main().catch(console.error);
