import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { brandAbbreviations, wordAbbreviations, expandAbbreviations } from './centralPetAbbreviations';

interface OrderItem {
  upc: string;
  description: string;
  expanded: string;
  vendorPart?: string;
}

function parseInvoiceText(content: string): OrderItem[] {
  const items: OrderItem[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Match lines with UPC codes (12 digits)
    const match = line.match(/^\s*\d+\/\S*\s+\d{8}\s+(\d{12})\s+(?:([A-Z0-9-]+)\s+)?(.+?)\s+EA\s+/);
    if (match) {
      const upc = match[1];
      const vendorPart = match[2] || undefined;
      let description = match[3].trim().replace(/\s+/g, ' ');
      
      // Expand abbreviations
      const expanded = expandAbbreviations(description);
      
      items.push({ upc, description, expanded, vendorPart });
    }
  }
  
  return items;
}

function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(str: string): string[] {
  return normalizeForMatching(str).split(' ').filter(w => w.length > 2);
}

function calculateSimilarity(invoice: string, db: string): number {
  const invoiceWords = getWords(invoice);
  const dbWords = getWords(db);
  
  if (invoiceWords.length === 0 || dbWords.length === 0) return 0;
  
  let matchScore = 0;
  for (const w of invoiceWords) {
    if (dbWords.includes(w)) {
      matchScore += 1;
    } else {
      // Partial match for longer words
      for (const dw of dbWords) {
        if (dw.includes(w) || w.includes(dw)) {
          matchScore += 0.5;
          break;
        }
      }
    }
  }
  
  return matchScore / Math.max(invoiceWords.length, dbWords.length);
}

async function main() {
  console.log('[CENTRAL-PET] Parsing Central Pet invoice files with expanded abbreviations...');
  
  const orderDir = 'attached_assets/extracted_orders';
  const files = fs.readdirSync(orderDir).filter(f => f.endsWith('.txt'));
  
  console.log(`[CENTRAL-PET] Found ${files.length} invoice text files`);
  
  // Collect all items from invoices
  const allItems = new Map<string, OrderItem>();
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(orderDir, file), 'utf-8');
    const items = parseInvoiceText(content);
    
    for (const item of items) {
      if (!allItems.has(item.upc)) {
        allItems.set(item.upc, item);
      }
    }
  }
  
  console.log(`[CENTRAL-PET] Extracted ${allItems.size} unique UPCs from invoices`);
  
  // Show expanded examples
  console.log('\n[CENTRAL-PET] Sample abbreviation expansions:');
  let count = 0;
  for (const [upc, item] of allItems) {
    if (count < 20 && item.description !== item.expanded) {
      console.log(`  "${item.description}" → "${item.expanded}"`);
      count++;
    }
  }
  
  // Load all supplies from database
  console.log('\n[CENTRAL-PET] Loading database supplies...');
  const allSupplies = await db.select().from(supplies);
  console.log(`[CENTRAL-PET] Found ${allSupplies.length} supplies in database`);
  
  // Build lookup by existing SKU
  const dbBySku = new Map<string, typeof allSupplies[0]>();
  for (const s of allSupplies) {
    if (s.sku) {
      dbBySku.set(s.sku, s);
    }
  }
  
  const stats = {
    skuVerified: 0,
    newSkuAssigned: 0,
    notFound: 0,
  };
  
  const updates: { id: number; sku: string; reason: string }[] = [];
  const notFound: { upc: string; description: string; expanded: string }[] = [];
  const assignedDbIds = new Set<number>();
  
  for (const [upc, item] of allItems) {
    // Check if UPC already exists in DB
    if (dbBySku.has(upc)) {
      stats.skuVerified++;
      assignedDbIds.add(dbBySku.get(upc)!.id);
      continue;
    }
    
    // Try to match using expanded description
    let bestMatch: typeof allSupplies[0] | null = null;
    let bestScore = 0;
    
    for (const s of allSupplies) {
      if (s.sku) continue;
      if (assignedDbIds.has(s.id)) continue;
      
      // Try both original and expanded description
      const score1 = calculateSimilarity(item.description, s.name);
      const score2 = calculateSimilarity(item.expanded, s.name);
      const score = Math.max(score1, score2);
      
      if (score > bestScore && score >= 0.6) {
        bestScore = score;
        bestMatch = s;
      }
    }
    
    if (bestMatch && bestScore >= 0.65) {
      assignedDbIds.add(bestMatch.id);
      updates.push({
        id: bestMatch.id,
        sku: upc,
        reason: `"${item.expanded}" → "${bestMatch.name}" (${(bestScore * 100).toFixed(0)}%)`
      });
      stats.newSkuAssigned++;
    } else {
      notFound.push({ upc, description: item.description, expanded: item.expanded });
      stats.notFound++;
    }
  }
  
  console.log('\n[CENTRAL-PET] === STATISTICS ===');
  console.log(`UPCs already in DB: ${stats.skuVerified}`);
  console.log(`New UPCs to assign: ${stats.newSkuAssigned}`);
  console.log(`Not matched: ${stats.notFound}`);
  
  console.log('\n[CENTRAL-PET] === UPDATES TO APPLY ===');
  for (const u of updates.slice(0, 40)) {
    console.log(`  ID ${u.id}: ${u.reason}`);
  }
  if (updates.length > 40) {
    console.log(`  ... and ${updates.length - 40} more`);
  }
  
  if (notFound.length > 0) {
    console.log('\n[CENTRAL-PET] === NOT MATCHED (first 30) ===');
    for (const nf of notFound.slice(0, 30)) {
      console.log(`  ${nf.upc}: ${nf.description}`);
      if (nf.description !== nf.expanded) {
        console.log(`          → ${nf.expanded}`);
      }
    }
  }
  
  // Apply updates
  if (updates.length > 0) {
    console.log(`\n[CENTRAL-PET] Applying ${updates.length} SKU updates...`);
    
    for (const u of updates) {
      await db.update(supplies).set({ sku: u.sku }).where(eq(supplies.id, u.id));
    }
    
    console.log('[CENTRAL-PET] Updates applied successfully!');
  }
  
  // Final count
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  console.log(`\n[CENTRAL-PET] === FINAL ===`);
  console.log(`Total supplies with SKU: ${countResult[0].count}`);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
