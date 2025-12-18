import { db } from '../db';
import { supplies } from '../../shared/schema';
import { eq, or, ilike, sql } from 'drizzle-orm';
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

// Better similarity - prioritize matching key product words
function wordOverlap(s1: string, s2: string): number {
  const words1 = new Set(s1.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(s2.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2));
  
  let matches = 0;
  for (const w of words1) {
    if (words2.has(w)) matches++;
  }
  
  const total = Math.max(words1.size, words2.size);
  return total > 0 ? matches / total : 0;
}

// Key brand mappings
const brandMappings: Record<string, string[]> = {
  'hikari': ['hikari'],
  'seachem': ['seachem', 'sli'],
  'zoo med': ['zoo med', 'zml', 'zoomed'],
  'tetra': ['tetra', 'tet'],
  'api': ['api'],
  'fluker': ['fluker', 'flkr'],
  'oxbow': ['oxbow'],
  'kaytee': ['kaytee'],
  'greenies': ['greenies'],
  'nylabone': ['nylabone', 'nylbn'],
  'kong': ['kong', 'kon'],
  'coastal': ['coastal'],
  'carefresh': ['carefresh', 'cf'],
};

async function main() {
  // Get all supplies
  const allSupplies = await db.select().from(supplies);
  console.log(`Found ${allSupplies.length} supplies in database`);
  
  // Check for UPC in name/description fields
  let matchedByUpcInName = 0;
  let matchedByKeywords = 0;
  const stillUnmatched: UnmatchedItem[] = [];
  const matches: Array<{upc: string, supplyId: number, supplyName: string, invoiceDesc: string, method: string, score: number}> = [];
  
  for (const item of unmatchedItems) {
    const searchWords = item.expanded.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
    
    // Try to find by matching key product identifiers
    let bestMatch: typeof allSupplies[0] | null = null;
    let bestScore = 0;
    
    for (const supply of allSupplies) {
      const supplyName = supply.name.toLowerCase();
      const supplyDesc = (supply.description || '').toLowerCase();
      const combined = supplyName + ' ' + supplyDesc;
      
      // Check word overlap
      const overlap = wordOverlap(item.expanded, supply.name);
      
      // Bonus for matching brand
      let brandBonus = 0;
      for (const [brand, aliases] of Object.entries(brandMappings)) {
        const itemHasBrand = aliases.some(a => item.expanded.toLowerCase().includes(a));
        const supplyHasBrand = combined.includes(brand) || aliases.some(a => combined.includes(a));
        if (itemHasBrand && supplyHasBrand) {
          brandBonus = 0.2;
          break;
        }
        if (itemHasBrand !== supplyHasBrand) {
          brandBonus = -0.3; // Penalize brand mismatch
          break;
        }
      }
      
      // Bonus for matching size
      const sizeMatch = /(\d+(?:\.\d+)?)\s*(oz|lb|#|qt|ml|gm|in)/i;
      const itemSize = item.expanded.match(sizeMatch);
      const supplySize = supply.name.match(sizeMatch);
      let sizeBonus = 0;
      if (itemSize && supplySize) {
        if (itemSize[1] === supplySize[1] && itemSize[2].toLowerCase() === supplySize[2].toLowerCase()) {
          sizeBonus = 0.15;
        } else {
          sizeBonus = -0.1;
        }
      }
      
      const totalScore = overlap + brandBonus + sizeBonus;
      
      if (totalScore > bestScore && totalScore >= 0.45) {
        bestScore = totalScore;
        bestMatch = supply;
      }
    }
    
    if (bestMatch && bestScore >= 0.45) {
      matches.push({
        upc: item.upc,
        supplyId: bestMatch.id,
        supplyName: bestMatch.name,
        invoiceDesc: item.expanded,
        method: 'Keywords',
        score: bestScore
      });
      matchedByKeywords++;
    } else {
      stillUnmatched.push(item);
    }
  }
  
  // Sort matches by score to review quality
  matches.sort((a, b) => b.score - a.score);
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Matched by keywords: ${matchedByKeywords}`);
  console.log(`Still unmatched: ${stillUnmatched.length}`);
  
  // Show high-confidence matches (score >= 0.6)
  const highConf = matches.filter(m => m.score >= 0.6);
  console.log(`\n=== HIGH CONFIDENCE MATCHES (${highConf.length}) ===`);
  for (const m of highConf.slice(0, 30)) {
    console.log(`[${(m.score*100).toFixed(0)}%] "${m.invoiceDesc}" => "${m.supplyName}"`);
  }
  
  // Only update high-confidence matches
  console.log(`\n=== UPDATING DATABASE (high confidence only) ===`);
  let updated = 0;
  for (const m of highConf) {
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
