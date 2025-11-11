import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { abbreviationMappings, getBatchName } from './abbreviation-mappings';
import * as fs from 'fs';

interface DiffResult {
  id: number;
  oldName: string;
  newName: string;
  changes: string[];
  category: string;
}

// Apply a single mapping to text with whitelist checking
function applyMapping(text: string, mapping: typeof abbreviationMappings[0]): { text: string; changed: boolean; changesApplied: string[] } {
  const changesApplied: string[] = [];
  
  // Check whitelist - if any whitelist term exists in the text, skip this mapping
  if (mapping.whitelist) {
    for (const term of mapping.whitelist) {
      if (text.toUpperCase().includes(term.toUpperCase())) {
        return { text, changed: false, changesApplied: [] };
      }
    }
  }
  
  const matches = text.match(mapping.pattern);
  if (!matches || matches.length === 0) {
    return { text, changed: false, changesApplied: [] };
  }
  
  const newText = text.replace(mapping.pattern, mapping.replacement);
  
  if (newText !== text) {
    // Record what changed
    const uniqueMatches = [...new Set(matches)];
    for (const match of uniqueMatches) {
      changesApplied.push(`"${match}" → "${mapping.replacement}"`);
    }
    return { text: newText, changed: true, changesApplied };
  }
  
  return { text, changed: false, changesApplied: [] };
}

// Apply all mappings in priority order
function expandAbbreviations(text: string): { text: string; changes: string[] } {
  let currentText = text;
  const allChanges: string[] = [];
  
  // Sort by priority (highest first)
  const sortedMappings = [...abbreviationMappings].sort((a, b) => b.priority - a.priority);
  
  for (const mapping of sortedMappings) {
    const result = applyMapping(currentText, mapping);
    if (result.changed) {
      currentText = result.text;
      allChanges.push(...result.changesApplied);
    }
  }
  
  return { text: currentText, changes: allChanges };
}

async function main() {
  const args = process.argv.slice(2);
  const batchPriority = args[0] ? parseInt(args[0]) : null;
  
  console.log('==============================================');
  console.log('   DRY RUN: ABBREVIATION EXPANSION PREVIEW');
  console.log('==============================================\n');
  
  if (batchPriority) {
    console.log(`🎯 Batch: ${getBatchName(batchPriority)} (Priority ${batchPriority})`);
  } else {
    console.log(`🎯 Batch: ALL ABBREVIATIONS`);
  }
  console.log(`📋 Mode: DRY RUN (no changes will be applied)\n`);
  
  try {
    // Get all supplies
    const allSupplies = await db.select().from(supplies);
    console.log(`📊 Analyzing ${allSupplies.length} products...\n`);
    
    const diffs: DiffResult[] = [];
    
    // Get mappings to apply
    const mappingsToApply = batchPriority
      ? abbreviationMappings.filter(m => m.priority === batchPriority)
      : abbreviationMappings;
    
    console.log(`Using ${mappingsToApply.length} abbreviation rules\n`);
    
    // Process each supply
    for (const supply of allSupplies) {
      const result = expandAbbreviations(supply.name);
      
      if (result.text !== supply.name) {
        diffs.push({
          id: supply.id,
          oldName: supply.name,
          newName: result.text,
          changes: result.changes,
          category: supply.category
        });
      }
    }
    
    // Sort diffs by ID
    diffs.sort((a, b) => a.id - b.id);
    
    console.log('==============================================');
    console.log(`   PREVIEW: ${diffs.length} PRODUCTS WILL CHANGE`);
    console.log('==============================================\n');
    
    // Show first 20 examples
    const displayCount = Math.min(20, diffs.length);
    console.log(`Showing first ${displayCount} of ${diffs.length} changes:\n`);
    
    for (let i = 0; i < displayCount; i++) {
      const diff = diffs[i];
      console.log(`${i + 1}. ID ${diff.id} [${diff.category}]`);
      console.log(`   Old: ${diff.oldName}`);
      console.log(`   New: ${diff.newName}`);
      console.log(`   Changes: ${diff.changes.join(', ')}`);
      console.log('');
    }
    
    if (diffs.length > displayCount) {
      console.log(`... and ${diffs.length - displayCount} more changes\n`);
    }
    
    // Save detailed diff report
    const reportFilename = batchPriority
      ? `diff-batch-${batchPriority}.json`
      : `diff-all-batches.json`;
    
    const reportData = {
      timestamp: new Date().toISOString(),
      batch: batchPriority ? getBatchName(batchPriority) : 'ALL',
      batchPriority: batchPriority || 'ALL',
      totalProducts: allSupplies.length,
      productsToChange: diffs.length,
      productsUnchanged: allSupplies.length - diffs.length,
      mappingsApplied: mappingsToApply.length,
      diffs: diffs
    };
    
    fs.writeFileSync(reportFilename, JSON.stringify(reportData, null, 2));
    
    // Also save a CSV for easy review
    const csvFilename = batchPriority
      ? `diff-batch-${batchPriority}.csv`
      : `diff-all-batches.csv`;
    
    const csvLines = [
      'ID,Category,Old Name,New Name,Changes'
    ];
    
    for (const diff of diffs) {
      const changes = diff.changes.join(' | ').replace(/"/g, '""');
      csvLines.push(
        `${diff.id},"${diff.category}","${diff.oldName}","${diff.newName}","${changes}"`
      );
    }
    
    fs.writeFileSync(csvFilename, csvLines.join('\n'));
    
    console.log('==============================================');
    console.log('   SUMMARY');
    console.log('==============================================');
    console.log(`Total products analyzed: ${allSupplies.length}`);
    console.log(`Products to be updated: ${diffs.length}`);
    console.log(`Products unchanged: ${allSupplies.length - diffs.length}`);
    console.log(`\n📝 Detailed report saved to: ${reportFilename}`);
    console.log(`📊 CSV diff saved to: ${csvFilename}`);
    console.log(`\n✅ Dry run complete! Review the reports before applying changes.\n`);
    
    console.log('To apply these changes, run:');
    console.log(`  NODE_ENV=production tsx scripts/apply-abbreviation-expansions.ts ${batchPriority || ''}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Error generating diffs:', error);
    throw error;
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
