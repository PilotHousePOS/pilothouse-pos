import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, sql, isNull, or, and } from 'drizzle-orm';
import { pennPlaxOrderItems } from './orderData';

function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getKeyWords(str: string): string[] {
  const norm = normalizeForMatching(str);
  return norm.split(' ').filter(w => w.length > 2 && !['the', 'and', 'for', 'with'].includes(w));
}

function similarity(a: string, b: string): number {
  const aWords = getKeyWords(a);
  const bWords = getKeyWords(b);
  
  if (aWords.length === 0 || bWords.length === 0) return 0;
  
  const matchingWords = aWords.filter(w => bWords.includes(w));
  return matchingWords.length / Math.max(aWords.length, bWords.length);
}

async function main() {
  console.log('[SYNC-SKU] Starting Penn-Plax order SKU sync...');
  console.log(`[SYNC-SKU] Order items to process: ${pennPlaxOrderItems.length}`);
  
  // Dedupe order items by SKU
  const orderBySku = new Map<string, { sku: string; name: string }>();
  for (const item of pennPlaxOrderItems) {
    if (!orderBySku.has(item.sku)) {
      orderBySku.set(item.sku, item);
    }
  }
  console.log(`[SYNC-SKU] Unique SKUs from orders: ${orderBySku.size}`);
  
  // Load all supplies
  const allSupplies = await db.select().from(supplies);
  console.log(`[SYNC-SKU] Total supplies in database: 7252`);
  
  // Build lookup maps
  const dbBySku = new Map<string, typeof allSupplies[0]>();
  const dbByNormName = new Map<string, typeof allSupplies[0][]>();
  
  for (const s of allSupplies) {
    if (s.sku) {
      dbBySku.set(s.sku, s);
    }
    const norm = normalizeForMatching(s.name);
    if (!dbByNormName.has(norm)) {
      dbByNormName.set(norm, []);
    }
    dbByNormName.get(norm)!.push(s);
  }
  
  const stats = {
    skuVerified: 0,
    nameUpdated: 0,
    newSkuAssigned: 0,
    notFound: 0,
  };
  
  const updates: { id: number; sku?: string; name?: string; reason: string }[] = [];
  const notFound: { sku: string; name: string }[] = [];
  
  for (const [orderSku, orderItem] of orderBySku) {
    // First check if SKU exists in DB
    const existingBySku = dbBySku.get(orderSku);
    
    if (existingBySku) {
      // SKU exists - verify and fix name if needed
      stats.skuVerified++;
      
      // Update to official Penn-Plax name if different
      if (existingBySku.name !== orderItem.name) {
        updates.push({ 
          id: existingBySku.id, 
          name: orderItem.name, 
          reason: `Name update: "${existingBySku.name}" → "${orderItem.name}"` 
        });
        stats.nameUpdated++;
      }
    } else {
      // SKU not in DB - try to match by name and assign SKU
      const normOrderName = normalizeForMatching(orderItem.name);
      
      // Exact normalized match
      let matches = dbByNormName.get(normOrderName) || [];
      
      // If no exact match, try fuzzy matching
      if (matches.length === 0) {
        let bestMatch: typeof allSupplies[0] | null = null;
        let bestScore = 0;
        
        for (const s of allSupplies) {
          if (s.sku) continue; // Skip items that already have SKU
          
          const sim = similarity(s.name, orderItem.name);
          if (sim > bestScore && sim >= 0.5) {
            bestScore = sim;
            bestMatch = s;
          }
        }
        
        if (bestMatch) {
          matches = [bestMatch];
        }
      }
      
      // Filter to items without SKU
      const noSkuMatches = matches.filter(m => !m.sku);
      
      if (noSkuMatches.length >= 1) {
        updates.push({
          id: noSkuMatches[0].id,
          sku: orderSku,
          name: orderItem.name,
          reason: `Assign SKU + name: "${noSkuMatches[0].name}" → SKU:${orderSku}, Name:"${orderItem.name}"`
        });
        stats.newSkuAssigned++;
      } else {
        notFound.push({ sku: orderSku, name: orderItem.name });
        stats.notFound++;
      }
    }
  }
  
  console.log('\n[SYNC-SKU] === STATISTICS ===');
  console.log(`SKUs verified: ${stats.skuVerified}`);
  console.log(`Names updated to official: ${stats.nameUpdated}`);
  console.log(`New SKUs assigned: ${stats.newSkuAssigned}`);
  console.log(`Not found in DB: ${stats.notFound}`);
  
  if (notFound.length > 0) {
    console.log('\n[SYNC-SKU] === NOT FOUND IN DB (first 20) ===');
    for (const nf of notFound.slice(0, 20)) {
      console.log(`  ${nf.sku}: ${nf.name}`);
    }
    if (notFound.length > 20) {
      console.log(`  ... and ${notFound.length - 20} more`);
    }
  }
  
  console.log('\n[SYNC-SKU] === SAMPLE UPDATES (first 30) ===');
  for (const u of updates.slice(0, 30)) {
    console.log(`  ID ${u.id}: ${u.reason}`);
  }
  if (updates.length > 30) {
    console.log(`  ... and ${updates.length - 30} more`);
  }
  
  // Apply updates
  if (updates.length > 0) {
    console.log(`\n[SYNC-SKU] Applying ${updates.length} updates...`);
    
    for (const u of updates) {
      const updateData: { sku?: string; name?: string } = {};
      if (u.sku) updateData.sku = u.sku;
      if (u.name) updateData.name = u.name;
      
      await db.update(supplies).set(updateData).where(eq(supplies.id, u.id));
    }
    
    console.log('[SYNC-SKU] Updates applied successfully!');
  }
  
  // Final count
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  console.log(`\n[SYNC-SKU] === FINAL ===`);
  console.log(`Total supplies with SKU: ${countResult[0].count}`);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
