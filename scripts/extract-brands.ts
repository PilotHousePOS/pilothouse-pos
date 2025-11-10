import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, or, isNull } from 'drizzle-orm';

async function extractBrands() {
  console.log('Extracting brand names from product names...\n');
  
  // Get supplies with empty brand field
  const emptyBrandSupplies = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.brand), eq(supplies.brand, '')));
  
  console.log(`Found ${emptyBrandSupplies.length} supplies with empty brand field`);
  
  // Define brand patterns to extract
  const brandPatterns = [
    { pattern: /zoomed|zoo med/i, brand: 'ZooMed' },
    { pattern: /exo terra|exoterra/i, brand: 'Exo Terra' },
    { pattern: /zilla/i, brand: 'Zilla' },
    { pattern: /fluker'?s?/i, brand: "Fluker's" },
    { pattern: /repti care|repticare/i, brand: 'ReptiCare' },
    { pattern: /tetra/i, brand: 'Tetra' },
    { pattern: /api/i, brand: 'API' },
    { pattern: /aqueon/i, brand: 'Aqueon' },
    { pattern: /marineland/i, brand: 'Marineland' },
    { pattern: /hikari/i, brand: 'Hikari' },
    { pattern: /omega one/i, brand: 'Omega One' },
    { pattern: /nature zone/i, brand: 'Nature Zone' },
    { pattern: /safari/i, brand: 'Safari' },
    { pattern: /magic coat/i, brand: 'Magic Coat' },
    { pattern: /lil pals/i, brand: 'Lil Pals' },
  ];
  
  let updated = 0;
  
  for (const supply of emptyBrandSupplies) {
    const name = supply.name.toLowerCase();
    
    // Try to match brand from name
    for (const { pattern, brand } of brandPatterns) {
      if (pattern.test(name)) {
        await db.update(supplies)
          .set({ brand })
          .where(eq(supplies.id, supply.id));
        updated++;
        if (updated % 100 === 0) {
          console.log(`Updated ${updated} items...`);
        }
        break; // Stop after first match
      }
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total brands extracted: ${updated}`);
  
  // Show sample
  const sampleWithBrands = await db.select()
    .from(supplies)
    .where(eq(supplies.brand, 'ZooMed'))
    .limit(5);
  
  console.log('\nSample ZooMed products:');
  sampleWithBrands.forEach(s => console.log(`  - ${s.name}`));
}

extractBrands();
