import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, isNull, or, sql } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

// Super aggressive normalization
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[™®©\-'"]/g, '')
    .replace(/action\s*air/g, 'actionair')
    .replace(/penn\s*plax/g, 'pennplax')
    .replace(/zoo\s*med/g, 'zoomed')
    .replace(/exo\s*terra/g, 'exoterra')
    .replace(/\s*&\s*/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get key tokens (important words)
function getKeyTokens(text: string): Set<string> {
  const norm = normalize(text);
  const tokens = norm.split(' ').filter(t => t.length > 2);
  return new Set(tokens);
}

// Calculate match score
function matchScore(supply: string, inventory: string): number {
  const supNorm = normalize(supply);
  const invNorm = normalize(inventory);
  
  // Exact match
  if (supNorm === invNorm) return 100;
  
  // One contains the other
  if (supNorm.includes(invNorm) || invNorm.includes(supNorm)) return 90;
  
  // Token overlap
  const supTokens = getKeyTokens(supply);
  const invTokens = getKeyTokens(inventory);
  
  let matches = 0;
  let partialMatches = 0;
  
  for (const st of supTokens) {
    for (const it of invTokens) {
      if (st === it) {
        matches++;
        break;
      } else if (st.includes(it) || it.includes(st)) {
        partialMatches++;
        break;
      }
    }
  }
  
  const score = (matches * 2 + partialMatches) / Math.max(supTokens.size, invTokens.size) * 100;
  return score;
}

async function run() {
  console.log('=== Direct Fast Matcher ===\n');
  
  // Load inventory
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const sheet = workbook.worksheets[0];
  
  const inventory: Array<{upc: string, name: string, norm: string}> = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const upc = String(row.getCell(2).value || '').trim();
    const name = String(row.getCell(3).value || '').trim();
    if (upc && name && upc.length >= 8) {
      inventory.push({ upc, name, norm: normalize(name) });
    }
  }
  
  // Add Penn Plax
  const pennPlax = fs.readFileSync('/tmp/penn_plax_products.txt', 'utf-8');
  for (const line of pennPlax.split('\n')) {
    const match = line.match(/^(.+?)\s*\|\|\|(\d{12,14})$/);
    if (match) {
      inventory.push({ upc: match[2], name: match[1].trim(), norm: normalize(match[1]) });
    }
  }
  
  // Add Central Pet
  try {
    const products = JSON.parse(fs.readFileSync('/tmp/all_extracted_products.json', 'utf-8'));
    for (const p of products) {
      const name = p.expandedDesc || p.description;
      inventory.push({ upc: p.upc, name, norm: normalize(name) });
    }
  } catch {}
  
  // Dedupe inventory by UPC
  const invMap = new Map<string, {upc: string, name: string, norm: string}>();
  for (const item of inventory) {
    if (!invMap.has(item.upc)) {
      invMap.set(item.upc, item);
    }
  }
  
  console.log(`Inventory: ${invMap.size} unique UPCs\n`);
  
  // Build index by normalized name prefix
  const prefixIndex = new Map<string, Array<{upc: string, name: string, norm: string}>>();
  for (const item of invMap.values()) {
    const prefix = item.norm.slice(0, 5);
    if (!prefixIndex.has(prefix)) prefixIndex.set(prefix, []);
    prefixIndex.get(prefix)!.push(item);
  }
  
  // Get unmatched supplies
  const unmatched = await db.select({ id: supplies.id, name: supplies.name })
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`Unmatched supplies: ${unmatched.length}\n`);
  
  // Get used UPCs
  const existing = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const usedUpcs = new Set(existing.map(s => s.sku!));
  
  let matchCount = 0;
  const matchLog: string[] = [];
  
  for (let i = 0; i < unmatched.length; i++) {
    const supply = unmatched[i];
    const supNorm = normalize(supply.name);
    const prefix = supNorm.slice(0, 5);
    
    // Check prefix matches first
    const candidates = [
      ...(prefixIndex.get(prefix) || []),
      ...(prefixIndex.get(supNorm.slice(0, 4)) || []),
      ...(prefixIndex.get(supNorm.slice(0, 3)) || [])
    ];
    
    let bestMatch: {upc: string, name: string} | null = null;
    let bestScore = 0;
    
    // Check all candidates
    for (const cand of candidates) {
      if (usedUpcs.has(cand.upc)) continue;
      
      const score = matchScore(supply.name, cand.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cand;
      }
    }
    
    // Also check full inventory for exact normalized match
    if (bestScore < 80) {
      for (const cand of invMap.values()) {
        if (usedUpcs.has(cand.upc)) continue;
        if (cand.norm === supNorm) {
          bestScore = 100;
          bestMatch = cand;
          break;
        }
      }
    }
    
    // Apply match if confident enough
    if (bestMatch && bestScore >= 70) {
      await db.update(supplies)
        .set({ sku: bestMatch.upc })
        .where(eq(supplies.id, supply.id));
      
      usedUpcs.add(bestMatch.upc);
      matchCount++;
      matchLog.push(`[${bestScore.toFixed(0)}] "${supply.name}" -> "${bestMatch.name}" (${bestMatch.upc})`);
    }
    
    if ((i + 1) % 500 === 0) {
      console.log(`Processed ${i + 1}/${unmatched.length}, ${matchCount} matches`);
    }
  }
  
  fs.writeFileSync('/tmp/direct_matches.txt', matchLog.join('\n'));
  
  // Final count
  const final = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const total = 7603;
  const coverage = (Number(final[0].count) / total * 100).toFixed(1);
  
  console.log(`\n=== RESULTS ===`);
  console.log(`New matches: ${matchCount}`);
  console.log(`Coverage: ${final[0].count}/${total} (${coverage}%)`);
}

run().catch(console.error);
