import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import { lowercaseWords, uppercaseBrands } from './shared-mappings';

// Apply title case with slash/comma support
function applyTitleCase(text: string): string {
  const capitalizeWord = (word: string, isFirstWord: boolean): string => {
    if (!word) return word;
    
    const upperWord = word.toUpperCase();
    const lowerWord = word.toLowerCase();
    
    if (uppercaseBrands.includes(upperWord)) {
      return upperWord;
    }
    
    if (isFirstWord) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    
    if (lowercaseWords.includes(lowerWord)) {
      return lowerWord;
    }
    
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  };
  
  return text.split(' ').map((segment, spaceIndex) => {
    if (segment.includes('/')) {
      return segment.split('/').map((part, slashIndex) => 
        capitalizeWord(part, spaceIndex === 0 && slashIndex === 0)
      ).join('/');
    } else if (segment.includes(',')) {
      return segment.split(',').map((part, commaIndex) => 
        capitalizeWord(part, spaceIndex === 0 && commaIndex === 0)
      ).join(',');
    } else {
      return capitalizeWord(segment, spaceIndex === 0);
    }
  }).join(' ');
}

async function main() {
  const args = process.argv.slice(2);
  const isApplyMode = args.includes('--apply');
  
  console.log('==============================================');
  console.log('   FIX ALL CAPITALIZATION (SLASHES/COMMAS)');
  console.log('==============================================\n');
  console.log(`📋 Mode: ${isApplyMode ? 'APPLY CHANGES' : 'DRY RUN'}\n`);
  
  const allSupplies = await db.select().from(supplies);
  const foodSupplies = allSupplies.filter(s => s.category === 'food');
  
  console.log(`📊 Food products: ${foodSupplies.length}\n`);
  
  // Find products that need capitalization fixes
  const fixes: Array<{
    id: number;
    field: 'name' | 'description';
    oldValue: string;
    newValue: string;
  }> = [];
  
  for (const supply of foodSupplies) {
    // Check name
    const newName = applyTitleCase(supply.name);
    if (newName !== supply.name) {
      fixes.push({
        id: supply.id,
        field: 'name',
        oldValue: supply.name,
        newValue: newName
      });
    }
    
    // Check description
    if (supply.description) {
      const newDesc = applyTitleCase(supply.description);
      if (newDesc !== supply.description) {
        fixes.push({
          id: supply.id,
          field: 'description',
          oldValue: supply.description,
          newValue: newDesc
        });
      }
    }
  }
  
  console.log(`📝 ${fixes.length} capitalization fixes needed\n`);
  
  if (fixes.length === 0) {
    console.log('✅ All products already have proper capitalization!');
    return;
  }
  
  // Preview
  const preview = Math.min(20, fixes.length);
  console.log(`Preview (first ${preview}):\n`);
  for (let i = 0; i < preview; i++) {
    const fix = fixes[i];
    console.log(`${i + 1}. ID ${fix.id} [${fix.field}]:`);
    console.log(`   Old: ${fix.oldValue}`);
    console.log(`   New: ${fix.newValue}\n`);
  }
  
  if (isApplyMode) {
    const timestamp = Date.now();
    const backupFilename = `backup-capitalization-fix-${timestamp}.json`;
    
    // Create backup
    const affectedProducts = [...new Set(fixes.map(f => f.id))].map(id =>
      foodSupplies.find(s => s.id === id)!
    );
    
    console.log('📦 Creating backup...');
    fs.writeFileSync(backupFilename, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalFixes: fixes.length,
      products: affectedProducts
    }, null, 2));
    console.log(`✅ Backup saved: ${backupFilename}\n`);
    
    // Apply in transaction
    console.log('🔄 Applying fixes in transaction...\n');
    await db.transaction(async (tx) => {
      for (const fix of fixes) {
        if (fix.field === 'name') {
          await tx.update(supplies)
            .set({ name: fix.newValue })
            .where(eq(supplies.id, fix.id));
        } else {
          await tx.update(supplies)
            .set({ description: fix.newValue })
            .where(eq(supplies.id, fix.id));
        }
      }
    });
    
    console.log('✅ Transaction committed!\n');
    console.log(`📦 Backup: ${backupFilename}\n`);
  } else {
    console.log('To apply these fixes, run:');
    console.log('  NODE_ENV=production tsx scripts/fix-all-capitalization.ts --apply\n');
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
