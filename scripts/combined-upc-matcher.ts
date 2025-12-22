import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql, or, isNull, eq } from "drizzle-orm";
import fs from 'fs';

interface UpcEntry {
  upc: string;
  name: string;
  source?: string;
}

function normalize(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function extractTokens(str: string): string[] {
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

async function main() {
  console.log("=== COMBINED UPC MATCHER ===\n");

  const maybeUpcs: UpcEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
  console.log(`maybe_upcs.json: ${maybeUpcs.length} entries`);

  let ocrUpcs: UpcEntry[] = [];
  try {
    ocrUpcs = JSON.parse(fs.readFileSync('scripts/pdf_ocr_upcs.json', 'utf-8'));
    console.log(`pdf_ocr_upcs.json: ${ocrUpcs.length} entries`);
  } catch { }

  const allUpcs = [...maybeUpcs, ...ocrUpcs].filter(e => e.upc && e.upc.length >= 10);
  console.log(`Combined valid UPCs: ${allUpcs.length}`);

  const upcMap = new Map<string, UpcEntry>();
  const normalizedNameMap = new Map<string, UpcEntry>();
  
  for (const entry of allUpcs) {
    if (!upcMap.has(entry.upc)) {
      upcMap.set(entry.upc, entry);
    }
    const normName = normalize(entry.name);
    if (normName && !normalizedNameMap.has(normName)) {
      normalizedNameMap.set(normName, entry);
    }
  }
  
  console.log(`Unique UPCs: ${upcMap.size}`);
  console.log(`Unique normalized names: ${normalizedNameMap.size}`);

  const productsWithoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies).where(or(isNull(supplies.sku), eq(supplies.sku, '')));

  console.log(`\nProducts without SKU: ${productsWithoutSku.length}\n`);

  const updates: { id: number; sku: string; productName: string; matchedName: string; method: string }[] = [];

  for (const product of productsWithoutSku) {
    const fullName = `${product.brand || ''} ${product.name}`.trim();
    const normFullName = normalize(fullName);
    const normName = normalize(product.name);
    
    let match = normalizedNameMap.get(normFullName);
    if (match) {
      updates.push({ id: product.id, sku: match.upc, productName: fullName, matchedName: match.name, method: 'exact-full' });
      continue;
    }

    match = normalizedNameMap.get(normName);
    if (match) {
      updates.push({ id: product.id, sku: match.upc, productName: fullName, matchedName: match.name, method: 'exact-name' });
      continue;
    }

    for (const [normKey, entry] of normalizedNameMap) {
      if (normFullName.includes(normKey) && normKey.length > 10) {
        updates.push({ id: product.id, sku: entry.upc, productName: fullName, matchedName: entry.name, method: 'contains' });
        break;
      }
      if (normKey.includes(normFullName) && normFullName.length > 10) {
        updates.push({ id: product.id, sku: entry.upc, productName: fullName, matchedName: entry.name, method: 'contained-in' });
        break;
      }
    }
  }

  console.log(`Found ${updates.length} matches\n`);
  
  const byMethod: Record<string, number> = {};
  updates.forEach(u => { byMethod[u.method] = (byMethod[u.method] || 0) + 1; });
  console.log("By method:", byMethod);

  console.log("\nSample matches:");
  updates.slice(0, 15).forEach(u => {
    console.log(`  [${u.method}] "${u.productName.slice(0, 35)}" -> "${u.matchedName.slice(0, 35)}"`);
  });

  if (updates.length > 0) {
    console.log("\nApplying updates...");
    for (const u of updates) {
      await db.update(supplies).set({ sku: u.sku }).where(eq(supplies.id, u.id));
    }
    console.log(`Applied ${updates.length} updates`);
  }

  const result = await db.execute(sql`
    SELECT COUNT(*) as total, 
           COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_sku
    FROM supplies
  `);
  
  const row = result.rows[0] as { total: string; with_sku: string };
  const pct = (100 * parseInt(row.with_sku) / parseInt(row.total)).toFixed(1);
  console.log(`\nFinal coverage: ${row.with_sku}/${row.total} (${pct}%)`);
}

main().catch(console.error);
