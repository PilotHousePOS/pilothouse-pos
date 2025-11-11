import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, or, like } from 'drizzle-orm';
import * as fs from 'fs';

async function main() {
  console.log('==============================================');
  console.log('   FIX BLUE BUFFALO DUPLICATES');
  console.log('==============================================\n');
  
  const args = process.argv.slice(2);
  const isApplyMode = args.includes('--apply');
  const timestamp = Date.now();
  const backupFilename = `backup-blue-buffalo-fix-${timestamp}.json`;
  
  console.log(`📋 Mode: ${isApplyMode ? 'APPLY CHANGES' : 'DRY RUN'}\n`);
  
  try {
    // Find products with duplicate Blue Buffalo
    const problematicProducts = await db.select()
      .from(supplies)
      .where(or(
        like(supplies.name, '%Black Blue Buffalo%'),
        like(supplies.name, '%Blue Blue Buffalo%'),
        like(supplies.description, '%Black Blue Buffalo%'),
        like(supplies.description, '%Blue Blue Buffalo%')
      ));
    
    console.log(`📊 Found ${problematicProducts.length} products with duplicate Blue Buffalo\n`);
    
    if (problematicProducts.length === 0) {
      console.log('✅ No issues found!');
      return;
    }
    
    // Build fixes
    const fixes: Array<{
      id: number;
      field: 'name' | 'description';
      oldValue: string;
      newValue: string;
    }> = [];
    
    for (const product of problematicProducts) {
      // Fix name
      if (product.name.includes('Black Blue Buffalo') || product.name.includes('Blue Blue Buffalo')) {
        const newName = product.name
          .replace(/Black Blue Buffalo/gi, 'Blue Buffalo')
          .replace(/Blue Blue Buffalo/gi, 'Blue Buffalo');
        
        if (newName !== product.name) {
          fixes.push({
            id: product.id,
            field: 'name',
            oldValue: product.name,
            newValue: newName
          });
        }
      }
      
      // Fix description
      if (product.description && (product.description.includes('Black Blue Buffalo') || product.description.includes('Blue Blue Buffalo'))) {
        const newDesc = product.description
          .replace(/Black Blue Buffalo/gi, 'Blue Buffalo')
          .replace(/Blue Blue Buffalo/gi, 'Blue Buffalo');
        
        if (newDesc !== product.description) {
          fixes.push({
            id: product.id,
            field: 'description',
            oldValue: product.description,
            newValue: newDesc
          });
        }
      }
    }
    
    console.log(`📝 ${fixes.length} fixes identified\n`);
    
    // Show preview
    const previewCount = Math.min(10, fixes.length);
    console.log(`Preview of fixes (first ${previewCount}):\n`);
    for (let i = 0; i < previewCount; i++) {
      const fix = fixes[i];
      console.log(`${i + 1}. ID ${fix.id} [${fix.field}]:`);
      console.log(`   Old: ${fix.oldValue}`);
      console.log(`   New: ${fix.newValue}\n`);
    }
    
    if (isApplyMode && fixes.length > 0) {
      // Create backup
      console.log('📦 Creating backup...');
      const backupData = {
        timestamp: new Date().toISOString(),
        totalProducts: problematicProducts.length,
        products: problematicProducts
      };
      fs.writeFileSync(backupFilename, JSON.stringify(backupData, null, 2));
      console.log(`✅ Backup saved to: ${backupFilename}\n`);
      
      // Apply fixes in transaction
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
      
      console.log('✅ Transaction committed successfully!\n');
      console.log(`📝 Backup file: ${backupFilename}\n`);
      
    } else if (!isApplyMode) {
      console.log('To apply these fixes, run:');
      console.log('  NODE_ENV=production tsx scripts/fix-blue-buffalo-duplicates.ts --apply\n');
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
