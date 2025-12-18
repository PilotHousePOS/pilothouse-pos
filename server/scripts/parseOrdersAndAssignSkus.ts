import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, sql, ilike } from 'drizzle-orm';

interface OrderItem {
  name: string;
  sku: string;
}

function parseOrderPdf(content: string): OrderItem[] {
  const items: OrderItem[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for lines that contain SKU patterns (030172xxxxxx format)
    const skuMatch = line.match(/\b(030172\d{6})\b/);
    if (skuMatch) {
      const sku = skuMatch[1];
      
      // Find the product name - it's typically before the SKU or on previous line
      let name = '';
      
      // Check if name is on the same line before SKU
      const beforeSku = line.substring(0, line.indexOf(sku)).trim();
      if (beforeSku && beforeSku.length > 3) {
        name = beforeSku;
      } else if (i > 0) {
        // Name might be on previous line
        name = lines[i - 1].trim();
      }
      
      // Clean up the name
      name = name
        .replace(/\$[\d.,]+/g, '') // Remove prices
        .replace(/\d+\.\d{2}\s*$/, '') // Remove trailing decimals
        .replace(/^\d+\s+/, '') // Remove leading numbers
        .trim();
      
      if (name && name.length > 2 && sku) {
        items.push({ name, sku });
      }
    }
  }
  
  return items;
}

function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('[ORDER-SKU] Parsing Penn-Plax order files...');
  
  const orderDir = 'attached_assets';
  const files = fs.readdirSync(orderDir).filter(f => f.startsWith('order_') && f.endsWith('.pdf'));
  
  console.log(`[ORDER-SKU] Found ${files.length} order files`);
  
  // Collect all items from orders
  const allItems = new Map<string, OrderItem>(); // SKU -> item (deduped)
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(orderDir, file), 'utf-8');
      const items = parseOrderPdf(content);
      
      for (const item of items) {
        if (!allItems.has(item.sku)) {
          allItems.set(item.sku, item);
        }
      }
    } catch (err) {
      // Skip files that can't be read as text
    }
  }
  
  console.log(`[ORDER-SKU] Extracted ${allItems.size} unique SKUs from orders`);
  
  // Show some examples
  console.log('\n[ORDER-SKU] Sample items from orders:');
  let count = 0;
  for (const [sku, item] of allItems) {
    if (count < 10) {
      console.log(`  ${sku}: ${item.name}`);
      count++;
    }
  }
  
  // Get all supplies from database
  console.log('\n[ORDER-SKU] Loading database supplies...');
  const allSupplies = await db.select({ id: supplies.id, name: supplies.name, sku: supplies.sku }).from(supplies);
  console.log(`[ORDER-SKU] Found ${allSupplies.length} supplies in database`);
  
  // Build normalized name lookup for database
  const dbByNormalized = new Map<string, { id: number; name: string; sku: string | null }>();
  for (const s of allSupplies) {
    const norm = normalizeForMatching(s.name);
    if (!dbByNormalized.has(norm)) {
      dbByNormalized.set(norm, s);
    }
  }
  
  // Match order items to database
  const updates: { id: number; sku: string; orderName: string; dbName: string }[] = [];
  const notFound: string[] = [];
  
  for (const [sku, item] of allItems) {
    const normOrderName = normalizeForMatching(item.name);
    
    // Try exact normalized match
    let match = dbByNormalized.get(normOrderName);
    
    // If no exact match, try partial matching
    if (!match) {
      for (const [normDb, supply] of dbByNormalized) {
        // Check if either contains the other
        if (normDb.includes(normOrderName) || normOrderName.includes(normDb)) {
          match = supply;
          break;
        }
        // Check key words match
        const orderWords = normOrderName.split(' ').filter(w => w.length > 2);
        const dbWords = normDb.split(' ').filter(w => w.length > 2);
        const matchingWords = orderWords.filter(w => dbWords.includes(w));
        if (matchingWords.length >= 3 && matchingWords.length >= orderWords.length * 0.6) {
          match = supply;
          break;
        }
      }
    }
    
    if (match) {
      updates.push({ id: match.id, sku, orderName: item.name, dbName: match.name });
      dbByNormalized.delete(normalizeForMatching(match.name)); // Don't match again
    } else {
      notFound.push(`${sku}: ${item.name}`);
    }
  }
  
  console.log(`\n[ORDER-SKU] === MATCH SUMMARY ===`);
  console.log(`Matched: ${updates.length}`);
  console.log(`Not found in DB: ${notFound.length}`);
  
  console.log('\n[ORDER-SKU] Sample matches:');
  for (let i = 0; i < Math.min(20, updates.length); i++) {
    const u = updates[i];
    console.log(`  SKU ${u.sku}:`);
    console.log(`    Order: "${u.orderName}"`);
    console.log(`    DB:    "${u.dbName}"`);
  }
  
  if (notFound.length > 0) {
    console.log('\n[ORDER-SKU] Sample not found (first 20):');
    notFound.slice(0, 20).forEach(nf => console.log(`  ${nf}`));
  }
  
  // Apply updates
  console.log(`\n[ORDER-SKU] Applying ${updates.length} SKU updates...`);
  const batchSize = 50;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    await Promise.all(batch.map(u => 
      db.update(supplies).set({ sku: u.sku }).where(eq(supplies.id, u.id))
    ));
    if ((i + batchSize) % 200 === 0 || i + batchSize >= updates.length) {
      console.log(`[ORDER-SKU] Progress: ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
    }
  }
  
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  console.log(`\n[ORDER-SKU] === FINAL ===`);
  console.log(`Total supplies with SKU: ${countResult[0].count}`);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
