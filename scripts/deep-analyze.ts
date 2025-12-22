import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import { expandAbbreviations } from "../server/abbreviationExpansion";

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/(\d+)#/g, '$1lb')
    .replace(/#(\d+)/g, 'lb$1')
    .replace(/([a-z])(\d)/gi, '$1 $2')
    .replace(/(\d)([a-z])/gi, '$1 $2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const unmatched = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(sql`${supplies.upc} IS NULL`);
  
  const masterData = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));
  
  // For each top brand, show unmatched supplies and potential catalog matches
  const brands = ['Science Diet', 'Blue Buffalo', 'Coastal', 'Greenies', 'Kong', 'Oxbow', 'Fluval', 'Kaytee'];
  
  for (const targetBrand of brands) {
    const brandUnmatched = unmatched.filter(s => s.brand === targetBrand);
    if (brandUnmatched.length === 0) continue;
    
    console.log(`\n=== ${targetBrand}: ${brandUnmatched.length} unmatched ===`);
    
    // Get catalog entries for this brand
    const brandKeywords = targetBrand.toLowerCase().split(' ');
    const catalogForBrand = masterData.entries.filter((e: any) => {
      const nameLower = e.name.toLowerCase();
      return brandKeywords.some((kw: string) => nameLower.includes(kw)) ||
             (targetBrand === 'Science Diet' && nameLower.startsWith('sd '));
    });
    
    console.log(`Catalog entries for ${targetBrand}: ${catalogForBrand.length}`);
    
    // Show 5 unmatched with potential matches
    for (const supply of brandUnmatched.slice(0, 5)) {
      const expanded = expandAbbreviations(supply.name);
      const normalized = normalize(expanded);
      console.log(`\nSupply: "${supply.name}"`);
      console.log(`  Expanded: "${expanded}"`);
      console.log(`  Normalized: "${normalized}"`);
      
      // Find closest catalog matches
      const scored = catalogForBrand.map((c: any) => {
        const catExpanded = expandAbbreviations(c.name);
        const catNormalized = normalize(catExpanded);
        
        // Token overlap
        const supTokens = new Set(normalized.split(' '));
        const catTokens = catNormalized.split(' ');
        const overlap = catTokens.filter((t: string) => supTokens.has(t)).length;
        const score = overlap / Math.max(supTokens.size, catTokens.length);
        
        return { name: c.name, expanded: catExpanded, normalized: catNormalized, score, overlap };
      }).sort((a: any, b: any) => b.score - a.score).slice(0, 2);
      
      if (scored.length > 0 && scored[0].score > 0.3) {
        console.log(`  Best catalog matches:`);
        scored.forEach((s: any) => {
          console.log(`    "${s.name}" -> "${s.expanded}" (${(s.score*100).toFixed(0)}% overlap)`);
        });
      }
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
