import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, or, and, ilike } from 'drizzle-orm';

async function verifyReptileSupplies() {
  console.log('=== Reptile Supplies Filter Verification ===\n');
  
  // Get reptile supplies using the same logic as the backend
  const reptileBrands = ['ZooMed', 'Exo Terra', 'Zilla', "Fluker's", 'ReptiCare', 'Tetra'];
  const reptileKeywords = [
    'gecko', 'lizard', 'snake', 'turtle', 'tortoise', 'chameleon',
    'bearded dragon', 'iguana', 'frog', 'toad', 'salamander', 'newt',
    'reptile', 'amphibian', 'terrarium', 'vivarium', 'repti'
  ];
  
  const brandConditions = reptileBrands.map(brand => eq(supplies.brand, brand));
  const keywordConditions = reptileKeywords.flatMap(keyword => [
    ilike(supplies.name, `%${keyword}%`),
    ilike(supplies.description, `%${keyword}%`)
  ]);
  
  const reptileSupplies = await db
    .select()
    .from(supplies)
    .where(
      and(
        eq(supplies.isActive, true),
        or(...brandConditions, ...keywordConditions)
      )
    );
  
  console.log(`Total reptile supplies found: ${reptileSupplies.length}`);
  
  // Break down by brand
  console.log('\n=== By Brand ===');
  for (const brand of reptileBrands) {
    const count = reptileSupplies.filter(s => s.brand === brand).length;
    if (count > 0) {
      console.log(`${brand}: ${count}`);
    }
  }
  
  // Break down by category
  console.log('\n=== By Category ===');
  const categories = new Set(reptileSupplies.map(s => s.category));
  for (const category of categories) {
    const count = reptileSupplies.filter(s => s.category === category).length;
    console.log(`${category}: ${count}`);
  }
  
  // Sample products
  console.log('\n=== Sample ZooMed Products ===');
  const zoomedSamples = reptileSupplies.filter(s => s.brand === 'ZooMed').slice(0, 5);
  zoomedSamples.forEach(s => console.log(`  - ${s.name}`));
  
  console.log('\n=== Sample Keyword Matches (no brand) ===');
  const keywordMatches = reptileSupplies
    .filter(s => !reptileBrands.includes(s.brand || ''))
    .filter(s => s.name.toLowerCase().includes('gecko') || s.name.toLowerCase().includes('reptile'))
    .slice(0, 5);
  keywordMatches.forEach(s => console.log(`  - ${s.name} (${s.brand || 'No brand'})`));
  
  console.log('\n✓ Verification complete!');
}

verifyReptileSupplies();
