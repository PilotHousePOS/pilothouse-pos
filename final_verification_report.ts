import ExcelJS from 'exceljs';
import { db } from './server/db';
import { supplies } from './shared/schema';
import { isNotNull, sql } from 'drizzle-orm';

async function main() {
  console.log('=== FINAL UPC/SKU VERIFICATION REPORT ===\n');
  console.log('Date:', new Date().toISOString());
  console.log('');
  
  // Load InventoryMaybe for verification
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  const ws = workbook.getWorksheet('Sheet1');
  
  const maybeMap = new Map<string, string>();
  ws?.eachRow((row, i) => {
    if (i === 1) return;
    const upc = String(row.getCell(1).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (upc && name) maybeMap.set(upc, name);
  });
  
  // Get coverage stats
  const totalCount = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  const withSkuCount = await db.select({ count: sql<number>`count(*)` })
    .from(supplies).where(isNotNull(supplies.sku));
  
  const total = Number(totalCount[0].count);
  const withSku = Number(withSkuCount[0].count);
  const coverage = (withSku / total * 100).toFixed(1);
  
  console.log('=== COVERAGE SUMMARY ===');
  console.log(`Total Products: ${total}`);
  console.log(`Products with UPC/SKU: ${withSku}`);
  console.log(`Products without UPC/SKU: ${total - withSku}`);
  console.log(`Coverage: ${coverage}%`);
  console.log('');
  
  // Get sample matches for verification
  const sampleProducts = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
    brand: supplies.brand,
    category: supplies.category,
  }).from(supplies).where(isNotNull(supplies.sku)).limit(100);
  
  // Verify samples against InventoryMaybe
  let verified = 0;
  let unverifiable = 0;
  const verifiedSamples: Array<{dbName: string, sku: string, maybeName: string}> = [];
  
  for (const prod of sampleProducts) {
    const maybeName = maybeMap.get(prod.sku!);
    if (maybeName) {
      verified++;
      if (verifiedSamples.length < 10) {
        verifiedSamples.push({ dbName: prod.name, sku: prod.sku!, maybeName });
      }
    } else {
      unverifiable++;
    }
  }
  
  console.log('=== SAMPLE VERIFICATION (100 random products) ===');
  console.log(`Found in InventoryMaybe: ${verified}`);
  console.log(`Not in InventoryMaybe (from Final Inventory): ${unverifiable}`);
  console.log('');
  
  console.log('=== SAMPLE VERIFIED MATCHES ===');
  for (const s of verifiedSamples) {
    console.log(`DB: "${s.dbName}"`);
    console.log(`   UPC ${s.sku} -> Invoice: "${s.maybeName}"`);
    console.log('');
  }
  
  // Get products without SKU
  const withoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    category: supplies.category,
  }).from(supplies).where(sql`${supplies.sku} IS NULL`).limit(20);
  
  console.log('=== SAMPLE PRODUCTS WITHOUT UPC (first 20) ===');
  for (const prod of withoutSku) {
    console.log(`- ${prod.name} (${prod.brand || 'no brand'}, ${prod.category || 'no category'})`);
  }
  
  // Category breakdown
  console.log('\n=== COVERAGE BY CATEGORY ===');
  const categoryStats = await db.execute(sql`
    SELECT 
      category,
      COUNT(*) as total,
      COUNT(sku) as with_sku,
      ROUND(COUNT(sku)::numeric / COUNT(*)::numeric * 100, 1) as coverage_pct
    FROM supplies
    GROUP BY category
    ORDER BY total DESC
    LIMIT 15
  `);
  
  for (const row of categoryStats.rows) {
    console.log(`${String(row.category || 'uncategorized').padEnd(25)} ${String(row.with_sku).padStart(5)}/${String(row.total).padStart(5)} (${String(row.coverage_pct)}%)`);
  }
  
  console.log('\n=== VERIFICATION COMPLETE ===');
  console.log(`Target: 90%+ coverage`);
  console.log(`Achieved: ${coverage}% coverage`);
  console.log(`Status: ${parseFloat(coverage) >= 90 ? 'TARGET MET' : 'BELOW TARGET'}`);
}

main().catch(console.error);
