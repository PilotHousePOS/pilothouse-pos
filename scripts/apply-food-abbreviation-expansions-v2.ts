import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import { abbreviationMappings, spellingCorrections, lowercaseWords, uppercaseBrands } from './shared-mappings';

// Fields to process
const FIELDS_TO_EXPAND = ['name', 'description'] as const;

interface FieldChange {
  id: number;
  field: string;
  oldValue: string;
  newValue: string;
  changes: string[];
}

// Phase 1: Expand abbreviations
function expandAbbreviations(text: string): string {
  let expanded = text;
  
  // Abbreviations are already sorted in shared-mappings.ts with longest first
  for (const [abbrev, full] of Object.entries(abbreviationMappings)) {
    if (abbrev === '#') {
      // Special handling for # symbol
      expanded = expanded.replace(/#(?=\s|$)/g, full);
    } else {
      // Case-insensitive replacement with word boundaries
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  
  return expanded;
}

// Phase 2: Fix spelling errors
function correctSpelling(text: string): string {
  let corrected = text;
  
  for (const [wrong, right] of Object.entries(spellingCorrections)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    corrected = corrected.replace(regex, right);
  }
  
  return corrected;
}

// Phase 3: Apply title case while respecting allowlists
function applyTitleCase(text: string): string {
  // Helper to capitalize a single word
  const capitalizeWord = (word: string, isFirstWord: boolean): string => {
    if (!word) return word;
    
    const upperWord = word.toUpperCase();
    const lowerWord = word.toLowerCase();
    
    // Keep uppercase brands as-is
    if (uppercaseBrands.includes(upperWord)) {
      return upperWord;
    }
    
    // Always capitalize first word
    if (isFirstWord) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    
    // Keep articles/conjunctions lowercase
    if (lowercaseWords.includes(lowerWord)) {
      return lowerWord;
    }
    
    // Capitalize everything else
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  };
  
  // Split on spaces and process each segment
  return text.split(' ').map((segment, spaceIndex) => {
    // Check if this segment contains slashes or commas
    if (segment.includes('/')) {
      // Split on slashes and capitalize each part
      return segment.split('/').map((part, slashIndex) => 
        capitalizeWord(part, spaceIndex === 0 && slashIndex === 0)
      ).join('/');
    } else if (segment.includes(',')) {
      // Split on commas and capitalize each part
      return segment.split(',').map((part, commaIndex) => 
        capitalizeWord(part, spaceIndex === 0 && commaIndex === 0)
      ).join(',');
    } else {
      // No special characters, just capitalize normally
      return capitalizeWord(segment, spaceIndex === 0);
    }
  }).join(' ');
}

// Process text through all phases
function processText(text: string): string {
  let result = text;
  
  // Phase 1: Expand abbreviations
  result = expandAbbreviations(result);
  
  // Phase 2: Correct spelling
  result = correctSpelling(result);
  
  // Phase 3: Apply title case
  result = applyTitleCase(result);
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const isApplyMode = args.includes('--apply');
  const timestamp = Date.now();
  const logFilename = `expansion-log-${timestamp}.json`;
  const backupFilename = `backup-before-expansion-${timestamp}.json`;
  
  console.log('==============================================');
  console.log('   FOOD PRODUCT EXPANSION & FORMATTING');
  console.log('==============================================\n');
  console.log(`📋 Mode: ${isApplyMode ? 'APPLY CHANGES' : 'DRY RUN'}`);
  console.log(`🎯 Target: Food category products (names + descriptions)\n`);
  
  if (isApplyMode) {
    console.log(`⚠️  SAFETY MEASURES ACTIVE:`);
    console.log(`   - Backup file: ${backupFilename}`);
    console.log(`   - Audit log: ${logFilename}`);
    console.log(`   - Transaction protection: All-or-nothing`);
    console.log(`   - Rollback capability: Available\n`);
  }
  
  try {
    // Get all food supplies
    const allSupplies = await db.select().from(supplies);
    const foodSupplies = allSupplies.filter(s => s.category === 'food');
    
    // Create backup before any changes
    if (isApplyMode) {
      console.log('📦 Creating backup of all food products...');
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
    
    const allChanges: FieldChange[] = [];
    
    // Build change list by processing each supply
    console.log('🔍 Analyzing products and building change list...\n');
    
    for (const supply of foodSupplies) {
      const changes: string[] = [];
      let nameChanged = false;
      let descChanged = false;
      
      // Process name
      const newName = processText(supply.name);
      if (newName !== supply.name) {
        allChanges.push({
          id: supply.id,
          field: 'name',
          oldValue: supply.name,
          newValue: newName,
          changes: [`name: "${supply.name}" → "${newName}"`]
        });
        nameChanged = true;
      }
      
      // Process description if it exists
      if (supply.description) {
        const newDesc = processText(supply.description);
        if (newDesc !== supply.description) {
          allChanges.push({
            id: supply.id,
            field: 'description',
            oldValue: supply.description,
            newValue: newDesc,
            changes: [`desc: "${supply.description}" → "${newDesc}"`]
          });
          descChanged = true;
        }
      }
    }
    
    // Group changes by field for reporting
    const nameChanges = allChanges.filter(c => c.field === 'name');
    const descChanges = allChanges.filter(c => c.field === 'description');
    
    console.log(`📝 Changes found:`);
    console.log(`   - Names: ${nameChanges.length} products`);
    console.log(`   - Descriptions: ${descChanges.length} products`);
    console.log(`   - Total changes: ${allChanges.length}\n`);
    
    // Save planned changes before applying
    if (isApplyMode && allChanges.length > 0) {
      const plannedLog = {
        timestamp: new Date().toISOString(),
        status: 'planned',
        totalChanges: allChanges.length,
        nameChanges: nameChanges.length,
        descriptionChanges: descChanges.length,
        changes: allChanges,
        backupFile: backupFilename
      };
      fs.writeFileSync(logFilename, JSON.stringify(plannedLog, null, 2));
      console.log(`📝 Planned changes logged to: ${logFilename}\n`);
      
      console.log(`🔄 Applying ${allChanges.length} changes in a transaction (all-or-nothing)...\n`);
      
      try {
        let updatedCount = 0;
        
        // Apply all changes in a single transaction
        await db.transaction(async (tx) => {
          for (const change of allChanges) {
            if (change.field === 'name') {
              await tx.update(supplies)
                .set({ name: change.newValue })
                .where(eq(supplies.id, change.id));
            } else if (change.field === 'description') {
              await tx.update(supplies)
                .set({ description: change.newValue })
                .where(eq(supplies.id, change.id));
            }
            
            updatedCount++;
            
            if (updatedCount % 100 === 0) {
              console.log(`✓ Applied ${updatedCount} changes...`);
            }
          }
        });
        
        console.log(`\n✅ Transaction committed successfully!`);
        
        // Update log to mark as completed
        const completedLog = {
          ...plannedLog,
          status: 'completed',
          completedAt: new Date().toISOString()
        };
        fs.writeFileSync(logFilename, JSON.stringify(completedLog, null, 2));
        
      } catch (txError) {
        console.error('\n❌ Transaction failed and was rolled back!');
        console.error('Error:', txError);
        
        // Update log to mark as failed
        const failedLog = {
          timestamp: new Date().toISOString(),
          status: 'failed',
          error: txError instanceof Error ? txError.message : String(txError),
          totalPlanned: allChanges.length,
          changes: allChanges,
          backupFile: backupFilename
        };
        fs.writeFileSync(logFilename, JSON.stringify(failedLog, null, 2));
        console.log(`\n📝 Failure logged to: ${logFilename}`);
        console.log(`📦 Data unchanged - backup not needed\n`);
        
        throw txError;
      }
    }
    
    // Report results
    console.log('\n==============================================');
    console.log('   RESULTS');
    console.log('==============================================\n');
    
    if (isApplyMode) {
      console.log(`✅ Successfully applied ${allChanges.length} changes!`);
      console.log(`   - ${nameChanges.length} names updated`);
      console.log(`   - ${descChanges.length} descriptions updated\n`);
      
      // Show sample changes
      const sampleCount = Math.min(10, allChanges.length);
      if (sampleCount > 0) {
        console.log(`Sample of changes (first ${sampleCount}):\n`);
        for (let i = 0; i < sampleCount; i++) {
          const change = allChanges[i];
          console.log(`${i + 1}. ID ${change.id} [${change.field}]:`);
          console.log(`   Old: ${change.oldValue}`);
          console.log(`   New: ${change.newValue}\n`);
        }
      }
      
      console.log(`📝 Audit log: ${logFilename}`);
      console.log(`📦 Backup file: ${backupFilename}\n`);
      
      console.log('==============================================');
      console.log('   ROLLBACK INSTRUCTIONS');
      console.log('==============================================');
      console.log(`\nIf you need to undo these changes:`);
      console.log(`1. Run this command to restore from backup:`);
      console.log(`   NODE_ENV=production tsx scripts/restore-from-backup.ts ${backupFilename} --confirm\n`);
      console.log(`2. Or review changes in: ${logFilename}\n`);
      
    } else {
      // Dry run results
      console.log(`📊 ${allChanges.length} changes would be applied:`);
      console.log(`   - ${nameChanges.length} name updates`);
      console.log(`   - ${descChanges.length} description updates\n`);
      
      // Show sample changes
      const sampleCount = Math.min(20, allChanges.length);
      if (sampleCount > 0) {
        console.log(`Preview of changes (first ${sampleCount}):\n`);
        for (let i = 0; i < sampleCount; i++) {
          const change = allChanges[i];
          console.log(`${i + 1}. ID ${change.id} [${change.field}]:`);
          console.log(`   Old: ${change.oldValue}`);
          console.log(`   New: ${change.newValue}\n`);
        }
        
        if (allChanges.length > sampleCount) {
          console.log(`... and ${allChanges.length - sampleCount} more changes\n`);
        }
      }
      
      console.log('==============================================\n');
      console.log('To apply these changes, run:');
      console.log('  NODE_ENV=production tsx scripts/apply-food-abbreviation-expansions-v2.ts --apply\n');
    }
    
  } catch (error) {
    console.error('❌ Error during processing:', error);
    throw error;
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
