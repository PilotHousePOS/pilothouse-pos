import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import { expandAbbreviations } from "../server/abbreviationExpansion";

async function main() {
  // Get unmatched supplies
  const unmatched = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(sql`${supplies.upc} IS NULL`);
  
  console.log(`Total unmatched: ${unmatched.length}\n`);
  
  // Load master index
  const masterData = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));
  
  // Group by brand
  const byBrand: Record<string, string[]> = {};
  unmatched.forEach(s => {
    const brand = s.brand || 'Unknown';
    if (!byBrand[brand]) byBrand[brand] = [];
    byBrand[brand].push(s.name);
  });
  
  // Sort by count
  const sorted = Object.entries(byBrand).sort((a, b) => b[1].length - a[1].length);
  
  console.log("=== UNMATCHED BY BRAND (top 20) ===");
  sorted.slice(0, 20).forEach(([brand, names]) => {
    console.log(`\n${brand}: ${names.length} unmatched`);
    names.slice(0, 3).forEach(n => console.log(`  - ${n}`));
  });
  
  // Find potential matches in catalog for top unmatched brands
  console.log("\n\n=== POTENTIAL MATCHES IN CATALOG ===");
  const topBrands = ['Science Diet', 'Blue Buffalo', 'Pro Plan', 'Natural Balance', 'Royal Canin'];
  
  for (const targetBrand of topBrands) {
    const brandUnmatched = unmatched.filter(s => s.brand === targetBrand).slice(0, 5);
    if (brandUnmatched.length === 0) continue;
    
    console.log(`\n--- ${targetBrand} ---`);
    for (const supply of brandUnmatched) {
      const expandedSupply = expandAbbreviations(supply.name);
      console.log(`\nSupply: "${supply.name}"`);
      console.log(`Expanded: "${expandedSupply}"`);
      
      // Find similar catalog entries
      const supplyLower = expandedSupply.toLowerCase();
      const candidates = masterData.entries.filter((e: any) => {
        const catalogLower = expandAbbreviations(e.name).toLowerCase();
        // Check if they share the brand and some key words
        return catalogLower.includes(targetBrand.toLowerCase().split(' ')[0]) ||
               e.name.toLowerCase().startsWith(targetBrand.toLowerCase().substring(0, 3));
      }).slice(0, 3);
      
      if (candidates.length > 0) {
        console.log("Catalog candidates:");
        candidates.forEach((c: any) => {
          const expanded = expandAbbreviations(c.name);
          console.log(`  "${c.name}" -> "${expanded}"`);
        });
      }
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
