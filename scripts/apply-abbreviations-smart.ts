import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import { abbreviationMappings, spellingCorrections, nonExpandableCodes, proteinAbbreviations } from './shared-mappings';

interface FieldChange {
  id: number;
  field: string;
  oldValue: string;
  newValue: string;
  changes: string[];
}

// Smart expansion - avoid expanding abbreviations in SKU codes and brand names
function expandAbbreviationsSmart(text: string): string {
  let expanded = text;
  
  for (const [abbrev, full] of Object.entries(abbreviationMappings)) {
    if (abbrev === '#') {
      // Don't expand # in prices or SKUs (like "3.5#" or "40#$")
      continue; // Skip # expansion for non-food products
    }
    
    const abbrevLower = abbrev.toLowerCase();
    const abbrevUpper = abbrev.toUpperCase();
    
    // Check if this is a protein abbreviation that needs food context
    if (proteinAbbreviations.includes(abbrevLower)) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      
      expanded = expanded.replace(regex, (match, offset) => {
        const before = text.slice(Math.max(0, offset - 15), offset);
        const after = text.slice(offset + match.length, offset + match.length + 15);
        const context = (before + match + after).toLowerCase();
        
        // Don't expand if surrounded by hyphens (SKU codes)
        const charBefore = text.charAt(offset - 1);
        const charAfter = text.charAt(offset + match.length);
        if (charBefore === '-' || charAfter === '-') {
          return match;
        }
        
        // Food context keywords - only expand if these are present
        const foodKeywords = /\b(treat|food|flavor|creamy|crunchy|&|kibble|wet|dry|recipe|formula|dinner|entree|pate|stew|gravy|broth)\b/i;
        
        // Non-food keywords - don't expand if these are present
        const nonFoodKeywords = /\b(cologne|perfume|spray|shampoo|toy|ball|roller|plush|bed|collar|leash|bowl|cage|crate)\b/i;
        
        // If non-food context, definitely keep as-is
        if (nonFoodKeywords.test(context)) {
          return match;
        }
        
        // Only expand if food context is present
        if (foodKeywords.test(context)) {
          return full;
        }
        
        // No clear context - keep as-is to be safe
        return match;
      });
    }
    // Check if this abbreviation is in the non-expandable list (size codes, brand codes)
    else if (nonExpandableCodes.includes(abbrevUpper)) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      
      expanded = expanded.replace(regex, (match, offset) => {
        const before = text.slice(Math.max(0, offset - 10), offset);
        const after = text.slice(offset + match.length, offset + match.length + 10);
        const context = before + match + after;
        
        // Check for descriptive keywords that suggest this is NOT a brand/SKU
        const descriptiveKeywords = /\b(toy|collar|bowl|leash|bed|treat|food|flavor|&|with|in)\b/i;
        
        // If no descriptive context, keep as-is (likely a brand/SKU)
        if (!descriptiveKeywords.test(context)) {
          return match;
        }
        
        // Don't expand if surrounded by hyphens
        const charBefore = text.charAt(offset - 1);
        const charAfter = text.charAt(offset + match.length);
        if (charBefore === '-' || charAfter === '-') {
          return match;
        }
        
        return full;
      });
    } else {
      // Standard expansion for non-problematic abbreviations
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      
      expanded = expanded.replace(regex, (match, offset) => {
        const before = text.charAt(offset - 1);
        const after = text.charAt(offset + match.length);
        
        // Don't expand if surrounded by hyphens
        if (before === '-' || after === '-') {
          return match;
        }
        
        return full;
      });
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

// Process text - smart abbreviation expansion only
function processText(text: string): string {
  let result = text;
  result = expandAbbreviationsSmart(result);
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
  console.log('   SMART ABBREVIATION EXPANSION');
  console.log('==============================================\n');
  console.log(`📋 Mode: ${isApplyMode ? 'APPLY CHANGES' : 'DRY RUN'}`);
  console.log(`🎯 Target: ALL products - Smart expansion (exclude SKUs)\n`);
  
  if (isApplyMode) {
    console.log(`⚠️  SAFETY MEASURES ACTIVE:`);
    console.log(`   - Backup file: ${backupFilename}`);
    console.log(`   - Audit log: ${logFilename}`);
    console.log(`   - Transaction protection: All-or-nothing\n`);
  }
  
  try {
    const allSupplies = await db.select().from(supplies);
    
    if (isApplyMode) {
      console.log('📦 Creating backup...');
      fs.writeFileSync(backupFilename, JSON.stringify({
        timestamp: new Date().toISOString(),
        totalProducts: allSupplies.length,
        products: allSupplies
      }, null, 2));
      console.log(`✅ Backup saved: ${backupFilename}\n`);
    }
    
    console.log(`📊 Total products: ${allSupplies.length}\n`);
    
    const allChanges: FieldChange[] = [];
    
    console.log('🔍 Analyzing products...\n');
    
    for (const supply of allSupplies) {
      const newName = processText(supply.name);
      if (newName !== supply.name) {
        allChanges.push({
          id: supply.id,
          field: 'name',
          oldValue: supply.name,
          newValue: newName,
          changes: [`"${supply.name}" → "${newName}"`]
        });
      }
      
      if (supply.description) {
        const newDesc = processText(supply.description);
        if (newDesc !== supply.description) {
          allChanges.push({
            id: supply.id,
            field: 'description',
            oldValue: supply.description,
            newValue: newDesc,
            changes: [`"${supply.description}" → "${newDesc}"`]
          });
        }
      }
    }
    
    console.log(`📝 Found ${allChanges.length} changes\n`);
    
    if (allChanges.length === 0) {
      console.log('✅ No abbreviations to fix!\n');
      return;
    }
    
    const preview = Math.min(50, allChanges.length);
    console.log(`Preview (first ${preview}):\n`);
    
    for (let i = 0; i < preview; i++) {
      const c = allChanges[i];
      console.log(`${i + 1}. ID ${c.id} [${c.field}]:`);
      console.log(`   Old: ${c.oldValue}`);
      console.log(`   New: ${c.newValue}\n`);
    }
    
    if (allChanges.length > preview) {
      console.log(`... and ${allChanges.length - preview} more\n`);
    }
    
    if (isApplyMode) {
      fs.writeFileSync(logFilename, JSON.stringify({
        timestamp: new Date().toISOString(),
        totalChanges: allChanges.length,
        changes: allChanges
      }, null, 2));
      
      console.log(`🔄 Applying ${allChanges.length} changes...\n`);
      
      await db.transaction(async (tx) => {
        for (const change of allChanges) {
          if (change.field === 'name') {
            await tx.update(supplies).set({ name: change.newValue }).where(eq(supplies.id, change.id));
          } else {
            await tx.update(supplies).set({ description: change.newValue }).where(eq(supplies.id, change.id));
          }
        }
      });
      
      console.log('✅ Transaction committed!\n');
      console.log(`📦 Backup: ${backupFilename}`);
      console.log(`📝 Log: ${logFilename}\n`);
      
    } else {
      console.log('To apply, run:');
      console.log('  NODE_ENV=production tsx scripts/apply-abbreviations-smart.ts --apply\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
