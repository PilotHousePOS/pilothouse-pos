import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { getValidationPatterns } from './shared-mappings';

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
    const issuesByCategory: Record<string, Array<{ id: number; name: string; field: string; issue: string }>> = {};
    
    // Get validation patterns from shared mappings
    const spotChecks = getValidationPatterns();
    
    // Check for remaining abbreviations in both names AND descriptions
    console.log('🔍 Checking for remaining abbreviations in names and descriptions...\n');
    
    for (const [category, terms] of Object.entries(spotChecks)) {
      issuesByCategory[category] = [];
      
      for (const [fullTerm, patterns] of Object.entries(terms)) {
        for (const pattern of patterns) {
          const regex = new RegExp(pattern, 'i');
          
          for (const supply of foodSupplies) {
            // Check name field
            if (regex.test(supply.name)) {
              issuesByCategory[category].push({
                id: supply.id,
                name: supply.name,
                field: 'name',
                issue: `Name contains "${pattern}" instead of "${fullTerm}"`
              });
              totalIssues++;
            }
            
            // Check description field if it exists
            if (supply.description && regex.test(supply.description)) {
              issuesByCategory[category].push({
                id: supply.id,
                name: supply.name,
                field: 'description',
                issue: `Description contains "${pattern}" instead of "${fullTerm}"`
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
      console.log('   No remaining abbreviations found in food product names or descriptions.\n');
      
      // Show sample of expanded products
      console.log('Sample of properly formatted products:\n');
      const samples = foodSupplies
        .filter(s => 
          s.name.includes('Science Diet') || 
          s.name.includes('Royal Canin') ||
          s.name.includes('Chicken') ||
          s.name.includes('Blue Buffalo') ||
          s.name.includes('Pro Plan')
        )
        .slice(0, 10);
      
      samples.forEach((s, i) => {
        console.log(`${i + 1}. ${s.name}`);
        if (s.description) {
          console.log(`   Desc: ${s.description.substring(0, 60)}...`);
        }
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
            console.log(`  ${i + 1}. ID ${issue.id} [${issue.field}]: ${issue.name}`);
            console.log(`     → ${issue.issue}`);
          }
          
          if (issues.length > displayCount) {
            console.log(`  ... and ${issues.length - displayCount} more\n`);
          }
        }
      }
      
      console.log('\n⚠️  Note: Some issues may be false positives');
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
