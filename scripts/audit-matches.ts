import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';

// Extract size/weight from product name
function extractWeight(name: string): { value: number; unit: string } | null {
  const match = name.match(/(\d+\.?\d*)\s*(lb|lbs|oz|#|kg|g)\b/i);
  if (match) {
    let value = parseFloat(match[1]);
    let unit = match[2].toLowerCase();
    if (unit === '#') unit = 'lb';
    if (unit === 'lbs') unit = 'lb';
    // Normalize to oz
    if (unit === 'lb') value *= 16;
    if (unit === 'kg') value *= 35.274;
    if (unit === 'g') value *= 0.035274;
    return { value, unit: 'oz' };
  }
  return null;
}

// Extract species hints
function getSpecies(name: string): string[] {
  const lower = name.toLowerCase();
  const species: string[] = [];
  if (lower.includes('cat') || lower.includes('kitten') || lower.includes('feline')) species.push('cat');
  if (lower.includes('dog') || lower.includes('puppy') || lower.includes('canine')) species.push('dog');
  if (lower.includes('bird') || lower.includes('parrot') || lower.includes('parakeet')) species.push('bird');
  if (lower.includes('fish') || lower.includes('aqua') || lower.includes('tank')) species.push('fish');
  if (lower.includes('reptile') || lower.includes('turtle') || lower.includes('snake')) species.push('reptile');
  return species;
}

async function main() {
  console.log('=== Auditing UPC Matches ===\n');
  
  // Load permanent matches
  const permPath = '.local/state/memory/permanent_upc_matches.json';
  const perm: Record<string, string> = JSON.parse(fs.readFileSync(permPath, 'utf-8'));
  
  // Get all products with SKU
  const withSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku
  }).from(supplies).where(isNotNull(supplies.sku));
  
  console.log(`Products with SKU: ${withSku.length}\n`);
  
  const issues: {id: number; name: string; sku: string; issue: string}[] = [];
  
  // Check for "kit" -> "kitten" false positives
  const kitIssues = withSku.filter(p => 
    p.name.toLowerCase().includes('kit') && 
    !p.name.toLowerCase().includes('kitten') &&
    (p.name.toLowerCase().includes('starter') || p.name.toLowerCase().includes('first'))
  );
  
  console.log(`Potential "kit" != "kitten" issues: ${kitIssues.length}`);
  for (const p of kitIssues.slice(0, 10)) {
    console.log(`  [${p.id}] ${p.name}`);
    issues.push({ id: p.id, name: p.name, sku: p.sku!, issue: 'kit-kitten' });
  }
  
  // Sample check: verify weight consistency (would need UPC name to compare)
  console.log(`\nTotal potential issues found: ${issues.length}`);
  
  // Remove bad matches
  if (issues.length > 0) {
    console.log(`\nRemoving ${issues.length} bad matches...`);
    for (const issue of issues) {
      await db.update(supplies).set({ sku: null }).where(sql`id = ${issue.id}`);
      delete perm[issue.id.toString()];
    }
    fs.writeFileSync(permPath, JSON.stringify(perm, null, 2));
  }
  
  // Recount
  const finalWithSku = await db.select({ id: supplies.id }).from(supplies).where(isNotNull(supplies.sku));
  const total = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  
  console.log(`\n=== After Cleanup ===`);
  console.log(`Coverage: ${finalWithSku.length} / ${total[0].count} (${(finalWithSku.length / Number(total[0].count) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
