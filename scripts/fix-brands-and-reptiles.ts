import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, or, ilike, isNull } from 'drizzle-orm';

async function fixBrandsAndReptiles() {
  console.log('Fixing brand names and categorizing reptile supplies...\n');
  
  // Get all supplies
  const allSupplies = await db.select().from(supplies);
  console.log(`Found ${allSupplies.length} supplies`);
  
  // Define reptile brands and keywords
  const reptileBrands = ['zoomed', 'exo terra', 'exoterra', 'zilla', 'fluker', 'repti'];
  const reptileKeywords = [
    'gecko', 'lizard', 'snake', 'turtle', 'tortoise', 'chameleon', 
    'bearded dragon', 'iguana', 'frog', 'toad', 'salamander', 'newt',
    'reptile', 'amphibian', 'terrarium', 'vivarium', 'repti'
  ];
  
  let brandExtracted = 0;
  let categorized = 0;
  
  for (const supply of allSupplies) {
    let needsUpdate = false;
    let updates: any = {};
    
    // Extract brand from name if brand is empty
    if (!supply.brand || supply.brand.trim() === '') {
      const name = supply.name.toLowerCase();
      
      // Check for common brands in the name
      if (name.includes('zoomed') || name.includes('zoo med')) {
        updates.brand = 'ZooMed';
        needsUpdate = true;
        brandExtracted++;
      } else if (name.includes('exo terra') || name.includes('exoterra')) {
        updates.brand = 'Exo Terra';
        needsUpdate = true;
        brandExtracted++;
      } else if (name.includes('zilla')) {
        updates.brand = 'Zilla';
        needsUpdate = true;
        brandExtracted++;
      } else if (name.includes('fluker')) {
        updates.brand = "Fluker's";
        needsUpdate = true;
        brandExtracted++;
      } else if (name.includes('repti')) {
        updates.brand = 'ReptiCare';
        needsUpdate = true;
        brandExtracted++;
      }
    }
    
    // Check if this should be categorized as reptile supply
    const searchText = `${supply.name} ${supply.brand || ''} ${supply.description || ''}`.toLowerCase();
    
    const isReptileBrand = reptileBrands.some(brand => searchText.includes(brand));
    const hasReptileKeyword = reptileKeywords.some(keyword => searchText.includes(keyword));
    
    if ((isReptileBrand || hasReptileKeyword) && supply.category !== 'reptile-supplies') {
      // Store original category in description if needed, then update to reptile-supplies
      updates.category = 'reptile-supplies';
      needsUpdate = true;
      categorized++;
    }
    
    // Update if needed
    if (needsUpdate) {
      await db.update(supplies)
        .set(updates)
        .where(eq(supplies.id, supply.id));
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Brand names extracted: ${brandExtracted}`);
  console.log(`Products categorized as reptile supplies: ${categorized}`);
  
  // Show sample of reptile supplies
  const reptileSupplies = await db.select()
    .from(supplies)
    .where(eq(supplies.category, 'reptile-supplies'))
    .limit(10);
  
  console.log('\nSample reptile supplies:');
  reptileSupplies.forEach(s => {
    console.log(`  - ${s.name} (${s.brand || 'no brand'})`);
  });
}

fixBrandsAndReptiles();
