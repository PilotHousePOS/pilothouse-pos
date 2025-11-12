import { db } from './db';
import { supplies } from '../shared/schema';
import { determineCategory, calculateCategoryScore } from './productCategory';
import { eq } from 'drizzle-orm';

async function testCategorization() {
  console.log('🧪 Testing Product Categorization\n');

  // Get sample products from each current category
  const foodSamples = await db.select().from(supplies).where(eq(supplies.category, 'food')).limit(10);
  const accessorySamples = await db.select().from(supplies).where(eq(supplies.category, 'accessories')).limit(30);

  console.log('📊 FOOD SAMPLES (should remain food):');
  for (const product of foodSamples) {
    const suggestedCategory = determineCategory(product);
    const foodScore = calculateCategoryScore(product, 'food');
    const toysScore = calculateCategoryScore(product, 'toys');
    const accessoriesScore = calculateCategoryScore(product, 'accessories');
    
    console.log(`\n  "${product.name}"`);
    console.log(`  Current: food | Suggested: ${suggestedCategory || 'NONE'}`);
    console.log(`  Scores: food=${foodScore}, toys=${toysScore}, accessories=${accessoriesScore}`);
  }

  console.log('\n\n📊 ACCESSORY SAMPLES (should be recategorized):');
  const categoryBreakdown: Record<string, number> = {
    food: 0,
    toys: 0,
    beds: 0,
    leashes: 0,
    healthcare: 0,
    accessories: 0,
    unchanged: 0,
  };

  for (const product of accessorySamples) {
    const suggestedCategory = determineCategory(product);
    const score = suggestedCategory ? calculateCategoryScore(product, suggestedCategory) : 0;
    
    console.log(`\n  "${product.name}"`);
    console.log(`  Current: accessories | Suggested: ${suggestedCategory || 'UNCHANGED'} (score: ${score})`);
    
    if (suggestedCategory) {
      categoryBreakdown[suggestedCategory]++;
    } else {
      categoryBreakdown.unchanged++;
    }
  }

  console.log('\n\n📈 CATEGORIZATION BREAKDOWN (from 30 accessory samples):');
  Object.entries(categoryBreakdown).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });
}

testCategorization()
  .then(() => {
    console.log('\n✅ Test complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
