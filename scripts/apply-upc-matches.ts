import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';

interface MatchResult {
  supplyId: number;
  supplyName: string;
  matchedUpc: string;
  matchMethod: 'exact_name' | 'token_match';
  confidence: number;
  catalogName: string;
}

async function applyMatches() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');

  console.log('=== APPLYING UPC MATCHES ===\n');
  if (dryRun) {
    console.log('DRY RUN MODE - use --apply to actually update the database\n');
  }

  const matches: MatchResult[] = JSON.parse(fs.readFileSync('scripts/upc_matches.json', 'utf-8'));
  console.log(`Loaded ${matches.length} matches`);

  const exactMatches = matches.filter(m => m.matchMethod === 'exact_name');
  const tokenMatches = matches.filter(m => m.matchMethod === 'token_match' && m.confidence >= 0.85);

  console.log(`Exact name matches: ${exactMatches.length}`);
  console.log(`High-confidence token matches (>=0.85): ${tokenMatches.length}`);

  const toApply = [...exactMatches, ...tokenMatches];
  console.log(`\nTotal to apply: ${toApply.length}`);

  if (dryRun) {
    console.log('\n=== SAMPLE OF MATCHES TO APPLY ===');
    for (const match of toApply.slice(0, 20)) {
      console.log(`[${match.matchMethod}] ID ${match.supplyId}: "${match.supplyName}"`);
      console.log(`  -> UPC: ${match.matchedUpc} | "${match.catalogName}"`);
    }
    console.log('\nRun with --apply to update the database');
    return;
  }

  let updated = 0;
  let errors = 0;

  for (const match of toApply) {
    try {
      await db.update(supplies)
        .set({ sku: match.matchedUpc })
        .where(eq(supplies.id, match.supplyId));
      updated++;
      if (updated % 100 === 0) {
        console.log(`Updated ${updated}/${toApply.length}`);
      }
    } catch (err) {
      errors++;
      console.log(`Error updating ID ${match.supplyId}: ${err}`);
    }
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);

  const allSupplies = await db.select().from(supplies);
  const withUpc = allSupplies.filter(s => s.sku && s.sku.trim() !== '').length;
  console.log(`\nNew UPC coverage: ${withUpc}/${allSupplies.length} (${(withUpc/allSupplies.length*100).toFixed(1)}%)`);
}

applyMatches().catch(console.error);
