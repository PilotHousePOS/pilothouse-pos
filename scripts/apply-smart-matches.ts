import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';

interface Match {
  supplyId: number;
  supplyName: string;
  supplyBrand: string | null;
  upc: string;
  catalogName: string;
  score: number;
  method: string;
}

function extractSizes(str: string): string[] {
  const sizes: string[] = [];
  const lower = str.toLowerCase();
  
  const lbMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:#|lb|lbs)/g);
  if (lbMatch) sizes.push(...lbMatch.map(m => m.replace(/#/g, 'lb').replace(/\s+/g, '')));
  
  const ozMatch = lower.match(/(\d+(?:\.\d+)?)\s*oz/g);
  if (ozMatch) sizes.push(...ozMatch.map(m => m.replace(/\s+/g, '')));
  
  return sizes;
}

function sizesMatch(supply: string, catalog: string): boolean {
  const supplySizes = extractSizes(supply);
  const catalogSizes = extractSizes(catalog);
  
  if (supplySizes.length === 0 || catalogSizes.length === 0) return true;
  
  for (const ss of supplySizes) {
    const supplyNum = parseFloat(ss.replace(/[^\d.]/g, ''));
    for (const cs of catalogSizes) {
      const catNum = parseFloat(cs.replace(/[^\d.]/g, ''));
      if (Math.abs(supplyNum - catNum) < 0.1) return true;
      if (supplyNum === catNum) return true;
    }
  }
  return false;
}

async function applyMatches() {
  const matches: Match[] = JSON.parse(fs.readFileSync('scripts/smart_matches.json', 'utf-8'));
  
  console.log('=== APPLY SMART MATCHES ===\n');
  console.log(`Total matches: ${matches.length}`);
  
  const highConf = matches.filter(m => m.score >= 0.80);
  const medConf = matches.filter(m => m.score >= 0.70 && m.score < 0.80);
  
  console.log(`High confidence (>=80%): ${highConf.length}`);
  console.log(`Medium confidence (70-80%): ${medConf.length}`);
  
  const toApply: Match[] = [];
  const sizeErrors: Match[] = [];
  
  for (const m of [...highConf, ...medConf]) {
    if (sizesMatch(m.supplyName, m.catalogName)) {
      toApply.push(m);
    } else {
      sizeErrors.push(m);
    }
  }
  
  console.log(`\nPassed size check: ${toApply.length}`);
  console.log(`Failed size check: ${sizeErrors.length}`);
  
  if (sizeErrors.length > 0) {
    console.log('\n=== SIZE MISMATCHES (not applying) ===');
    for (const m of sizeErrors.slice(0, 10)) {
      console.log(`  "${m.supplyName}" -> "${m.catalogName}"`);
    }
  }
  
  const dryRun = !process.argv.includes('--apply');
  
  if (dryRun) {
    console.log('\n=== DRY RUN - samples ===');
    for (const m of toApply.slice(0, 20)) {
      console.log(`[${(m.score*100).toFixed(0)}%] "${m.supplyName}"`);
      console.log(`    -> "${m.catalogName}" | UPC: ${m.upc}`);
    }
    console.log(`\nRun with --apply to update database`);
  } else {
    console.log('\n=== APPLYING TO DATABASE ===');
    let applied = 0;
    let errors = 0;
    
    for (const m of toApply) {
      try {
        await db.update(supplies)
          .set({ sku: m.upc })
          .where(eq(supplies.id, m.supplyId));
        applied++;
      } catch (e) {
        errors++;
        console.log(`Error applying ${m.supplyId}: ${e}`);
      }
    }
    
    console.log(`Applied: ${applied}`);
    console.log(`Errors: ${errors}`);
    
    const allSupplies = await db.select().from(supplies);
    const withUpc = allSupplies.filter(s => s.sku && s.sku.trim() !== '');
    console.log(`\nNew coverage: ${withUpc.length}/${allSupplies.length} (${(withUpc.length/allSupplies.length*100).toFixed(1)}%)`);
  }
}

applyMatches().catch(console.error);
