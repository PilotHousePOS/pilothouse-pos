import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql, or, isNull, eq } from "drizzle-orm";
import fs from 'fs';

interface OcrEntry {
  upc: string;
  name: string;
  source: string;
}

function normalizeForMatch(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(str: string): Set<string> {
  return new Set(normalizeForMatch(str).split(' ').filter(t => t.length > 2));
}

function calculateSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = [...set1].filter(t => set2.has(t));
  const union = new Set([...set1, ...set2]);
  return intersection.length / union.size;
}

async function main() {
  console.log("=== MATCH OCR UPCs TO PRODUCTS ===\n");

  const ocrData: OcrEntry[] = JSON.parse(fs.readFileSync('scripts/pdf_ocr_upcs.json', 'utf-8'));
  console.log(`Loaded ${ocrData.length} OCR entries`);

  const validOcr = ocrData.filter(e => e.upc && e.upc.length >= 10 && e.upc.length <= 14);
  console.log(`Valid UPCs: ${validOcr.length}`);

  const productsWithoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    description: supplies.description,
  }).from(supplies).where(or(isNull(supplies.sku), eq(supplies.sku, '')));

  console.log(`Products without SKU/UPC: ${productsWithoutSku.length}\n`);

  const upcMap = new Map<string, OcrEntry>();
  for (const entry of validOcr) {
    if (!upcMap.has(entry.upc)) {
      upcMap.set(entry.upc, entry);
    }
  }
  console.log(`Unique UPCs: ${upcMap.size}`);

  let matched = 0;
  const updates: { id: number; upc: string; productName: string; ocrName: string; similarity: number }[] = [];

  for (const product of productsWithoutSku) {
    const productText = `${product.brand || ''} ${product.name} ${product.description || ''}`;
    const productTokens = tokenize(productText);

    let bestMatch: { upc: string; name: string; similarity: number } | null = null;

    for (const [upc, entry] of upcMap) {
      const ocrTokens = tokenize(entry.name);
      const similarity = calculateSimilarity(productTokens, ocrTokens);
      
      if (similarity > 0.35 && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { upc, name: entry.name, similarity };
      }
    }

    if (bestMatch) {
      updates.push({
        id: product.id,
        upc: bestMatch.upc,
        productName: product.name,
        ocrName: bestMatch.name,
        similarity: bestMatch.similarity
      });
      matched++;
    }
  }

  console.log(`\nMatched ${matched} products\n`);

  if (updates.length > 0) {
    console.log("Top 20 matches:");
    updates.slice(0, 20).forEach(u => {
      console.log(`  ${u.similarity.toFixed(2)} | ${u.productName.slice(0, 40)} <- ${u.ocrName.slice(0, 40)}`);
    });

    console.log("\nApplying updates...");
    let applied = 0;
    for (const update of updates) {
      await db.update(supplies)
        .set({ sku: update.upc })
        .where(eq(supplies.id, update.id));
      applied++;
    }
    console.log(`Applied ${applied} SKU/UPC updates`);
  }

  const result = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_sku
    FROM supplies
  `);
  
  const row = result.rows[0] as { total: string; with_sku: string };
  console.log(`\nFinal coverage: ${row.with_sku}/${row.total} (${(100 * parseInt(row.with_sku) / parseInt(row.total)).toFixed(1)}%)`);
}

main().catch(console.error);
