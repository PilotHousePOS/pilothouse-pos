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
  
  // Define brand patterns to extract - comprehensive pet supply brands
  const brandPatterns = [
    // Reptile brands
    { pattern: /\bzoomed\b|\bzoo med\b/i, brand: 'ZooMed' },
    { pattern: /\bexo terra\b|\bexoterra\b/i, brand: 'Exo Terra' },
    { pattern: /\bzilla\b/i, brand: 'Zilla' },
    { pattern: /\bfluker'?s?\b/i, brand: "Fluker's" },
    { pattern: /\brepti care\b|\brepticare\b/i, brand: 'ReptiCare' },
    { pattern: /\brep-cal\b|\brepcal\b/i, brand: 'Rep-Cal' },
    { pattern: /\bnature zone\b/i, brand: 'Nature Zone' },
    
    // Aquatic brands
    { pattern: /\btetra\b/i, brand: 'Tetra' },
    { pattern: /\bapi\b/i, brand: 'API' },
    { pattern: /\baqueon\b/i, brand: 'Aqueon' },
    { pattern: /\bmarineland\b/i, brand: 'Marineland' },
    { pattern: /\bhikari\b/i, brand: 'Hikari' },
    { pattern: /\bomega one\b/i, brand: 'Omega One' },
    { pattern: /\bfluval\b/i, brand: 'Fluval' },
    { pattern: /\bseachem\b/i, brand: 'SeaChem' },
    { pattern: /\bglofish\b/i, brand: 'GloFish' },
    { pattern: /\bpenn plax\b|\bpenn-plax\b/i, brand: 'Penn Plax' },
    
    // Dog & Cat food brands
    { pattern: /\bpro plan\b|\bproplan\b|\bpurina pro plan\b/i, brand: 'Purina Pro Plan' },
    { pattern: /\bblue buffalo\b|\bblue\b(?=.*food)/i, brand: 'Blue Buffalo' },
    { pattern: /\bhill'?s?\b(?=.*science)/i, brand: "Hill's Science Diet" },
    { pattern: /\broyale canin\b|\broyal canin\b/i, brand: 'Royal Canin' },
    { pattern: /\biams\b/i, brand: 'IAMS' },
    { pattern: /\bwellness\b(?=.*food|.*core)/i, brand: 'Wellness' },
    { pattern: /\bmerrick\b/i, brand: 'Merrick' },
    { pattern: /\btaste of the wild\b/i, brand: 'Taste of the Wild' },
    { pattern: /\borijen\b/i, brand: 'Orijen' },
    { pattern: /\bacana\b/i, brand: 'Acana' },
    { pattern: /\bnutro\b/i, brand: 'Nutro' },
    { pattern: /\bfancy feast\b/i, brand: 'Fancy Feast' },
    { pattern: /\bfriskies\b/i, brand: 'Friskies' },
    { pattern: /\bmeow mix\b/i, brand: 'Meow Mix' },
    { pattern: /\b9 lives\b|\bnine lives\b/i, brand: '9 Lives' },
    
    // Toys & Accessories
    { pattern: /\bkong\b/i, brand: 'KONG' },
    { pattern: /\bchuckit\b/i, brand: 'Chuckit!' },
    { pattern: /\bnylabone\b/i, brand: 'Nylabone' },
    { pattern: /\bzippy paws\b|\bzippypaws\b/i, brand: 'ZippyPaws' },
    { pattern: /\bwest paw\b|\bwestpaw\b/i, brand: 'West Paw' },
    { pattern: /\boutward hound\b/i, brand: 'Outward Hound' },
    { pattern: /\bpetmate\b/i, brand: 'Petmate' },
    
    // Grooming & Healthcare
    { pattern: /\bfurminator\b/i, brand: 'FURminator' },
    { pattern: /\bwahl\b/i, brand: 'Wahl' },
    { pattern: /\boster\b/i, brand: 'Oster' },
    { pattern: /\bconair\b/i, brand: 'Conair' },
    { pattern: /\bsafari\b/i, brand: 'Safari' },
    { pattern: /\bmagic coat\b/i, brand: 'Magic Coat' },
    { pattern: /\bearthbath\b/i, brand: 'Earthbath' },
    { pattern: /\btropiclean\b/i, brand: 'TropiClean' },
    { pattern: /\bburt'?s bees\b/i, brand: "Burt's Bees" },
    
    // Leashes & Collars
    { pattern: /\bruffwear\b/i, brand: 'Ruffwear' },
    { pattern: /\bflexi\b/i, brand: 'Flexi' },
    { pattern: /\bpetsafe\b/i, brand: 'PetSafe' },
    { pattern: /\bblueberry pet\b/i, brand: 'Blueberry Pet' },
    
    // Small Animal & Bird
    { pattern: /\bkaytee\b/i, brand: 'Kaytee' },
    { pattern: /\boxbow\b/i, brand: 'Oxbow' },
    { pattern: /\bvitakraft\b/i, brand: 'Vitakraft' },
    { pattern: /\bsunseed\b/i, brand: 'Sunseed' },
    { pattern: /\bliving world\b/i, brand: 'Living World' },
    
    // Additional common brands
    { pattern: /\blil pals\b|\blil'?pals\b/i, brand: 'Lil Pals' },
    { pattern: /\bpedigree\b/i, brand: 'Pedigree' },
    { pattern: /\bcadet\b/i, brand: 'Cadet' },
    { pattern: /\breddog\b|\bred dog\b/i, brand: 'RedDog' },
    { pattern: /\bgood lovin\b/i, brand: 'Good Lovin' },
    { pattern: /\bred barn\b|\bredbar/i, brand: 'RedBarn' },
    { pattern: /\bnature'?s miracle\b/i, brand: "Nature's Miracle" },
    { pattern: /\bsimple solution\b/i, brand: 'Simple Solution' },
    { pattern: /\bpet botanics\b/i, brand: 'Pet Botanics' },
    { pattern: /\bstellar\b/i, brand: 'Stellar' },
  ];
  
  let updated = 0;
  const brandCounts: Record<string, number> = {};
  
  for (const supply of emptyBrandSupplies) {
    const name = supply.name?.toLowerCase() || '';
    const description = supply.description?.toLowerCase() || '';
    const searchText = `${name} ${description}`;
    
    // Try to match brand from name and description
    for (const { pattern, brand } of brandPatterns) {
      if (pattern.test(searchText)) {
        await db.update(supplies)
          .set({ brand })
          .where(eq(supplies.id, supply.id));
        updated++;
        brandCounts[brand] = (brandCounts[brand] || 0) + 1;
        if (updated % 100 === 0) {
          console.log(`Updated ${updated} items...`);
        }
        break; // Stop after first match
      }
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total brands extracted: ${updated} out of ${emptyBrandSupplies.length} products`);
  
  // Show brand breakdown
  if (Object.keys(brandCounts).length > 0) {
    console.log('\n=== Brands Found ===');
    const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]);
    sortedBrands.forEach(([brand, count]) => {
      console.log(`  ${brand}: ${count} products`);
    });
  }
  
  // Show sample ZooMed products
  const sampleWithBrands = await db.select()
    .from(supplies)
    .where(eq(supplies.brand, 'ZooMed'))
    .limit(5);
  
  if (sampleWithBrands.length > 0) {
    console.log('\n=== Sample ZooMed products ===');
    sampleWithBrands.forEach(s => console.log(`  - ${s.name}`));
  }
  
  console.log('\nBrand extraction complete!');
}

extractBrands()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
