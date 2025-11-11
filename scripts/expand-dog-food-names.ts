import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

async function expandDogFoodNames() {
  console.log('Starting dog food name expansion...\n');

  // Define the expansion mappings
  const brandExpansions: Record<string, string> = {
    'sd': 'Science Diet',
    'SD': 'Science Diet',
    'RC': 'Royal Canin',
    'PPP': 'Purina Pro Plan',
    'EB': 'Eukanuba',
    'IAM': 'IAMS',
    'TOTW': 'Taste of the Wild',
    'BB': 'Blue Buffalo',
    'NB': 'Natural Balance'
  };

  const termExpansions: Record<string, string> = {
    ' sm br ': ' Small Breed ',
    ' lg br ': ' Large Breed ',
    ' ck ': ' Chicken ',
    ' lam ': ' Lamb ',
    ' br ': ' Brown Rice ',
    ' puppy': ' Puppy',
    ' 7+': ' Age 7+',
    ' 11+': ' Age 11+',
    ' 6+': ' Age 6+',
    'sm br': 'Small Breed',
    'lg br': 'Large Breed'
  };

  try {
    // Get all supplies
    const allSupplies = await db.select().from(supplies);
    console.log(`Found ${allSupplies.length} total supplies\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const supply of allSupplies) {
      let originalName = supply.name;
      let newName = originalName;
      let changed = false;

      // Expand brand abbreviations at the start
      for (const [abbr, full] of Object.entries(brandExpansions)) {
        if (newName.toLowerCase().startsWith(abbr.toLowerCase() + ' ')) {
          newName = full + newName.slice(abbr.length);
          changed = true;
          break;
        }
      }

      // Expand terms within the name
      for (const [abbr, full] of Object.entries(termExpansions)) {
        const regex = new RegExp(abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        if (regex.test(newName)) {
          newName = newName.replace(regex, full);
          changed = true;
        }
      }

      // Clean up multiple spaces
      newName = newName.replace(/\s+/g, ' ').trim();

      // Capitalize first letter of each word for better presentation
      newName = newName
        .split(' ')
        .map(word => {
          // Keep numbers and weights as-is
          if (/^\d+/.test(word) || word.includes('#') || word.includes('lb')) {
            return word;
          }
          // Capitalize first letter
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');

      if (changed && newName !== originalName) {
        console.log(`Updating: "${originalName}" → "${newName}"`);
        
        await db
          .update(supplies)
          .set({ name: newName })
          .where(sql`id = ${supply.id}`);
        
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log(`\n✅ Update complete!`);
    console.log(`   Updated: ${updatedCount} items`);
    console.log(`   Skipped: ${skippedCount} items`);
  } catch (error) {
    console.error('Error expanding dog food names:', error);
    throw error;
  }
}

expandDogFoodNames()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
