import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface BackupData {
  timestamp: string;
  totalProducts: number;
  products: Array<{
    id: number;
    name: string;
    category: string;
    brand?: string | null;
    price: number;
    stock: number;
    imageUrl?: string | null;
    imageUrls?: string[] | null;
    description?: string | null;
    filterType?: string | null;
  }>;
}

async function main() {
  const backupFile = process.argv[2];
  
  if (!backupFile) {
    console.error('❌ Error: Backup file not specified');
    console.log('\nUsage:');
    console.log('  NODE_ENV=production tsx scripts/restore-from-backup.ts <backup-file>\n');
    console.log('Example:');
    console.log('  NODE_ENV=production tsx scripts/restore-from-backup.ts backup-before-expansion-1234567890.json\n');
    process.exit(1);
  }
  
  console.log('==============================================');
  console.log('   RESTORE FROM BACKUP');
  console.log('==============================================\n');
  console.log(`📦 Backup file: ${backupFile}\n`);
  
  try {
    // Read backup file
    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file not found: ${backupFile}`);
    }
    
    const backupContent = fs.readFileSync(backupFile, 'utf-8');
    const backupData: BackupData = JSON.parse(backupContent);
    
    console.log(`📊 Backup created: ${backupData.timestamp}`);
    console.log(`📊 Products in backup: ${backupData.totalProducts}`);
    console.log(`📊 Products to restore: ${backupData.products.length}\n`);
    
    console.log('⚠️  WARNING: This will restore product names to their backup state.');
    console.log('⚠️  Any changes made after the backup will be lost.\n');
    
    // In production, require confirmation
    if (process.env.NODE_ENV === 'production') {
      console.log('This is a PRODUCTION restore operation.');
      console.log('Please confirm by adding --confirm flag to the command.\n');
      
      const hasConfirm = process.argv.includes('--confirm');
      if (!hasConfirm) {
        console.log('❌ Restore cancelled. Add --confirm to proceed.\n');
        console.log('Full command:');
        console.log(`  NODE_ENV=production tsx scripts/restore-from-backup.ts ${backupFile} --confirm\n`);
        process.exit(0);
      }
    }
    
    console.log('🔄 Starting restore operation...\n');
    
    let restoredCount = 0;
    const errors: Array<{ id: number; error: string }> = [];
    
    // Restore each product
    for (const product of backupData.products) {
      try {
        await db.update(supplies)
          .set({ name: product.name })
          .where(eq(supplies.id, product.id));
        
        restoredCount++;
        
        if (restoredCount % 50 === 0) {
          console.log(`✓ Restored ${restoredCount} products...`);
        }
      } catch (error) {
        errors.push({
          id: product.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    console.log('\n==============================================');
    console.log('   RESTORE COMPLETE');
    console.log('==============================================\n');
    
    console.log(`✅ Successfully restored ${restoredCount} products`);
    
    if (errors.length > 0) {
      console.log(`⚠️  Failed to restore ${errors.length} products\n`);
      console.log('Failed products:');
      errors.slice(0, 10).forEach(err => {
        console.log(`  - ID ${err.id}: ${err.error}`);
      });
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more errors\n`);
      }
      
      // Save error log
      const errorLogFile = `restore-errors-${Date.now()}.json`;
      fs.writeFileSync(errorLogFile, JSON.stringify(errors, null, 2));
      console.log(`📝 Error log saved to: ${errorLogFile}\n`);
    }
    
    console.log('🎉 Restore operation completed!\n');
    
  } catch (error) {
    console.error('❌ Fatal error during restore:', error);
    throw error;
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
