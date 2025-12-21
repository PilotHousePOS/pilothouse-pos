import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

interface UpcEntry { upc: string; name: string; }

function normalizeText(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(text: string): string[] {
  const normalized = normalizeText(text);
  return normalized.split(' ').filter(w => w.length > 2);
}

function matchScore(productName: string, upcName: string): number {
  const pKeywords = extractKeywords(productName);
  const uKeywords = extractKeywords(upcName);
  
  let matches = 0;
  for (const pk of pKeywords) {
    for (const uk of uKeywords) {
      if (pk === uk || 
          (pk.length > 3 && uk.length > 3 && (pk.includes(uk) || uk.includes(pk)))) {
        matches++;
        break;
      }
    }
  }
  
  if (pKeywords.length === 0) return 0;
  return matches / pKeywords.length;
}

async function main() {
  console.log("=== Fluval & Exo Terra UPC Matching ===\n");
  
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  
  const fluvalUpcs = upcData.filter(e => /fluval/i.test(e.name));
  const exoTerraUpcs = upcData.filter(e => /exo\s*terra/i.test(e.name));
  
  console.log(`Fluval UPCs in database: ${fluvalUpcs.length}`);
  console.log(`Exo Terra UPCs in database: ${exoTerraUpcs.length}\n`);
  
  const allProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  const usedUpcs = new Set(allProducts.filter(p => p.sku && p.sku.length >= 10).map(p => p.sku!));
  
  const fluvalProducts = allProducts.filter(p => 
    (!p.sku || p.sku.length < 10) && 
    (/fluval/i.test(p.brand || '') || /fluval/i.test(p.name))
  );
  
  const exoTerraProducts = allProducts.filter(p => 
    (!p.sku || p.sku.length < 10) && 
    (/exo\s*terra/i.test(p.brand || '') || /exo\s*terra/i.test(p.name))
  );
  
  console.log(`Fluval products needing UPCs: ${fluvalProducts.length}`);
  console.log(`Exo Terra products needing UPCs: ${exoTerraProducts.length}\n`);
  
  const matches: { id: number; name: string; upc: string; upcName: string; score: number }[] = [];
  const THRESHOLD = 0.6;
  
  for (const p of fluvalProducts) {
    let bestMatch: UpcEntry | null = null;
    let bestScore = 0;
    
    for (const upc of fluvalUpcs) {
      if (usedUpcs.has(upc.upc)) continue;
      const score = matchScore(p.name, upc.name);
      if (score > bestScore && score >= THRESHOLD) {
        bestScore = score;
        bestMatch = upc;
      }
    }
    
    if (bestMatch) {
      matches.push({
        id: p.id,
        name: p.name,
        upc: bestMatch.upc,
        upcName: bestMatch.name,
        score: bestScore
      });
      usedUpcs.add(bestMatch.upc);
      console.log(`✓ "${p.name}" → ${bestMatch.upc} (${(bestScore*100).toFixed(0)}%)`);
    }
  }
  
  for (const p of exoTerraProducts) {
    let bestMatch: UpcEntry | null = null;
    let bestScore = 0;
    
    for (const upc of exoTerraUpcs) {
      if (usedUpcs.has(upc.upc)) continue;
      const score = matchScore(p.name, upc.name);
      if (score > bestScore && score >= THRESHOLD) {
        bestScore = score;
        bestMatch = upc;
      }
    }
    
    if (bestMatch) {
      matches.push({
        id: p.id,
        name: p.name,
        upc: bestMatch.upc,
        upcName: bestMatch.name,
        score: bestScore
      });
      usedUpcs.add(bestMatch.upc);
      console.log(`✓ "${p.name}" → ${bestMatch.upc} (${(bestScore*100).toFixed(0)}%)`);
    }
  }
  
  console.log(`\nTotal matches: ${matches.length}`);
  
  if (matches.length > 0) {
    console.log('\nApplying matches...');
    for (const m of matches) {
      await db.update(supplies).set({ sku: m.upc }).where(eq(supplies.id, m.id));
    }
    console.log('Done!');
  }
  
  const updated = await db.select({ 
    total: sql<number>`COUNT(*)`,
    withUpc: sql<number>`COUNT(CASE WHEN sku IS NOT NULL AND LENGTH(sku) >= 10 THEN 1 END)`
  }).from(supplies);
  
  const total = Number(updated[0].total);
  const withUpc = Number(updated[0].withUpc);
  console.log(`\nCurrent coverage: ${withUpc} / ${total} = ${(withUpc/total*100).toFixed(1)}%`);
  console.log(`Need ${Math.ceil(total * 0.80) - withUpc} more for 80%`);
}

main().catch(console.error);
