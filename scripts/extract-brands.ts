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
    { pattern: /\bpenn plax\b|\bpenn-plax\b|\bpennplac\b/i, brand: 'Penn Plax' },
    { pattern: /\bmarina\b/i, brand: 'Marina' },
    { pattern: /\bcascade\b/i, brand: 'Cascade' },
    { pattern: /\baquatop\b/i, brand: 'Aquatop' },
    { pattern: /\bactiv\b(?=.*water|.*betta)/i, brand: 'Activ' },
    { pattern: /\bacurel\b/i, brand: 'Acurel' },
    
    // Dog & Cat food brands
    { pattern: /\bpro plan\b|\bproplan\b|\bpurina pro plan\b/i, brand: 'Purina Pro Plan' },
    { pattern: /\bblue buffalo\b|\bblue b\b|\bbluebuff\b/i, brand: 'Blue Buffalo' },
    { pattern: /\bscience diet\b|\bhill'?s?\b(?=.*science)/i, brand: 'Science Diet' },
    { pattern: /\broyale canin\b|\broyal canin\b/i, brand: 'Royal Canin' },
    { pattern: /\biams\b/i, brand: 'IAMS' },
    { pattern: /\bwellness\b(?=.*food|.*core)/i, brand: 'Wellness' },
    { pattern: /\bwholseso\b|\bwholso\b|\bwholeso\b|\bwholesome\b/i, brand: 'Wholesome' },
    { pattern: /\bvict\b|\bvictor\b/i, brand: 'Victor' },
    { pattern: /\beuk\b|\beukanuba\b/i, brand: 'Eukanuba' },
    { pattern: /\bnutri sour\b|\bnutri sou\b|\bnutrisource\b|\bnutrisrc\b/i, brand: 'Nutrisource' },
    { pattern: /\bmerrick\b/i, brand: 'Merrick' },
    { pattern: /\btaste of the wild\b/i, brand: 'Taste of the Wild' },
    { pattern: /\borijen\b/i, brand: 'Orijen' },
    { pattern: /\bacana\b/i, brand: 'Acana' },
    { pattern: /\bnutro\b/i, brand: 'Nutro' },
    { pattern: /\bzign\b|\bzignature\b/i, brand: 'Zignature' },
    { pattern: /\bfromm\b/i, brand: 'Fromm' },
    { pattern: /\bdiamond\b/i, brand: 'Diamond' },
    { pattern: /\bnatural balance\b/i, brand: 'Natural Balance' },
    { pattern: /\bpure vita\b/i, brand: 'Pure Vita' },
    { pattern: /\bcanidae\b/i, brand: 'Canidae' },
    { pattern: /\bsportsmix\b/i, brand: 'Sportsmix' },
    { pattern: /\bfreshpet\b/i, brand: 'Freshpet' },
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
    { pattern: /\bsodapup\b/i, brand: 'SodaPup' },
    { pattern: /\bjolly\s*pet/i, brand: 'Jolly Pets' },
    { pattern: /\bmeowijuana\b/i, brand: 'Meowijuana' },
    { pattern: /\bspot\b(?=.*toy|.*ball|.*latex)/i, brand: 'Spot' },
    { pattern: /\bcoastal\b/i, brand: 'Coastal Pet Products' },
    
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
    { pattern: /\bpetcrest\b/i, brand: 'Petcrest' },
    { pattern: /\bhappy jack\b/i, brand: 'Happy Jack' },
    { pattern: /\badams\b(?=.*spray|.*flea)/i, brand: 'Adams' },
    
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
    { pattern: /\bmarshall\b/i, brand: 'Marshall' },
    { pattern: /\bhiggins\b/i, brand: 'Higgins' },
    { pattern: /\bferret nation\b|\bnation\b(?=.*hammock|.*cage|.*shelf)/i, brand: 'Ferret Nation' },
    { pattern: /\bbirdlife\b/i, brand: 'Birdlife' },
    { pattern: /\ba&e\b/i, brand: 'A&E Cage Company' },
    { pattern: /\bquiko\b/i, brand: 'Quiko' },
    
    // Treats & Chews
    { pattern: /\bgreenies\b/i, brand: 'Greenies' },
    { pattern: /\bsmartbones\b/i, brand: 'SmartBones' },
    { pattern: /\bbeggin'?\b/i, brand: "Beggin'" },
    { pattern: /\bjones\b(?=.*chew|.*bone)/i, brand: 'Jones Natural Chews' },
    { pattern: /\bfresh kisses\b/i, brand: 'Fresh Kisses' },
    
    // Cat Litter & Supplies
    { pattern: /\bintersand\b/i, brand: 'Intersand' },
    { pattern: /\bsupernatural\b/i, brand: 'Supernatural' },
    { pattern: /\bcatit\b/i, brand: 'Catit' },
    
    // Additional common brands
    { pattern: /\blil pals\b|\blil'?pals\b/i, brand: 'Lil Pals' },
    { pattern: /\bpedigree\b/i, brand: 'Pedigree' },
    { pattern: /\bcadet\b/i, brand: 'Cadet' },
    { pattern: /\breddog\b|\bred dog\b/i, brand: 'RedDog' },
    { pattern: /\bgood lovin\b/i, brand: 'Good Lovin' },
    { pattern: /\bred barn\b|\bredbarn\b|\bred b\b/i, brand: 'RedBarn' },
    { pattern: /\bnature'?s miracle\b/i, brand: "Nature's Miracle" },
    { pattern: /\bsimple solution\b/i, brand: 'Simple Solution' },
    { pattern: /\bpet botanics\b/i, brand: 'Pet Botanics' },
    { pattern: /\bstellar\b/i, brand: 'Stellar' },
    { pattern: /\bpethouse\b/i, brand: 'Pethouse' },
    { pattern: /\bquiettime\b/i, brand: 'QuietTime' },
    { pattern: /\breptology\b/i, brand: 'Reptology' },
    { pattern: /\bruffntuff\b/i, brand: 'RuffNTuff' },
    { pattern: /\bhappydog\b/i, brand: 'HappyDog' },
    { pattern: /\bbasic\b(?=.*hoodie|.*leash)/i, brand: 'Basic' },
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
