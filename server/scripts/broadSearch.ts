import { db } from '../db';
import { supplies } from '../../shared/schema';
import { ilike, or, sql } from 'drizzle-orm';

async function main() {
  // Search for products with key brand names
  const brandSearches = [
    { brand: 'hikari', pattern: '%hikari%' },
    { brand: 'greenies', pattern: '%greenies%' },
    { brand: 'carefresh', pattern: '%carefresh%' },
    { brand: 'pill pocket', pattern: '%pill%pocket%' },
    { brand: 'crittertrail', pattern: '%critter%trail%' },
    { brand: 'tortoise', pattern: '%tortoise%' },
    { brand: 'aspen', pattern: '%aspen%' },
    { brand: 'cichlid', pattern: '%cichlid%' },
    { brand: 'gravel', pattern: '%gravel%' },
  ];
  
  for (const search of brandSearches) {
    const results = await db.select({ id: supplies.id, name: supplies.name, sku: supplies.sku })
      .from(supplies)
      .where(ilike(supplies.name, search.pattern))
      .limit(10);
    
    console.log(`=== ${search.brand.toUpperCase()} (${results.length} found) ===`);
    results.forEach(r => console.log(`  [${r.sku || 'NO SKU'}] ${r.name}`));
    console.log();
  }
  
  // Count totals
  const all = await db.select({ count: sql<number>`count(*)` }).from(supplies);
  const withSku = await db.select({ count: sql<number>`count(*)` }).from(supplies).where(sql`sku IS NOT NULL AND sku != ''`);
  console.log(`\n=== TOTALS ===`);
  console.log(`Total supplies: ${all[0].count}`);
  console.log(`With SKU: ${withSku[0].count}`);
}

main().catch(console.error);
