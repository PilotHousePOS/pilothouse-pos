import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

// Focused abbreviation mapping for food products only
const foodAbbreviations: Record<string, string> = {
  // Brand
  'sd': 'Science Diet',
  'RC': 'Royal Canin',
  'PPP': 'Purina Pro Plan',
  'EB': 'Eukanuba',
  'IAM': 'IAMS',
  
  // Size
  'sm br': 'Small Breed',
  'md br': 'Medium Breed',
  'lg br': 'Large Breed',
  'xlg br': 'Extra Large Breed',
  'mini br': 'Mini Breed',
  'toy br': 'Toy Breed',
  
  // Proteins
  'ck': 'Chicken',
  'chk': 'Chicken',
  'lam': 'Lamb',
  'bf': 'Beef',
  'tk': 'Turkey',
  'trk': 'Turkey',
  'salm': 'Salmon',
  'duc': 'Duck',
  
  // Life stages
  'pup': 'Puppy',
  'jr': 'Junior',
  'sr': 'Senior',
  'ad': 'Adult',
  'adt': 'Adult',
  
  // Measurements
  '#': 'lb',
};

// Function to expand abbreviations
function expandAbbreviations(text: string): string {
  let expanded = text;
  
  // Sort by length (longest first) to handle multi-word abbreviations
  const sortedAbbrevs = Object.entries(foodAbbreviations).sort((a, b) => b[0].length - a[0].length);
  
  for (const [abbrev, full] of sortedAbbrevs) {
    // Special handling for # symbol
    if (abbrev === '#') {
      expanded = expanded.replace(/#(?=\s|$)/g, full);
    } else {
      // Case-insensitive replacement with word boundaries
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  
  return expanded;
}

async function main() {
  const args = process.argv.slice(2);
  const isApplyMode = args.includes('--apply');
  const timestamp = Date.now();
  const logFilename = `expansion-log-${timestamp}.json`;
  const backupFilename = `backup-before-expansion-${timestamp}.json`;
  
  console.log('==============================================');
  console.log('   FOOD ABBREVIATION EXPANSION');
  console.log('==============================================\n');
  console.log(`📋 Mode: ${isApplyMode ? 'APPLY CHANGES' : 'DRY RUN'}`);
  console.log(`🎯 Target: Food category products only\n`);
  
  if (isApplyMode) {
    console.log(`⚠️  SAFETY MEASURES ACTIVE:`);
    console.log(`   - Backup file: ${backupFilename}`);
    console.log(`   - Audit log: ${logFilename}`);
    console.log(`   - Rollback instructions will be provided\n`);
  }
  
  try {
    // Get all food supplies only
    const allSupplies = await db.select().from(supplies);
    const foodSupplies = allSupplies.filter(s => s.category === 'food');
    
    // Create backup before making any changes
    if (isApplyMode) {
      console.log('📦 Creating backup of food products before changes...');
      const backupData = {
        timestamp: new Date().toISOString(),
        totalProducts: foodSupplies.length,
        products: foodSupplies
      };
      fs.writeFileSync(backupFilename, JSON.stringify(backupData, null, 2));
      console.log(`✅ Backup saved to: ${backupFilename}\n`);
    }
    
    console.log(`📊 Total products: ${allSupplies.length}`);
    console.log(`📊 Food products: ${foodSupplies.length}\n`);
    
    const changes: { id: number; oldName: string; newName: string }[] = [];
    let updatedCount = 0;
    
    // Process each food supply
    for (const supply of foodSupplies) {
      const expandedName = expandAbbreviations(supply.name);
      
      if (expandedName !== supply.name) {
        changes.push({
          id: supply.id,
          oldName: supply.name,
          newName: expandedName
        });
        
        if (isApplyMode) {
          // Apply the change
          await db.update(supplies)
            .set({ name: expandedName })
            .where(eq(supplies.id, supply.id));
          
          updatedCount++;
          
          if (updatedCount % 50 === 0) {
            console.log(`✓ Updated ${updatedCount} products...`);
          }
        }
      }
    }
    
    console.log('\n==============================================');
    console.log('   RESULTS');
    console.log('==============================================\n');
    
    if (isApplyMode) {
      console.log(`✅ Successfully updated ${updatedCount} food products!`);
      
      // Show first 20 examples
      const displayCount = Math.min(20, changes.length);
      console.log(`\nFirst ${displayCount} changes applied:\n`);
      
      for (let i = 0; i < displayCount; i++) {
        const change = changes[i];
        console.log(`${i + 1}. ID ${change.id}:`);
        console.log(`   Old: ${change.oldName}`);
        console.log(`   New: ${change.newName}`);
        console.log('');
      }
      
      // Save audit log
      const logData = {
        timestamp: new Date().toISOString(),
        totalProcessed: foodSupplies.length,
        totalUpdated: updatedCount,
        changes: changes,
        backupFile: backupFilename
      };
      
      fs.writeFileSync(logFilename, JSON.stringify(logData, null, 2));
      
      console.log(`\n📝 Audit log saved to: ${logFilename}`);
      console.log(`📦 Backup file: ${backupFilename}\n`);
      
      // Provide rollback instructions
      console.log('==============================================');
      console.log('   ROLLBACK INSTRUCTIONS');
      console.log('==============================================');
      console.log(`\nIf you need to undo these changes:`);
      console.log(`1. Run this command to restore from backup:`);
      console.log(`   NODE_ENV=production tsx scripts/restore-from-backup.ts ${backupFilename}\n`);
      console.log(`2. Or manually review the changes in: ${logFilename}\n`);
      
    } else {
      console.log(`📊 ${changes.length} food products would be updated`);
      console.log(`📊 ${foodSupplies.length - changes.length} food products unchanged\n`);
      
      // Show preview
      const displayCount = Math.min(20, changes.length);
      console.log(`Preview of first ${displayCount} changes:\n`);
      
      for (let i = 0; i < displayCount; i++) {
        const change = changes[i];
        console.log(`${i + 1}. ID ${change.id}:`);
        console.log(`   Old: ${change.oldName}`);
        console.log(`   New: ${change.newName}`);
        console.log('');
      }
      
      if (changes.length > displayCount) {
        console.log(`... and ${changes.length - displayCount} more changes\n`);
      }
      
      console.log('==============================================\n');
      console.log('To apply these changes, run:');
      console.log('  NODE_ENV=production tsx scripts/apply-food-abbreviation-expansions.ts --apply\n');
    }
    
  } catch (error) {
    console.error('❌ Error during expansion:', error);
    throw error;
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
