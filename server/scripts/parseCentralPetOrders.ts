import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, sql, ilike, or } from 'drizzle-orm';

interface OrderItem {
  upc: string;
  description: string;
  vendorPart?: string;
}

function parseInvoiceText(content: string): OrderItem[] {
  const items: OrderItem[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Match lines with UPC codes (12 digits)
    // Format: LINE# PRODUCT UPC [VENDOR_PART] DESCRIPTION ...
    const match = line.match(/^\s*\d+\/\S*\s+\d{8}\s+(\d{12})\s+(?:([A-Z0-9-]+)\s+)?(.+?)\s+EA\s+/);
    if (match) {
      const upc = match[1];
      const vendorPart = match[2] || undefined;
      let description = match[3].trim();
      
      // Clean up description
      description = description.replace(/\s+/g, ' ').trim();
      
      items.push({ upc, description, vendorPart });
    }
  }
  
  return items;
}

function expandBrandAbbreviation(abbrev: string): string {
  const brands: Record<string, string> = {
    'AQE': 'Aqueon',
    'API': 'API',
    'HIK': 'Hikari',
    'TET': 'Tetra',
    'SLI': 'Seachem',
    'FLU': 'Fluker\'s',
    'ZIL': 'Zilla',
    'ZOO': 'Zoo Med',
    'ZMD': 'Zoo Med',
    'KOM': 'Komodo',
    'REP': 'Rep-Cal',
    'EXO': 'Exo Terra',
    'GAL': 'Galápagos',
    'KMP': 'Kaytee',
    'KAY': 'Kaytee',
    'JWP': 'JW Pet',
    'NYL': 'Nylabone',
    'COA': 'Coastal',
    'ETH': 'Ethical Pet',
    'KON': 'Kong',
    'BLI': 'Bergan',
    'ZUP': 'ZuPreem',
    'EPC': 'Litter Genie',
    'N/M': 'Nature\'s Miracle',
    'NZP': 'Natural Chemistry',
    'ATP': 'Aquatop',
    'WWI': 'Worldwide Imports',
    'MAR': 'Marineland',
    'MBL': 'MarineLand',
    'VIT': 'Vitakraft',
    'SUP': 'Super Pet',
    'OXB': 'Oxbow',
    'LIV': 'Living World',
    'CAR': 'Carib Sea',
    'CBS': 'Carib Sea',
  };
  
  return brands[abbrev] || abbrev;
}

function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('[CENTRAL-PET] Parsing Central Pet invoice files...');
  
  const orderDir = 'attached_assets/extracted_orders';
  const files = fs.readdirSync(orderDir).filter(f => f.endsWith('.txt'));
  
  console.log(`[CENTRAL-PET] Found ${files.length} invoice text files`);
  
  // Collect all items from invoices
  const allItems = new Map<string, OrderItem>(); // UPC -> item (deduped)
  
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
  
  // Show some examples
  console.log('\n[CENTRAL-PET] Sample items from invoices:');
  let count = 0;
  for (const [upc, item] of allItems) {
    if (count < 15) {
      console.log(`  ${upc}: ${item.description}`);
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
  const notFound: { upc: string; description: string }[] = [];
  const assignedDbIds = new Set<number>();
  
  for (const [upc, item] of allItems) {
    // Check if UPC already exists in DB
    if (dbBySku.has(upc)) {
      stats.skuVerified++;
      assignedDbIds.add(dbBySku.get(upc)!.id);
      continue;
    }
    
    // Try to match by description
    const descNorm = normalizeForMatching(item.description);
    const descWords = descNorm.split(' ').filter(w => w.length > 2);
    
    let bestMatch: typeof allSupplies[0] | null = null;
    let bestScore = 0;
    
    for (const s of allSupplies) {
      if (s.sku) continue; // Skip items with SKU
      if (assignedDbIds.has(s.id)) continue;
      
      const dbNorm = normalizeForMatching(s.name);
      const dbWords = dbNorm.split(' ').filter(w => w.length > 2);
      
      // Count matching words
      const matchingWords = descWords.filter(w => dbWords.includes(w));
      const score = matchingWords.length / Math.max(descWords.length, dbWords.length);
      
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = s;
      }
    }
    
    if (bestMatch && bestScore >= 0.6) {
      assignedDbIds.add(bestMatch.id);
      updates.push({
        id: bestMatch.id,
        sku: upc,
        reason: `"${item.description}" → "${bestMatch.name}" (${(bestScore * 100).toFixed(0)}% match)`
      });
      stats.newSkuAssigned++;
    } else {
      notFound.push({ upc, description: item.description });
      stats.notFound++;
    }
  }
  
  console.log('\n[CENTRAL-PET] === STATISTICS ===');
  console.log(`UPCs already in DB: ${stats.skuVerified}`);
  console.log(`New UPCs to assign: ${stats.newSkuAssigned}`);
  console.log(`Not matched: ${stats.notFound}`);
  
  console.log('\n[CENTRAL-PET] === UPDATES TO APPLY ===');
  for (const u of updates.slice(0, 30)) {
    console.log(`  ID ${u.id}: ${u.reason}`);
  }
  if (updates.length > 30) {
    console.log(`  ... and ${updates.length - 30} more`);
  }
  
  if (notFound.length > 0) {
    console.log('\n[CENTRAL-PET] === NOT MATCHED (first 20) ===');
    for (const nf of notFound.slice(0, 20)) {
      console.log(`  ${nf.upc}: ${nf.description}`);
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
