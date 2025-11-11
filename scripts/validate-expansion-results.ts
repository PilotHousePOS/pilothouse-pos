import { db } from '../server/db';
import { supplies } from '../shared/schema';

// Key brands and terms to spot-check
const spotChecks = {
  brands: {
    'Science Diet': ['sd', 'SD'],
    'Royal Canin': ['RC', 'rc'],
    'Purina Pro Plan': ['PPP', 'ppp'],
  },
  proteins: {
    'Chicken': ['\\bck\\b', '\\bchk\\b'],
    'Lamb': ['\\blam\\b'],
    'Salmon': ['\\bsalm\\b'],
  },
  sizes: {
    'Small Breed': ['sm br', 'SM BR'],
    'Large Breed': ['lg br', 'LG BR'],
  },
  measurements: {
    'lb': ['#(?=\\s|$)'],
  }
};

async function main() {
  console.log('==============================================');
  console.log('   POST-EXPANSION VALIDATION');
  console.log('==============================================\n');
  
  try {
    // Get all food supplies
    const allSupplies = await db.select().from(supplies);
    const foodSupplies = allSupplies.filter(s => s.category === 'food');
    
    console.log(`📊 Total products: ${allSupplies.length}`);
    console.log(`📊 Food products: ${foodSupplies.length}\n`);
    
    let totalIssues = 0;
    const issuesByCategory: Record<string, Array<{ id: number; name: string; issue: string }>> = {};
    
    // Check for remaining abbreviations
    console.log('🔍 Checking for remaining abbreviations...\n');
    
    for (const [category, terms] of Object.entries(spotChecks)) {
      issuesByCategory[category] = [];
      
      for (const [fullTerm, patterns] of Object.entries(terms)) {
        for (const pattern of patterns) {
          const regex = new RegExp(pattern, 'i');
          
          for (const supply of foodSupplies) {
            if (regex.test(supply.name)) {
              issuesByCategory[category].push({
                id: supply.id,
                name: supply.name,
                issue: `Contains "${pattern}" instead of "${fullTerm}"`
              });
              totalIssues++;
            }
          }
        }
      }
    }
    
    // Report results
    console.log('==============================================');
    console.log('   VALIDATION RESULTS');
    console.log('==============================================\n');
    
    if (totalIssues === 0) {
      console.log('✅ VALIDATION PASSED!');
      console.log('   No remaining abbreviations found in food products.\n');
      
      // Show sample of expanded products
      console.log('Sample of properly expanded products:\n');
      const samples = foodSupplies
        .filter(s => 
          s.name.includes('Science Diet') || 
          s.name.includes('Royal Canin') ||
          s.name.includes('Chicken') ||
          s.name.includes('Small Breed') ||
          s.name.includes('Large Breed')
        )
        .slice(0, 10);
      
      samples.forEach((s, i) => {
        console.log(`${i + 1}. ${s.name}`);
      });
      console.log('');
      
    } else {
      console.log(`⚠️  VALIDATION FOUND ${totalIssues} POTENTIAL ISSUES\n`);
      
      for (const [category, issues] of Object.entries(issuesByCategory)) {
        if (issues.length > 0) {
          console.log(`\n${category.toUpperCase()} (${issues.length} issues):`);
          
          const displayCount = Math.min(5, issues.length);
          for (let i = 0; i < displayCount; i++) {
            const issue = issues[i];
            console.log(`  ${i + 1}. ID ${issue.id}: ${issue.name}`);
            console.log(`     → ${issue.issue}`);
          }
          
          if (issues.length > displayCount) {
            console.log(`  ... and ${issues.length - displayCount} more\n`);
          }
        }
      }
      
      console.log('\n⚠️  Note: Some issues may be false positives (e.g., "sm bite" instead of "sm br")');
      console.log('Review the specific cases to determine if they need manual correction.\n');
    }
    
  } catch (error) {
    console.error('❌ Error during validation:', error);
    throw error;
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
