import { db } from '../server/db';
import { supplies } from '../shared/schema';

async function main() {
  console.log('==============================================');
  console.log('   SLASH & COMMA CAPITALIZATION CHECK');
  console.log('==============================================\n');
  
  const allSupplies = await db.select().from(supplies);
  const foodSupplies = allSupplies.filter(s => s.category === 'food');
  
  console.log(`📊 Total food products: ${foodSupplies.length}\n`);
  
  // Find products with slashes or commas
  const productsWithDelimiters = foodSupplies.filter(s => 
    s.name.includes('/') || s.name.includes(',')
  );
  
  console.log(`📊 Products with slashes or commas: ${productsWithDelimiters.length}\n`);
  
  if (productsWithDelimiters.length === 0) {
    console.log('✅ No products with slashes or commas found.');
    return;
  }
  
  // Check for capitalization issues
  const issues: Array<{id: number; name: string; issue: string}> = [];
  
  for (const product of productsWithDelimiters) {
    const name = product.name;
    
    // Check for lowercase letters after slashes
    const slashMatch = name.match(/\/[a-z]/g);
    if (slashMatch) {
      issues.push({
        id: product.id,
        name: name,
        issue: `Lowercase after slash: ${slashMatch.join(', ')}`
      });
    }
    
    // Check for lowercase letters after commas
    const commaMatch = name.match(/,[a-z]/g);
    if (commaMatch) {
      issues.push({
        id: product.id,
        name: name,
        issue: `Lowercase after comma: ${commaMatch.join(', ')}`
      });
    }
  }
  
  if (issues.length === 0) {
    console.log('✅ All slashes and commas have proper capitalization!\n');
    console.log('Sample products with proper capitalization:');
    productsWithDelimiters.slice(0, 10).forEach((p, i) => {
      console.log(`${i + 1}. ${p.name}`);
    });
  } else {
    console.log(`⚠️  Found ${issues.length} capitalization issues:\n`);
    issues.slice(0, 20).forEach((issue, i) => {
      console.log(`${i + 1}. ID ${issue.id}: ${issue.name}`);
      console.log(`   Issue: ${issue.issue}\n`);
    });
    
    if (issues.length > 20) {
      console.log(`... and ${issues.length - 20} more issues\n`);
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
