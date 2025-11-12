import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import { abbreviationMappings, spellingCorrections } from './shared-mappings';

interface FieldChange {
  id: number;
  field: string;
  oldValue: string;
  newValue: string;
  changes: string[];
}

// ONLY expand abbreviations - don't change capitalization of existing words
function expandAbbreviationsOnly(text: string): string {
  let expanded = text;
  
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

// Fix spelling errors
function correctSpelling(text: string): string {
  let corrected = text;
  
  for (const [wrong, right] of Object.entries(spellingCorrections)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    corrected = corrected.replace(regex, right);
  }
  
  return corrected;
}

// Process text - ONLY abbreviations and spelling, NO title case changes
function processText(text: string): string {
  let result = text;
  
  // Expand abbreviations
  result = expandAbbreviationsOnly(result);
  
  // Correct spelling
  result = correctSpelling(result);
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const isApplyMode = args.includes('--apply');
  const timestamp = Date.now();
  const logFilename = `expansion-log-${timestamp}.json`;
  const backupFilename = `backup-before-expansion-${timestamp}.json`;
  
  console.log('==============================================');
  console.log('   ABBREVIATION EXPANSION (ALL PRODUCTS)');
  console.log('==============================================\n');
  console.log(`📋 Mode: ${isApplyMode ? 'APPLY CHANGES' : 'DRY RUN'}`);
  console.log(`🎯 Target: ALL products - ONLY fix abbreviations\n`);
  
  if (isApplyMode) {
    console.log(`⚠️  SAFETY MEASURES ACTIVE:`);
    console.log(`   - Backup file: ${backupFilename}`);
    console.log(`   - Audit log: ${logFilename}`);
    console.log(`   - Transaction protection: All-or-nothing`);
    console.log(`   - Rollback capability: Available\n`);
  }
  
  try {
    const allSupplies = await db.select().from(supplies);
    
    if (isApplyMode) {
      console.log('📦 Creating backup of all products...');
      const backupData = {
        timestamp: new Date().toISOString(),
        totalProducts: allSupplies.length,
        products: allSupplies
      };
      fs.writeFileSync(backupFilename, JSON.stringify(backupData, null, 2));
      console.log(`✅ Backup saved to: ${backupFilename}\n`);
    }
    
    console.log(`📊 Total products: ${allSupplies.length}\n`);
    
    const allChanges: FieldChange[] = [];
    
    console.log('🔍 Analyzing products for abbreviations...\n');
    
    for (const supply of allSupplies) {
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
        }
      }
    }
    
    const nameChanges = allChanges.filter(c => c.field === 'name');
    const descChanges = allChanges.filter(c => c.field === 'description');
    
    console.log(`📝 Changes found:`);
    console.log(`   - Names: ${nameChanges.length} products`);
    console.log(`   - Descriptions: ${descChanges.length} products`);
    console.log(`   - Total changes: ${allChanges.length}\n`);
    
    if (allChanges.length === 0) {
      console.log('✅ No abbreviations found! All products are already properly formatted.\n');
      return;
    }
    
    if (isApplyMode) {
      console.log(`📝 Planned changes logged to: ${logFilename}\n`);
      fs.writeFileSync(logFilename, JSON.stringify({
        timestamp: new Date().toISOString(),
        totalChanges: allChanges.length,
        changes: allChanges
      }, null, 2));
    }
    
    console.log('==============================================');
    console.log('   RESULTS');
    console.log('==============================================\n');
    console.log(`📊 ${allChanges.length} changes would be applied:`);
    console.log(`   - ${nameChanges.length} name updates`);
    console.log(`   - ${descChanges.length} description updates\n`);
    
    const previewCount = Math.min(30, allChanges.length);
    console.log(`Preview of changes (first ${previewCount}):\n`);
    
    for (let i = 0; i < previewCount; i++) {
      const change = allChanges[i];
      console.log(`${i + 1}. ID ${change.id} [${change.field}]:`);
      console.log(`   Old: ${change.oldValue}`);
      console.log(`   New: ${change.newValue}\n`);
    }
    
    if (allChanges.length > previewCount) {
      console.log(`... and ${allChanges.length - previewCount} more changes\n`);
    }
    
    if (isApplyMode) {
      console.log(`🔄 Applying ${allChanges.length} changes in a transaction (all-or-nothing)...\n`);
      
      await db.transaction(async (tx) => {
        let count = 0;
        for (const change of allChanges) {
          if (change.field === 'name') {
            await tx.update(supplies)
              .set({ name: change.newValue })
              .where(eq(supplies.id, change.id));
          } else {
            await tx.update(supplies)
              .set({ description: change.newValue })
              .where(eq(supplies.id, change.id));
          }
          
          count++;
          if (count % 100 === 0) {
            console.log(`✓ Applied ${count} changes...`);
          }
        }
      });
      
      console.log('\n✅ Transaction committed successfully!\n');
      console.log('==============================================');
      console.log('   RESULTS');
      console.log('==============================================\n');
      console.log(`✅ Successfully applied ${allChanges.length} changes!`);
      console.log(`   - ${nameChanges.length} names updated`);
      console.log(`   - ${descChanges.length} descriptions updated\n`);
      
      console.log(`📝 Audit log: ${logFilename}`);
      console.log(`📦 Backup file: ${backupFilename}\n`);
      
      console.log('==============================================');
      console.log('   ROLLBACK INSTRUCTIONS');
      console.log('==============================================\n');
      console.log('If you need to undo these changes:');
      console.log(`1. Run this command to restore from backup:`);
      console.log(`   NODE_ENV=production tsx scripts/restore-from-backup.ts ${backupFilename} --confirm\n`);
      console.log(`2. Or review changes in: ${logFilename}\n`);
      
    } else {
      console.log('==============================================\n');
      console.log('To apply these changes, run:');
      console.log('  NODE_ENV=production tsx scripts/apply-abbreviations-only.ts --apply\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
