import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';

// Comprehensive abbreviation mappings for pet supplies
const abbreviations: Record<string, string> = {
  // Brands
  'sd': 'Science Diet',
  'RC': 'Royal Canin',
  'PPP': 'Purina Pro Plan',
  'EB': 'Eukanuba',
  'IAM': 'IAMS',
  'NN': 'Natural Balance',
  'WD': 'Wellness',
  'BO': 'Blue Buffalo',
  'FP': 'FirstMate',
  'OR': 'Orijen',
  'AC': 'Acana',
  'FM': 'Fromm',
  'ME': 'Merrick',
  'ND': 'Natural Dog',
  'NC': 'Natural Cat',
  
  // Size abbreviations
  'sm br': 'Small Breed',
  'md br': 'Medium Breed',
  'lg br': 'Large Breed',
  'xlg br': 'Extra Large Breed',
  'mini br': 'Mini Breed',
  'toy br': 'Toy Breed',
  'gnt br': 'Giant Breed',
  
  // Life stages
  'pup': 'Puppy',
  'jr': 'Junior',
  'sr': 'Senior',
  'ad': 'Adult',
  'adt': 'Adult',
  'mat': 'Mature',
  'all ls': 'All Life Stages',
  
  // Proteins/Ingredients
  'ck': 'Chicken',
  'chk': 'Chicken',
  'lam': 'Lamb',
  'bf': 'Beef',
  'tk': 'Turkey',
  'trk': 'Turkey',
  'slm': 'Salmon',
  'salm': 'Salmon',
  'duc': 'Duck',
  'dk': 'Duck',
  'ven': 'Venison',
  'bsn': 'Bison',
  'rab': 'Rabbit',
  'wf': 'Whitefish',
  'tun': 'Tuna',
  'srd': 'Sardine',
  'mck': 'Mackerel',
  
  // Food types
  'gf': 'Grain Free',
  'grf': 'Grain Free',
  'grn fr': 'Grain Free',
  'ltd': 'Limited Ingredient Diet',
  'li': 'Limited Ingredient',
  'sens': 'Sensitive',
  'wght': 'Weight',
  'wt': 'Weight',
  'lite': 'Light',
  'lo cal': 'Low Calorie',
  
  // Formulas
  'frm': 'Formula',
  'form': 'Formula',
  'rec': 'Recipe',
  'rcp': 'Recipe',
  'ent': 'Entree',
  'pate': 'Pate',
  'chun': 'Chunks',
  'shrd': 'Shredded',
  
  // Health/Special
  'sen stom': 'Sensitive Stomach',
  'sens sk': 'Sensitive Skin',
  'hi pro': 'High Protein',
  'hp': 'High Protein',
  'lo fat': 'Low Fat',
  'jt': 'Joint',
  'jnt': 'Joint',
  'dent': 'Dental',
  'hb': 'Hairball',
  'hairb': 'Hairball',
  'urin': 'Urinary',
  'kid': 'Kidney',
  'renal': 'Renal',
  
  // Measurements
  '#': 'lb',
  'oz': 'oz',
  'ct': 'count',
  'pk': 'pack',
  'bx': 'box',
  
  // General
  'w/': 'with',
  'ind': 'Indoor',
  'out': 'Outdoor',
  'act': 'Active',
  'perf': 'Performance',
  'orig': 'Original',
  'nat': 'Natural',
  'hol': 'Holistic',
  'org': 'Organic',
  'wld': 'Wild',
  'prem': 'Premium',
  'del': 'Deluxe',
  'ult': 'Ultimate',
  'comp': 'Complete',
  'bal': 'Balanced',
  'nutr': 'Nutrition',
  'hlth': 'Health',
  'care': 'Care',
  'maint': 'Maintenance',
  'var': 'Variety',
  'asst': 'Assorted',
  'flv': 'Flavor',
  'sfc': 'Seafood',
  'poul': 'Poultry',
  'veg': 'Vegetable',
  'frt': 'Fruit',
  'brn': 'Brown',
  'wht': 'White',
  'red': 'Red',
  'grn': 'Green',
  'blu': 'Blue',
};

// Function to expand abbreviations in a text string
function expandAbbreviations(text: string): string {
  let expanded = text;
  
  // Sort by length (longest first) to handle multi-word abbreviations properly
  const sortedAbbrevs = Object.entries(abbreviations).sort((a, b) => b[0].length - a[0].length);
  
  for (const [abbrev, full] of sortedAbbrevs) {
    // Case-insensitive replacement, preserving word boundaries
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  
  return expanded;
}

async function main() {
  console.log('Starting comprehensive abbreviation expansion...\n');
  
  try {
    // Get all supplies
    const allSupplies = await db.select().from(supplies);
    console.log(`Total supplies in database: ${allSupplies.length}`);
    
    let updatedCount = 0;
    const updates: { id: number; oldName: string; newName: string }[] = [];
    
    // Process each supply
    for (const supply of allSupplies) {
      const expandedName = expandAbbreviations(supply.name);
      const expandedDescription = supply.description ? expandAbbreviations(supply.description) : supply.description;
      
      // Check if anything changed
      const nameChanged = expandedName !== supply.name;
      const descChanged = expandedDescription !== supply.description;
      
      if (nameChanged || descChanged) {
        // Update the supply
        await db.update(supplies)
          .set({
            name: expandedName,
            description: expandedDescription || supply.description
          })
          .where(eq(supplies.id, supply.id));
        
        updatedCount++;
        updates.push({
          id: supply.id,
          oldName: supply.name,
          newName: expandedName
        });
        
        console.log(`Updated ID ${supply.id}:`);
        console.log(`  Old: ${supply.name}`);
        console.log(`  New: ${expandedName}`);
      }
    }
    
    console.log(`\n✅ Expansion complete!`);
    console.log(`Total supplies processed: ${allSupplies.length}`);
    console.log(`Supplies updated: ${updatedCount}`);
    console.log(`Supplies unchanged: ${allSupplies.length - updatedCount}`);
    
  } catch (error) {
    console.error('Error during expansion:', error);
    throw error;
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
