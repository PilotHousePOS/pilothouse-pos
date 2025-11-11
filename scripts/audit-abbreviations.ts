import { db } from '../server/db';
import { supplies } from '../shared/schema';
import * as fs from 'fs';

// Common abbreviation patterns to detect
const knownAbbreviations = [
  // Brands
  { abbrev: /\bsd\b/gi, full: 'Science Diet', category: 'brand' },
  { abbrev: /\bRC\b/g, full: 'Royal Canin', category: 'brand' },
  { abbrev: /\bPPP\b/g, full: 'Purina Pro Plan', category: 'brand' },
  { abbrev: /\bEB\b/g, full: 'Eukanuba', category: 'brand' },
  { abbrev: /\bIAM\b/g, full: 'IAMS', category: 'brand' },
  
  // Sizes
  { abbrev: /\bsm br\b/gi, full: 'Small Breed', category: 'size' },
  { abbrev: /\bmd br\b/gi, full: 'Medium Breed', category: 'size' },
  { abbrev: /\blg br\b/gi, full: 'Large Breed', category: 'size' },
  { abbrev: /\bxlg br\b/gi, full: 'Extra Large Breed', category: 'size' },
  { abbrev: /\bmini br\b/gi, full: 'Mini Breed', category: 'size' },
  { abbrev: /\btoy br\b/gi, full: 'Toy Breed', category: 'size' },
  
  // Life stages
  { abbrev: /\bpup\b/gi, full: 'Puppy', category: 'life_stage' },
  { abbrev: /\bjr\b/gi, full: 'Junior', category: 'life_stage' },
  { abbrev: /\bsr\b/gi, full: 'Senior', category: 'life_stage' },
  { abbrev: /\badt?\b/gi, full: 'Adult', category: 'life_stage' },
  
  // Proteins
  { abbrev: /\bck\b/gi, full: 'Chicken', category: 'protein' },
  { abbrev: /\bchk\b/gi, full: 'Chicken', category: 'protein' },
  { abbrev: /\blam\b/gi, full: 'Lamb', category: 'protein' },
  { abbrev: /\bbf\b/gi, full: 'Beef', category: 'protein' },
  { abbrev: /\btk\b/gi, full: 'Turkey', category: 'protein' },
  { abbrev: /\btrk\b/gi, full: 'Turkey', category: 'protein' },
  { abbrev: /\bslm\b/gi, full: 'Salmon', category: 'protein' },
  { abbrev: /\bsalm\b/gi, full: 'Salmon', category: 'protein' },
  { abbrev: /\bduc\b/gi, full: 'Duck', category: 'protein' },
  { abbrev: /\bdk\b/gi, full: 'Duck', category: 'protein' },
  
  // Diet types
  { abbrev: /\bgf\b/gi, full: 'Grain Free', category: 'diet' },
  { abbrev: /\bgrn fr\b/gi, full: 'Grain Free', category: 'diet' },
  { abbrev: /\bltd\b/gi, full: 'Limited Ingredient Diet', category: 'diet' },
  { abbrev: /\bli\b/gi, full: 'Limited Ingredient', category: 'diet' },
  { abbrev: /\bhp\b/gi, full: 'High Protein', category: 'diet' },
  { abbrev: /\blo fat\b/gi, full: 'Low Fat', category: 'diet' },
  
  // Formulas
  { abbrev: /\bfrm\b/gi, full: 'Formula', category: 'formula' },
  { abbrev: /\bform\b/gi, full: 'Formula', category: 'formula' },
  { abbrev: /\brec\b/gi, full: 'Recipe', category: 'formula' },
  { abbrev: /\bent\b/gi, full: 'Entree', category: 'formula' },
  
  // Common words
  { abbrev: /\bw\//gi, full: 'with', category: 'common' },
  { abbrev: /\bind\b/gi, full: 'Indoor', category: 'common' },
  { abbrev: /\bout\b/gi, full: 'Outdoor', category: 'common' },
  { abbrev: /\bnat\b/gi, full: 'Natural', category: 'common' },
  { abbrev: /\borg\b/gi, full: 'Organic', category: 'common' },
  { abbrev: /\bvar\b/gi, full: 'Variety', category: 'common' },
  { abbrev: /\basst\b/gi, full: 'Assorted', category: 'common' },
];

interface AuditResult {
  category: string;
  abbreviation: string;
  fullForm: string;
  count: number;
  examples: { id: number; name: string }[];
}

async function main() {
  console.log('==============================================');
  console.log('   ABBREVIATION AUDIT REPORT');
  console.log('==============================================\n');
  
  try {
    // Get all supplies
    const allSupplies = await db.select().from(supplies);
    console.log(`📊 Total supplies analyzed: ${allSupplies.length}\n`);
    
    const auditResults: AuditResult[] = [];
    
    // Check each abbreviation pattern
    for (const pattern of knownAbbreviations) {
      const matches: { id: number; name: string }[] = [];
      
      for (const supply of allSupplies) {
        if (pattern.abbrev.test(supply.name)) {
          matches.push({ id: supply.id, name: supply.name });
        }
        // Reset regex lastIndex for global patterns
        pattern.abbrev.lastIndex = 0;
      }
      
      if (matches.length > 0) {
        auditResults.push({
          category: pattern.category,
          abbreviation: pattern.abbrev.source.replace(/\\b/g, '').replace(/\\/g, ''),
          fullForm: pattern.full,
          count: matches.length,
          examples: matches.slice(0, 5) // First 5 examples
        });
      }
    }
    
    // Sort by count (highest first)
    auditResults.sort((a, b) => b.count - a.count);
    
    // Group by category
    const byCategory = auditResults.reduce((acc, result) => {
      if (!acc[result.category]) {
        acc[result.category] = [];
      }
      acc[result.category].push(result);
      return acc;
    }, {} as Record<string, AuditResult[]>);
    
    // Print results
    let totalMatches = 0;
    
    console.log('==============================================');
    console.log('   FOUND ABBREVIATIONS BY CATEGORY');
    console.log('==============================================\n');
    
    for (const [category, results] of Object.entries(byCategory)) {
      console.log(`\n🏷️  ${category.toUpperCase()}`);
      console.log('─'.repeat(50));
      
      for (const result of results) {
        totalMatches += result.count;
        console.log(`\n  "${result.abbreviation}" → "${result.fullForm}"`);
        console.log(`  Count: ${result.count} products`);
        console.log(`  Examples:`);
        result.examples.forEach(ex => {
          console.log(`    • ID ${ex.id}: ${ex.name}`);
        });
      }
    }
    
    console.log('\n\n==============================================');
    console.log('   SUMMARY');
    console.log('==============================================');
    console.log(`Total abbreviation patterns detected: ${auditResults.length}`);
    console.log(`Total products with abbreviations: ${totalMatches}`);
    console.log(`\n📝 Report saved to: abbreviation-audit-report.json`);
    
    // Save detailed report to file
    const reportData = {
      timestamp: new Date().toISOString(),
      totalSupplies: allSupplies.length,
      totalAbbreviationPatterns: auditResults.length,
      totalProductsWithAbbreviations: totalMatches,
      byCategory,
      allResults: auditResults
    };
    
    fs.writeFileSync(
      'abbreviation-audit-report.json',
      JSON.stringify(reportData, null, 2)
    );
    
    console.log('✅ Audit complete!\n');
    
  } catch (error) {
    console.error('❌ Error during audit:', error);
    throw error;
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
