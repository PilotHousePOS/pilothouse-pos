import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import * as fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

// Load UPCs
const maybeUpcs: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));

// Extract pattern code from Coastal product name
function extractCoastalCode(name: string): string | null {
  const normalized = name.toLowerCase().replace(/['"]/g, '');
  
  // Extract pattern code like GKS12, GLS18, etc. (3 letters + 2 digits)
  const codeMatch = normalized.match(/\b([a-z]{3})(\d{2})\b/);
  if (codeMatch) {
    return (codeMatch[1] + codeMatch[2]).toLowerCase();
  }
  
  // Handle formats like "skz18", "pcr12" at end of name
  const endMatch = normalized.match(/([a-z]{2,3})(\d{1,2})['"]?$/);
  if (endMatch) {
    return (endMatch[1] + endMatch[2]).toLowerCase();
  }
  
  return null;
}

// Normalize Coastal source entry name to extract pattern
function normalizeCoastalSource(name: string): string[] {
  const normalized = name.toLowerCase().replace(/['"]/g, '');
  const codes: string[] = [];
  
  // Extract main code pattern
  const codeMatch = normalized.match(/\b([a-z]{3})(\d{2})\b/);
  if (codeMatch) {
    codes.push((codeMatch[1] + codeMatch[2]).toLowerCase());
  }
  
  // Try other patterns
  const patterns = normalized.match(/([a-z]{2,4})(\d{1,2})/g);
  if (patterns) {
    for (const p of patterns) {
      codes.push(p.toLowerCase());
    }
  }
  
  return [...new Set(codes)];
}

async function main() {
  console.log('=== COASTAL PATTERN CODE MATCHER ===\n');
  
  // Get all Coastal products without UPC
  const missingCoastal = await db.select()
    .from(supplies)
    .where(
      and(
        eq(supplies.brand, 'Coastal'),
        or(isNull(supplies.sku), eq(supplies.sku, ''))
      )
    );
  
  console.log(`Coastal products missing UPC: ${missingCoastal.length}`);
  
  // Get Coastal entries from UPC source
  const coastalUpcs = maybeUpcs.filter(e => 
    e.name.toLowerCase().includes('coastal')
  );
  console.log(`Coastal entries in UPC source: ${coastalUpcs.length}`);
  
  // Build code-to-UPC map from source
  const codeToUPC = new Map<string, { upc: string; name: string }>();
  for (const entry of coastalUpcs) {
    const codes = normalizeCoastalSource(entry.name);
    for (const code of codes) {
      if (code.length >= 4 && !codeToUPC.has(code)) {
        codeToUPC.set(code, { upc: entry.upc, name: entry.name });
      }
    }
  }
  
  console.log(`Unique codes extracted from source: ${codeToUPC.size}`);
  console.log('\nSample codes:', [...codeToUPC.keys()].slice(0, 20));
  
  let matched = 0;
  let updated = 0;
  const matches: string[] = [];
  
  for (const product of missingCoastal) {
    const code = extractCoastalCode(product.name);
    if (!code) continue;
    
    const upcEntry = codeToUPC.get(code);
    if (upcEntry) {
      matches.push(`MATCH: "${product.name}" -> "${upcEntry.name}" = ${upcEntry.upc}`);
      
      await db.update(supplies)
        .set({ sku: upcEntry.upc })
        .where(eq(supplies.id, product.id));
      
      matched++;
      updated++;
    }
  }
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Matched: ${matched}`);
  console.log(`Updated: ${updated}`);
  
  // Show first 20 matches
  if (matches.length > 0) {
    console.log('\nFirst 20 matches:');
    matches.slice(0, 20).forEach(m => console.log(m));
  }
  
  // Check final coverage
  const [coverage] = await db.execute(sql`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc
    FROM supplies
  `);
  console.log(`\nFinal coverage: ${coverage.with_upc}/${coverage.total}`);
  
  process.exit(0);
}

main().catch(console.error);
